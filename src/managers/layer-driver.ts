/**
 * 层驱动（ExplodedViewManager 的每帧执行核心，React 外纯逻辑）：
 * - 层位姿：stagger 采样 + easeOutCubic（拆解）/ easeOutBack 落座回弹（组装逆序）
 * - 高亮/降暗：选中层 emissive 提亮，其余层透明度 damp 至 0.35；nested 态父设备其余层 0.2
 * - 呼吸灯：colorEmphasis 层 sin 驱动（周期 4s、幅度 5%）
 * - 组装 flash：整设备 emissive 脉冲 320ms（文档 4.6）
 */
import * as THREE from 'three'
import type { LayerDef } from '../data/types'
import {
  computeExplodeOffsets,
  easeOutBack,
  easeOutCubic,
  layerRegistry,
  sampleLayerLocal,
} from './exploded'
import { motion, explosion as explosionTokens } from '../styles/tokens'

export interface LayerDriverInput {
  deviceId: string
  layers: LayerDef[]
  /** 每层的 Group 引用（挂载时解析一次，避免每帧 getObjectByName 遍历） */
  layerGroups: (THREE.Group | undefined)[]
  /** 设备包围盒尺寸（米），推 gap 用 */
  width: number
  depth: number
  progress: number // 爆炸全局进度 0~1
  assembling: boolean // 本帧方向：true = 组装（逆序 + 落座回弹）
  selectedLayerId: string | null
  hoverLayerId: string | null
  /** nested 激活：父宿主层隐藏、其余层降暗 0.2 */
  nestedHostLayerId: string | null
  flashPulse: number // 0~1
  time: number // 全局秒（呼吸灯相位）
  delta: number
  /** devices.json 的 explodeGap 原始值 */
  explodeGap: number
}

/** 每设备缓存的 offsets（尺寸不变，构建期算一次） */
const offsetsCache = new Map<string, Array<{ x: number; y: number; z: number }>>()

/** gap = explodeGap × 设备归一化尺寸（最大水平边）× gapScale（文档 4.3） */
export function getOffsets(input: Pick<LayerDriverInput, 'deviceId' | 'layers' | 'width' | 'depth' | 'explodeGap'>) {
  let off = offsetsCache.get(input.deviceId)
  if (!off) {
    const gap = input.explodeGap * Math.max(input.width, input.depth) * explosionTokens.gapScale
    off = computeExplodeOffsets(input.layers, gap)
    offsetsCache.set(input.deviceId, off)
  }
  return off
}

/** 每帧驱动一台设备的全部层 */
export function updateLayers(input: LayerDriverInput): void {
  const { deviceId, layers, layerGroups, progress, assembling, delta } = input
  const offsets = getOffsets(input)
  const n = layers.length

  layers.forEach((layer, i) => {
    const g = layerGroups[i]
    if (!g) return
    // —— 位姿：stagger 平移采样 ——
    const local = sampleLayerLocal(progress, i, n, assembling)
    const eased = assembling ? easeOutBack(local) : easeOutCubic(local)
    g.position.set(offsets[i].x, offsets[i].y * eased, offsets[i].z)
    // nested 激活时宿主层整体隐藏（由子设备模型替代）
    g.visible = !(input.nestedHostLayerId === layer.id)
  })

  // —— 材质：高亮 / 降暗 / 呼吸 / flash ——
  const breath = Math.sin((input.time * Math.PI * 2) / motion.breathPeriod) * motion.breathAmplitude
  for (const layer of layers) {
    const reg = layerRegistry.get(deviceId, layer.id)
    if (!reg) continue
    const isSelected = input.selectedLayerId === layer.id
    const isHover = input.hoverLayerId === layer.id
    let opacityTarget = 1
    if (input.selectedLayerId) opacityTarget = isSelected ? 1 : 0.35
    if (input.nestedHostLayerId && layer.id !== input.nestedHostLayerId) opacityTarget = Math.min(opacityTarget, 0.2)
    for (const mat of reg.materials) {
      const std = mat as THREE.MeshStandardMaterial
      const baseOp = reg.baseOpacity.get(mat) ?? 1
      std.opacity = THREE.MathUtils.damp(std.opacity, baseOp * opacityTarget, 6, delta)
      std.transparent = true
      std.depthWrite = std.opacity > 0.6
      // emissive：基线 + 选中提亮 + hover 微亮 + 呼吸（仅霓虹层）+ flash 脉冲；降暗层同步压暗
      const base = reg.baseEmissive.get(mat)
      if (base) {
        let target = base.intensity * opacityTarget
        if (isSelected) target = Math.max(base.intensity, 0.35) + (reg.colorEmphasis ? 0.9 : 0.55)
        else if (isHover) target += 0.18
        if (reg.colorEmphasis) target = Math.max(target, 0.35) * (1 + breath)
        target += input.flashPulse * 1.6
        std.emissiveIntensity = THREE.MathUtils.damp(std.emissiveIntensity, target, 8, delta)
      }
    }
  }
}
