/**
 * 设计 Token —— 文档 0.3 节的 TS 常量固化，供 3D 与 UI 共用。
 * 视觉唯一权威基准：docs/assets/reference-keyboard-exploded.png（image_0）。
 */

/** 颜色 Token */
export const colors = {
  bgBase: '#0B0F14', // 全局背景 / Canvas clearColor
  bgVignette: '#05070A', // 页面四角暗角
  fgPrimary: '#E8EDF2', // 层名大字
  fgSecondary: '#8A97A5', // 描述正文
  fgTertiary: '#55616D', // 分隔线、禁用态
  accentRed: '#FF4D5E', // colorEmphasis 部件的发光/高亮（轴体红）
  accentMint: '#7BE3BD', // 编号前缀、导线选中态
  lineThin: 'rgba(232,237,242,0.18)', // 分隔线、默认导线
} as const

/** 动效 Token（帧率无关阻尼参数，全部集中于此便于美术调参） */
export const motion = {
  /** damp3 的 smoothTime（秒）：约 1.2s 收敛，符合文档相机过渡 1.0–1.4s */
  cameraSmoothTime: 0.35,
  cameraArriveEps: 0.012, // 相机到位判定距离（米）
  explodeLambda: 6, // 层材质/位姿阻尼 λ（THREE.MathUtils.damp 语义）
  explodeDuration: 1.15, // 爆炸/组装推进总时长（秒，不含 stagger 尾巴）
  staggerStep: 0.08, // 每层 stagger 步长（秒 → 以进度比例参与采样）
  seatOvershoot: 0.04, // 组装落座回弹过冲幅度（4%）
  flashDuration: 0.32, // 组装完成整灯 flash 时长
  breathPeriod: 4, // 呼吸灯周期（秒）
  breathAmplitude: 0.05, // 呼吸幅度 5%
} as const

/** 爆炸布局 Token */
export const explosion = {
  /** 层间距 = explodeGap × 设备归一化尺寸（最大水平边），可整体缩放微调构图 */
  gapScale: 0.82,
  focusStageY: 1.12, // 聚焦舞台高度：聚焦设备 damp 至此悬浮展示
} as const

/** 无障碍：用户偏好减少动效时，全部过渡改为 200ms 直切 */
export const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** reduced-motion 下的等效阻尼（加大 λ ≈ 快速收敛） */
export const motionScale = prefersReducedMotion ? 8 : 1

/** 输入阈值：点击 vs 拖拽判定位移（像素，文档 4.2） */
export const dragThresholdPx = 6
