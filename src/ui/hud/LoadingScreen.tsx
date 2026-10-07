/**
 * LoadingScreen：预构建模型时的进度（真实构建分帧推进）+ 项目标题。
 */
export function LoadingScreen({ progress }: { progress: number }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-base" role="status" aria-label="加载中">
      <div className="font-num text-[11px] tracking-[0.5em] text-accent-mint">VIRTUAL PC BUILDER</div>
      <h1 className="mt-4 font-cn text-[28px] font-bold tracking-[0.18em] text-fg-primary">
        计算机硬件拆解与组装交互实验室
      </h1>
      <p className="mt-3 max-w-md text-center font-cn text-[13px] leading-relaxed text-fg-secondary">
        把一台完整电脑逐层拆开、逐层读懂、再逐层装回去。
      </p>
      <div className="mt-10 h-px w-64 overflow-hidden bg-fg-tertiary/30">
        <div
          className="h-full bg-accent-mint transition-[width] duration-300 ease-out"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="mt-3 font-num text-[10px] tracking-[0.35em] text-fg-tertiary">
        LOADING {String(Math.round(progress * 100)).padStart(3, '0')}%
      </div>
    </div>
  )
}
