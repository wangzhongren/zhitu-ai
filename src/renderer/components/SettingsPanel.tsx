import { useEffect, useState } from 'react'
import { api } from '../api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, Loader2, Key, Globe, Cpu } from 'lucide-react'

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
        body: JSON.stringify({ api_key: apiKey, base_url: baseUrl, model: model }),
      })
      const d = await r.json()
      setMsg(d.message || '保存成功')
    } catch {
      setMsg('保存失败')
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-[400px] p-6 bg-card border-border">
        <DialogHeader className="mb-1">
          <DialogTitle className="text-[15px] text-foreground">API 设置</DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground">
            配置 AI 模型接口参数，保存在本地 .env 文件中
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground flex items-center gap-1.5">
              <Key className="w-3 h-3 text-muted-foreground" />
              API Key
            </label>
            <Input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="h-9 text-[13px] bg-background border-border text-foreground"
            />
            {hasKey && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                <Check className="w-3 h-3" />
                已配置
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground flex items-center gap-1.5">
              <Globe className="w-3 h-3 text-muted-foreground" />
              API 地址
            </label>
            <Input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              className="h-9 text-[13px] bg-background border-border text-foreground"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground flex items-center gap-1.5">
              <Cpu className="w-3 h-3 text-muted-foreground" />
              模型
            </label>
            <Input
              type="text"
              placeholder="gpt-4o"
              value={model}
              onChange={e => setModel(e.target.value)}
              className="h-9 text-[13px] bg-background border-border text-foreground"
            />
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">
              兼容 OpenAI / DeepSeek / 其他 OpenAI 兼容接口
            </p>
          </div>
        </div>

        {msg && (
          <div className={`text-[11px] px-2.5 py-1.5 rounded-md ${
            msg.includes('失败')
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}>
            {msg}
          </div>
        )}

        <DialogFooter className="gap-2 mt-1">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted">
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={saving} className="h-8 text-[12px]">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
