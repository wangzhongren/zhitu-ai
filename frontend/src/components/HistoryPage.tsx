import { useEffect, useState } from 'react'
import { useStore } from '../store/scriptoriumStore'
import { api } from '../api'

interface Props {
  onEnter: (sessionId: string) => void
  onNew: () => void
  refreshKey: number
}

export default function HistoryPage({ onEnter, onNew, refreshKey }: Props) {
  const sessions = useStore((s) => s.sessions)
  const setSessions = useStore((s) => s.setSessions)
  const setSessionId = useStore((s) => s.setSessionId)
  const loadSessionData = useStore((s) => s.loadSessionData)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api('/api/sessions')
      .then((data: any) => {
        setSessions(data.sessions || [])
        setLoading(false)
      })
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
    })
      .then((s: any) => {
        setSessionId(s.id)
        useStore.setState({
          nodes: [], edges: [],
          messages: [{
            role: 'ai',
            content: '欢迎。请告诉我想学习或理解的技术话题，我会通过提问帮你梳理知识结构。\n\n例如：我想理解 Kubernetes 的调度机制',
          }],
          metrics: { depth: 0, consistency: 0, blind_zones: 3 },
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
      })
      .catch(() => setDeleting(null))
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-sm">加载中...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-12 px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">知图</h1>
            <p className="text-sm text-slate-400 mt-1">AI 知识图谱学习助手</p>
          </div>
          <button
            onClick={createAndEnter}
            className="px-5 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-all shadow-sm"
          >
            + 新话题
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">{'\u{1F4AD}'}</div>
            <p className="text-slate-400 mb-4">还没有学习记录</p>
            <button
              onClick={createAndEnter}
              className="px-5 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-all"
            >
              开始第一个话题
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => enterSession(s.id)}
                className="group bg-white rounded-xl p-5 border border-slate-200 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-slate-800 truncate">
                      {s.title || '未命名话题'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1.5">
                      {new Date(s.updated_at).toLocaleDateString('zh-CN', {
                        year: 'numeric', month: 'long', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    disabled={deleting === s.id}
                    className="ml-3 w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  >
                    {deleting === s.id ? '...' : '×'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
