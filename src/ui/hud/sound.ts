/**
 * 组装落座音效：无音频资源依赖，WebAudio 现场合成短促"咔哒"声（可静音）。
 * 文档 4.6：资源就位后替换为采样音效，Mute 开关常驻 HUD。
 */
let ctx: AudioContext | null = null
let muted = false

export function isMuted(): boolean {
  return muted
}

export function toggleMuted(): boolean {
  muted = !muted
  return muted
}

/** 落座声：低频短脉冲 + 高频tick，模拟零件卡入位 */
export function playSeatClick(): void {
  if (muted) return
  try {
    ctx = ctx ?? new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    // 低频体感
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.09)
    gain.gain.setValueAtTime(0.28, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.12)
    // 高频 tick
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'square'
    osc2.frequency.setValueAtTime(1800, now + 0.012)
    gain2.gain.setValueAtTime(0.06, now + 0.012)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
    osc2.connect(gain2).connect(ctx.destination)
    osc2.start(now + 0.012)
    osc2.stop(now + 0.06)
  } catch {
    /* 无音频设备时静默 */
  }
}
