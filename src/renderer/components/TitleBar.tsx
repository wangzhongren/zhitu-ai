import { useState, useEffect } from 'react'
import { Minus, Square, X } from 'lucide-react'

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const api = window.electronAPI
  const isMac = navigator.platform.toLowerCase().includes('mac')

  useEffect(() => {
    if (!api) return
    const check = () => api.isMaximized().then(setIsMaximized)
    check()
    const interval = setInterval(check, 500)
    return () => clearInterval(interval)
  }, [api])

  // macOS: minimal drag region only
  if (isMac) {
    return (
      <div
        className="flex items-center justify-center h-[38px] shrink-0 select-none bg-sidebar"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
    )
  }

  // Windows: drag region + window controls only, no app name
  return (
    <div
      className="flex items-center justify-end h-[38px] shrink-0 select-none px-2 bg-sidebar"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <WinBtn onClick={() => api?.minimizeWindow()} title="最小化">
          <Minus className="w-3 h-3" />
        </WinBtn>
        <WinBtn onClick={() => { api?.maximizeWindow(); setIsMaximized(!isMaximized) }} title={isMaximized ? '还原' : '最大化'}>
          {isMaximized ? (
            <div className="relative w-2.5 h-2.5">
              <Square className="absolute top-0.5 left-0.5 w-2 h-2" strokeWidth={1.5} />
              <Square className="absolute -top-0.5 -left-0.5 w-2 h-2" strokeWidth={1.5} />
            </div>
          ) : (
            <Square className="w-2.5 h-2.5" strokeWidth={1.5} />
          )}
        </WinBtn>
        <WinBtn onClick={() => api?.closeWindow()} title="关闭" isClose>
          <X className="w-3 h-3" />
        </WinBtn>
      </div>
    </div>
  )
}

function WinBtn({
  children,
  onClick,
  title,
  isClose = false,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  isClose?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-6 flex items-center justify-center rounded transition-colors text-sidebar-muted
        ${isClose ? 'hover:bg-red-500 hover:text-white' : 'hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}
    >
      {children}
    </button>
  )
}
