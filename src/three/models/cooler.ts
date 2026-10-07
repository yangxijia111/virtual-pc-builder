/**
 * 风冷散热器程序化低模（0.125 × 0.155 × 0.09 m，双塔六热管）。
 * nodeNames：fan_front_* / heatpipe_* / fin_stack_* / cold_plate_*
 * 同时供主机 cooler 层（buildCoolerBody 简装版）与 cooler-nested 子设备（完整四层）复用。
 */
import * as THREE from 'three'
import { box, cyl, makeFan, makeStd, makeInstanced, unitBox, unitCylinder } from './parts'

const copper = () => makeStd({ color: '#B87333', metalness: 1, roughness: 0.35 })
const nickel = () => makeStd({ color: '#B9C2C9', metalness: 0.95, roughness: 0.28 })
const alu = () => makeStd({ color: '#9BA3AB', metalness: 0.9, roughness: 0.5 })

/** 完整四层结构（cooler-nested 子设备用；未归组，由 registry 归组） */
export function buildCooler(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'cooler-nested'

  // —— 铜底（cold_plate）：镀镍铜底微凸研磨 ——
  root.add(box(0.052, 0.007, 0.052, copper(), 'cold_plate_base', 0, 0.0035, 0))
  root.add(box(0.048, 0.004, 0.048, nickel(), 'cold_plate_face', 0, 0.009, 0))

  // —— 鳍片堆（fin_stack）：双塔各 8 片 → 单实例网格（16 实例）——
  const finH = 0.125
  root.add(
    makeInstanced(unitBox, alu(), 'fin_stack', 16, (i, m, t) => {
      const towerX = Math.floor(i / 8) === 0 ? -0.032 : 0.032
      t.p.set(towerX, 0.028 + (finH / 8) * (i % 8) + 0.008, 0)
      t.s.set(0.05, 0.002, 0.03)
      m.compose(t.p, t.q, t.s)
    }),
  )

  // —— 热管（heatpipe）：6 根 U 形烧结热管（12 竖柱 + 6 顶半环，各合为单实例网格）——
  const pipeMat = copper()
  root.add(
    makeInstanced(unitCylinder, pipeMat, 'heatpipe_leg', 12, (i, m, t) => {
      const k = Math.floor(i / 2)
      const x = (k % 3) * 0.014 - 0.014 + (i % 2 === 0 ? -0.016 : 0.016)
      const zOff = k < 3 ? 0.008 : -0.008
      t.p.set(x, 0.093, zOff)
      t.s.set(0.006, 0.13, 0.006)
      m.compose(t.p, t.q, t.s)
    }),
  )
  const arcGeo = new THREE.TorusGeometry(0.016, 0.003, 8, 16, Math.PI)
  root.add(
    makeInstanced(arcGeo, pipeMat, 'heatpipe_arc', 6, (i, m, t) => {
      const k = i % 6
      const x = (k % 3) * 0.014 - 0.014
      const zOff = k < 3 ? 0.008 : -0.008
      t.p.set(x, 0.158, zOff)
      m.compose(t.p, t.q, t.s)
    }),
  )

  // —— 前风扇（fan_front）：120mm FDB ——
  const frameMat = makeStd({ color: '#2A2F35', roughness: 0.5, metalness: 0.4 })
  const bladeMat = makeStd({ color: '#454C54', roughness: 0.55, transparent: true, opacity: 0.95 })
  const fan = makeFan(0.118, 0.025, 7, frameMat, bladeMat, 'fan_front')
  fan.position.set(0, 0.09, 0.047)
  root.add(fan)
  // 扣具角（装饰）
  const clipMat = makeStd({ color: '#31373E', metalness: 0.8, roughness: 0.4 })
  for (let i = 0; i < 2; i++) {
    root.add(box(0.012, 0.15, 0.006, clipMat, `fan_front_clip_${i}`, i === 0 ? -0.055 : 0.055, 0.09, -0.03))
  }
  return root
}

/** 简装版（主机 cooler 层内嵌）：塔体 + 露头热管 + 风扇脸，不再分内部层。
 *  铜底在塔体 -z 侧（装配时 rotation.y=π/2 转向 +x），对准主板上的 CPU 顶盖。 */
export function buildCoolerBody(): THREE.Group {
  const root = new THREE.Group()
  const finMat = alu()
  for (let t = 0; t < 2; t++) {
    root.add(box(0.028, 0.125, 0.096, finMat, `cooler_tower_${t}`, t === 0 ? -0.017 : 0.017, 0.0625, 0))
  }
  const pipeMat = copper()
  for (let i = 0; i < 6; i++) {
    const z = (i % 3) * 0.014 - 0.014
    const cap = cyl(0.003, 0.02, pipeMat, `cooler_pipe_${i}`, i < 3 ? -0.016 : 0.016, 0.112, z - 0.008)
    root.add(cap)
  }
  const frameMat = makeStd({ color: '#2A2F35', roughness: 0.5, metalness: 0.4 })
  const bladeMat = makeStd({ color: '#454C54', roughness: 0.55 })
  const fan = makeFan(0.118, 0.025, 7, frameMat, bladeMat, 'cooler_fan')
  fan.position.set(0, 0.09, 0.062)
  root.add(fan)
  root.add(box(0.052, 0.008, 0.052, copper(), 'cooler_base', 0, 0.004, -0.035))
  return root
}
