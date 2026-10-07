/**
 * SceneManager（文档 3.1/3.2）：
 * - CameraRig：drei CameraControls（拖拽环绕/缩放）+ 模式位姿阻尼补间 + transitioning 锁
 * - LightingRig：主平行光（阴影）+ 轮廓光 + Lightformer 自建环境（零外部文件）+ 爆炸态光照演出
 * - Effects：Bloom（mipmapBlur 半分辨率，只咬霓虹件）
 * - Ticker：爆炸时钟推进与到达回调（驱动 store.finishTransition）
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useAppStore, resolveDeviceContext } from '../store/useAppStore'
import { OVERVIEW_POSE, poseToWorld, updateCameraRig } from '../managers/camera-tween'
import { explosionClocks, layerRegistry, computeGap } from '../managers/exploded'
import { threeBridge } from './three-bridge'
import { explosion as explosionTokens, motionScale } from '../styles/tokens'

/** 各模式的相机极角/距离钳制（文档 4.0 输入映射表） */
function applyControlLimits(controls: OrbitControls, mode: string): void {
  if (mode === 'overview') {
    controls.minPolarAngle = 0.12
    controls.maxPolarAngle = Math.PI * 0.46
    controls.minDistance = 1.1
    controls.maxDistance = 6
  } else {
    controls.minPolarAngle = 0.1
    controls.maxPolarAngle = Math.PI * 0.52
    controls.minDistance = 0.25
    controls.maxDistance = 4
  }
}

/** 模式 → 世界位姿（全部由 devices.json 数据推导；设备尺寸由 DeviceAnchor 挂载时写入 dimsRegistry） */
export function resolveTargetPose(mode: string, devicePath: string[]): ReturnType<typeof poseToWorld> | typeof OVERVIEW_POSE {
  const ctx = resolveDeviceContext(devicePath)
  if (!ctx) return OVERVIEW_POSE
  const anchor = new THREE.Vector3(0, explosionTokens.focusStageY, 0)
  const dims = dimsRegistry.get(ctx.device.id) ?? new THREE.Vector3(0.3, 0.1, 0.3)
  const span = (ctx.device.layers.length - 1) * computeGap(ctx.device.explodeGap, dims.x, dims.z)
  if (mode === 'nested' || (mode === 'inspecting' && devicePath.length > 1)) {
    // 子设备：锚点 = 父宿主层当前爆炸位（舞台上），跨度用子设备自身尺寸
    const childAnchor = new THREE.Vector3(0, explosionTokens.focusStageY + anchorLayerY(devicePath[0], ctx.parentLayerId), 0)
    return poseToWorld(ctx.device.focusCamera, childAnchor, span)
  }
  if (mode === 'focus') return poseToWorld(ctx.device.focusCamera, anchor, 0)
  return poseToWorld(ctx.device.focusCamera, anchor, span)
}

/** 查父设备宿主层当前爆炸偏移 y（舞台局部） */
function anchorLayerY(parentDeviceId: string, parentLayerId: string | null): number {
  if (!parentLayerId) return 0
  const reg = layerRegistry.get(parentDeviceId, parentLayerId)
  return reg ? reg.group.position.y : 0
}

/** 设备尺寸注册（DeviceAnchor 挂载时写入；相机拉远量依赖它） */
export const dimsRegistry = new Map<string, THREE.Vector3>()

export function SceneManager(): JSX.Element {
  return (
    <>
      <CameraRig />
      <LightingRig />
      <Effects />
      <Ticker />
    </>
  )
}

/** 爆炸时钟推进 + 到达解锁（贯穿所有模式的每帧逻辑枢纽）；顺带按需重绘阴影贴图 */
function Ticker(): null {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    // 静态帧不重绘阴影（autoUpdate=false），首帧强制渲染一次兜底
    gl.shadowMap.needsUpdate = true
    explosionClocks.onArrive = (deviceId, target) => {
      const s = useAppStore.getState()
      if (s.animatingDeviceId === deviceId) {
        s.finishTransition()
      }
      void target
    }
    return () => {
      explosionClocks.onArrive = null
    }
  }, [gl])
  useFrame((_, delta) => {
    const s = useAppStore.getState()
    explosionClocks.update(delta, s.explosionTargets)
    // 几何静止（无过渡、无爆炸时钟在途）时跳过阴影贴图重绘，
    // 省掉整个场景的阴影 pass（相机环绕 / 材质呼吸不影响阴影内容）
    let moving = s.transitioning
    if (!moving) {
      for (const [id, t] of Object.entries(s.explosionTargets)) {
        if ((explosionClocks.progress.get(id) ?? 0) !== t) {
          moving = true
          break
        }
      }
    }
    gl.shadowMap.autoUpdate = moving
    if (moving) gl.shadowMap.needsUpdate = true
  })
  return null
}

function CameraRig(): null {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const controls = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enableDamping = true
    c.dampingFactor = 0.08
    c.enablePan = false
    c.target.copy(OVERVIEW_POSE.target)
    c.update()
    return c
  }, [camera, gl])
  const lastMode = useRef<string>('')
  const transitionStartedAt = useRef(0)

  useEffect(() => {
    threeBridge.camera = camera
    threeBridge.canvas = gl.domElement
    threeBridge.scene = scene
    return () => controls.dispose()
  }, [camera, gl, scene, controls])

  // 过渡开始（transitioning 上升沿）即重新计时
  useEffect(() => {
    return useAppStore.subscribe((s, prev) => {
      if (s.transitioning && !prev.transitioning) transitionStartedAt.current = performance.now()
    })
  }, [])

  useFrame((_, delta) => {
    const s = useAppStore.getState()
    if (s.mode !== lastMode.current) {
      applyControlLimits(controls, s.mode)
      lastMode.current = s.mode
    }
    if (s.transitioning) {
      controls.enabled = false
      const pose = resolveTargetPose(s.mode, s.devicePath)
      const arrived = updateCameraRig(camera, controls.target, pose, delta * motionScale)
      controls.update()
      // 超时兜底：后台标签 rAF 深度节流或浮点渐近不收敛时，直接吸附到目标位姿再解锁，
      // 保证过渡的最终状态在任何帧率下都精确
      if (arrived || performance.now() - transitionStartedAt.current > 2500) {
        camera.position.copy(pose.position)
        controls.target.copy(pose.target)
        if (Math.abs(camera.fov - pose.fov) > 0.01) {
          camera.fov = pose.fov
          camera.updateProjectionMatrix()
        }
        controls.update()
        s.finishTransition()
      }
    } else {
      controls.enabled = true
      controls.update()
    }
  })
  return null
}

function LightingRig(): JSX.Element {
  const keyLight = useRef<THREE.DirectionalLight>(null)
  const baseIntensity = 1.15
  useFrame((_, delta) => {
    // 爆炸态光照演出：主光 damp 至 1.2 倍并轻微上移（文档 4.3）
    const s = useAppStore.getState()
    const lit = keyLight.current
    if (!lit) return
    const exploded = s.mode === 'exploded' || s.mode === 'inspecting' || s.mode === 'nested'
    const target = baseIntensity * (exploded ? 1.2 : 1)
    lit.intensity = THREE.MathUtils.damp(lit.intensity, target, 3, delta)
    const yTarget = exploded ? 5.4 : 5
    lit.position.y = THREE.MathUtils.damp(lit.position.y, yTarget, 3, delta)
  })
  return (
    <>
      <ambientLight intensity={0.22} />
      <directionalLight
        ref={keyLight}
        position={[3, 5, 2]}
        intensity={baseIntensity}
        color="#EAF2F8"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-1.6}
        shadow-camera-right={1.6}
        shadow-camera-top={1.6}
        shadow-camera-bottom={-1.6}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-bias={-0.0004}
      />
      {/* 轮廓光：不投影 */}
      <directionalLight position={[-3.5, 2.5, -3]} intensity={0.4} color="#8FB8C9" />
      {/* 自建摄影棚环境（Lightformer，无外部 HDRI 文件） */}
      <Environment resolution={64} frames={1}>
        <color attach="background" args={['#0B0F14']} />
        <Lightformer intensity={2.4} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[9, 9, 1]} color="#DCE8F2" />
        <Lightformer intensity={1.1} position={[-4, 1.5, 2]} rotation-y={Math.PI / 2} scale={[5, 2.4, 1]} color="#9FC4D4" />
        <Lightformer intensity={0.7} position={[4, 1, -2]} rotation-y={-Math.PI / 2} scale={[5, 2, 1]} color="#5E7686" />
      </Environment>
    </>
  )
}

/** Bloom：半径小、阈值高，只咬霓虹件（轴体红 / 编号青 / 灯条） */
function Effects(): JSX.Element {
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.62} luminanceThreshold={0.6} luminanceSmoothing={0.15} levels={5} />
    </EffectComposer>
  )
}
