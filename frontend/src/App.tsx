import { useState } from 'react'
import Header from './components/Header'
import ChatPanel from './components/ChatPanel'
import MindCanvas from './components/MindCanvas'
import SettingsPanel from './components/SettingsPanel'
import HistoryPage from './components/HistoryPage'

type View = 'history' | 'chat'

export default function App() {
  const [view, setView] = useState<View>('history')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  function enterChat() {
    setView('chat')
  }

  function backToHistory() {
    setRefreshKey(k => k + 1)
    setView('history')
  }

  if (view === 'history') {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <Header
          showBack={false}
          onBack={() => {}}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <HistoryPage onEnter={enterChat} onNew={enterChat} refreshKey={refreshKey} />
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        showBack={true}
        onBack={backToHistory}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="flex-1 flex min-h-0">
        <ChatPanel />
        <MindCanvas />
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
