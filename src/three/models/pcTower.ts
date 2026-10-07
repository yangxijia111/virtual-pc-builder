/**
 * ATX 主机程序化低模（0.21 × 0.46 × 0.43 m，立式）。
 * 布局约定：主板贴 -x 侧板，+x 侧为钢化玻璃 —— 聚焦相机（focusCamera 在 +x 象限）直接看到玻璃侧。
 * nodeNames：side_glass_* / cooler_* / cpu_* / dimm_* / gpu_* / m2_ssd_* / motherboard_* / psu_* / chassis_*
 */
import * as THREE from 'three'
import { box, cyl, makeFan, makeGlass, makeStd } from './parts'
import { buildCoolerBody } from './cooler'
import { buildCpuChip } from './cpu'
import { buildGpuAssembly } from './gpu'

const W = 0.21
const H = 0.46
const D = 0.43

export function buildPcTower(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'pc-tower'
  const steel = makeStd({ color: '#262B31', metalness: 0.75, roughness: 0.5 })
  const steelLight = makeStd({ color: '#31373E', metalness: 0.75, roughness: 0.45 })
  const black = makeStd({ color: '#14171C', metalness: 0.4, roughness: 0.6 })

  // —— 机箱骨架（chassis）：SPCC 钢板，+x 侧开放装玻璃 ——
  root.add(box(W, 0.02, D, steel, 'chassis_bottom', 0, 0.01, 0))
  root.add(box(W, 0.02, D, steel, 'chassis_top', 0, H - 0.01, 0))
  root.add(box(W, H, 0.02, steelLight, 'chassis_back', 0, H / 2, -D / 2 + 0.01))
  root.add(box(W, H, 0.018, steelLight, 'chassis_front', 0, H / 2, D / 2 - 0.009))
  for (let i = 0; i < 3; i++) {
    root.add(box(W - 0.02, 0.012, 0.008, black, `chassis_grille_${i}`, 0, 0.1 + i * 0.12, D / 2 - 0.002))
  }
  // -x 侧板 + 四立柱
  root.add(box(0.018, H, D, steelLight, 'chassis_right', -W / 2 + 0.009, H / 2, 0))
  for (let i = 0; i < 4; i++) {
    const x = i % 2 === 0 ? W / 2 - 0.009 : -W / 2 + 0.009
    const z = i < 2 ? D / 2 - 0.05 : -D / 2 + 0.05
    root.add(box(0.018, H, 0.018, steel, `chassis_post_${i}`, x, H / 2, z))
  }
  // 前置三风扇（装饰，归机箱层）
  const fanBladeMat = makeStd({ color: '#3A4046', roughness: 0.5, transparent: true, opacity: 0.9 })
  for (let i = 0; i < 3; i++) {
    const fan = makeFan(0.118, 0.024, 7, steelLight, fanBladeMat, `chassis_frontfan_${i}`)
    fan.rotation.x = Math.PI / 2
    fan.position.set(0, 0.11 + i * 0.125, D / 2 - 0.035)
    root.add(fan)
  }
  // 机脚
  for (let i = 0; i < 4; i++) {
    const x = i % 2 === 0 ? W / 2 - 0.03 : -W / 2 + 0.03
    const z = i < 2 ? D / 2 - 0.03 : -D / 2 + 0.03
    root.add(box(0.03, 0.012, 0.03, black, `chassis_foot_${i}`, x, -0.006, z))
  }

  // —— 电源（psu）：ATX 3.0 850W 金牌 ——
  const psuMat = makeStd({ color: '#565E66', metalness: 0.85, roughness: 0.4 })
  root.add(box(0.15, 0.086, 0.16, psuMat, 'psu_body', 0, 0.053, -D / 2 + 0.09))
  root.add(box(0.12, 0.002, 0.1, black, 'psu_grille', 0, 0.0965, -D / 2 + 0.09))

  // —— 主板（motherboard）：贴 -x 侧板，元件朝 +x ——
  const moboMat = makeStd({ color: '#17201B', roughness: 0.65, metalness: 0.25 })
  const moboX = -(W / 2 - 0.028)
  root.add(box(0.002, 0.305, 0.244, moboMat, 'motherboard_board', moboX, 0.27, 0.03))
  const vrmMat = makeStd({ color: '#3A4148', metalness: 0.85, roughness: 0.35 })
  root.add(box(0.024, 0.05, 0.075, vrmMat, 'motherboard_vrm_top', moboX + 0.013, 0.4, -0.02))
  root.add(box(0.024, 0.18, 0.02, vrmMat, 'motherboard_vrm_side', moboX + 0.013, 0.3, -0.08))
  root.add(box(0.02, 0.04, 0.04, vrmMat, 'motherboard_chipset', moboX + 0.012, 0.17, 0.1))
  // AM5 插座（黑色塑料框 + 拔插扳手），随主板层，CPU 芯片坐在框内
  const socketMat = makeStd({ color: '#23282E', roughness: 0.55, metalness: 0.3 })
  root.add(box(0.005, 0.049, 0.049, socketMat, 'motherboard_socket_frame', moboX + 0.0035, 0.305, -0.03))
  root.add(box(0.003, 0.003, 0.045, socketMat, 'motherboard_socket_lever', moboX + 0.005, 0.277, -0.058))

  // —— CPU（cpu）：AM5 处理器，坐在插座里、风冷下方 ——
  root.add(buildCpuChip(moboX))

  // —— M.2 固态（m2_ssd）——
  const ssdMat = makeStd({ color: '#1B1F24', roughness: 0.5, metalness: 0.5 })
  root.add(box(0.004, 0.022, 0.08, ssdMat, 'm2_ssd_drive', moboX + 0.006, 0.21, -0.03))
  root.add(box(0.006, 0.026, 0.024, vrmMat, 'm2_ssd_heatsink', moboX + 0.007, 0.21, -0.03))

  // —— 内存（dimm）：DDR5 ×2，马甲 + 顶灯条 ——
  const ramMat = makeStd({ color: '#788088', metalness: 0.9, roughness: 0.35 })
  const rgbMat = makeStd({ color: '#E8EDF2', emissive: '#E8EDF2', emissiveIntensity: 0.55, roughness: 0.4 })
  for (let i = 0; i < 2; i++) {
    const z = -0.085 + i * 0.011
    root.add(box(0.0075, 0.125, 0.045, ramMat, `dimm_stick_${i}`, moboX + 0.006, 0.42, z))
    root.add(box(0.008, 0.008, 0.045, rgbMat, `dimm_rgb_${i}`, moboX + 0.006, 0.487, z))
  }

  // —— 显卡（gpu）：三风扇旗舰（简装壳罩，可进入 gpu-nested 二级拆解），平躺于 PCIe 槽 ——
  const gpu = buildGpuAssembly()
  gpu.position.set(moboX + 0.085, 0.145, 0.04)
  root.add(gpu)

  // —— 风冷散热器（cooler）：双塔六热管（可进一步拆解，nested 态由子设备替代）——
  // 高度对齐 CPU（0.305），让铜底真正压在顶盖上方
  const cooler = buildCoolerBody()
  cooler.name = 'cooler_assembly'
  cooler.position.set(moboX + 0.055, 0.335, -0.03)
  cooler.rotation.y = Math.PI / 2 // 风扇脸朝 +x（朝玻璃）
  root.add(cooler)

  // —— 侧透面板（side_glass）：4mm 钢化玻璃，+x 侧 ——
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.004, H - 0.03, D - 0.05), makeGlass())
  glass.name = 'side_glass_panel'
  glass.position.set(W / 2 - 0.012, H / 2 - 0.005, 0)
  glass.castShadow = false
  root.add(glass)
  root.add(box(0.006, 0.012, D - 0.05, steelLight, 'side_glass_frame_b', W / 2 - 0.012, 0.017, 0))
  root.add(box(0.006, 0.012, D - 0.05, steelLight, 'side_glass_frame_t', W / 2 - 0.012, H - 0.023, 0))

  // 电源位灯（装饰 mint）
  const ledMat = makeStd({ color: '#7BE3BD', emissive: '#7BE3BD', emissiveIntensity: 0.8 })
  root.add(cyl(0.004, 0.002, ledMat, 'chassis_led', 0, 0.098, -D / 2 + 0.03))

  return root
}
