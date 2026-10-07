/**
 * 27″ 4K 显示器程序化低模（面板 0.62 × 0.37 m，整机高 0.52 m）。
 * nodeNames：panel_* / backlight_* / driver_board_* / power_board_* / monitor_shell_* / stand_*
 */
import * as THREE from 'three'
import { box, makeStd } from './parts'

const PW = 0.62
const PH = 0.37
const PANEL_Y = 0.545 // 面板中心高（支架顶起后）

export function buildMonitor(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'monitor'
  const alum = makeStd({ color: '#828A92', metalness: 0.9, roughness: 0.42 })
  const darkAlum = makeStd({ color: '#31373E', metalness: 0.85, roughness: 0.45 })
  const black = makeStd({ color: '#14171C', metalness: 0.4, roughness: 0.55 })

  // —— 支架（stand）：VESA 100×100 铝合金 ——
  root.add(box(0.22, 0.016, 0.16, darkAlum, 'stand_base', 0, 0.008, 0.02))
  root.add(box(0.055, 0.34, 0.032, alum, 'stand_column', 0, 0.186, 0.005))
  root.add(box(0.12, 0.14, 0.014, darkAlum, 'stand_vesa', 0, 0.38, 0))

  // —— 后壳（monitor_shell）：铝镁合金 ——
  root.add(box(PW, PH, 0.02, alum, 'monitor_shell_back', 0, PANEL_Y, -0.032))
  root.add(box(0.24, 0.2, 0.024, alum, 'monitor_shell_bulge', 0, PANEL_Y, -0.05))
  // 四边框
  root.add(box(PW, 0.012, 0.044, black, 'monitor_shell_edge_t', 0, PANEL_Y + PH / 2 - 0.006, -0.01))
  root.add(box(PW, 0.012, 0.044, black, 'monitor_shell_edge_b', 0, PANEL_Y - PH / 2 + 0.006, -0.01))
  root.add(box(0.012, PH, 0.044, black, 'monitor_shell_edge_l', -PW / 2 + 0.006, PANEL_Y, -0.01))
  root.add(box(0.012, PH, 0.044, black, 'monitor_shell_edge_r', PW / 2 - 0.006, PANEL_Y, -0.01))

  // —— 电源板（power_board）——
  const pcbMat = makeStd({ color: '#12241C', roughness: 0.65, metalness: 0.3 })
  root.add(box(0.2, 0.15, 0.008, pcbMat, 'power_board_pcb', -0.14, PANEL_Y - 0.06, -0.022))
  const capMat = makeStd({ color: '#2E353C', metalness: 0.6, roughness: 0.5 })
  for (let i = 0; i < 3; i++) {
    root.add(box(0.016, 0.03, 0.012, capMat, `power_board_cap_${i}`, -0.2 + i * 0.03, PANEL_Y + 0.03, -0.022))
  }

  // —— 驱动板（driver_board）——
  root.add(box(0.16, 0.11, 0.008, pcbMat, 'driver_board_pcb', 0.12, PANEL_Y - 0.05, -0.02))
  root.add(box(0.04, 0.04, 0.01, capMat, 'driver_board_soc', 0.12, PANEL_Y - 0.05, -0.014))

  // —— 背光板（backlight）：MiniLED，mint 边缘微光（colorEmphasis）——
  const ledMat = makeStd({ color: '#7BE3BD', emissive: '#7BE3BD', emissiveIntensity: 0.35, roughness: 0.4 })
  root.add(box(0.585, 0.345, 0.01, ledMat, 'backlight_plate', 0, PANEL_Y, -0.006))

  // —— 面板模组（panel）：4K IPS 黑镜 ——
  const panelMat = makeStd({ color: '#0A0D11', roughness: 0.12, metalness: 0.25 })
  root.add(box(PW, PH, 0.006, panelMat, 'panel_module', 0, PANEL_Y, 0.003))

  return root
}
