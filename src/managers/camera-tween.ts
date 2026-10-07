/**
 * 相机补间（文档 3.2 SceneManager / 4.2）：
 * position 与 OrbitControls target 同时沿帧率无关阻尼插值；到位后回调解锁。
 * 各模式的相机位姿全部由 devices.json 数据推导，不写死在业务代码里。
 */
import * as THREE from 'three'
import { damp3 } from 'maath/easing'
import type { CameraPose } from '../data/types'
import { motion, motionScale } from '../styles/tokens'

export interface WorldPose {
  position: THREE.Vector3
  target: THREE.Vector3
  fov: number
}

/** 总览默认位姿：3/4 俯视（文档 4.1） */
export const OVERVIEW_POSE: WorldPose = {
  position: new THREE.Vector3(1.95, 1.62, 2.45),
  target: new THREE.Vector3(0, 0.68, 0),
  fov: 40,
}

/**
 * 由设备局部 CameraPose 推导世界位姿。
 * @param anchor 舞台上该设备（或子设备宿主层）的世界原点
 * @param span 爆炸总跨度（聚焦态传 0），用于自动拉远相机并抬高视线中心
 */
export function poseToWorld(pose: CameraPose, anchor: THREE.Vector3, span: number): WorldPose {
  const localPos = new THREE.Vector3(...pose.position)
  const localTarget = new THREE.Vector3(...pose.target)
  // 爆炸态：相机沿视线方向退远（跨度越大退得越远），并加宽 fov 收纳整根爆炸柱
  const viewDir = localPos.clone().sub(localTarget)
  const zoomOut = 1 + Math.min(span * 1.9, 2.6)
  const pos = anchor.clone().add(viewDir.multiplyScalar(zoomOut))
  pos.y += span * 0.1
  const target = anchor.clone().add(localTarget).add(new THREE.Vector3(0, span * 0.42, 0))
  return { position: pos, target, fov: span > 0 ? Math.max(pose.fov ?? 40, 46) : pose.fov ?? 40 }
}

/** 每帧阻尼推进相机与轨道目标；返回是否已到达（误差内） */
export function updateCameraRig(
  camera: THREE.PerspectiveCamera,
  controlsTarget: THREE.Vector3,
  targetPose: WorldPose,
  delta: number,
): boolean {
  // damp3 第三参为 smoothTime（秒）——文档 4.2 示例的 0.35
  damp3(camera.position, targetPose.position, motion.cameraSmoothTime / motionScale, delta)
  damp3(controlsTarget, targetPose.target, motion.cameraSmoothTime / motionScale, delta)
  const fovErr = Math.abs(camera.fov - targetPose.fov)
  if (fovErr > 0.05) {
    camera.fov = THREE.MathUtils.damp(camera.fov, targetPose.fov, 6 * motionScale, delta)
    camera.updateProjectionMatrix()
  }
  const arrived =
    camera.position.distanceTo(targetPose.position) < motion.cameraArriveEps &&
    controlsTarget.distanceTo(targetPose.target) < motion.cameraArriveEps &&
    fovErr < 0.05
  return arrived
}
