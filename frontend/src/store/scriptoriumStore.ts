import { create } from 'zustand'
import type { MindNode, MindEdge, Metrics, ChatMessage, SessionInfo, GraphOp } from '../types'

interface ScriptoriumState {
  sessionId: string | null
  sessions: SessionInfo[]
  nodes: MindNode[]
  edges: MindEdge[]
  metrics: Metrics
  messages: ChatMessage[]
  isStreaming: boolean
  streamBuffer: string
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void

  setSessionId: (id: string) => void
  setSessions: (sessions: SessionInfo[]) => void
  addMessage: (msg: ChatMessage) => void
  appendStreamToken: (token: string) => void
  finalizeStream: () => void
  setStreaming: (v: boolean) => void
  applyGraphUpdate: (update: { nodes: MindNode[]; edges: MindEdge[]; metrics: Metrics }) => void
  applyOperations: (ops: GraphOp[], metrics: Metrics) => void
  loadSessionData: (nodes: MindNode[], edges: MindEdge[], messages: ChatMessage[]) => void
}

export const useStore = create<ScriptoriumState>((set) => ({
  sessionId: null,
  sessions: [],
  nodes: [],
  edges: [],
  metrics: { depth: 0, consistency: 0, blind_zones: 3 },
  messages: [
    {
      role: 'ai',
      content:
        '欢迎。请告诉我想学习或理解的技术话题，我会通过提问帮你梳理知识结构。\n\n例如：我想理解 Kubernetes 的调度机制',
    },
  ],
  isStreaming: false,
  streamBuffer: '',
  selectedNodeId: null,

  setSessionId: (id) => set({ sessionId: id }),
  setSessions: (sessions) => set({ sessions }),

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  appendStreamToken: (token) =>
    set((s) => {
      const buf = s.streamBuffer + token
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'ai' && last.content.startsWith('[STREAMING]')) {
        msgs[msgs.length - 1] = { role: 'ai', content: '[STREAMING]' + buf }
      } else {
        msgs.push({ role: 'ai', content: '[STREAMING]' + buf })
      }
      return { messages: msgs, streamBuffer: buf }
    }),

  finalizeStream: () =>
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'ai' && last.content.startsWith('[STREAMING]')) {
        let text = s.streamBuffer
        const idx = text.indexOf('\n```json')
        if (idx !== -1) text = text.slice(0, idx).trimEnd()
        msgs[msgs.length - 1] = { role: 'ai', content: text }
      }
      return { messages: msgs, streamBuffer: '', isStreaming: false }
    }),

  setStreaming: (v) => set({ isStreaming: v, streamBuffer: '' }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  applyGraphUpdate: (update) =>
    set({
      nodes: update.nodes,
      edges: update.edges,
      metrics: update.metrics,
    }),

  applyOperations: (ops, metrics) =>
    set((s) => {
      let nodes = [...s.nodes]
      let edges = [...s.edges]

      for (const op of ops) {
        switch (op.action) {
          case 'add_node':
            if (!op.id || !op.label) break
            nodes.push({
              id: op.id,
              parent_id: op.parent_id ?? null,
              label: op.label || '',
              layer_depth: op.layer_depth ?? 1,
              status: 'stable',
              x: 0, y: 0,
              cognitive_dimension: op.cognitive_dimension || 'general',
              description: op.description || '',
            })
            break
          case 'update_node': {
            const idx = nodes.findIndex((n) => n.id === op.id)
            if (idx !== -1) {
              nodes[idx] = { ...nodes[idx], ...op.changes }
            }
            break
          }
          case 'delete_node':
            nodes = nodes.filter((n) => n.id !== op.id)
            edges = edges.filter((e) => e.source_id !== op.id && e.target_id !== op.id)
            break
          case 'add_edge':
            edges.push({
              id: op.id,
              source_id: op.source_id,
              target_id: op.target_id,
              type: op.type || 'normal',
              description: op.description || '',
            })
            break
          case 'delete_edge':
            edges = edges.filter((e) => e.id !== op.id)
            break
        }
      }

      return { nodes, edges, metrics }
    }),

  loadSessionData: (nodes, edges, messages) =>
    set({
      nodes,
      edges,
      messages: messages.length > 0 ? messages : [
        {
          role: 'ai',
          content: '欢迎回来，继续上次的学习吧。',
        },
      ],
    }),
}))
