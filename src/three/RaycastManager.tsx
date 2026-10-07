/**
 * RaycastManager（InteractionManager 的场景实现，文档 3.2/4.2）：
 * 原生 pointer 事件 + Raycaster，把命中翻译成业务意图并 dispatch store actions。
 * - 点击 vs 拖拽：位移阈值 6px（interaction.ts）
 * - 双击：300ms 内同目标两击（overview 双击 = 聚焦并直接拆解；focus 双击 = 拆解）
 * - hover：节流 raycast，驱动光标与 hoverLayerId
 */
import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useAppStore } from '../store/useAppStore'
import { InteractionTracker } from '../managers/interaction'
import { visiblePickRoots } from './pick-roots'

export function RaycastManager(): null {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const tracker = new InteractionTracker()
    let lastHoverKey: string | null = null
    let lastHoverAt = 0

    const hitInfo = (ev: PointerEvent): { deviceKey: string | null; layerId: string | null; deviceId: string | null; key: string } => {
      const rect = el.getBoundingClientRect()
      pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      // 只扫登记的设备模型根，并按当帧可见性过滤：跳过桌面 / 接触阴影 /
      // 已淡出设备与隐藏的嵌套模型（three.js 射线检测不会跳过 invisible 对象）
      const hits = raycaster.intersectObjects(visiblePickRoots(), true)
      let deviceKey: string | null = null
      let layerId: string | null = null
      let deviceId: string | null = null
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object
        while (o) {
          const ud = o.userData as { deviceKey?: string; layerId?: string; deviceId?: string }
          if (!deviceKey && ud.deviceKey) deviceKey = ud.deviceKey
          if (!layerId && ud.layerId) {
            layerId = ud.layerId
            deviceId = ud.deviceId ?? null
          }
          if (deviceKey && layerId) break
          o = o.parent
        }
        if (deviceKey || layerId) break
      }
      return { deviceKey, layerId, deviceId, key: layerId ?? deviceKey ?? '' }
    }

    const onDown = (ev: PointerEvent): void => {
      if (ev.button !== 0) return
      tracker.onDown(ev.clientX, ev.clientY)
    }
    const onMove = (ev: PointerEvent): void => {
      tracker.onMove(ev.clientX, ev.clientY)
      // hover 节流 60ms
      const now = performance.now()
      if (now - lastHoverAt < 60) return
      lastHoverAt = now
      const s = useAppStore.getState()
      if (s.transitioning) return
      const hit = hitInfo(ev)
      let hover: string | null = null
      let pointerCursor = false
      if (s.mode === 'overview') {
        pointerCursor = !!hit.deviceKey
      } else if (s.mode === 'exploded' || s.mode === 'inspecting' || s.mode === 'nested') {
        // 仅当前层级上下文的设备层可 hover（嵌套时父层降暗不可点）
        const ctxOk = hit.deviceId === s.devicePath[s.devicePath.length - 1]
        if (ctxOk && hit.layerId) {
          hover = hit.layerId
          pointerCursor = true
        }
      }
      if (hover !== lastHoverKey) {
        lastHoverKey = hover
        s.setHover(hover)
      }
      el.style.cursor = pointerCursor ? 'pointer' : ''
    }
    const onUp = (ev: PointerEvent): void => {
      if (ev.button !== 0) return
      const s = useAppStore.getState()
      const hit = hitInfo(ev)
      const intent = tracker.onUp(ev.clientX, ev.clientY, hit.key, performance.now())
      if (!intent || s.transitioning) return

      if (s.mode === 'overview') {
        if (!hit.deviceKey) return
        if (intent.kind === 'dblclick') {
          // 双击 = 聚焦并直接拆解：聚焦过渡解锁后自动触发
          useAppStore.setState({ pendingExplodeRequest: true })
        }
        s.enterDevice(hit.deviceKey)
        return
      }
      if (s.mode === 'focus') {
        if (intent.kind === 'dblclick' && hit.deviceKey) s.explode()
        return
      }
      if (s.mode === 'exploded' || s.mode === 'inspecting' || s.mode === 'nested') {
        const ctxOk = hit.deviceId === s.devicePath[s.devicePath.length - 1]
        if (ctxOk && hit.layerId) s.selectLayer(hit.layerId)
        else if (!hit.layerId) s.selectLayer(null) // 点空白取消
      }
    }
    const onLeave = (): void => tracker.cancel()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [gl, camera])

  // 双击直拆：聚焦过渡完成且解锁后自动触发（store 订阅驱动，无常驻 rAF 轮询）
  useEffect(() => {
    const consume = (s = useAppStore.getState()): void => {
      if (s.pendingExplodeRequest && !s.transitioning && s.mode === 'focus') {
        useAppStore.setState({ pendingExplodeRequest: false })
        s.explode()
      }
    }
    consume()
    return useAppStore.subscribe(() => consume())
  }, [])

  return null
}
