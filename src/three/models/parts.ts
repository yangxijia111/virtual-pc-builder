/**
 * 程序化建模共享工具。
 * 约定与 GLB 资产管线对齐（文档 5.3）：
 * - mesh 命名 = `${nodeNames 前缀}_${序号}`，由通用 groupLayers() 按 devices.json 归组并注入 userData
 * - 每层材质独立实例，保证高亮/淡出互不串扰
 * 全部几何共享 unit 原型 + scale，低面数、低 GC 压力。
 */
import * as THREE from 'three'

// —— unit 几何原型（全场景共享）——
export const unitBox = new THREE.BoxGeometry(1, 1, 1)
export const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 24)
export const unitSphere = new THREE.SphereGeometry(0.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2) // 上半球
export const unitSphereLower = new THREE.SphereGeometry(0.5, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2) // 下半球
export const unitTorus = new THREE.TorusGeometry(1, 0.18, 12, 32)

export interface MatSpec {
  color: number | string
  metalness?: number
  roughness?: number
  emissive?: number | string
  emissiveIntensity?: number
  opacity?: number
  transparent?: boolean
}

export function makeStd(spec: MatSpec): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.color),
    metalness: spec.metalness ?? 0.1,
    roughness: spec.roughness ?? 0.6,
    emissive: new THREE.Color(spec.emissive ?? 0x000000),
    emissiveIntensity: spec.emissiveIntensity ?? 0,
  })
  if (spec.transparent || (spec.opacity !== undefined && spec.opacity < 1)) {
    m.transparent = true
    m.opacity = spec.opacity ?? 1
  }
  return m
}

/** 钢化玻璃：MeshPhysicalMaterial transmission（文档 6.3） */
export function makeGlass(color = '#AFC6CE', opacity = 0.32): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: 0,
    roughness: 0.06,
    transparent: true,
    opacity,
    transmission: 0.55,
    thickness: 0.004,
  })
  return m
}

/** 盒：unit 几何 + scale（米） */
export function box(w: number, h: number, d: number, mat: THREE.Material, name: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(unitBox, mat)
  mesh.scale.set(w, h, d)
  mesh.position.set(x, y, z)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** 圆柱（y 轴向） */
export function cyl(
  r: number,
  h: number,
  mat: THREE.Material,
  name: string,
  x = 0,
  y = 0,
  z = 0,
  seg = 24,
): THREE.Mesh {
  const geo = seg === 24 ? unitCylinder : new THREE.CylinderGeometry(0.5, 0.5, 1, seg)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.scale.set(r * 2, h, r * 2)
  mesh.position.set(x, y, z)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** 实例填充回调的临时对象（复用，避免构建期分配） */
export interface InstanceScratch {
  p: THREE.Vector3
  q: THREE.Quaternion
  e: THREE.Euler
  s: THREE.Vector3
}

/**
 * 批量实例：同一几何/材质、仅位姿不同的重复件（鳍片 / 扇叶 / 滚轮刻度等）
 * 合成为单个 InstancedMesh —— N 个 mesh 的 draw call 与材质实例收敛为 1。
 * fill 回调负责写入第 i 个实例的矩阵（用 scratch 组装，勿闭包捕获）。
 */
export function makeInstanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  name: string,
  count: number,
  fill: (i: number, m: THREE.Matrix4, t: InstanceScratch) => void,
): THREE.InstancedMesh {
  const inst = new THREE.InstancedMesh(geo, mat, count)
  inst.name = name
  const m = new THREE.Matrix4()
  const t: InstanceScratch = { p: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(1, 1, 1) }
  for (let i = 0; i < count; i++) {
    t.p.set(0, 0, 0)
    t.e.set(0, 0, 0)
    t.q.setFromEuler(t.e)
    t.s.set(1, 1, 1)
    fill(i, m, t)
    inst.setMatrixAt(i, m)
  }
  inst.instanceMatrix.needsUpdate = true
  inst.castShadow = true
  inst.receiveShadow = true
  return inst
}

/** 风扇组件：边框 + 中毂 + n 叶片（径向排布），朝向默认 +z */
export function makeFan(size: number, thickness: number, blades: number, frameMat: THREE.Material, bladeMat: THREE.Material, prefix: string): THREE.Group {
  const g = new THREE.Group()
  g.name = `${prefix}_frame`
  const t = thickness
  const f = size
  // 边框四条
  g.add(box(f, t, 0.008, frameMat, `${prefix}_frame_t`, 0, 0, f / 2 - 0.004))
  g.add(box(f, t, 0.008, frameMat, `${prefix}_frame_b`, 0, 0, -f / 2 + 0.004))
  g.add(box(0.008, t, f, frameMat, `${prefix}_frame_l`, -f / 2 + 0.004, 0, 0))
  g.add(box(0.008, t, f, frameMat, `${prefix}_frame_r`, f / 2 - 0.004, 0, 0))
  // 中毂 + 叶片（在 xy 平面内旋转，法向 +z）
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(f * 0.16, f * 0.16, t * 0.8, 16), frameMat)
  hub.rotation.x = Math.PI / 2
  hub.name = `${prefix}_hub`
  g.add(hub)
  for (let i = 0; i < blades; i++) {
    const blade = box(f * 0.34, t * 0.3, f * 0.16, bladeMat, `${prefix}_blade_${i}`)
    const a = (i / blades) * Math.PI * 2
    const rr = f * 0.31
    blade.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0)
    blade.rotation.z = a + 0.6
    blade.rotation.y = 0.5
    g.add(blade)
  }
  return g
}

/**
 * 通用归组：按 devices.json 的 nodeNames 前缀，把模型内的 mesh 归组为层 Group 并注入 userData。
 * 与 GLB 路径共用（文档 5.3：Group 名 = layer.id，userData 由加载侧统一注入）。
 * 用 attach() 保持 mesh 世界变换（源 mesh 可能位于带变换的子装配体内）。
 */
export function groupLayers(model: THREE.Group, layers: Array<{ id: string; nodeNames: string[] }>, extras: Record<string, unknown>): void {
  model.updateWorldMatrix(true, true)
  const meshes: THREE.Object3D[] = []
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o)
  })
  // 已归属某层的 mesh 不再参与后续层匹配（首匹配优先），
  // 防止前缀交叠时后序层把 mesh 从前序层"抢走"
  const claimed = new Set<THREE.Object3D>()
  for (const layer of layers) {
    const g = new THREE.Group()
    g.name = layer.id
    g.userData = { ...extras, layerId: layer.id }
    model.add(g)
    for (const mesh of meshes) {
      if (claimed.has(mesh)) continue
      const hit = layer.nodeNames.some((p) => mesh.name === p || mesh.name.startsWith(`${p}_`) || mesh.name.startsWith(p))
      if (hit) {
        g.attach(mesh)
        claimed.add(mesh)
      }
    }
  }
}
