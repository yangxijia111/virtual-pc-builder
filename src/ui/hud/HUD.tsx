/**
 * HUD：拆解/组装按钮（含组装进度百分比）、面包屑、声音开关。
 * 进度显示用 rAF 节流读取 store（100ms），避免每帧 setState。
 */
import { useEffect, useRef, useState } from 'react'
import { useAppStore, useCurrentDevice, resolveDeviceContext, topDevices } from '../../store/useAppStore'
import { explosionClocks } from '../../managers/exploded'
import { playSeatClick, toggleMuted, isMuted } from './sound'

export function HUD(): JSX.Element | null {
  const mode = useAppStore((s) => s.mode)
  const transitioning = useAppStore((s) => s.transitioning)
  const animatingId = useAppStore((s) => s.animatingDeviceId)
  const busyTarget = useAppStore((s) => (animatingId ? s.explosionTargets[animatingId] : undefined))
  const device = useCurrentDevice()
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(isMuted())

  // 组装完成 → 落座音效（资源未接入前用 WebAudio 合成，可静音）
  const flashAt = useAppStore((s) => s.assemblyFlashAt)
  useEffect(() => {
    if (flashAt) playSeatClick()
  }, [flashAt])

  // 组装/拆解进度（节流 100ms）：rAF 只在动画在途时运转，避免解锁后永久空转轮询
  useEffect(() => {
    if (!animatingId || !transitioning) return
    let raf = 0
    let last = 0
    const tick = (t: number): void => {
      if (t - last > 100) {
        last = t
        const p = explosionClocks.progress.get(animatingId) ?? 0
        setProgress(Math.round((useAppStore.getState().explosionTargets[animatingId] === 0 ? 1 - p : p) * 100))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      setProgress(0)
    }
  }, [animatingId, transitioning])

  if (mode === 'overview') return null
  // 动效方向标签：由 explosionTargets 决定"拆解中/组装中"（此前方向与文案相反）
  const busyLabel =
    transitioning && animatingId && busyTarget !== undefined ? `${busyTarget === 1 ? '拆解中' : '组装中'} ${progress}%` : null

  return (
    <>
      {/* 底部中：拆解 / 组装 */}
      <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2">
        {mode === 'focus' && (
          <ActionButton
            disabled={transitioning}
            shortcut="E"
            label={busyLabel ?? (transitioning ? '调整视角…' : '拆解')}
            onClick={() => useAppStore.getState().explode()}
          />
        )}
        {(mode === 'exploded' || mode === 'inspecting' || mode === 'nested') && (
          <ActionButton
            disabled={transitioning}
            shortcut="A"
            label={busyLabel ?? '组装'}
            onClick={() => useAppStore.getState().assemble()}
          />
        )}
      </div>
      {/* 右下：提示 + 声音开关 */}
      <div className="fixed bottom-8 right-8 z-40 flex items-center gap-3">
        {device && mode !== 'focus' && (
          <span className="font-cn text-[11px] tracking-wider text-fg-tertiary">Esc 逐级返回</span>
        )}
        <button
          onClick={() => setMuted(toggleMuted())}
          className="rounded-sm border border-line-thin px-2 py-1 font-num text-[10px] tracking-widest text-fg-tertiary transition-colors hover:text-fg-secondary"
          aria-label={muted ? '开启音效' : '静音'}
        >
          {muted ? 'SOUND OFF' : 'SOUND ON'}
        </button>
      </div>
    </>
  )
}

function ActionButton({ label, shortcut, disabled, onClick }: { label: string; shortcut: string; disabled: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group pointer-events-auto flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-sm border border-accent-mint/60 bg-base/80 px-6 py-2.5 font-cn text-[14px] tracking-[0.2em] text-fg-primary backdrop-blur transition-all duration-200 hover:border-accent-mint hover:bg-accent-mint/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
      <kbd className="rounded-sm border border-fg-tertiary/60 px-1.5 py-0.5 font-num text-[10px] text-fg-tertiary group-hover:text-fg-secondary">
        {shortcut}
      </kbd>
    </button>
  )
}

/** 面包屑：总览 / 设备 / 子设备，点击逐级返回（Esc 等价） */
export function Breadcrumb(): JSX.Element | null {
  const mode = useAppStore((s) => s.mode)
  const devicePath = useAppStore((s) => s.devicePath)
  // 返回总览的轮询定时器：防重复创建，卸载时清理
  const backTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (backTimer.current !== null) clearInterval(backTimer.current)
    },
    [],
  )
  if (mode === 'overview' && devicePath.length === 0) return null

  const ctx = resolveDeviceContext(devicePath)
  const topLevel = devicePath.length >= 1 ? findName(devicePath[0]) : null
  const subLevel = devicePath.length >= 2 ? (ctx?.device.name ?? null) : null

  const goOverview = (): void => {
    if (backTimer.current !== null) return
    // 循环 back：transitioning 期间自动等待，逐级动画返回总览
    backTimer.current = window.setInterval(() => {
      const s = useAppStore.getState()
      if (s.mode === 'overview' && s.devicePath.length === 0) {
        clearInterval(backTimer.current!)
        backTimer.current = null
        return
      }
      if (!s.transitioning) s.back()
    }, 250)
  }

  return (
    <nav className="fixed left-10 top-7 z-40 flex items-center gap-2 font-cn text-[12px] tracking-widest" aria-label="层级导航">
      <button onClick={goOverview} className="text-fg-tertiary transition-colors hover:text-accent-mint">
        总览
      </button>
      {topLevel && (
        <>
          <span className="text-fg-tertiary">/</span>
          <button
            onClick={() => {
              const s = useAppStore.getState()
              if (!s.transitioning && s.devicePath.length > 1) s.back()
            }}
            className={devicePath.length > 1 ? 'text-fg-tertiary transition-colors hover:text-accent-mint' : 'text-fg-primary'}
          >
            {topLevel}
          </button>
        </>
      )}
      {subLevel && (
        <>
          <span className="text-fg-tertiary">/</span>
          <span className="text-fg-primary">{subLevel}</span>
        </>
      )}
    </nav>
  )
}

function findName(deviceId: string): string | null {
  // devicePath 存的是 def.id；从顶层目录反查展示名
  for (const def of Object.values(topDevices)) {
    if (def.id === deviceId) return def.name
  }
  return null
}
