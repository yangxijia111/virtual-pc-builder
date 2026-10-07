/**
 * ExplodedViewManager 纯逻辑模块（文档 3.2）：
 * - computeExplodeOffsets：垂直爆炸偏移（铁律 L2，对齐 image_0：layers[0] 最上）
 * - stagger 时间平移采样：每层 0.5s + 80ms 依次弹开
 * - 爆炸时钟：全局进度 0→1 线性推进，组装逆序（底壳先落座、键帽最后盖上）
 * - 层注册表：供连线引擎查询层的实时世界锚点
 */
import * as THREE from 'three'
import type { LayerDef } from '../data/types'
import { motion, explosion as explosionTokens } from '../styles/tokens'

/** 拆解顺序 = layers 数组顺序（自上而下）；键帽层 i=0 爆炸位最高（对齐 image_0） */
export function computeExplodeOffsets(layers: LayerDef[], gap: number): Array<{ x: number; y: number; z: number }> {
  const n = layers.length
  const mid = (n - 1) / 2
  return layers.map((_, i) => ({ x: 0, y: (mid - i) * gap, z: 0 }))
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** easeOutCubic：展开用 */
export function easeOutCubic(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}

/** easeOutBack（s 控制过冲幅度）：组装落座回弹用，默认约 4% 过冲（文档 4.6） */
export function easeOutBack(t: number, overshoot = motion.seatOvershoot): number {
  // 由目标过冲比例反推 back 参数：过冲 ≈ s / 3 后的峰值
  const s = overshoot * 12.5
  const u = t - 1
  return 1 + (s + 1) * u * u * u + s * u * u
}

/**
 * stagger 采样：把全局进度 t 平移到某层的局部进度。
 * - 拆解：index=0（最上层）先动
 * - 组装（reverse=true）：index 大者（底层）先落座
 */
export function sampleLayerLocal(t: number, index: number, count: number, reverse: boolean): number {
  const stagger = motion.staggerStep
  const layerDur = 0.5 // 单层可见动画时长（秒）
  const total = layerDur + (count - 1) * stagger // 全局时钟走完一遍的秒数
  const ti = t * total
  const start = reverse ? (count - 1 - index) * stagger : index * stagger
  return clamp01((ti - start) / layerDur)
}

/** 爆炸时钟（React 外可变单例；explosionProgress 由 3D 侧每帧直写） */
class ExplosionClocks {
  /** deviceId -> 0~1 */
  progress = new Map<string, number>()
  /** 到达观察者：时钟到达目标时回调（用于解锁 transitioning） */
  onArrive: ((deviceId: string, target: 0 | 1) => void) | null = null

  ensure(id: string): number {
    let v = this.progress.get(id)
    if (v === undefined) {
      v = 0
      this.progress.set(id, v)
    }
    return v
  }

  /** 每帧推进：向 store.explosionTargets 中声明的目标线性推进 */
  update(delta: number, targets: Record<string, 0 | 1>): void {
    for (const [id, target] of Object.entries(targets)) {
      const cur = this.ensure(id)
      if (cur === target) continue
      // 全程时长：按该设备层数计算（含 stagger 尾巴），文档动效预算 1.0–1.4s
      const dir = target === 1 ? 1 : -1
      const next = cur + (dir * delta) / motion.explodeDuration
      const arrived = dir === 1 ? next >= target : next <= target
      const clamped = arrived ? target : next
      this.progress.set(id, clamped)
      if (arrived) this.onArrive?.(id, target)
    }
  }
}

export const explosionClocks = new ExplosionClocks()

// ————————————————————————————————
// 层注册表：设备内每个层的 Group 引用（连线引擎与高亮系统使用）
// ————————————————————————————————

export interface LayerNodeReg {
  deviceId: string
  layerId: string
  group: THREE.Group
  /** 该层全部材质（高亮/降暗直接操作；层间独立实例） */
  materials: THREE.Material[]
  /** 材质原始参数缓存 */
  baseOpacity: Map<THREE.Material, number>
  baseEmissive: Map<THREE.Material, { color: THREE.Color; intensity: number }>
  /** 霓虹强调色（轴体红等） */
  colorEmphasis?: 'red' | 'mint'
  /** 层局部包围盒（连线引擎缓存；首用时计算） */
  boxLocal?: THREE.Box3
}

class LayerRegistry {
  /** deviceId -> layerId -> reg */
  private byDevice = new Map<string, Map<string, LayerNodeReg>>()

  register(reg: LayerNodeReg): void {
    let m = this.byDevice.get(reg.deviceId)
    if (!m) {
      m = new Map()
      this.byDevice.set(reg.deviceId, m)
    }
    m.set(reg.layerId, reg)
  }

  unregister(deviceId: string, layerId: string): void {
    this.byDevice.get(deviceId)?.delete(layerId)
  }

  get(deviceId: string, layerId: string): LayerNodeReg | undefined {
    return this.byDevice.get(deviceId)?.get(layerId)
  }

  allLayers(deviceId: string): LayerNodeReg[] {
    return Array.from(this.byDevice.get(deviceId)?.values() ?? [])
  }

  /** 查询层锚点：包围盒朝向侧边栏一侧的边中点（世界坐标，每帧现算） */
  getAnchorWorldPos(deviceId: string, layerId: string, side: 'left' | 'right', out: THREE.Vector3): boolean {
    const reg = this.get(deviceId, layerId)
    if (!reg) return false
    const box = new THREE.Box3().setFromObject(reg.group)
    if (!box.isEmpty()) {
      // 朝向侧边栏一侧的竖边中点：left 侧取 minX 边、right 侧取 maxX 边
      out.set(side === 'left' ? box.min.x : box.max.x, (box.min.y + box.max.y) / 2, side === 'left' ? box.min.z : box.max.z)
      return true
    }
    reg.group.getWorldPosition(out)
    return true
  }
}

export const layerRegistry = new LayerRegistry()

/** 由设备数据推爆炸层间距（米）：explodeGap × 设备归一化尺寸（最大水平边）× gapScale */
export function computeGap(explodeGap: number, deviceWidth: number, deviceDepth: number): number {
  return explodeGap * Math.max(deviceWidth, deviceDepth) * explosionTokens.gapScale
}
