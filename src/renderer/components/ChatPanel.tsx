import { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '../store/scriptoriumStore'
import { api, API_BASE } from '../api'
import { cn } from '@/lib/utils'
import { Paperclip, SendHorizontal, X, MessageCircle, BookOpen, Lightbulb, Bot, User } from 'lucide-react'

const SUGGESTIONS = [
  '我想理解 React 的 Hooks 机制',
  '帮我梳理 HTTP 协议的请求流程',
  '解释一下什么是微服务架构',
]

export default function ChatPanel() {
  const messages = useStore((s) => s.messages)
  const isStreaming = useStore((s) => s.isStreaming)
  const sessionId = useStore((s) => s.sessionId)
  const addMessage = useStore((s) => s.addMessage)
  const appendStreamToken = useStore((s) => s.appendStreamToken)
  const finalizeStream = useStore((s) => s.finalizeStream)
  const setStreaming = useStore((s) => s.setStreaming)
  const applyOperations = useStore((s) => s.applyOperations)
  const nodes = useStore((s) => s.nodes)
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId)
  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  const [input, setInput] = useState('')
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => {
    const ta = textareaRef.current; if (!ta) return
    ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
  }, [input])

  function processLine(line: string) {
    if (!line.startsWith('data: ')) return
    try {
      const evt = JSON.parse(line.slice(6))
      if (evt.event === 'text_delta') appendStreamToken(evt.data)
      else if (evt.event === 'graph_ops') {
        const data = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data
        if (data.operations) applyOperations(data.operations, data.metrics)
      } else if (evt.event === 'title') {
        useStore.setState((s) => ({
          sessions: s.sessions.map((ss: any) => ss.id === sessionId ? { ...ss, title: evt.data } : ss),
        }))
      }
    } catch { /* skip */ }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
      setAttachedFile({ name: file.name, content: await file.text() })
    } else {
      const form = new FormData(); form.append('file', file)
      try {
        const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: form })
        const data = await res.json()
        setAttachedFile({ name: file.name, content: data.content || '[文件为空]' })
      } catch { setAttachedFile({ name: file.name, content: `[读取失败]` }) }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit() {
    const text = input.trim(); if (!text || !sessionId || isStreaming) return

    let aiText = selectedNode ? `「${selectedNode.label}」\n${text}` : text
    let displayText = aiText
    if (attachedFile) {
      aiText = `我上传了一份文件「${attachedFile.name}」，内容如下：\n\n${attachedFile.content}\n\n---\n根据以上文件内容，${aiText}`
      displayText = `📎「${attachedFile.name}」\n${text}`
    }
    addMessage({ role: 'user', content: displayText })
    const ctxNodeId = selectedNodeId
    setInput(''); setAttachedFile(null); setSelectedNodeId(null); setStreaming(true)
    let res: Response
    try {
      res = await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, text: aiText, context_node_id: ctxNodeId, display_text: displayText }) })
    } catch (err: any) {
      setStreaming(false)
      // 移除刚才发送的用户消息
      useStore.setState((s) => ({ messages: s.messages.slice(0, -1) }))
      if (String(err?.message || '').includes('404')) {
        addMessage({ role: 'ai', content: '话题不存在，请重新创建一个话题后再试。' })
      } else {
        addMessage({ role: 'ai', content: '无法连接到后端服务，请检查服务是否正常运行。' })
      }
      return
    }
    if (!res.body) { setStreaming(false); addMessage({ role: 'ai', content: '后端返回异常。' }); return }
    try {
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        let done = false; let value: Uint8Array | undefined
        try { const chunk = await reader.read(); done = chunk.done; value = chunk.value } catch { done = true }
        if (value) buffer += decoder.decode(value, { stream: true })
        if (done) { if (buffer.trim()) buffer.split('\n').forEach(processLine); break }
        const lines = buffer.split('\n'); buffer = lines.pop() || ''; lines.forEach(processLine)
      }
    } catch (e: any) { setStreaming(false); addMessage({ role: 'ai', content: `流读取错误: ${e.message || e}` }); return }
    finalizeStream()
  }

  function stripJsonBlock(text: string): string {
    const idx = text.indexOf('\n```json'); return idx !== -1 ? text.slice(0, idx).trimEnd() : text
  }

  function renderContent(content: string) {
    if (content.startsWith('[STREAMING]')) content = content.slice(11)
    const cleaned = stripJsonBlock(content)
    return (
      <div className="prose-chat">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleaned}</ReactMarkdown>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full rounded-xl border border-border bg-card overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3">
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center mb-4">
              <MessageCircle className="w-4 h-4 text-accent-foreground" />
            </div>
            <h3 className="text-[14px] font-medium text-foreground mb-1">开始对话</h3>
            <p className="text-[12px] text-muted-foreground mb-6 max-w-[240px] leading-relaxed">
              输入你想学习的技术话题，AI 会通过提问帮你梳理知识结构
            </p>
            <div className="flex flex-col gap-2 w-full max-w-[260px]">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(s); textareaRef.current?.focus() }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[12px] text-muted-foreground bg-background hover:bg-muted border border-border transition-colors"
                >
                  {i === 0 ? <BookOpen className="w-3.5 h-3.5 shrink-0 text-primary/60" /> :
                   i === 1 ? <MessageCircle className="w-3.5 h-3.5 shrink-0 text-primary/60" /> :
                   <Lightbulb className="w-3.5 h-3.5 shrink-0 text-primary/60" />}
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="msg pb-3 mb-3 border-b border-border/50 last:border-b-0 flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5">
              {msg.role === 'ai' ? (
                <Bot className="w-3.5 h-3.5 text-primary" />
              ) : (
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {msg.role === 'ai' ? (
                <div className="text-foreground text-[13px] leading-[1.7]">
                  {renderContent(msg.content)}
                </div>
              ) : (
                <div className="text-foreground text-[13px] leading-[1.7] whitespace-pre-wrap font-medium">
                  {msg.content}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-start gap-2 msg">
            <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex items-center gap-1 py-1">
              <span className="w-[5px] h-[5px] rounded-full animate-pulse-dot bg-muted-foreground/40" />
              <span className="w-[5px] h-[5px] rounded-full animate-pulse-dot bg-muted-foreground/40" style={{ animationDelay: '0.15s' }} />
              <span className="w-[5px] h-[5px] rounded-full animate-pulse-dot bg-muted-foreground/40" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-border">
        {(attachedFile || selectedNode) && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachedFile && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted text-muted-foreground">
                <Paperclip className="w-3 h-3" />
                {attachedFile.name}
                <button onClick={() => setAttachedFile(null)} className="ml-0.5 hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedNode && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-accent text-accent-foreground">
                {selectedNode.label}
                <button onClick={() => setSelectedNodeId(null)} className="ml-0.5 hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}

        <div className="flex items-end gap-2 bg-background rounded-lg border border-border px-2 py-1.5 focus-within:border-primary/50 transition-colors">
          <input
            type="file"
            ref={fileRef}
            onChange={handleFile}
            className="hidden"
            accept=".txt,.md,.docx,.json,.py,.js,.ts,.html,.css,.yaml,.yml,.xml,.csv"
          />

          <button
            onClick={() => fileRef.current?.click()}
            disabled={isStreaming}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
          >
            <Paperclip className="w-[14px] h-[14px]" />
          </button>

          <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent px-1 py-1 text-[13px] outline-none resize-none placeholder:text-muted-foreground/40 text-foreground leading-relaxed min-h-[28px] max-h-[140px]"
            placeholder="输入你想理解的技术话题..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit() } }}
            disabled={isStreaming}
            rows={1}
            style={{ height: 'auto', minHeight: '28px' }}
            onInput={(e) => {
              const ta = e.currentTarget
              ta.style.height = 'auto'
              ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
            }}
          />

          <button
            onClick={handleSubmit}
            disabled={isStreaming || !input.trim()}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-md shrink-0 transition-all",
              (isStreaming || !input.trim())
                ? "bg-muted text-muted-foreground/30"
                : "bg-primary text-primary-foreground hover:bg-primary/85"
            )}
          >
            <SendHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] mt-1.5 text-muted-foreground/30 text-center">
          Ctrl + Enter 发送
        </p>
      </div>
    </div>
  )
}
