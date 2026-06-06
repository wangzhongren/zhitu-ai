import { useState, useEffect } from 'react'
import { useStore } from './store/scriptoriumStore'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import MindCanvas from './components/MindCanvas'
import SettingsPanel from './components/SettingsPanel'
import { TooltipProvider } from '@/components/ui/tooltip'

type View = 'history' | 'chat'

export default function App() {
  const [view, setView] = useState<View>('history')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const sessionId = useStore((s) => s.sessionId)

  useEffect(() => {
    if (window.electronAPI) {
      return window.electronAPI.onMenuAction((action) => {
        if (action === 'open-settings') setSettingsOpen(true)
      })
    }
  }, [])

  function enterChat() { setView('chat') }
  function backToWelcome() { setView('history'); useStore.setState({ sessionId: null }) }

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col overflow-hidden bg-background">
        <TitleBar />
        <div className="flex-1 flex min-h-0">
          <Sidebar
            onEnter={enterChat}
            onNew={enterChat}
            refreshKey={refreshKey}
            activeSessionId={sessionId}
            onOpenSettings={() => setSettingsOpen(true)}
            onBackToWelcome={backToWelcome}
          />
          <div className="flex-1 flex flex-col min-w-0">
            {view === 'history' ? (
              <div className="flex-1 flex items-center justify-center bg-background">
                <div className="text-center">
                  <h2 className="text-[15px] font-medium text-foreground/80 mb-1 tracking-tight">
                    知图
                  </h2>
                  <p className="text-[13px] text-muted-foreground/60">
                    AI 知识图谱学习助手
                  </p>
                  <div className="mt-8">
                    <p className="text-[12px] text-muted-foreground/40 leading-relaxed">
                      从侧边栏选择一个话题<br />或创建新话题开始探索
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex min-h-0 p-2 gap-2 bg-background">
                <ChatPanel />
                <MindCanvas />
              </div>
            )}
          </div>
        </div>
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </TooltipProvider>
  )
}
