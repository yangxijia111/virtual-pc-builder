/**
 * UIOverlay：DOM 层组合（文档 3.1）。叠在 Canvas 之上，与 3D 层唯一通道 = store。
 * 另附页面四角暗角（CSS 径向渐变，不用后处理 vignette —— 文档 6.3）。
 */
import { DescriptionPanelManager } from './panels/DescriptionPanelManager'
import { ConnectorLayer } from './connector/ConnectorLayer'
import { HUD, Breadcrumb } from './hud/HUD'
import { Onboarding } from './hud/Onboarding'

export function UIOverlay(): JSX.Element {
  return (
    <>
      {/* 四角暗角（最底层 overlay，不拦截输入） */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(5,7,10,0.55) 100%)' }}
        aria-hidden
      />
      <DescriptionPanelManager />
      <ConnectorLayer />
      <Breadcrumb />
      <HUD />
      <Onboarding />
    </>
  )
}
