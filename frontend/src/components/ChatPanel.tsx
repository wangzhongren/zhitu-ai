import { useRef, useEffect, useState } from 'react'
import { useStore } from '../store/scriptoriumStore'
import { api } from '../api'

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
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function processLine(line: string) {
    if (!line.startsWith('data: ')) return
    try {
      const evt = JSON.parse(line.slice(6))
      if (evt.event === 'text_delta') {
        appendStreamToken(evt.data)
      } else if (evt.event === 'graph_ops') {
        const data = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data
        if (data.operations) {
          applyOperations(data.operations, data.metrics)
        }
      } else if (evt.event === 'title') {
        useStore.setState((s) => ({
          sessions: s.sessions.map((ss: any) =>
            ss.id === sessionId ? { ...ss, title: evt.data } : ss
          ),
        }))
      }
    } catch { /* skip */ }
  }

  async function handleSubmit() {
    const text = input.trim()
    if (!text || !sessionId || isStreaming) return

    const displayText = selectedNode ? `「${selectedNode.label}」\n${text}` : text
    addMessage({ role: 'user', content: displayText })
    const ctxNodeId = selectedNodeId
    setInput('')
    setSelectedNodeId(null)
    setStreaming(true)

    let res: Response
    try {
      res = await api('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, text, context_node_id: ctxNodeId }),
      })
    } catch {
      setStreaming(false)
      addMessage({ role: 'ai', content: '无法连接到后端服务，请确认后端已启动。' })
      return
    }

    if (!res.body) {
      setStreaming(false)
      addMessage({ role: 'ai', content: '后端返回异常。' })
      return
    }

    try {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        let done = false
        let value: Uint8Array | undefined
        try {
          const chunk = await reader.read()
          done = chunk.done
          value = chunk.value
        } catch {
          done = true
        }
        if (value) {
          buffer += decoder.decode(value, { stream: true })
        }
        if (done) {
          // Process remaining data in buffer before ending
          if (buffer.trim()) {
            const lines = buffer.split('\n')
            for (const line of lines) {
              processLine(line)
            }
          }
          break
        }
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          processLine(line)
        }
      }
    } catch (e: any) {
      setStreaming(false)
      addMessage({ role: 'ai', content: `流读取错误: ${e.message || e}` })
      return
    }
    finalizeStream()
  }

  function stripJsonBlock(text: string): string {
    const idx = text.indexOf('\n```json')
    if (idx !== -1) return text.slice(0, idx).trimEnd()
    const idx2 = text.indexOf('```json')
    if (idx2 !== -1) return text.slice(0, idx2).trimEnd()
    return text
  }

  function renderContent(content: string) {
    if (content.startsWith('[STREAMING]')) content = content.slice(11)
    return <Markdown text={stripJsonBlock(content)} />
  }

  return (
    <div className="w-[40%] bg-white border-r border-slate-200 flex flex-col min-w-0">
      {/* Messages */}
      <div className="flex-1 px-6 py-6 overflow-y-auto flex flex-col gap-4 bg-slate-50">
        {messages.map((msg, i) => (
          <div key={i}
            className={`msg max-w-[88%] text-sm ${
              msg.role === 'ai'
                ? 'self-start bg-white text-slate-700 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-slate-100'
                : 'self-end bg-blue-500 text-white rounded-2xl rounded-tr-md px-4 py-3'
            }`}
          >
            {renderContent(msg.content)}
          </div>
        ))}
        {isStreaming && (
          <div className="self-start flex items-center gap-1.5 px-3 py-2 bg-white rounded-2xl rounded-tl-md shadow-sm border border-slate-100">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0s' }} />
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.4s' }} />
            <span className="text-xs text-slate-400 ml-1">思考中</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-200 bg-white shrink-0">
        {selectedNode && (
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2.5 py-1 rounded-lg">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="3"/></svg>
              {selectedNode.label}
              <button onClick={() => setSelectedNodeId(null)} className="text-blue-400 hover:text-blue-600 ml-0.5">&times;</button>
            </span>
            <span className="text-[10px] text-slate-400">已选中，消息将包含此节点上下文</span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            className="flex-1 bg-slate-100 border-0 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-200 focus:bg-white transition-all resize-none"
            placeholder="输入你想理解的技术话题..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            disabled={isStreaming}
            rows={2}
          />
          <button
            onClick={handleSubmit}
            disabled={isStreaming || !input.trim()}
            className="px-5 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 disabled:opacity-40 transition-all shrink-0"
          >
            发送
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Ctrl + Enter 发送</p>
      </div>
    </div>
  )
}

/* ========== Lightweight Markdown Renderer ========== */

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const els: React.ReactNode[] = []
  let i = 0; let inFence = false; let buf: string[] = []

  function parseInline(s: string): React.ReactNode[] {
    const r: React.ReactNode[] = []; let rem = s; let k = 0
    while (rem.length) {
      const b = rem.match(/\*\*(.+?)\*\*/)
      const c = rem.match(/`([^`]+)`/)
      if (b && (!c || b.index! <= c.index!)) {
        if (b.index! > 0) r.push(rem.slice(0, b.index))
        r.push(<strong key={++k}>{b[1]}</strong>)
        rem = rem.slice(b.index! + b[0].length)
      } else if (c) {
        if (c.index! > 0) r.push(rem.slice(0, c.index))
        r.push(<code key={++k} className="bg-slate-200 text-slate-700 px-1 py-0.5 rounded text-xs font-mono">{c[1]}</code>)
        rem = rem.slice(c.index! + c[0].length)
      } else { r.push(<span key={++k}>{rem}</span>); break }
    }
    return r
  }

  while (i < lines.length) {
    const l = lines[i]; const t = l.trim()
    if (t.startsWith('```')) {
      if (!inFence) { inFence = true; buf = []; i++; continue }
      else { els.push(<pre key={i} className="bg-slate-800 text-slate-200 text-xs rounded-lg p-3 my-2 overflow-x-auto font-mono leading-relaxed"><code>{buf.join('\n')}</code></pre>); inFence = false; buf = []; i++; continue }
    }
    if (inFence) { buf.push(l); i++; continue }
    if (t === '') { i++; continue }

    const h = /^(#{1,3})\s+(.+)/.exec(t)
    if (h) {
      const cls = h[1].length === 1 ? 'text-lg font-bold text-slate-800' : h[1].length === 2 ? 'text-base font-semibold text-slate-700' : 'text-sm font-semibold text-slate-600'
      els.push(<p key={i} className={`${cls} mt-2 mb-1`}>{parseInline(h[2])}</p>); i++; continue
    }
    const ul = /^[-*]\s+(.+)/.exec(t)
    if (ul) { els.push(<div key={i} className="flex gap-2 ml-2"><span className="text-slate-400 select-none">•</span><span className="text-slate-600">{parseInline(ul[1])}</span></div>); i++; continue }
    const ol = /^(\d+)\.\s+(.+)/.exec(t)
    if (ol) { els.push(<div key={i} className="flex gap-2 ml-2"><span className="text-slate-400 select-none min-w-[1.2em]">{ol[1]}.</span><span className="text-slate-600">{parseInline(ol[2])}</span></div>); i++; continue }
    if (t.startsWith('> ')) { els.push(<blockquote key={i} className="border-l-3 border-blue-300 pl-3 text-slate-500 italic my-1">{parseInline(t.slice(2))}</blockquote>); i++; continue }
    if (/^[-*_]{3,}$/.test(t)) { els.push(<hr key={i} className="border-slate-200 my-2" />); i++; continue }
    els.push(<p key={i} className="leading-relaxed">{parseInline(t)}</p>); i++
  }
  if (inFence && buf.length) els.push(<pre key="tail" className="bg-slate-800 text-slate-200 text-xs rounded-lg p-3 my-2 overflow-x-auto font-mono leading-relaxed"><code>{buf.join('\n')}</code></pre>)
  return <>{els}</>
}
