/**
 * 桌面场景静态件：工作台 + 桌垫（非设备，不可拆，不参与爆炸）。
 */
import * as THREE from 'three'
import { box, makeStd } from './parts'

export function buildDesk(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'desk'
  const wood = makeStd({ color: '#1A1F26', roughness: 0.55, metalness: 0.15 })
  const legMat = makeStd({ color: '#101318', roughness: 0.4, metalness: 0.6 })

  root.add(box(1.7, 0.04, 0.8, wood, 'desk_top', 0, 0.72, 0))
  for (let i = 0; i < 4; i++) {
    const x = i % 2 === 0 ? -0.78 : 0.78
    const z = i < 2 ? -0.33 : 0.33
    root.add(box(0.05, 0.7, 0.05, legMat, `desk_leg_${i}`, x, 0.35, z))
  }
  // 桌垫（键鼠区）
  const padMat = makeStd({ color: '#11151B', roughness: 0.92, metalness: 0 })
  root.add(box(0.98, 0.005, 0.46, padMat, 'desk_pad', 0.12, 0.7425, 0.14))
  return root
}
