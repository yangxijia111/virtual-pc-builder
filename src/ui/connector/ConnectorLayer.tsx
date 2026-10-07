/**
 * ConnectorLayer：全屏 SVG 导线层 + 右侧词卡容器锚点（铁律 L6：导线是配角）。
 * 路径计算与直写全部在 engine 的 rAF 循环内，本组件只提供 DOM 载体。
 */
import { useEffect, useRef } from 'react'
import { startConnectorEngine } from './engine'
import { useCurrentLayers } from '../../store/useAppStore'

export function ConnectorLayer(): JSX.Element {
  const pathMain = useRef<SVGPathElement>(null)
  const pathChip = useRef<SVGPathElement>(null)
  const chipsRoot = useRef<HTMLDivElement>(null)
  const layers = useCurrentLayers()

  useEffect(() => {
    if (!pathMain.current || !pathChip.current || !chipsRoot.current) return
    const stop = startConnectorEngine(
      { pathMain: pathMain.current, pathChip: pathChip.current, chipsRoot: chipsRoot.current },
      () => false,
    )
    return stop
  }, [])

  return (
    <>
      {/* 导线 SVG：直角折线，1px，低透明度，选中时提亮 */}
      <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full" aria-hidden>
        <path ref={pathMain} fill="none" strokeWidth={1} style={{ opacity: 0, transition: 'opacity 200ms ease' }} />
        <path
          ref={pathChip}
          fill="none"
          strokeWidth={0.75}
          strokeDasharray="3 3"
          style={{ opacity: 0, transition: 'opacity 200ms ease' }}
        />
      </svg>
      {/* 右侧短词卡（铁律 L5：一个短语，无编号无描述，浮在对应层附近） */}
      <div ref={chipsRoot} className="pointer-events-none fixed right-8 top-0 z-20 h-full w-28" aria-hidden>
        {layers.map((l) => (
          <div
            key={l.id}
            data-chip-id={l.id}
            className={`absolute right-0 rounded-sm border px-2.5 py-1 text-right font-num text-[11px] tracking-wider transition-opacity duration-200 ${
              l.colorEmphasis === 'red' ? 'text-accent-red' : 'text-fg-secondary'
            }`}
            style={{
              borderColor: 'rgba(123,227,189,0.35)',
              backgroundColor: 'rgba(11,15,20,0.6)',
              top: '40%',
              opacity: 0,
            }}
          >
            {l.materialChip}
          </div>
        ))}
      </div>
    </>
  )
}
