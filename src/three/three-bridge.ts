/**
 * R3F 场景 → DOM UI 的单向桥（只读）。
 * ConnectorLineEngine 每帧读取 camera/canvas 投影锚点；禁止 UI 反向写 3D 状态。
 * scene 仅供 dev 验收脚本（window.__vpc）只读巡检，业务代码勿依赖。
 */
import type * as THREE from 'three'

export const threeBridge: {
  camera: THREE.PerspectiveCamera | null
  canvas: HTMLCanvasElement | null
  scene: THREE.Scene | null
} = {
  camera: null,
  canvas: null,
  scene: null,
}
