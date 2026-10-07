/**
 * SceneRoot：R3F Canvas 根（文档 3.1）。
 * dpr [1,2] + 高性能偏好 + 阴影；clearColor = 设计 Token bg-base。
 */
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { SceneManager } from './SceneManager'
import { DesktopScene } from './DesktopScene'
import { RaycastManager } from './RaycastManager'
import { colors } from '../styles/tokens'

export function SceneRoot(): JSX.Element {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [1.95, 1.62, 2.45], fov: 40, near: 0.05, far: 60 }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color(colors.bgBase))
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.12
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <SceneManager />
      <DesktopScene />
      <RaycastManager />
    </Canvas>
  )
}
