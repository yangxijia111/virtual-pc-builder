/**
 * ConnectorLineEngine（文档 3.2/4.4）：
 * 每帧把选中层的锚点从世界坐标投影到屏幕像素，生成直角折线并直写 SVG path
 *（绕过 React）；右侧词卡同步跟随层屏幕位置。性能预算 ≤ 0.3ms/帧。
 *
 * 优化：
 * - 每层的局部包围盒在挂载时缓存（含 InstancedMesh 实例展开），运行时 O(1) 求世界锚点；
 * - 视口尺寸与 DOM 引用（条目 / 词卡）按需缓存，禁止每帧 getBoundingClientRect / querySelector
 *   在写入后读取造成布局抖动——每帧先批量读，再统一写，且相同值跳过写；
 * - 向量与投影全部复用预分配对象，稳态零 GC 压力。
 */
import * as THREE from 'three'
import { useAppStore, resolveDeviceContext } from '../../store/useAppStore'
import { layerRegistry } from '../../managers/exploded'
import { threeBridge } from '../../three/three-bridge'
import { colors } from '../../styles/tokens'

/** 挂载时计算层局部包围盒（写入注册表；InstancedMesh 需 computeBoundingBox 展开实例） */
export function computeLayerLocalBox(deviceId: string, layerId: string): void {
  const reg = layerRegistry.get(deviceId, layerId)
  if (!reg || reg.boxLocal) return
  const box = new THREE.Box3()
  const tmp = new THREE.Box3()
  reg.group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const im = mesh as THREE.InstancedMesh
      im.computeBoundingBox()
      if (im.boundingBox) box.union(tmp.copy(im.boundingBox).applyMatrix4(mesh.matrixWorld))
    } else {
      mesh.geometry.computeBoundingBox()
      if (mesh.geometry.boundingBox) box.union(tmp.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld))
    }
  })
  // 由世界坐标换回层局部坐标（层 group 此刻可能已有爆炸偏移）
  reg.group.updateWorldMatrix(true, false)
  const inv = reg.group.matrixWorld.clone().invert()
  box.applyMatrix4(inv)
  reg.boxLocal = box
}

export interface ConnectorRefs {
  pathMain: SVGPathElement
  pathChip: SVGPathElement
  chipsRoot: HTMLDivElement
}

// 预分配复用向量（每帧零分配）
const v = new THREE.Vector3()
const anchor = new THREE.Vector3()
const proj = new THREE.Vector3()

export function startConnectorEngine(refs: ConnectorRefs, isCancelled: () => boolean): () => void {
  let raf = 0

  // 视口尺寸缓存：canvas 恒为全屏 fixed，resize 时置脏、下帧重读
  let vw = 0
  let vh = 0
  const onResize = (): void => {
    vw = 0
  }
  window.addEventListener('resize', onResize)

  // DOM 引用缓存：条目随选中变化，词卡随设备变化；元素卸载重建后自动重查
  let entrySel = ''
  let entryEl: HTMLElement | null = null
  let chipCacheKey = ''
  let chipCache: Array<{ id: string; el: HTMLElement | null; h: number }> = []

  // 冗余写护栏：值未变化时不触碰 DOM（相机静止的稳态帧零重排）
  let lastMainD = ''
  let lastMainOpacity = ''
  let lastChipD = ''
  let lastChipOpacity = ''
  const lastChipTop = new Map<string, number>()
  const lastChipShown = new Map<string, boolean>()

  const setOpacity = (el: SVGPathElement, value: string, last: string): string => {
    if (last !== value) el.style.opacity = value
    return value
  }

  const tick = (): void => {
    if (isCancelled()) return
    raf = requestAnimationFrame(tick)
    const s = useAppStore.getState()
    const camera = threeBridge.camera
    const canvas = threeBridge.canvas
    if (!camera || !canvas) return

    const panelVisible = s.mode === 'exploded' || s.mode === 'inspecting' || s.mode === 'nested'
    const sel = s.selectedLayerId
    if (!panelVisible || !sel) {
      lastMainOpacity = setOpacity(refs.pathMain, '0', lastMainOpacity)
      lastChipOpacity = setOpacity(refs.pathChip, '0', lastChipOpacity)
      return
    }
    const ctx = resolveDeviceContext(s.devicePath)
    if (!ctx) return
    const layer = ctx.device.layers.find((l) => l.id === sel)
    const reg = layerRegistry.get(ctx.device.id, sel)
    if (!layer || !reg) {
      lastMainOpacity = setOpacity(refs.pathMain, '0', lastMainOpacity)
      lastChipOpacity = setOpacity(refs.pathChip, '0', lastChipOpacity)
      return
    }
    computeLayerLocalBox(ctx.device.id, sel)
    const box = reg.boxLocal
    if (!box) return

    if (!vw || !vh) {
      const rect = canvas.getBoundingClientRect()
      vw = rect.width
      vh = rect.height
    }

    // —— DOM 引用缓存（读矩形前完成全部查询）——
    if (entrySel !== sel || !entryEl || !entryEl.isConnected) {
      entryEl = document.querySelector<HTMLElement>(`[data-entry-id="${sel}"]`)
      entrySel = sel
    }
    if (chipCacheKey !== ctx.device.id) {
      chipCache = ctx.device.layers.map((l) => {
        const el = refs.chipsRoot.querySelector<HTMLElement>(`[data-chip-id="${l.id}"]`)
        return { id: l.id, el, h: el?.offsetHeight || 26 }
      })
      chipCacheKey = ctx.device.id
    }

    // —— 世界锚点：层包围盒朝向侧边栏一侧的边中点 ——
    reg.group.getWorldPosition(v)
    anchor.set(
      layer.anchor === 'left' ? v.x + box.min.x : v.x + box.max.x,
      v.y + (box.min.y + box.max.y) / 2,
      v.z + (box.min.z + box.max.z) / 2,
    )
    proj.copy(anchor).project(camera)
    const behind = proj.z > 1
    const ax = (proj.x * 0.5 + 0.5) * vw
    const ay = (-proj.y * 0.5 + 0.5) * vh

    // —— 批量读取（矩形读取放在全部写入之前，单次布局 flush）——
    const entry = entryEl && entryEl.isConnected && !behind ? entryEl : null
    const entryRect = entry?.getBoundingClientRect() ?? null
    const selChip = behind ? null : chipCache.find((c) => c.id === sel && c.el?.isConnected)
    const chipRect = selChip?.el?.getBoundingClientRect() ?? null

    // —— 统一写入：左侧条目连线（铁律 L6 直角折线）——
    if (!entry || !entryRect) {
      lastMainOpacity = setOpacity(refs.pathMain, '0', lastMainOpacity)
    } else {
      const entryY = entryRect.top + entryRect.height / 2
      const panelEdge = entryRect.right
      const dir = layer.anchor === 'left' ? -1 : 1
      const elbowX = ax + 24 * dir
      const d = `M${ax.toFixed(1)},${ay.toFixed(1)} L${elbowX.toFixed(1)},${ay.toFixed(1)} L${elbowX.toFixed(1)},${entryY.toFixed(1)} L${panelEdge.toFixed(1)},${entryY.toFixed(1)}`
      if (d !== lastMainD) {
        refs.pathMain.setAttribute('d', d)
        lastMainD = d
      }
      lastMainOpacity = setOpacity(refs.pathMain, '1', lastMainOpacity)
    }

    // —— 选中层的词卡短线（更短、更细，同样直角）——
    if (!selChip || !chipRect) {
      lastChipOpacity = setOpacity(refs.pathChip, '0', lastChipOpacity)
    } else {
      const dir = layer.anchor === 'left' ? -1 : 1
      const elbowX = ax + 20 * dir
      const chipY = chipRect.top + chipRect.height / 2
      const chipEdge = layer.anchor === 'left' ? chipRect.right + 6 : chipRect.left - 6
      const d = `M${(ax + 2 * dir).toFixed(1)},${ay.toFixed(1)} L${elbowX.toFixed(1)},${ay.toFixed(1)} L${elbowX.toFixed(1)},${chipY.toFixed(1)} L${chipEdge.toFixed(1)},${chipY.toFixed(1)}`
      if (d !== lastChipD) {
        refs.pathChip.setAttribute('d', d)
        lastChipD = d
      }
      lastChipOpacity = setOpacity(refs.pathChip, '0.7', lastChipOpacity)
    }

    // —— 右栏词卡跟随各自层的屏幕 Y（一瞥即懂，贴近对应层）——
    for (const c of chipCache) {
      if (!c.el?.isConnected) continue
      const lreg = layerRegistry.get(ctx.device.id, c.id)
      if (!lreg || !lreg.boxLocal) continue
      lreg.group.getWorldPosition(v)
      proj.copy(v).project(camera)
      if (proj.z > 1) {
        if (lastChipShown.get(c.id) !== false) {
          c.el.style.opacity = '0'
          lastChipShown.set(c.id, false)
        }
        continue
      }
      const cy = (-proj.y * 0.5 + 0.5) * vh
      const top = Math.min(Math.max(cy - c.h / 2, 8), vh - c.h - 8)
      const prevTop = lastChipTop.get(c.id)
      if (prevTop === undefined || Math.abs(prevTop - top) >= 1) {
        c.el.style.top = `${top.toFixed(0)}px`
        lastChipTop.set(c.id, top)
      }
      if (lastChipShown.get(c.id) !== true) {
        c.el.style.opacity = '1'
        lastChipShown.set(c.id, true)
      }
    }
  }

  // 导线颜色恒定，挂载期设置一次即可（原先每帧 setAttribute 同值）
  refs.pathMain.setAttribute('stroke', colors.accentMint)
  refs.pathChip.setAttribute('stroke', colors.accentMint)

  raf = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', onResize)
  }
}
