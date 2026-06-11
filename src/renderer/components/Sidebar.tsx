import { useEffect, useState } from 'react'
import { useStore } from '../store/scriptoriumStore'
import { api } from '../api'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Hash, Settings } from 'lucide-react'

interface Props {
  onEnter: (sessionId: string) => void
  onNew: () => void
  refreshKey: number
  activeSessionId: string | null
  onOpenSettings: () => void
  onBackToWelcome: () => void
}

export default function Sidebar({ onEnter, onNew, refreshKey, activeSessionId, onOpenSettings, onBackToWelcome }: Props) {
  const sessions = useStore((s) => s.sessions)
  const setSessions = useStore((s) => s.setSessions)
  const setSessionId = useStore((s) => s.setSessionId)
  const loadSessionData = useStore((s) => s.loadSessionData)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api('/api/sessions')
      .then((data: any) => { setSessions(data.sessions || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [refreshKey])

  function enterSession(id: string) {
    setSessionId(id)
    api(`/api/sessions/${id}`)
      .then((data: any) => {
        loadSessionData(data.nodes || [], data.edges || [], data.messages || [])
        onEnter(id)
      })
  }

  function createAndEnter() {
    api('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新话题' }),
    }).then((s: any) => {
      setSessionId(s.id)
      const newSession = {
        id: s.id,
        title: '新话题',
        topic: '',
        created_at: s.created_at || new Date().toISOString(),
        updated_at: s.updated_at || new Date().toISOString()
      }
      setSessions([newSession, ...sessions])
      useStore.setState({
        nodes: [],
        edges: [],
        messages: [],
        metrics: { depth: 0, consistency: 0, blind_zones: 3 }
      })
      onNew()
    })
  }

  function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(id)
    api(`/api/sessions/${id}`, { method: 'DELETE' })
      .then(() => {
        setSessions(sessions.filter((s) => s.id !== id))
        setDeleting(null)
        if (id === activeSessionId) {
          onBackToWelcome()
        }
      })
      .catch(() => setDeleting(null))
  }

  return (
    <div className="flex flex-col h-full select-none w-[240px] bg-sidebar">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-1 shrink-0">
        <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground/90">
          明心
        </span>
      </div>

      {/* Section label */}
      <div className="px-4 pt-1 pb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-sidebar-muted/60">
          话题
        </span>
      </div>

      {/* Session list */}
      <ScrollArea className="flex-1">
        <div className="px-2">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4">
              <span className="w-1 h-1 rounded-full animate-pulse-dot bg-sidebar-muted" />
              <span className="w-1 h-1 rounded-full animate-pulse-dot bg-sidebar-muted" style={{ animationDelay: '0.15s' }} />
              <span className="w-1 h-1 rounded-full animate-pulse-dot bg-sidebar-muted" style={{ animationDelay: '0.3s' }} />
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-3 py-4 text-[12px] leading-relaxed text-sidebar-muted/70">
              暂无话题
            </p>
          ) : (
            <div className="flex flex-col gap-px">
              {sessions.map((s) => {
                const isActive = s.id === activeSessionId
                return (
                  <div
                    key={s.id}
                    onClick={() => enterSession(s.id)}
                    className={cn(
                      "group relative flex items-center gap-2 px-2.5 py-[7px] rounded-md cursor-pointer transition-colors duration-100",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    <Hash className={cn(
                      "w-3.5 h-3.5 shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-sidebar-muted/50"
                    )} />

                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-[12.5px] font-medium truncate leading-snug",
                        isActive ? "text-sidebar-foreground" : "text-sidebar-muted"
                      )}>
                        {s.title || '未命名话题'}
                      </p>
                    </div>

                    <span className="text-[10px] text-sidebar-muted/50 shrink-0">
                      {new Date(s.updated_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                    </span>

                    <button
                      onClick={(e) => deleteSession(s.id, e)}
                      className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-sidebar-muted hover:text-red-400 absolute right-1.5"
                    >
                      {deleting === s.id ? (
                        <span className="text-[9px]">···</span>
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Bottom: New Topic + Settings */}
      <div className="px-2 pb-2 pt-1 flex items-center justify-between">
        <button
          onClick={createAndEnter}
          className="flex items-center gap-2 px-2.5 py-[7px] rounded-md text-[12.5px] font-medium transition-colors duration-100 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Plus className="w-3.5 h-3.5" />
          新话题
        </button>
        <button
          onClick={onOpenSettings}
          className="w-7 h-7 flex items-center justify-center rounded-md text-sidebar-muted/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
