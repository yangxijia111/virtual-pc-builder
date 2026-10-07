/**
 * PBT 二色机械键盘（60% 配列，64 键）程序化低模。
 * mesh 命名遵循 nodeNames 前缀约定：keycap_* / switch_* / plate_* / pcb_* / foam_* / ixpe_* / bottom_case_* / feet_*
 * 对齐 image_0：灰白键帽（Esc 红）、红色轴体、开槽定位板、黑色 PCB、Poron 米白夹心棉、铝壳底座。
 */
import * as THREE from 'three'
import { box, makeStd } from './parts'

const PITCH = 0.019 // 键距 19mm
const W = 0.365
const D = 0.145

/** 60% 配列近似布局（行 = 键宽序列，单位 u） */
const ROWS: number[][] = [
  Array(15).fill(1), // 数字行（Esc 为第 0 个）
  [1.5, ...Array(12).fill(1), 1.5],
  [1.75, ...Array(12).fill(1), 1.25],
  [2.25, ...Array(11).fill(1), 1.75],
  [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],
]

export function buildKeyboard(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'keyboard'

  // —— 底壳层（bottom_case, feet）：CNC 铝壳 ——
  const alumMat = makeStd({ color: '#9BA3AB', metalness: 0.9, roughness: 0.45 })
  const darkMat = makeStd({ color: '#3A4048', metalness: 0.7, roughness: 0.5 })
  root.add(box(W, 0.009, D, alumMat, 'bottom_case_floor', 0, 0.0075, 0))
  root.add(box(W, 0.024, 0.006, alumMat, 'bottom_case_wall_f', 0, 0.024, D / 2 - 0.003))
  root.add(box(W, 0.024, 0.006, alumMat, 'bottom_case_wall_b', 0, 0.024, -D / 2 + 0.003))
  root.add(box(0.006, 0.024, D, alumMat, 'bottom_case_wall_l', -W / 2 + 0.003, 0.024, 0))
  root.add(box(0.006, 0.024, D, alumMat, 'bottom_case_wall_r', W / 2 - 0.003, 0.024, 0))
  root.add(box(0.024, 0.003, 0.028, darkMat, 'feet_0', -W / 2 + 0.05, 0.0015, 0.01))
  root.add(box(0.024, 0.003, 0.028, darkMat, 'feet_1', W / 2 - 0.05, 0.0015, 0.01))
  // 类型口（装饰）
  root.add(box(0.03, 0.008, 0.004, darkMat, 'bottom_case_port', 0, 0.012, -D / 2 + 0.002))

  // —— 填充层（foam, ixpe）——
  const foamMat = makeStd({ color: '#D8D2C4', roughness: 0.95, metalness: 0 })
  root.add(box(0.348, 0.008, 0.132, foamMat, 'foam_sheet', 0, 0.018, 0))
  const ixpeMat = makeStd({ color: '#4A4640', roughness: 0.9, metalness: 0 })
  root.add(box(0.348, 0.003, 0.132, ixpeMat, 'ixpe_sheet', 0, 0.0235, 0))

  // —— PCB 层（pcb）——
  const pcbMat = makeStd({ color: '#101A16', roughness: 0.7, metalness: 0.2 })
  root.add(box(0.352, 0.0018, 0.136, pcbMat, 'pcb_board', 0, 0.0262, 0))
  const goldMat = makeStd({ color: '#C9A227', metalness: 1, roughness: 0.35 })
  for (let i = 0; i < 4; i++) {
    root.add(box(0.012, 0.0025, 0.008, goldMat, `pcb_ic_${i}`, -0.12 + i * 0.08, 0.0276, -0.04))
  }

  // —— 定位板层（plate）：船型开槽 ——
  const plateMat = makeStd({ color: '#8D959D', metalness: 0.85, roughness: 0.4 })
  root.add(box(0.36, 0.0015, 0.142, plateMat, 'plate_sheet', 0, 0.0282, 0))
  const slotMat = makeStd({ color: '#1A1E24', roughness: 0.8 })
  for (let i = 0; i < 5; i++) {
    root.add(box(0.36, 0.0018, 0.0022, slotMat, `plate_slot_${i}`, 0, 0.0284, -0.045 + i * 0.0225))
  }

  // —— 轴体层（switch）：全键热插拔，红色轴心（image_0 的霓虹红）——
  const positions: Array<{ x: number; z: number }> = []
  for (let r = 0; r < ROWS.length; r++) {
    const row = ROWS[r]
    let cursor = -W / 2 + 0.04
    const z = -0.038 + r * PITCH
    for (const wu of row) {
      positions.push({ x: cursor + (wu * PITCH) / 2, z })
      cursor += wu * PITCH
    }
  }
  const housingMat = makeStd({ color: '#6E747C', roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.85 })
  const stemMat = makeStd({ color: '#FF4D5E', emissive: '#FF4D5E', emissiveIntensity: 0.5, roughness: 0.4 })
  const housingGeo = new THREE.BoxGeometry(0.0145, 0.012, 0.0145)
  const housing = new THREE.InstancedMesh(housingGeo, housingMat, positions.length)
  housing.name = 'switch_housing'
  const stemGeo = new THREE.BoxGeometry(0.0062, 0.011, 0.0062)
  const stem = new THREE.InstancedMesh(stemGeo, stemMat, positions.length)
  stem.name = 'switch_stem'
  const m = new THREE.Matrix4()
  positions.forEach((p, i) => {
    housing.setMatrixAt(i, m.makeTranslation(p.x, 0.035, p.z))
    stem.setMatrixAt(i, m.makeTranslation(p.x, 0.0405, p.z))
  })
  housing.castShadow = true
  stem.castShadow = true
  root.add(housing, stem)

  // —— 键帽层（keycap）：PBT 二色，Esc 红键 ——
  const capMat = makeStd({ color: '#FFFFFF', roughness: 0.5, metalness: 0.05 })
  const byWidth = new Map<number, Array<THREE.Vector3>>()
  for (let r = 0; r < ROWS.length; r++) {
    const row = ROWS[r]
    let cursor = -W / 2 + 0.04
    const z = -0.038 + r * PITCH
    for (const wu of row) {
      const arr = byWidth.get(wu) ?? []
      arr.push(new THREE.Vector3(cursor + (wu * PITCH) / 2, 0.048, z))
      byWidth.set(wu, arr)
      cursor += wu * PITCH
    }
  }
  const red = new THREE.Color('#FF4D5E')
  const grey = new THREE.Color('#C9CDD3')
  for (const [wu, list] of byWidth) {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0) {
        pos.setX(i, pos.getX(i) * 0.84)
        pos.setZ(i, pos.getZ(i) * 0.84)
      }
    }
    geo.computeVertexNormals()
    const inst = new THREE.InstancedMesh(geo, capMat, list.length)
    inst.name = `keycap_${wu}u`
    list.forEach((p, i) => {
      inst.setMatrixAt(i, m.compose(p, new THREE.Quaternion(), new THREE.Vector3(wu * PITCH - 0.0012, 0.011, PITCH - 0.0012)))
      // Esc 键（1u 实例列表首项 = 数字行首键）上红 —— image_0 的红色键帽
      inst.setColorAt(i, wu === 1 && i === 0 ? red : grey)
    })
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
    inst.castShadow = true
    root.add(inst)
  }
  // 指示灯：右上角 mint 微光
  const ledMat = makeStd({ color: '#7BE3BD', emissive: '#7BE3BD', emissiveIntensity: 0.9 })
  const led = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.002, 8), ledMat)
  led.name = 'keycap_led'
  led.position.set(W / 2 - 0.028, 0.0375, -D / 2 + 0.012)
  root.add(led)
  return root
}
