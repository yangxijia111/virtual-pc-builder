/**
 * 新手引导（F7）：三步气泡（点击设备 → 拆解 → 点层读介绍），可跳过。
 * 步骤随真实交互自动推进；完成后写入 localStorage 不再出现。
 */
import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'

const STEPS = [
  { text: '单击任意设备，推近查看它的内部结构', hint: '第 1 步 / 共 3 步', pos: 'center' },
  { text: '点击下方「拆解」按钮，沿垂直方向展开所有层', hint: '第 2 步 / 共 3 步', pos: 'bottom' },
  { text: '单击任意一层，阅读它的规格故事', hint: '第 3 步 / 共 3 步', pos: 'left' },
] as const

export function Onboarding(): JSX.Element | null {
  const seen = useAppStore((s) => s.onboardingSeen)
  const mode = useAppStore((s) => s.mode)
  const selected = useAppStore((s) => s.selectedLayerId)
  const markSeen = useAppStore((s) => s.markOnboardingSeen)
  const [step, setStep] = useState(0)

  // 步骤推进：跟随真实模式变化
  useEffect(() => {
    if (seen) return
    if (step === 0 && (mode === 'focus' || mode === 'exploded')) setStep(1)
    else if (step === 1 && (mode === 'exploded' || mode === 'inspecting' || mode === 'nested')) setStep(2)
    else if (step === 2 && selected) markSeen()
  }, [mode, selected, step, seen, markSeen])

  if (seen) return null
  const s = STEPS[step]

  const posClass =
    s.pos === 'center'
      ? 'left-1/2 top-[62%] -translate-x-1/2'
      : s.pos === 'bottom'
        ? 'bottom-28 left-1/2 -translate-x-1/2'
        : 'left-[340px] top-1/2 -translate-y-1/2'

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className={`pointer-events-auto absolute ${posClass} w-[320px] rounded-sm border border-accent-mint/50 bg-base/95 p-5 backdrop-blur`}>
        <div className="font-num text-[10px] tracking-[0.35em] text-accent-mint">{s.hint}</div>
        <p className="mt-2 font-cn text-[14px] leading-relaxed text-fg-primary">{s.text}</p>
        <button
          onClick={markSeen}
          className="mt-3 font-cn text-[11px] tracking-wider text-fg-tertiary transition-colors hover:text-fg-secondary"
        >
          跳过引导 →
        </button>
      </div>
    </div>
  )
}
