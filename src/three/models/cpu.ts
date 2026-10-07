/**
 * CPU 处理器程序化低模。
 * - buildCpuChip()：主机塔内简装版（竖装在 -x 主板上，触点朝 +x），nodeNames：cpu_*
 * - buildCpu()  ：cpu-nested 子设备完整版（平放、顶盖朝上，四层可拆解）
 *   层结构（自上而下）：ihs 金属顶盖 / die 核心晶片 / substrate 基板 / pins 触点阵列
 */
import * as THREE from 'three'
import { box, makeStd, unitCylinder } from './parts'

const nickel = () => makeStd({ color: '#B9C2C9', metalness: 1, roughness: 0.28 })
const pcbGreen = () => makeStd({ color: '#1B5E35', roughness: 0.7, metalness: 0.15 })
const silicon = () => makeStd({ color: '#454E58', metalness: 0.95, roughness: 0.12 })
const gold = () => makeStd({ color: '#C9A227', metalness: 1, roughness: 0.35 })

/** 塔内简装版：基板 + 顶盖（藏在散热器下，拆解后作为独立层升起） */
export function buildCpuChip(moboX: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'cpu_chip'
  // 基板（AM5 40×40 mm 绿板）
  g.add(box(0.0016, 0.037, 0.037, pcbGreen(), 'cpu_substrate', moboX + 0.005, 0.305, -0.03))
  // 镀镍顶盖（IHS），比基板窄、凸出插座面
  g.add(box(0.0045, 0.028, 0.028, nickel(), 'cpu_ihs', moboX + 0.008, 0.305, -0.03))
  // 顶盖蚀刻型号条
  g.add(box(0.001, 0.003, 0.014, makeStd({ color: '#6B7480', metalness: 0.6, roughness: 0.4 }), 'cpu_mark', moboX + 0.0104, 0.305, -0.03))
  return g
}

/** cpu-nested 子设备：平放完整四层（由 registry 归组） */
export function buildCpu(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'cpu-nested'

  // —— 触点阵列（pins）：LGA 镀金触点 14×14（InstancedMesh）+ 底板 ——
  root.add(box(0.0365, 0.0008, 0.0365, makeStd({ color: '#123524', roughness: 0.75 }), 'pins_base', 0, 0.0004, 0))
  const GRID = 14
  const PITCH = 0.0024
  const padMat = gold()
  const pads = new THREE.InstancedMesh(unitCylinder, padMat, GRID * GRID)
  const m = new THREE.Matrix4()
  let n = 0
  for (let ix = 0; ix < GRID; ix++) {
    for (let iz = 0; iz < GRID; iz++) {
      m.makeScale(0.0018, 0.0012, 0.0018)
      m.setPosition((ix - (GRID - 1) / 2) * PITCH, -0.0006, (iz - (GRID - 1) / 2) * PITCH)
      pads.setMatrixAt(n++, m)
    }
  }
  pads.name = 'pins_pad'
  pads.instanceMatrix.needsUpdate = true
  root.add(pads)

  // —— 基板（substrate）：8 层 PCB + 陶瓷电容 + 缺角标记 ——
  root.add(box(0.0385, 0.0016, 0.0385, pcbGreen(), 'substrate_board', 0, 0.0016, 0))
  const capMat = makeStd({ color: '#C9B896', roughness: 0.5, metalness: 0.3 })
  for (let i = 0; i < 8; i++) {
    // 顶部一排 + 底部一排 + 两侧各两颗
    if (i < 4) root.add(box(0.0016, 0.0007, 0.001, capMat, `substrate_cap_${i}`, -0.012 + i * 0.008, 0.0027, 0.0176))
    else root.add(box(0.001, 0.0007, 0.0016, capMat, `substrate_cap_${i}`, 0.0176, 0.0027, -0.006 + (i - 4) * 0.008))
  }
  root.add(box(0.003, 0.0006, 0.003, gold(), 'substrate_mark', 0.0165, 0.0026, -0.0165))

  // —— 核心晶片（die）：1×CCD + 1×IOD 双晶片 ——
  root.add(box(0.0105, 0.0008, 0.0085, silicon(), 'die_ccd', 0.0072, 0.0029, -0.004))
  root.add(box(0.0095, 0.0008, 0.0075, silicon(), 'die_iod', -0.0072, 0.0029, 0.0052))
  // 晶片边缘的封装胶
  const glueMat = makeStd({ color: '#2A2F35', roughness: 0.6 })
  root.add(box(0.0125, 0.0005, 0.0105, glueMat, 'die_ccd_glue', 0.0072, 0.0025, -0.004))
  root.add(box(0.0115, 0.0005, 0.0095, glueMat, 'die_iod_glue', -0.0072, 0.0025, 0.0052))

  // —— 金属顶盖（ihs）：镀镍铜钎焊盖 + 裙边 + 蚀刻条 ——
  root.add(box(0.037, 0.0012, 0.037, nickel(), 'ihs_skirt', 0, 0.0029, 0))
  root.add(box(0.03, 0.0026, 0.03, nickel(), 'ihs_cap', 0, 0.0047, 0))
  root.add(box(0.017, 0.0004, 0.0038, makeStd({ color: '#6B7480', metalness: 0.6, roughness: 0.4 }), 'ihs_text', 0, 0.0061, 0.008))
  root.add(box(0.0035, 0.0004, 0.0035, gold(), 'ihs_mark', 0.0132, 0.0061, -0.0132))

  return root
}
