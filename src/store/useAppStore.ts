/**
 * 全局唯一事实源（文档 4.0）。
 * UI 层经 hook 订阅；3D 层在 useFrame 内 getState() 零成本读取，不经 React 渲染。
 *
 * 状态机：
 *   OVERVIEW --clickDevice--> FOCUS --explode--> EXPLODED --clickLayer--> INSPECTING
 *   EXPLODED --clickNested--> NESTED（子设备爆炸）…… Esc 沿链逐级回退。
 * 任何模式切换期间 transitioning=true 锁输入，动画系统到岗后调用 finishTransition() 解锁。
 */
import { create } from 'zustand'
import catalogJson from '../data/devices.json'
import type { DeviceDef, LayerDef, DeviceCatalog } from '../data/types'

/** JSON 导入的类型收窄（元组在 JSON 推断中退化为 number[]） */
export const catalog = catalogJson as unknown as DeviceCatalog

export type Mode = 'overview' | 'focus' | 'exploded' | 'nested' | 'inspecting'

/** 顶层设备键（devices.json 的 key，如 'keyboard'）与设备定义 */
export const deviceKeys = Object.keys(catalog.devices) as string[]
export const topDevices: Record<string, DeviceDef> = catalog.devices
export type { DeviceDef, LayerDef }

/** 按 id 查顶层设备定义 */
export function findTopDevice(id: string): DeviceDef | undefined {
  return Object.values(topDevices).find((d) => d.id === id)
}

/**
 * 当前生效的设备定义与层列表（考虑 devicePath 的嵌套深度）。
 * devicePath 为空 → 无设备；长度 1 → 顶层设备；长度 2 → 子设备。
 */
export function resolveDeviceContext(path: string[]): { device: DeviceDef; parentLayerId: string | null } | null {
  if (path.length === 0) return null
  if (path.length === 1) {
    const device = findTopDevice(path[0])
    return device ? { device, parentLayerId: null } : null
  }
  const parent = findTopDevice(path[0])
  if (!parent) return null
  // v1 深度上限 2 级：path[1] 一定是 path[0] 某层的 nested 设备
  for (const layer of parent.layers) {
    if (layer.nested && layer.nested.id === path[1]) return { device: layer.nested, parentLayerId: layer.id }
  }
  return null
}

/** 完成回调的内部排队（动画系统到岗后消费） */
type PendingSettle =
  | { type: 'enter-done' }
  | { type: 'explode-done' }
  | { type: 'assemble-done'; popNested: boolean }
  | { type: 'back-focus' } // back：整设备组装完成 → focus
  | { type: 'back-overview' } // back：聚焦返回总览完成
  | { type: 'settle-camera' } // 模式已切换，等待相机 damp 到新机位后解锁
  | null

interface AppState {
  mode: Mode
  transitioning: boolean // 相机/爆炸动画播放期间锁输入
  devicePath: string[] // 如 ['tower-01','cooler-nested']，长度 = 层级深度
  selectedLayerId: string | null // 当前选中层（连线 + 高亮）
  hoverLayerId: string | null
  /** deviceId -> 0(组装)~1(拆解)。由 3D 侧每帧直写（可变对象，不触发渲染），供 useFrame/HUD 读取 */
  explosionProgress: Record<string, number>
  /** deviceId -> 目标进度（0|1），动画推进的方向 */
  explosionTargets: Record<string, 0 | 1>
  /** 当前正在播放爆炸/组装动画的设备 id */
  animatingDeviceId: string | null
  /** 组装完成 flash 时间戳（performance.now()），3D 侧读取后自行衰减 */
  assemblyFlashAt: number
  /** 双击设备后排队的一次拆解请求（聚焦过渡解锁后自动消费） */
  pendingExplodeRequest: boolean
  onboardingSeen: boolean

  // —— 内部排队（勿在业务代码中直接使用）——
  _pending: PendingSettle

  // —— actions ——
  enterDevice: (deviceKey: string) => void // OVERVIEW → FOCUS
  explode: () => void // FOCUS → EXPLODED
  assemble: () => void // EXPLODED → FOCUS（nested 态则先组装子层）
  selectLayer: (layerId: string | null) => void // INSPECTING ↔ EXPLODED；带 nested 的层自动 enterNested
  enterNested: (layerId: string) => void // EXPLODED → NESTED
  back: () => void // Esc / 面包屑逐级返回
  setHover: (layerId: string | null) => void
  finishTransition: () => void // 动画系统到岗后解锁输入并消费排队回调
  markOnboardingSeen: () => void
}

const ONBOARDING_KEY = 'vpc.onboarding'

function readOnboardingSeen(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'done'
  } catch {
    return false
  }
}

/** 由 devicePath 推导相机锁定期间的目标模式（用于 transitioning 解锁时校正 mode） */
export const useAppStore = create<AppState>((set, get) => ({
  mode: 'overview',
  transitioning: false,
  devicePath: [],
  selectedLayerId: null,
  hoverLayerId: null,
  explosionProgress: {},
  explosionTargets: {},
  animatingDeviceId: null,
  assemblyFlashAt: 0,
  pendingExplodeRequest: false,
  onboardingSeen: readOnboardingSeen(),
  _pending: null,

  enterDevice: (deviceKey) => {
    const def = topDevices[deviceKey]
    if (!def) return
    const { transitioning } = get()
    if (transitioning) return
    set({
      mode: 'focus',
      devicePath: [def.id],
      selectedLayerId: null,
      hoverLayerId: null,
      transitioning: true,
      _pending: { type: 'enter-done' },
    })
  },

  explode: () => {
    const { mode, transitioning, devicePath } = get()
    if (transitioning) return
    if (mode !== 'focus' && mode !== 'exploded') return
    const id = devicePath[devicePath.length - 1]
    set((s) => ({
      mode: 'exploded',
      selectedLayerId: null,
      explosionTargets: { ...s.explosionTargets, [id]: 1 },
      animatingDeviceId: id,
      transitioning: true,
      _pending: { type: 'explode-done' },
    }))
  },

  assemble: () => {
    const { mode, transitioning, devicePath } = get()
    if (transitioning) return
    if (mode !== 'exploded' && mode !== 'nested' && mode !== 'inspecting') return
    // 仅当处于子设备层级（或子设备内选中态）时，组装才回退到父设备爆炸态
    if ((mode === 'nested' || mode === 'inspecting') && devicePath.length > 1) {
      const id = devicePath[devicePath.length - 1]
      set((s) => ({
        mode: 'exploded',
        selectedLayerId: null,
        explosionTargets: { ...s.explosionTargets, [id]: 0 },
        animatingDeviceId: id,
        transitioning: true,
        _pending: { type: 'assemble-done', popNested: true },
      }))
      return
    }
    // 顶层爆炸/选中态：整设备组装回聚焦态
    const id = devicePath[devicePath.length - 1]
    set((s) => ({
      mode: 'focus',
      selectedLayerId: null,
      explosionTargets: { ...s.explosionTargets, [id]: 0 },
      animatingDeviceId: id,
      transitioning: true,
      _pending: { type: 'assemble-done', popNested: false },
    }))
  },

  selectLayer: (layerId) => {
    const { mode, transitioning, devicePath } = get()
    if (transitioning) return
    // EXPLODED/INSPECTING/NESTED 上下文才响应
    if (mode !== 'exploded' && mode !== 'inspecting' && mode !== 'nested') return
    if (layerId === null) {
      // 取消选中：子设备上下文回到 nested，顶层回到 exploded
      set({ selectedLayerId: null, mode: devicePath.length > 1 ? 'nested' : 'exploded' })
      return
    }
    const ctx = resolveDeviceContext(devicePath)
    if (!ctx) return
    const layer = ctx.device.layers.find((l) => l.id === layerId)
    if (!layer) return
    // 可进一步拆解的层：直接进入二级拆解（文档 4.5）
    if (layer.nested) {
      get().enterNested(layerId)
      return
    }
    set({ selectedLayerId: layerId, mode: 'inspecting' })
  },

  enterNested: (layerId) => {
    const { mode, transitioning, devicePath } = get()
    if (transitioning) return
    if (mode !== 'exploded' && mode !== 'inspecting') return
    const ctx = resolveDeviceContext(devicePath)
    if (!ctx) return
    const layer = ctx.device.layers.find((l) => l.id === layerId)
    if (!layer?.nested) return
    if (devicePath.length >= 2) return // v1 深度上限 2 级
    set({
      mode: 'nested',
      devicePath: [...devicePath, layer.nested.id],
      selectedLayerId: null,
      hoverLayerId: null,
      transitioning: true,
      _pending: { type: 'enter-done' },
    })
  },

  back: () => {
    const { mode, transitioning, devicePath } = get()
    if (transitioning) return
    if (mode === 'inspecting') {
      // 取消选中：子设备上下文回 nested，顶层回 exploded
      set({ selectedLayerId: null, mode: devicePath.length > 1 ? 'nested' : 'exploded' })
      return
    }
    if (mode === 'nested') {
      // Esc 逐级返回：组装当前子设备 → 回父设备爆炸态
      const id = devicePath[devicePath.length - 1]
      set((s) => ({
        mode: 'exploded',
        selectedLayerId: null,
        explosionTargets: { ...s.explosionTargets, [id]: 0 },
        animatingDeviceId: id,
        transitioning: true,
        _pending: { type: 'assemble-done', popNested: true },
      }))
      return
    }
    if (mode === 'exploded') {
      // 整设备组装 → 回聚焦态
      const id = devicePath[devicePath.length - 1]
      set((s) => ({
        mode: 'focus',
        selectedLayerId: null,
        explosionTargets: { ...s.explosionTargets, [id]: 0 },
        animatingDeviceId: id,
        transitioning: true,
        _pending: { type: 'back-focus' },
      }))
      return
    }
    if (mode === 'focus') {
      // 返回总览：设备移回桌面、其余设备淡入、相机飞回
      set({
        mode: 'overview',
        devicePath: [],
        selectedLayerId: null,
        hoverLayerId: null,
        transitioning: true,
        _pending: { type: 'back-overview' },
      })
    }
  },

  setHover: (layerId) => {
    const { hoverLayerId } = get()
    if (hoverLayerId === layerId) return
    set({ hoverLayerId: layerId })
  },

  finishTransition: () => {
    const { _pending, devicePath } = get()
    if (!_pending) {
      set({ transitioning: false })
      return
    }
    const patch: Partial<AppState> = { transitioning: false, _pending: null }
    switch (_pending.type) {
      case 'enter-done': {
        // 进入设备/子设备完成：保持 focus/nested 模式。
        // 子设备（文档 4.5）：相机二次推近到位后，自动引爆子层（同一套爆炸时钟）
        if (devicePath.length > 1) {
          const subId = devicePath[devicePath.length - 1]
          patch.transitioning = true
          patch._pending = { type: 'explode-done' }
          patch.animatingDeviceId = subId
          patch.explosionTargets = { ...get().explosionTargets, [subId]: 1 }
        }
        break
      }
      case 'explode-done': {
        // 爆炸完成：默认预选第一层，立即呈现图文结构（文档 4.3）
        patch.animatingDeviceId = null // 动画已收尾，释放 HUD 的进度监听
        const ctx = resolveDeviceContext(devicePath)
        patch.mode = 'inspecting'
        patch.selectedLayerId = ctx?.device.layers[0]?.id ?? null
        break
      }
      case 'assemble-done': {
        // 组装完成：整灯 flash（F6）；popNested 时移除子设备路径
        patch.animatingDeviceId = null
        patch.assemblyFlashAt = performance.now()
        if (_pending.popNested) {
          const parent = findTopDevice(devicePath[0])
          const popTo = 'exploded'
          patch.devicePath = devicePath.slice(0, 1)
          patch.mode = popTo
          patch.selectedLayerId = _pending.popNested
            ? parent?.layers.find((l) => l.nested?.id === devicePath[1])?.id ?? null
            : null
          // 相机还在子设备机位：继续锁定，等它飞回父设备爆炸位再解锁
          patch.animatingDeviceId = null
          patch.transitioning = true
          patch._pending = { type: 'settle-camera' }
        }
        break
      }
      case 'back-focus': {
        patch.mode = 'focus'
        // 相机需要从爆炸位飞回聚焦位：保持锁定直到到位
        patch.animatingDeviceId = null
        patch.transitioning = true
        patch._pending = { type: 'settle-camera' }
        break
      }
      case 'settle-camera':
        // 相机已到新机位（CameraRig 到达判定 / 2.5s 超时吸附），解锁
        break
      case 'back-overview':
        patch.mode = 'overview'
        break
    }
    set(patch as AppState)
  },

  markOnboardingSeen: () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'done')
    } catch {
      /* 隐私模式下静默失败 */
    }
    set({ onboardingSeen: true })
  },
}))

/** 便捷读取：当前设备定义（可能为子设备） */
export function useCurrentDevice(): DeviceDef | null {
  return useAppStore((s) => resolveDeviceContext(s.devicePath)?.device ?? null)
}

/** 便捷读取：当前层列表 */
export function useCurrentLayers(): LayerDef[] {
  return useCurrentDevice()?.layers ?? []
}
