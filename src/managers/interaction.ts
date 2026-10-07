/**
 * InteractionManager 纯逻辑模块（文档 3.2）：
 * 把原生 pointer 事件翻译成业务意图（click / dblclick / hover），
 * 做点击 vs 拖拽判定（位移阈值 6px）与双击检测（300ms 内同目标两击）。
 */
import { dragThresholdPx } from '../styles/tokens'

export interface PointerIntent {
  kind: 'click' | 'dblclick'
  x: number
  y: number
}

export class InteractionTracker {
  private downX = 0
  private downY = 0
  private downValid = false
  private lastClickTime = 0
  private lastClickKey = ''

  /** pointerdown：记录起点 */
  onDown(x: number, y: number): void {
    this.downX = x
    this.downY = y
    this.downValid = true
  }

  /** pointermove：拖出阈值后本次按下作废（视为拖拽环绕） */
  onMove(x: number, y: number): void {
    if (!this.downValid) return
    if (Math.hypot(x - this.downX, y - this.downY) > dragThresholdPx) this.downValid = false
  }

  /**
   * pointerup：位移在阈值内才算点击。
   * @param key 目标的稳定标识（同一对象 300ms 内两击 = 双击）
   * @returns null = 忽略（拖拽 / 非点击）
   */
  onUp(x: number, y: number, key: string, now: number): PointerIntent | null {
    if (!this.downValid) return null
    this.downValid = false
    const isDouble = now - this.lastClickTime < 300 && this.lastClickKey === key
    this.lastClickTime = now
    this.lastClickKey = key
    return { kind: isDouble ? 'dblclick' : 'click', x, y }
  }

  cancel(): void {
    this.downValid = false
  }
}
