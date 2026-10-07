/**
 * 模型注册表（AssetLoader 职责的程序化实现）：
 * - 预构建四台设备 + 散热器子设备模型并缓存（LoadingScreen 分帧推进真实进度）
 * - groupLayers 按 devices.json 的 nodeNames 前缀归组并注入 userData（与未来 GLB 路径共用）
 * - dev 命名校验：未匹配任何层的 mesh 打警告（文档 5.3 validate-models 语义）
 */
import * as THREE from 'three'
import type { DeviceDef } from '../../data/types'
import { topDevices } from '../../store/useAppStore'
import { groupLayers } from './parts'
import { buildKeyboard } from './keyboard'
import { buildPcTower } from './pcTower'
import { buildMonitor } from './monitor'
import { buildMouse } from './mouse'
import { buildCooler } from './cooler'
import { buildCpu } from './cpu'
import { buildGpu } from './gpu'
import { buildDesk } from './desk'

const factories: Record<string, () => THREE.Group> = {
  'kbd-01': buildKeyboard,
  'tower-01': buildPcTower,
  'mon-01': buildMonitor,
  'mouse-01': buildMouse,
  'cooler-nested': buildCooler,
  'cpu-nested': buildCpu,
  'gpu-nested': buildGpu,
}

const cache = new Map<string, THREE.Group>()

export interface BuiltModel {
  root: THREE.Group
  /** 设备包围盒尺寸（米） */
  dims: THREE.Vector3
}

/** 构建设备模型：按 nodeNames 归组 + 注入 userData + 缓存 */
export function buildDeviceModel(deviceKey: string, def: DeviceDef): BuiltModel {
  const cached = cache.get(def.id)
  if (cached) {
    const box = new THREE.Box3().setFromObject(cached)
    return { root: cached, dims: box.getSize(new THREE.Vector3()) }
  }
  const factory = factories[def.id]
  const root = factory ? factory() : new THREE.Group()
  root.name = root.name || def.id
  root.userData = { ...root.userData, deviceKey, deviceId: def.id }
  groupLayers(root, def.layers, { deviceKey, deviceId: def.id })
  // dev 命名校验：找不到任何未归组 mesh 即通过
  if (import.meta.env.DEV) {
    const ungrouped: string[] = []
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.parent === root) ungrouped.push(o.name)
    })
    if (ungrouped.length > 0) {
      console.warn(`[validate-models] ${def.id} 有 ${ungrouped.length} 个 mesh 未匹配任何层:`, ungrouped)
    }
  }
  cache.set(def.id, root)
  const box = new THREE.Box3().setFromObject(root)
  return { root, dims: box.getSize(new THREE.Vector3()) }
}

/** 桌面静态件（不参与拆解） */
export function buildDeskModel(): THREE.Group {
  return buildDesk()
}

/** 全量预构建（LoadingScreen 进度回调 n/total）；防重入（StrictMode 双执行） */
let prepareStarted = false
export function prepareAllModels(onProgress: (done: number, total: number) => void): void {
  if (prepareStarted) return
  prepareStarted = true
  const entries = Object.entries(topDevices)
  const total = entries.length + 1
  // 程序化几何构建总量 <100ms，同步完成最稳妥：
  // 后台标签/不可见 webview 中 requestAnimationFrame 会被节流到 ~1fps，分帧链会让加载屏假死
  let done = 0
  for (const [key, def] of entries) {
    try {
      buildDeviceModel(key, def)
      // 子设备模型一并预构建
      for (const layer of def.layers) {
        if (layer.nested) {
          const sub = factories[layer.nested.id]
          if (sub) {
            const g = sub()
            g.name = layer.nested.id
            g.userData = { deviceKey: key, deviceId: layer.nested.id }
            groupLayers(g, layer.nested.layers, { deviceKey: key, deviceId: layer.nested.id })
            cache.set(layer.nested.id, g)
          }
        }
      }
    } catch (e) {
      console.error('[prepareAllModels] 构建失败:', key, e)
    }
    done += 1
    onProgress(done, total)
  }
  try {
    buildDeskModel()
  } catch (e) {
    console.error('[prepareAllModels] 桌面构建失败:', e)
  }
  onProgress(total, total)
}
