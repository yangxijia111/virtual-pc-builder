/**
 * DescriptionPanelManager（铁律 L3/L5）：左侧条目流 + 右侧词卡。
 * 左栏：编号 `0X · 层别词`（青、宽字距、等宽）→ 层名（白粗体大字）→ 描述（灰）→ 1px 分隔线。
 * 选中变化时 scrollIntoView 居中；条目可 Tab 聚焦（Enter 等价点击，无障碍路径）。
 */
import { useEffect, useRef } from 'react'
import { useAppStore, useCurrentDevice, useCurrentLayers } from '../../store/useAppStore'
import type { LayerDef } from '../../data/types'

export function DescriptionPanelManager(): JSX.Element | null {
  const device = useCurrentDevice()
  const layers = useCurrentLayers()
  const mode = useAppStore((s) => s.mode)
  const visible = mode === 'exploded' || mode === 'inspecting' || mode === 'nested'
  if (!device || !visible) return null

  return (
    <>
      {/* 左侧条目流 */}
      <aside
        className="pointer-events-none fixed left-0 top-0 z-20 flex h-full w-[320px] flex-col justify-center overflow-hidden pl-10 pr-6"
        aria-label={`${device.name} 拆解层介绍`}
      >
        <div className="max-h-[82vh] overflow-y-auto no-scrollbar">
          <div className="mb-4 font-num text-[10px] uppercase tracking-[0.35em] text-fg-tertiary">
            {device.name}
          </div>
          <ul>
            {layers.map((l) => (
              <LayerEntry key={l.id} layer={l} />
            ))}
          </ul>
        </div>
      </aside>
      {/* 右侧栏占位标题（词卡本体由 ConnectorLayer 渲染并跟随层位置） */}
      <aside className="pointer-events-none fixed right-8 top-8 z-20 hidden" aria-hidden />
    </>
  )
}

function LayerEntry({ layer }: { layer: LayerDef }): JSX.Element {
  const selectedId = useAppStore((s) => s.selectedLayerId)
  const selectLayer = useAppStore((s) => s.selectLayer)
  const mode = useAppStore((s) => s.mode)
  const selected = selectedId === layer.id
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [selected])

  const nestedBadge = layer.nested && mode === 'exploded'

  return (
    <li ref={ref}>
      <button
        data-entry-id={layer.id}
        onClick={() => selectLayer(selected ? null : layer.id)}
        onFocus={() => selectLayer(layer.id)}
        className={`pointer-events-auto block w-full border-l-2 py-3.5 pl-4 pr-2 text-left transition-all duration-200 ${
          selected
            ? 'border-accent-mint bg-white/[0.04]'
            : 'border-transparent hover:border-fg-tertiary hover:bg-white/[0.02]'
        }`}
      >
        <div className="flex items-baseline justify-between">
          <div className="font-num text-[12px] tracking-[0.35em] text-accent-mint">
            {String(layer.index).padStart(2, '0')} · {layer.category}
          </div>
          {nestedBadge && (
            <span className="rounded-sm border border-accent-mint/50 px-1.5 py-px font-num text-[9px] tracking-widest text-accent-mint">
              可再拆
            </span>
          )}
        </div>
        <div
          className={`mt-1 font-cn text-[22px] font-bold leading-tight transition-colors duration-200 ${
            selected ? 'text-fg-primary' : 'text-fg-primary/85'
          }`}
        >
          {layer.name}
        </div>
        <p className="mt-1.5 font-cn text-[13px] leading-[1.9] text-fg-secondary">{layer.description}</p>
        <div className="mt-3 h-px w-full" style={{ backgroundColor: 'rgba(232,237,242,0.12)' }} />
      </button>
    </li>
  )
}
