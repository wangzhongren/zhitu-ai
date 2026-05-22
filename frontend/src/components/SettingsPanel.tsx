import { useState, useEffect } from 'react'
import { api } from '../api'

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsPanel({ open, onClose }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!open) return
    api('/api/settings').then((d: any) => {
      setApiKey(d.api_key || '')
      setBaseUrl(d.base_url || '')
      setModel(d.model || '')
      setHasKey(d.has_key)
    })
  }, [open])

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      const r = await api('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          base_url: baseUrl,
          model: model,
        }),
      })
      const d = await r.json()
      setMsg(d.message || '')
    } catch {
      setMsg('保存失败')
    }
    setSaving(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-[460px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-800">设置</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
            &#x2715;
          </button>
        </div>

        <div className="space-y-5">
          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">API Key</label>
            <input
              type="password"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all"
              placeholder="sk-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            {hasKey && <p className="text-[10px] text-slate-400 mt-1">已配置 API Key</p>}
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">API 地址</label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all"
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">模型</label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all"
              placeholder="gpt-4o"
              value={model}
              onChange={e => setModel(e.target.value)}
            />
            <p className="text-[10px] text-slate-400 mt-1">支持 OpenAI / DeepSeek 等兼容接口</p>
          </div>
        </div>

        {msg && (
          <div className={`mt-4 text-xs px-3 py-2 rounded-lg ${msg.includes('失败') ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
            {msg}
          </div>
        )}

        <div className="mt-6 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40 transition-all"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
