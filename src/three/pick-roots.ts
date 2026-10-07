/**
 * 可拾取设备根注册表：RaycastManager 的射线检测只扫描这里登记的设备模型根，
 * 并按当帧可见性过滤——跳过桌面 / 接触阴影 / 已淡出与隐藏的嵌套设备
 *（three.js Raycaster 不会自动跳过 visible=false 的对象，全场景扫描既浪费，
 *  又会让隐藏模型遮挡真实命中）。DeviceAnchor / NestedDeviceHost 挂载时登记。
 */
import type * as THREE from 'three'

const roots = new Set<THREE.Group>()

/** 登记设备模型根，返回注销函数（挂载 effect 清理用） */
export function registerPickRoot(root: THREE.Group): () => void {
  roots.add(root)
  return () => {
    roots.delete(root)
  }
}

/** 当前可见的设备根（射线检测目标列表；O(n) n=设备数） */
export function visiblePickRoots(): THREE.Group[] {
  const out: THREE.Group[] = []
  roots.forEach((r) => {
    if (r.visible) out.push(r)
  })
  return out
}
