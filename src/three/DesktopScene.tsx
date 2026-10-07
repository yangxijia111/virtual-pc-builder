/**
 * DesktopScene（F1 总览）：桌面 + 桌垫 + 四设备锚点 + 接触阴影。
 * DeviceAnchor 承担 F2~F6 的每帧驱动：总览↔舞台位姿、淡入淡出、层驱动、嵌套子设备。
 * 全部插值在 useFrame 内完成，零 setState（文档 6.5 帧预算）。
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { damp3 } from 'maath/easing'
import { topDevices, useAppStore } from '../store/useAppStore'
import { buildDeviceModel, buildDeskModel } from './models/registry'
import { layerRegistry, explosionClocks } from '../managers/exploded'
import { updateLayers } from '../managers/layer-driver'
import { dimsRegistry } from './SceneManager'
import { registerPickRoot } from './pick-roots'
import { colors, explosion as explosionTokens, motion, motionScale } from '../styles/tokens'
import type { DeviceDef, LayerDef } from '../data/types'

/** 总览桌面布局（世界坐标；设备局部原点=底面中心） */
const LAYOUT: Record<string, { pos: [number, number, number]; rotY: number }> = {
  keyboard: { pos: [0.02, 0.74, 0.18], rotY: -0.04 },
  'pc-tower': { pos: [-0.58, 0.74, -0.06], rotY: -0.5 },
  monitor: { pos: [0.06, 0.74, -0.3], rotY: 0.06 },
  mouse: { pos: [0.42, 0.74, 0.2], rotY: 0.4 },
}

export function DesktopScene(): JSX.Element {
  const desk = useMemo(() => buildDeskModel(), [])
  const deskRef = useRef<THREE.Group>(null)
  // 聚焦/爆炸时桌面降暗，保持"任何时刻画面只有一个视觉主体"（文档 1.4 原则 2）
  useFrame((_, delta) => {
    const s = useAppStore.getState()
    const g = deskRef.current
    if (!g) return
    const target = s.mode === 'overview' ? 1 : 0.28
    g.visible = dampFadeOpacity(rootMaterials(g), target, 2.4, delta, 0.03, 0.55)
  })
  return (
    <group name="desktop-root">
      <group ref={deskRef}>
        <primitive object={desk} />
      </group>
      {Object.keys(topDevices).map((key) => (
        <DeviceAnchor key={key} deviceKey={key} />
      ))}
      <ContactShadowsRig />
    </group>
  )
}

/** 接触阴影：爆炸时随层间距淡出（文档 4.3） */
function ContactShadowsRig(): JSX.Element {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    const s = useAppStore.getState()
    const exploded = s.mode === 'exploded' || s.mode === 'inspecting' || s.mode === 'nested'
    const target = exploded ? 0.22 : 0.55
    const g = ref.current
    if (!g) return
    // 阴影平面材质不参与 depthWrite 管理（避免平面写深度遮挡设备）
    dampFadeOpacity(rootMaterials(g), target, 4, delta, 0, null)
  })
  return <ContactShadows ref={ref} position={[0, 0.7405, 0]} scale={2.4} far={0.9} blur={2.4} resolution={512} color={colors.bgVignette} />
}

/** 单设备锚点：模型常驻挂载，按模式驱动位姿/可见性/层爆炸 */
function DeviceAnchor({ deviceKey }: { deviceKey: string }): JSX.Element | null {
  const def = topDevices[deviceKey]
  const built = useMemo(() => buildDeviceModel(deviceKey, def), [deviceKey, def])
  const rootRef = useRef<THREE.Group>(null)
  const layout = LAYOUT[deviceKey]
  // 层 Group 引用挂载期解析一次（模型结构静态，避免每帧 getObjectByName 全树遍历）
  const layerGroupsRef = useRef<Array<THREE.Group | undefined>>([])

  // 层注册 + 尺寸注册（挂载一次）
  useEffect(() => {
    dimsRegistry.set(def.id, built.dims)
    const groups = def.layers.map((l) => built.root.getObjectByName(l.id) as THREE.Group | undefined)
    layerGroupsRef.current = groups
    const unregisterPick = registerPickRoot(built.root)
    def.layers.forEach((l, i) => {
      const g = groups[i]
      if (!g) return
      layerRegistry.register({
        deviceId: def.id,
        layerId: l.id,
        group: g,
        materials: collectMaterials(g),
        baseOpacity: new Map(),
        baseEmissive: new Map(),
        colorEmphasis: l.colorEmphasis,
      })
    })
    // 基线材质参数缓存
    for (const l of def.layers) {
      const reg = layerRegistry.get(def.id, l.id)
      if (!reg) continue
      for (const m of reg.materials) {
        const std = m as THREE.MeshStandardMaterial
        reg.baseOpacity.set(m, std.opacity)
        reg.baseEmissive.set(m, { color: std.emissive.clone(), intensity: std.emissiveIntensity })
      }
    }
    return () => {
      unregisterPick()
      for (const l of def.layers) layerRegistry.unregister(def.id, l.id)
    }
  }, [def, built])

  useFrame((state, delta) => {
    const s = useAppStore.getState()
    const root = rootRef.current
    if (!root) return
    const isFocused = s.devicePath[0] === def.id
    // damp3 第三参为 smoothTime（秒）：位姿过渡 ≈0.35s 量级；reduced-motion 时缩短
    const smooth = 0.35 / motionScale

    // —— 位姿：总览布局位 ↔ 聚焦舞台位 ——
    if (isFocused) {
      damp3(root.position, [0, explosionTokens.focusStageY, 0], smooth, delta)
      root.rotation.y = THREE.MathUtils.damp(root.rotation.y, 0, 6 * motionScale, delta) // 归零朝向，focusCamera 为局部坐标
    } else {
      damp3(root.position, layout.pos, smooth, delta)
      root.rotation.y = THREE.MathUtils.damp(root.rotation.y, layout.rotY, 6 * motionScale, delta)
    }

    // —— 可见性：非聚焦设备淡出（收尾 visible=false）——
    const opacityTarget = s.mode === 'overview' || isFocused ? 1 : 0
    const visible = dampFadeOpacity(rootMaterials(root), opacityTarget, 5 * motionScale, delta, 0.02, 0.55)
    root.visible = visible
    if (!isFocused || !visible) return

    // —— 聚焦中：驱动层爆炸/高亮 ——
    const progress = explosionClocks.progress.get(def.id) ?? 0
    const target = s.explosionTargets[def.id] ?? 0
    const assembling = target === 0 && progress > 0
    const layerGroups = layerGroupsRef.current
    const flashPulse = flashEnvelope(s.assemblyFlashAt)
    const nestedHostLayerId = s.devicePath[1]
      ? (def.layers.find((l) => l.nested?.id === s.devicePath[1])?.id ?? null)
      : null
    updateLayers({
      deviceId: def.id,
      layers: def.layers,
      layerGroups,
      width: built.dims.x,
      depth: built.dims.z,
      explodeGap: def.explodeGap,
      progress,
      assembling,
      selectedLayerId: s.devicePath.length === 1 ? s.selectedLayerId : null,
      hoverLayerId: s.devicePath.length === 1 ? s.hoverLayerId : null,
      nestedHostLayerId,
      flashPulse: s.devicePath.length === 1 ? flashPulse : 0,
      time: state.clock.elapsedTime,
      delta,
    })
  })

  return (
    <group ref={rootRef} position={layout.pos} rotation-y={layout.rotY}>
      <primitive object={built.root} />
      {def.layers.filter((l) => l.nested).map((l) => (
        <NestedDeviceHost key={l.nested!.id} parentDef={def} hostLayer={l} />
      ))}
    </group>
  )
}

/** F5 嵌套子设备：挂在父设备根下，激活时出现在宿主层爆炸位，按同一套层驱动逻辑爆炸（每层独立宿主） */
function NestedDeviceHost({ parentDef, hostLayer }: { parentDef: DeviceDef; hostLayer: LayerDef }): JSX.Element {
  const subDef = hostLayer.nested!
  const built = useMemo(() => buildDeviceModel(parentDef.id, subDef), [subDef, parentDef])
  const rootRef = useRef<THREE.Group>(null)
  const layerGroupsRef = useRef<Array<THREE.Group | undefined>>([])

  useEffect(() => {
    dimsRegistry.set(subDef.id, built.dims)
    const groups = subDef.layers.map((l) => built.root.getObjectByName(l.id) as THREE.Group | undefined)
    layerGroupsRef.current = groups
    const unregisterPick = registerPickRoot(built.root)
    subDef.layers.forEach((l, i) => {
      const g = groups[i]
      if (!g) return
      layerRegistry.register({
        deviceId: subDef.id,
        layerId: l.id,
        group: g,
        materials: collectMaterials(g),
        baseOpacity: new Map(),
        baseEmissive: new Map(),
        colorEmphasis: l.colorEmphasis,
      })
    })
    for (const l of subDef.layers) {
      const reg = layerRegistry.get(subDef.id, l.id)
      if (!reg) continue
      for (const m of reg.materials) {
        const std = m as THREE.MeshStandardMaterial
        reg.baseOpacity.set(m, std.opacity)
        reg.baseEmissive.set(m, { color: std.emissive.clone(), intensity: std.emissiveIntensity })
      }
    }
    return () => {
      unregisterPick()
      for (const l of subDef.layers) layerRegistry.unregister(subDef.id, l.id)
    }
  }, [subDef, built])

  useFrame((state, delta) => {
    const s = useAppStore.getState()
    const root = rootRef.current
    if (!root) return
    const active = s.devicePath[1] === subDef.id
    root.visible = active
    if (!active) return
    // 位置 = 宿主层当前爆炸位；朝向由数据决定（散热器风扇脸朝玻璃侧，CPU 平放顶盖朝上）
    const reg = layerRegistry.get(s.devicePath[0], hostLayer.id)
    root.position.y = reg ? reg.group.position.y : 0
    root.rotation.y = subDef.mountRotationY ?? Math.PI / 2

    const progress = explosionClocks.progress.get(subDef.id) ?? 0
    const target = s.explosionTargets[subDef.id] ?? 0
    const layerGroups = layerGroupsRef.current
    updateLayers({
      deviceId: subDef.id,
      layers: subDef.layers,
      layerGroups,
      width: built.dims.x,
      depth: built.dims.z,
      explodeGap: subDef.explodeGap,
      progress,
      assembling: target === 0 && progress > 0,
      selectedLayerId: s.selectedLayerId,
      hoverLayerId: s.hoverLayerId,
      nestedHostLayerId: null,
      flashPulse: flashEnvelope(s.assemblyFlashAt),
      time: state.clock.elapsedTime,
      delta,
    })
  })

  return (
    <group ref={rootRef} visible={false}>
      <primitive object={built.root} />
    </group>
  )
}

// ———————————————————————— 工具 ————————————————————————

function collectMaterials(root: THREE.Object3D): THREE.Material[] {
  const out = new Set<THREE.Material>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((m) => out.add(m))
    }
  })
  return Array.from(out)
}

const rootMaterialCache = new WeakMap<THREE.Object3D, THREE.Material[]>()
function rootMaterials(root: THREE.Object3D): THREE.Material[] {
  let mats = rootMaterialCache.get(root)
  if (!mats) {
    mats = collectMaterials(root)
    rootMaterialCache.set(root, mats)
  }
  return mats
}

/** 组装 flash 包络：完成后 0.32s 内 0→1→0 脉冲 */
function flashEnvelope(flashAt: number): number {
  if (!flashAt) return 0
  const t = (performance.now() - flashAt) / 1000
  if (t < 0 || t > motion.flashDuration) return 0
  const k = t / motion.flashDuration
  return Math.sin(k * Math.PI)
}

/**
 * 把一组材质的 opacity 阻尼到 target，并维护 transparent / depthWrite（可关）；
 * 返回整体可见性（最暗材质 > visibleThreshold）。
 * 注意：与层驱动的高亮/降暗存在双向阻尼叠加（先淡出后层驱动，后者同帧覆盖），
 * 稳态亮度是两者的平衡值——必须逐帧无条件执行，收敛冻结会改变已验收的观感。
 */
function dampFadeOpacity(
  mats: THREE.Material[],
  target: number,
  lambda: number,
  delta: number,
  visibleThreshold: number,
  depthWriteThreshold: number | null,
): boolean {
  let minOp = 1
  for (const m of mats) {
    const std = m as THREE.MeshStandardMaterial
    std.opacity = THREE.MathUtils.damp(std.opacity, target, lambda, delta)
    std.transparent = true
    if (depthWriteThreshold !== null) std.depthWrite = std.opacity > depthWriteThreshold
    if (std.opacity < minOp) minOp = std.opacity
  }
  return minOp > visibleThreshold
}
