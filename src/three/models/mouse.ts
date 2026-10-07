/**
 * 有线电竞鼠标程序化模型（约 0.063 × 0.040 × 0.122 m，前 = +z，局部原点 = 脚贴底面）。
 * 建模方式：纵向放样（loft）——沿长度方向取站位，每站一条"侧沿→顶部→侧沿"的上半环
 * （上盖）或"侧沿→底部→侧沿"的下半环（底盖），两半边缘重合于侧面合缝线，上盖外扩
 * 1.5% 形成真实装配缝。按键 / 侧键 / DPI 键均为同一表面函数采样的贴合曲面薄壳
 * （分体按键带真实悬臂前缘）；滚轮槽为四壁下沉的开口内衬，轮盘从中探出。
 * nodeNames：top_shell_* / scroll_wheel_* / micro_switch_* / mouse_pcb_* / cable_* / base_cover_* / ptfe_feet_*
 */
import * as THREE from 'three'
import { box, cyl, makeStd, makeInstanced, unitCylinder } from './parts'

// ———————————————————————————————— 轮廓控制 ————————————————————————————————

const L = 0.122 // 总长
const HW = 0.0315 // 最大半宽
/** 一维 Catmull-Rom 插值器（控制点 [t, value]，t 单调递增） */
function curve1d(pts: Array<[number, number]>): (t: number) => number {
  return (t) => {
    const n = pts.length
    if (t <= pts[0][0]) return pts[0][1]
    if (t >= pts[n - 1][0]) return pts[n - 1][1]
    let i = 0
    while (i < n - 2 && t > pts[i + 1][0]) i++
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p0 = pts[Math.max(0, i - 1)]
    const p3 = pts[Math.min(n - 1, i + 2)]
    const u = (t - p1[0]) / (p2[0] - p1[0])
    const u2 = u * u
    const u3 = u2 * u
    return (
      0.5 *
      (2 * p1[1] +
        (-p0[1] + p2[1]) * u +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)
    )
  }
}

/** t: 0=尾部 → 1=前端。俯视半宽轮廓：尾部圆收、中后最宽、按键区收窄、前端再收 */
const halfWidthAt = curve1d([
  [0.0, 0.3],
  [0.1, 0.62],
  [0.28, 0.9],
  [0.5, 1.0],
  [0.7, 0.95],
  [0.85, 0.86],
  [0.96, 0.72],
  [1.0, 0.55],
])
/** 顶缘高度（背部驼峰在 t≈0.5，前低后高） */
const topAt = curve1d([
  [0.0, 0.0215],
  [0.15, 0.03],
  [0.35, 0.0375],
  [0.5, 0.04],
  [0.65, 0.036],
  [0.8, 0.0295],
  [0.92, 0.0245],
  [1.0, 0.0205],
])
/** 底面高度（两端微翘，最低点在中前脚贴区） */
const baseAt = curve1d([
  [0.0, 0.0055],
  [0.25, 0.0028],
  [0.55, 0.0018],
  [0.85, 0.0026],
  [1.0, 0.006],
])
const SEAM = 0.42 // 合缝线在截面高度的比例（侧沿中部偏下）

/** z = f(t)：t=0 尾 → t=1 头 */
const zAt = (t: number) => (t - 0.5) * L

/**
 * 外壳表面采样：u ∈ [0,1]。
 * upper=true：从右侧沿（+x）越过顶部到左侧沿（-x）
 * upper=false：从左侧沿（-x）越过底部回到右侧沿（+x）
 * grow：水平外扩系数（上盖 1.015 形成装配缝）
 */
function shellPoint(t: number, u: number, upper: boolean, grow = 1, out = new THREE.Vector3()): THREE.Vector3 {
  const hw = halfWidthAt(t) * HW * grow
  const top = topAt(t)
  const base = baseAt(t)
  const sideY = base + SEAM * (top - base)
  const ang = u * Math.PI
  if (upper) {
    // 侧壁略外扩（指数 <1）让截面饱满；顶部 sin^0.82 略压平
    const c = Math.cos(ang)
    out.set(hw * Math.sign(c) * Math.pow(Math.abs(c), 0.9), sideY + (top - sideY) * Math.pow(Math.sin(ang), 0.82), zAt(t))
  } else {
    // 底部快速压平（指数 0.72）→ 平坦底面 + 两侧圆角
    out.set(-hw * Math.cos(ang), sideY - (sideY - base) * Math.pow(Math.sin(ang), 0.72), zAt(t))
  }
  return out
}

/** 表面数值法线（du × dt 归一化） */
function shellNormal(t: number, u: number, upper: boolean, out = new THREE.Vector3(), grow = 1): THREE.Vector3 {
  const e = 0.004
  const pu = shellPoint(t, Math.min(1, u + e), upper, grow).clone().sub(shellPoint(t, Math.max(0, u - e), upper, grow))
  const pt = shellPoint(Math.min(1, t + e), u, upper, grow).clone().sub(shellPoint(Math.max(0, t - e), u, upper, grow))
  return out.copy(pu.cross(pt)).normalize()
}

/** 放样半壳：upper 决定上半/下半，前后端三角扇封口（索引方向已按外法线推好） */
function loftHalfShell(upper: boolean, nz = 44, nu = 14, grow = 1): THREE.BufferGeometry {
  const rows = nz + 1
  const cols = nu + 1
  const pos = new Float32Array((rows * cols + 2) * 3)
  for (let r = 0; r < rows; r++) {
    const t = r / nz
    for (let c = 0; c < cols; c++) {
      shellPoint(t, c / nu, upper, grow).toArray(pos, (r * cols + c) * 3)
    }
  }
  const idx: number[] = []
  // 主网格：外法线 = -Pu × Pt 推得（u 自 +x 向 -x 时上盖需 a,d,b 序）
  for (let r = 0; r < nz; r++) {
    for (let c = 0; c < nu; c++) {
      const a = r * cols + c
      const b = (r + 1) * cols + c
      const d = (r + 1) * cols + c + 1
      const e = r * cols + c + 1
      if (upper) idx.push(a, d, b, a, e, d)
      else idx.push(a, b, d, a, d, e)
    }
  }
  // 前后端封口：ci=端心；环自 +x 出发。上盖环逆时针（+z 视），下盖环顺时针
  for (const r of [0, nz]) {
    const ci = rows * cols + (r === 0 ? 0 : 1)
    const pA = new THREE.Vector3().fromArray(pos, r * cols * 3)
    const pB = new THREE.Vector3().fromArray(pos, (r * cols + nu) * 3)
    const cy = (pA.y + pB.y) / 2
    new THREE.Vector3(0, cy, zAt(r / nz)).toArray(pos, ci * 3)
    const front = r === nz
    // 上盖：前(front)+z → (ci,a,b)？环逆时针朝 +z ⇒ front 用 (ci,b,a) 尾朝 -z 用 (ci,a,b) —— 已由渲染验收校准
    for (let c = 0; c < nu; c++) {
      const a = r * cols + c
      const b = r * cols + c + 1
      if (upper) {
        if (front) idx.push(ci, a, b)
        else idx.push(ci, b, a)
      } else {
        if (front) idx.push(ci, b, a)
        else idx.push(ci, a, b)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/**
 * 表面贴合薄壳（凸起件：按键 / 侧键 / DPI 键）：
 * 在表面函数的 (t, u) 子矩形上生成外皮（offset 外凸）+ 内皮（下潜 thickness）+ 四周侧裙。
 * grow 需与目标壳体的外扩系数一致（上盖 1.015），否则贴片会悬空/陷入。
 */
function shellPatch(
  t0: number,
  t1: number,
  u0: number,
  u1: number,
  upper: boolean,
  offset: number,
  thickness = 0.002,
  nt = 10,
  nu = 8,
  grow = 1,
): THREE.BufferGeometry {
  const rows = nt + 1
  const cols = nu + 1
  const sample = (r: number, c: number, off: number) => {
    const t = t0 + (t1 - t0) * (r / nt)
    const u = u0 + (u1 - u0) * (c / nu)
    return shellPoint(t, u, upper, grow).addScaledVector(shellNormal(t, u, upper, undefined, grow), off)
  }
  const pos = new Float32Array(rows * cols * 2 * 3)
  const gridIdx = (layer: number, r: number, c: number) => layer * rows * cols + r * cols + c
  for (let layer = 0; layer < 2; layer++) {
    const off = layer === 0 ? offset : offset - thickness
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        sample(r, c, off).toArray(pos, gridIdx(layer, r, c) * 3)
      }
    }
  }
  const idx: number[] = []
  for (let layer = 0; layer < 2; layer++) {
    // 外皮法线朝外；内皮翻向
    const flip = layer === 0
    for (let r = 0; r < nt; r++) {
      for (let c = 0; c < nu; c++) {
        const a = gridIdx(layer, r, c)
        const b = gridIdx(layer, r + 1, c)
        const cc = gridIdx(layer, r + 1, c + 1)
        const d = gridIdx(layer, r, c + 1)
        if (flip) idx.push(a, d, b, a, d, cc)
        else idx.push(a, b, cc, a, cc, d)
      }
    }
  }
  // 四周侧裙：外皮边 ↔ 内皮边
  const skirt = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d)
  for (let r = 0; r < nt; r++) {
    skirt(gridIdx(0, r, 0), gridIdx(1, r, 0), gridIdx(1, r + 1, 0), gridIdx(0, r + 1, 0))
    skirt(gridIdx(0, r + 1, nu), gridIdx(1, r + 1, nu), gridIdx(1, r, nu), gridIdx(0, r, nu))
  }
  for (let c = 0; c < nu; c++) {
    skirt(gridIdx(0, nt, c), gridIdx(1, nt, c), gridIdx(1, nt, c + 1), gridIdx(0, nt, c + 1))
    skirt(gridIdx(0, 0, c + 1), gridIdx(1, 0, c + 1), gridIdx(1, 0, c), gridIdx(0, 0, c))
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/** 表面单层贴片（分缝带）：无侧裙，深色贴面靠与壳面的间隙产生缝感 */
function shellSkin(t0: number, t1: number, u0: number, u1: number, offset: number, nt = 8, nu = 6, grow = 1): THREE.BufferGeometry {
  const rows = nt + 1
  const cols = nu + 1
  const pos = new Float32Array(rows * cols * 3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = t0 + (t1 - t0) * (r / nt)
      const u = u0 + (u1 - u0) * (c / nu)
      shellPoint(t, u, true, grow).addScaledVector(shellNormal(t, u, true, new THREE.Vector3(), grow), offset).toArray(pos, (r * cols + c) * 3)
    }
  }
  const idx: number[] = []
  for (let r = 0; r < nt; r++) {
    for (let c = 0; c < nu; c++) {
      const a = r * cols + c
      const b = (r + 1) * cols + c
      const d = (r + 1) * cols + c + 1
      const e = r * cols + c + 1
      idx.push(a, e, b, b, e, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/** 滚轮槽下沉墙：沿 t 方向的窄带，从表面向下垂 depth */
function slotWall(t0: number, t1: number, u: number, depth: number, nz = 14, grow = 1): THREE.BufferGeometry {
  const rows = nz + 1
  const pos = new Float32Array(rows * 2 * 3)
  for (let r = 0; r < rows; r++) {
    const t = t0 + (t1 - t0) * (r / nz)
    shellPoint(t, u, true, grow).toArray(pos, r * 2 * 3)
    shellPoint(t, u, true, grow).add(new THREE.Vector3(0, -depth, 0)).toArray(pos, (r * 2 + 1) * 3)
  }
  const idx: number[] = []
  for (let r = 0; r < nz; r++) {
    const a = r * 2
    idx.push(a, a + 2, a + 3, a, a + 3, a + 1)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

// ———————————————————————————————— 主构建 ————————————————————————————————

export function buildMouse(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'mouse'
  const shellMat = makeStd({ color: '#22262C', roughness: 0.42, metalness: 0.08 })
  const baseMat = makeStd({ color: '#1B1F25', roughness: 0.6, metalness: 0.3 })
  const black = makeStd({ color: '#14171C', roughness: 0.5, metalness: 0.4 })
  const rubber = makeStd({ color: '#1A1E24', roughness: 0.88, metalness: 0.04 })
  const seamMat = makeStd({ color: '#0A0D11', roughness: 0.75 })
  seamMat.side = THREE.DoubleSide
  shellMat.side = THREE.DoubleSide
  baseMat.side = THREE.DoubleSide

  // —— 上盖（top_shell_cap）：上半放样 + 外扩装配缝 ——
  const upper = new THREE.Mesh(loftHalfShell(true, 44, 16, 1.015), shellMat)
  upper.name = 'top_shell_cap'
  upper.castShadow = true
  root.add(upper)

  // 上盖可见面外扩系数：所有贴附上盖的贴片必须同 grow，否则会悬空/陷入
  const G = 1.015

  // 左右分体按键（悬臂薄壳贴片，前缘探出、后缘嵌入壳体）
  for (const side of [-1, 1] as const) {
    const u0 = side < 0 ? 0.56 : 0.13
    const u1 = side < 0 ? 0.87 : 0.44
    const btn = new THREE.Mesh(shellPatch(0.655, 0.985, u0, u1, true, 0.0008, 0.0022, 20, 14, G), shellMat)
    btn.name = `top_shell_button_${side < 0 ? 'l' : 'r'}`
    btn.castShadow = true
    root.add(btn)
  }
  // 按键三段分缝 + 后横缝（深色单层贴面）
  const seamBand = (t0: number, t1: number, u0: number, u1: number, name: string) => {
    const band = new THREE.Mesh(shellSkin(t0, t1, u0, u1, 0.0002, 8, 6, G), seamMat)
    band.name = name
    root.add(band)
  }
  seamBand(0.655, 0.985, 0.445, 0.555, 'top_shell_seam_c') // 中缝（按键间深色中脊平台）
  seamBand(0.655, 0.985, 0.112, 0.13, 'top_shell_seam_l') // 左缝
  seamBand(0.655, 0.985, 0.44, 0.443, 'top_shell_seam_r') // 右缝
  seamBand(0.64, 0.66, 0.13, 0.87, 'top_shell_seam_rear') // 按键后横缝

  // 滚轮槽：内衬 + 左右下沉墙 + 前后端墙（轮盘从中探出）
  const wellLiner = new THREE.Mesh(shellPatch(0.7, 0.9, 0.455, 0.545, true, -0.0035, 0.001, 8, 4, G), seamMat)
  wellLiner.name = 'top_shell_wheelwell'
  root.add(wellLiner)
  const wallDepth = 0.006
  for (const u of [0.455, 0.545]) {
    const w = new THREE.Mesh(slotWall(0.7, 0.9, u, wallDepth, 14, G), seamMat)
    w.name = `top_shell_wheelwall_${u < 0.5 ? 'l' : 'r'}`
    root.add(w)
  }
  for (const t of [0.7, 0.9] as const) {
    const w = new THREE.Mesh(shellPatch(t - 0.004, t, 0.455, 0.545, true, -0.003, 0.001, 2, 4, G), seamMat)
    w.name = `top_shell_wheelwall_${t < 0.8 ? 'f' : 'b'}`
    root.add(w)
  }

  // DPI 档位键（滚轮槽后侧的小凸台）+ 尾侧分缝
  const dpi = new THREE.Mesh(shellPatch(0.6, 0.65, 0.462, 0.538, true, 0.0012, 0.002, 8, 6, G), shellMat)
  dpi.name = 'top_shell_dpi'
  root.add(dpi)
  const dpiSeam = new THREE.Mesh(shellSkin(0.592, 0.604, 0.462, 0.538, 0.0002, 2, 4, G), seamMat)
  dpiSeam.name = 'top_shell_dpi_seam'
  root.add(dpiSeam)

  // 侧键（前进 / 后退，仅左侧；贴合侧面上部）
  const sideBtnSegs: Array<[number, number]> = [
    [0.5, 0.585],
    [0.615, 0.7],
  ]
  sideBtnSegs.forEach(([t0, t1], i) => {
    const btn = new THREE.Mesh(shellPatch(t0, t1, 0.8, 0.95, true, 0.001, 0.0018, 4, 4, G), shellMat)
    btn.name = `top_shell_sidebtn_${i === 0 ? 'f' : 'b'}`
    btn.castShadow = true
    root.add(btn)
  })
  seamBand(0.585, 0.615, 0.8, 0.95, 'top_shell_sidebtn_seam')

  // —— 底盖（base_cover）：下半放样 + 传感器光孔 + 铭牌 + 出线口护圈 ——
  const lower = new THREE.Mesh(loftHalfShell(false, 44, 12), baseMat)
  lower.name = 'base_cover_shell'
  lower.castShadow = true
  root.add(lower)
  const apertureMat = makeStd({ color: '#05070A', roughness: 0.9 })
  root.add(cyl(0.0042, 0.0012, apertureMat, 'base_cover_aperture', 0, 0.0014, 0.012))
  root.add(box(0.024, 0.001, 0.012, makeStd({ color: '#3E464F', roughness: 0.6 }), 'base_cover_label', 0, 0.0033, -0.0405))
  const outlet = cyl(0.0055, 0.0016, black, 'base_cover_outlet', 0, 0.0163, 0.0602)
  outlet.rotation.x = Math.PI / 2
  root.add(outlet)

  // PTFE 脚贴（2 大 2 小，纯特氟龙白，整机由脚贴着地）
  const ptfeMat = makeStd({ color: '#B9B8B2', roughness: 0.55, metalness: 0 })
  const feetPos: Array<[number, number, number]> = [
    [-0.0175, 0.036, 0.0085],
    [0.0175, 0.036, 0.0085],
    [-0.017, -0.042, 0.008],
    [0.017, -0.042, 0.008],
  ]
  feetPos.forEach(([x, z, r], i) => {
    const pad = cyl(r, 0.0018, ptfeMat, `ptfe_feet_${i}`, x, 0.0009, z)
    pad.scale.z *= 0.68 // 椭圆压扁
    root.add(pad)
  })

  // —— 主板（mouse_pcb）：围口拼板（中部让位滚轮）+ 传感器子板 + 主控 + 晶振 ——
  const pcbMat = makeStd({ color: '#14251C', roughness: 0.65, metalness: 0.25 })
  const pcbY = 0.0165
  root.add(box(0.013, 0.0016, 0.08, pcbMat, 'mouse_pcb_board_l', -0.0155, pcbY, 0))
  root.add(box(0.013, 0.0016, 0.08, pcbMat, 'mouse_pcb_board_r', 0.0155, pcbY, 0))
  root.add(box(0.044, 0.0016, 0.009, pcbMat, 'mouse_pcb_board_f', 0, pcbY, 0.0455))
  root.add(box(0.038, 0.0016, 0.008, pcbMat, 'mouse_pcb_board_b', 0, pcbY, -0.044))
  // 传感器子板（岛）：镜头穿板向下对准底盖光孔
  root.add(box(0.02, 0.0016, 0.016, pcbMat, 'mouse_pcb_board_s', 0, pcbY, 0.012))
  const chipMat = makeStd({ color: '#1B1F24', roughness: 0.4, metalness: 0.6 })
  root.add(box(0.0098, 0.0028, 0.0098, chipMat, 'mouse_pcb_sensor', 0, pcbY + 0.0022, 0.012))
  const lensMat = makeStd({ color: '#23405E', roughness: 0.22, metalness: 0.3 })
  root.add(box(0.0068, 0.0125, 0.0068, lensMat, 'mouse_pcb_lens', 0, 0.008, 0.012))
  root.add(box(0.009, 0.0024, 0.009, chipMat, 'mouse_pcb_soc', -0.0155, pcbY + 0.002, -0.024))
  root.add(box(0.004, 0.0018, 0.0025, makeStd({ color: '#8A939B', metalness: 0.85, roughness: 0.3 }), 'mouse_pcb_osc', -0.0155, pcbY + 0.0017, -0.0105))

  // —— 微动（micro_switch）：主键 ×2（欧姆龙红点）+ 中键 ×1 ——
  const swMat = makeStd({ color: '#D8D5CC', roughness: 0.6 })
  const swRedMat = makeStd({ color: '#FF4D5E', emissive: '#FF4D5E', emissiveIntensity: 0.45, roughness: 0.45 })
  const swPos: Array<[number, number]> = [
    [-0.018, 0.0445],
    [0.018, 0.0445],
    [0, 0.0455],
  ]
  swPos.forEach(([x, z], i) => {
    root.add(box(0.0072, 0.0056, 0.0062, swMat, `micro_switch_body_${i}`, x, pcbY + 0.0033, z))
    root.add(box(0.0032, 0.0026, 0.0028, swRedMat, `micro_switch_plunger_${i}`, x, pcbY + 0.0048, z))
  })

  // —— 滚轮（scroll_wheel）：前倾轮盘 + 28 条防滑刻度 + 跨骑编码器 ——
  const wheelZ = 0.0375
  const wheelY = 0.0218
  const wheelTilt = new THREE.Group()
  wheelTilt.rotation.x = -0.14 // 前倾
  wheelTilt.position.set(0, wheelY, wheelZ)
  root.add(wheelTilt)
  const wheel = new THREE.Mesh(unitCylinder, rubber)
  wheel.scale.set(0.0224, 0.008, 0.0224)
  wheel.rotation.z = Math.PI / 2
  wheel.name = 'scroll_wheel_disc'
  wheel.castShadow = true
  wheelTilt.add(wheel)
  const ribGeo = new THREE.BoxGeometry(0.0086, 0.0016, 0.0026)
  const ribMat = makeStd({ color: '#14181D', roughness: 0.78 })
  wheelTilt.add(
    makeInstanced(ribGeo, ribMat, 'scroll_wheel_rib', 28, (i, m, t) => {
      const a = (i / 28) * Math.PI * 2
      t.p.set(0, Math.cos(a) * 0.0109, Math.sin(a) * 0.0109)
      t.e.set(-a, 0, 0)
      t.q.setFromEuler(t.e)
      m.compose(t.p, t.q, t.s)
    }),
  )
  // 编码器：底座跨骑在 PCB 左右条上缘，轴穿轮心，顶帽承中键按压
  root.add(box(0.022, 0.006, 0.024, black, 'scroll_wheel_encoder_base', 0, pcbY + 0.0038, wheelZ))
  root.add(cyl(0.0035, 0.0105, black, 'scroll_wheel_encoder_shaft', 0, wheelY, wheelZ))
  root.add(box(0.005, 0.0025, 0.005, black, 'scroll_wheel_encoder_cap', 0, wheelY + 0.0055, wheelZ))

  // —— 线材（cable）：出线护套 + 编织主线自然垂坠 + 模压头 + USB-A 镀金接头 ——
  const boot = cyl(0.0052, 0.015, rubber, 'cable_boot', 0, 0.0148, 0.0645)
  boot.rotation.x = Math.PI / 2 - 0.1 // 随出线口微微上翘
  root.add(boot)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.0152, 0.0695),
    new THREE.Vector3(0, 0.015, 0.0795),
    new THREE.Vector3(0.0035, 0.0105, 0.0935),
    new THREE.Vector3(0.0075, 0.0045, 0.109),
    new THREE.Vector3(0.0095, 0.0018, 0.128),
    new THREE.Vector3(0.0105, 0.0015, 0.148),
  ])
  const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.0021, 10), makeStd({ color: '#15181D', roughness: 0.92, metalness: 0.05 }))
  wire.name = 'cable_wire'
  wire.castShadow = true
  root.add(wire)
  root.add(box(0.0094, 0.007, 0.019, rubber, 'cable_mold', 0.0105, 0.0024, 0.1565))
  const usbMat = makeStd({ color: '#9AA2AA', metalness: 0.9, roughness: 0.3 })
  root.add(box(0.0118, 0.0046, 0.0145, usbMat, 'cable_usb_shell', 0.0105, 0.0024, 0.1735))
  root.add(box(0.009, 0.0012, 0.002, makeStd({ color: '#C9A227', metalness: 1, roughness: 0.35 }), 'cable_usb_gold', 0.0105, 0.0024, 0.1815))

  return root
}
