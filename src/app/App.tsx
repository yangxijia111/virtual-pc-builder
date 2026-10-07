/**
 * App：应用根。
 * - Loading 阶段分帧预构建全部模型（真实进度），完成后挂载 Canvas
 * - 全局键盘：E 拆解 / A 组装 / Esc 逐级返回（文档 4.0 输入映射表）
 * - Canvas aria-label 描述当前模式（可访问性）
 */
import { useEffect, useState } from 'react'
import { SceneRoot } from '../three/SceneRoot'
import { UIOverlay } from '../ui/UIOverlay'
import { LoadingScreen } from '../ui/hud/LoadingScreen'
import { prepareAllModels } from '../three/models/registry'
import { useAppStore } from '../store/useAppStore'

export function App(): JSX.Element {
  const [progress, setProgress] = useState(0)
  const [ready, setReady] = useState(false)
  const [modeLabel, setModeLabel] = useState('总览')

  useEffect(() => {
    // 程序化模型同步构建（<100ms）；揭幕交给 CSS 动画，不依赖 setTimeout/rAF 时序
    //（后台标签与不可见 webview 中 timer/rAF 会被浏览器深度节流）
    prepareAllModels((done, total) => {
      setProgress(done / total)
      if (done >= total) setReady(true)
    })
  }, [])

  // 全局快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useAppStore.getState()
      if (e.key === 'Escape') s.back()
      else if (e.key === 'e' || e.key === 'E') {
        if (s.mode === 'focus') s.explode()
      } else if (e.key === 'a' || e.key === 'A') {
        if (s.mode === 'exploded' || s.mode === 'inspecting' || s.mode === 'nested') s.assemble()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // dev 调试句柄：验收脚本通过 CDP 驱动状态机与读取进度
  useEffect(() => {
    if (import.meta.env.DEV) {
      Promise.all([import('../three/three-bridge'), import('../three/SceneManager')]).then(
        ([{ threeBridge }, { dimsRegistry }]) => {
          ;(window as unknown as Record<string, unknown>).__vpc = { useAppStore, threeBridge, dimsRegistry }
        },
      )
    }
  }, [])

  // Canvas 区域 aria-label 跟随模式
  useEffect(() => {
    const labels: Record<string, string> = {
      overview: '总览模式：拖拽环绕，滚轮缩放，单击设备聚焦',
      focus: '聚焦模式：可点击拆解按钮展开内部层',
      exploded: '拆解模式：单击任意层查看介绍',
      nested: '二级拆解模式：单击子部件查看介绍',
      inspecting: '检视模式：已选中一层，再点空白取消',
    }
    setModeLabel(labels[useAppStore.getState().mode] ?? '交互场景')
    return useAppStore.subscribe((s) => setModeLabel(labels[s.mode] ?? '交互场景'))
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-base font-cn">
      {ready && (
        <div className="scene-reveal absolute inset-0">
          <div aria-label={modeLabel} role="application" className="h-full w-full">
            <SceneRoot />
          </div>
          <UIOverlay />
        </div>
      )}
      {!ready && <LoadingScreen progress={progress} />}
    </div>
  )
}
