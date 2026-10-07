/**
 * 显卡程序化低模（三风扇 3.5 槽旗舰）。
 * - buildGpuAssembly()：主机塔内简装版（平躺、风扇朝 -y 朝下、LED 面朝 +y 玻璃侧），
 *   以显卡中心为原点，由 pcTower 摆到 PCIe 槽位。nodeNames：gpu_*
 * - buildGpu()：gpu-nested 子设备完整版（平放、风扇面朝上，四层可拆解）
 *   层结构（自上而下）：front_fans 轴心风扇模组 / gpu_hs 散热体 / gpu_pcb 非公 PCB / gpu_bp 金属背板
 */
import * as THREE from 'three'
import { box, cyl, makeFan, makeStd, makeInstanced, unitBox, unitCylinder } from './parts'

const shroud = () => makeStd({ color: '#16191E', metalness: 0.6, roughness: 0.45 })
const alu = () => makeStd({ color: '#9BA3AB', metalness: 0.9, roughness: 0.5 })
const copper = () => makeStd({ color: '#B87333', metalness: 1, roughness: 0.35 })
const nickel = () => makeStd({ color: '#B9C2C9', metalness: 0.95, roughness: 0.28 })
const gold = () => makeStd({ color: '#C9A227', metalness: 1, roughness: 0.35 })
const pcbBlack = () => makeStd({ color: '#14181D', roughness: 0.6, metalness: 0.3 })
const silicon = () => makeStd({ color: '#454E58', metalness: 0.95, roughness: 0.12 })
const brushedAlu = () => makeStd({ color: '#3A4148', metalness: 0.85, roughness: 0.4 })

/** 三风扇间距（z 向）与风扇半径（buildGpuAssembly 与 buildGpu 共用比例） */
const FAN_Z = [-0.095, 0, 0.095]

/** 塔内简装版：壳罩 + 三风扇 + 背板 + 灯条 + 挡板 + 供电（pcTower gpu 层） */
export function buildGpuAssembly(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'gpu_assembly'
  const body = shroud()
  root.add(box(0.125, 0.048, 0.29, body, 'gpu_shroud', 0, 0, 0))
  // 正面三风扇（朝 -y，塔内真实朝向）
  const bladeMat = makeStd({ color: '#2A2F35', roughness: 0.5 })
  for (let i = 0; i < 3; i++) {
    const fan = makeFan(0.085, 0.02, 9, body, bladeMat, `gpu_fan_${i}`)
    fan.rotation.x = Math.PI / 2 // +z 法向 → -y
    fan.position.set(0, -0.025, FAN_Z[i])
    root.add(fan)
  }
  // 金属背板（顶面）+ 发光 logo 灯条 + 尾部镂空
  root.add(box(0.12, 0.0022, 0.282, brushedAlu(), 'gpu_backplate', 0, 0.0251, 0))
  const ledMat = makeStd({ color: '#FF4D5E', emissive: '#FF4D5E', emissiveIntensity: 0.85, roughness: 0.4 })
  root.add(box(0.02, 0.0016, 0.16, ledMat, 'gpu_led', 0, 0.027, 0.03))
  root.add(box(0.024, 0.0022, 0.05, shroud(), 'gpu_backplate_vent', 0, 0.0251, -0.115))
  // PCIe 挡板（贴主板侧）
  root.add(box(0.006, 0.05, 0.29, alu(), 'gpu_bracket', -0.062, 0, 0))
  // 外接供电：12VHPWR 模压头（顶边后侧）
  root.add(box(0.018, 0.011, 0.05, makeStd({ color: '#14171C', roughness: 0.6 }), 'gpu_power', -0.023, 0.03, 0.1))
  return root
}

/** gpu-nested 子设备：平放完整四层（风扇面朝上），由 registry 归组 */
export function buildGpu(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'gpu-nested'
  const L = 0.3 // 长（z）
  const W = 0.135 // 宽（x）

  // —— 轴心风扇模组（front_fans）：罩框 + 三风扇 + 侧灯条 ——
  const frameMat = shroud()
  // 罩框四边 + 分隔梁（框顶 y=0.052）
  const frameY = 0.05
  root.add(box(W, 0.007, L, frameMat, 'gpu_fan_frame_rim', 0, frameY, 0))
  // 三组开孔：用深色内凹圆盘示意开孔，风扇嵌在孔位
  const holeMat = makeStd({ color: '#0A0D11', roughness: 0.8 })
  const bladeMat = makeStd({ color: '#39424C', roughness: 0.5, metalness: 0.25 })
  const hubMat = makeStd({ color: '#2C323A', metalness: 0.5, roughness: 0.4 })
  const ringMat = makeStd({ color: '#4A545E', metalness: 0.7, roughness: 0.35 })
  for (let i = 0; i < 3; i++) {
    const zc = FAN_Z[i]
    root.add(cyl(0.052, 0.004, holeMat, `gpu_fan_well_${i}`, 0, frameY + 0.001, zc, 28))
    // 风扇：保护栅环 + 中毂 + 9 叶（法向 +y）
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.049, 0.0035, 8, 32), ringMat)
    ring.rotation.x = Math.PI / 2
    ring.name = `gpu_fan_ring_${i}`
    ring.position.set(0, frameY + 0.004, zc)
    root.add(ring)
    const hub = new THREE.Mesh(unitCylinder, hubMat)
    hub.scale.set(0.032, 0.016, 0.032)
    hub.name = `gpu_fan_hub_${i}`
    hub.position.set(0, frameY + 0.006, zc)
    root.add(hub)
  }
  // 三扇 × 9 叶：27 片扇叶合为单实例网格（攻角 Euler(y,z) 与原逐 mesh 一致）
  root.add(
    makeInstanced(unitBox, bladeMat, 'gpu_fan_blade', 27, (i, m, t) => {
      const fan = Math.floor(i / 9)
      const b = i % 9
      const a = (b / 9) * Math.PI * 2
      t.p.set(Math.cos(a) * 0.03, frameY + 0.005, FAN_Z[fan] + Math.sin(a) * 0.03)
      t.e.set(0, -a + 0.55, 0.28)
      t.q.setFromEuler(t.e)
      t.s.set(0.03, 0.0022, 0.016)
      m.compose(t.p, t.q, t.s)
    }),
  )
  // 两侧 RGB 灯条（colorEmphasis 由数据侧标红）
  const ledMat = makeStd({ color: '#FF4D5E', emissive: '#FF4D5E', emissiveIntensity: 0.8, roughness: 0.4 })
  root.add(box(0.003, 0.004, 0.27, ledMat, 'gpu_fan_led_l', -W / 2 + 0.004, frameY - 0.002, 0))
  root.add(box(0.003, 0.004, 0.27, ledMat, 'gpu_fan_led_r', W / 2 - 0.004, frameY - 0.002, 0))

  // —— 散热体（gpu_hs）：均热板 + 鳍片堆 + 7×8mm 热管 ——
  root.add(box(0.285, 0.006, 0.125, nickel(), 'gpu_hs_vapor', 0, 0.031, 0))
  // 26 片鳍片合为单实例网格
  const FIN_N = 26
  root.add(
    makeInstanced(unitBox, alu(), 'gpu_hs_fin', FIN_N, (i, m, t) => {
      t.p.set(0, 0.0425, -0.132 + (0.264 / (FIN_N - 1)) * i)
      t.s.set(0.118, 0.017, 0.0016)
      m.compose(t.p, t.q, t.s)
    }),
  )
  // 热管：7 根沿 z 走向、两端 U 形弯到均热板（侧面露出弯头）
  const pipeMat = copper()
  root.add(
    makeInstanced(unitCylinder, pipeMat, 'gpu_hs_pipe', 7, (i, m, t) => {
      const y = 0.0365 + (i % 4) * 0.0034
      t.p.set((i - 3) * 0.015, y, 0)
      t.e.set(Math.PI / 2, 0, 0) // y 轴向 → z 向
      t.q.setFromEuler(t.e)
      t.s.set(0.008, 0.26, 0.008)
      m.compose(t.p, t.q, t.s)
    }),
  )
  // 两端 U 弯（14 个半环，法向朝 ±x）合为单实例网格
  const bendGeo = new THREE.TorusGeometry(0.008, 0.004, 8, 16, Math.PI)
  root.add(
    makeInstanced(bendGeo, pipeMat, 'gpu_hs_pipe_bend', 14, (i, m, t) => {
      const k = Math.floor(i / 2)
      const y = 0.0365 + (k % 4) * 0.0034
      const xOff = (k - 3) * 0.015
      t.p.set(xOff, y, i % 2 === 0 ? -0.13 : 0.13)
      t.e.set(0, Math.PI / 2, 0)
      t.q.setFromEuler(t.e)
      m.compose(t.p, t.q, t.s.set(1, 1, 1))
    }),
  )

  // —— 非公 PCB（gpu_pcb）：短板设计 + 核心 + 显存 ×8 + 供电 + 金手指 ——
  root.add(box(0.155, 0.0018, 0.132, pcbBlack(), 'gpu_pcb_board', 0, 0.021, -0.01))
  // GPU 核心：基板 + 硅晶片
  root.add(box(0.032, 0.0016, 0.032, pcbBlack(), 'gpu_pcb_die_base', 0.008, 0.0227, -0.03))
  root.add(box(0.024, 0.001, 0.024, silicon(), 'gpu_pcb_die', 0.008, 0.024, -0.03))
  // GDDR7 显存 ×8（核心两侧各 4）→ 单实例网格
  root.add(
    makeInstanced(unitBox, silicon(), 'gpu_pcb_vram', 8, (i, m, t) => {
      t.p.set(i < 4 ? -0.022 : 0.038, 0.0224, -0.062 + (i % 4) * 0.021)
      t.s.set(0.013, 0.0009, 0.01)
      m.compose(t.p, t.q, t.s)
    }),
  )
  // 供电相：电感 ×14（两排黑色方块）→ 单实例网格
  const indMat = makeStd({ color: '#23282E', roughness: 0.55, metalness: 0.2 })
  root.add(
    makeInstanced(unitBox, indMat, 'gpu_pcb_ind', 14, (i, m, t) => {
      t.p.set(i < 7 ? -0.052 : 0.052, 0.0239, -0.05 + (i % 7) * 0.016)
      t.s.set(0.008, 0.004, 0.009)
      m.compose(t.p, t.q, t.s)
    }),
  )
  // PCIe 金手指（板尾缘镀金长条）
  root.add(box(0.002, 0.0035, 0.09, gold(), 'gpu_pcb_pcie', 0.0685, 0.0205, -0.02))
  // 12VHPWR 插座（板中部）
  root.add(box(0.014, 0.007, 0.024, makeStd({ color: '#F0EDE4', roughness: 0.5 }), 'gpu_pcb_power', -0.06, 0.0255, 0.02))

  // —— 金属背板（gpu_bp）：拉丝铝 + 镂空窗 + 螺丝 + 丝印 ——
  root.add(box(0.292, 0.002, 0.13, brushedAlu(), 'gpu_bp_plate', 0, 0.014, 0))
  // 尾部镂空窗（露出鳍片的深色框）
  root.add(box(0.1, 0.0024, 0.1, makeStd({ color: '#0A0D11', roughness: 0.85 }), 'gpu_bp_vent', 0, 0.0152, -0.006))
  // 螺丝 ×6
  const screwMat = makeStd({ color: '#788088', metalness: 0.9, roughness: 0.35 })
  const screwPos: Array<[number, number]> = [
    [-0.125, 0.048], [-0.125, -0.048], [-0.04, 0.048], [-0.04, -0.048], [0.06, 0.048], [0.06, -0.048],
  ]
  screwPos.forEach(([x, z], i) => {
    root.add(cyl(0.0032, 0.0012, screwMat, `gpu_bp_screw_${i}`, x, 0.0155, z, 12))
  })
  // 型号丝印条 + 小背标
  root.add(box(0.05, 0.0004, 0.008, makeStd({ color: '#8A97A5', roughness: 0.5, metalness: 0.3 }), 'gpu_bp_text', 0.09, 0.0153, 0.04))

  return root
}
