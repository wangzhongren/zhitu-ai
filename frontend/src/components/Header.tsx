export default function Header({
  showBack, onBack, onOpenSettings,
}: {
  showBack: boolean
  onBack: () => void
  onOpenSettings: () => void
}) {
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10 shrink-0">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors mr-1"
            title="返回历史"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
        )}
        <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
          知
        </div>
        <div>
          <span className="text-base font-semibold text-slate-800">知图</span>
          <span className="text-xs text-slate-400 ml-2">· AI 知识图谱学习助手</span>
        </div>
      </div>

      <button
        onClick={onOpenSettings}
        className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
        title="设置"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1.5v1.5M8 13v1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M1.5 8H3M13 8h1.5M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" />
        </svg>
      </button>
    </header>
  )
}
