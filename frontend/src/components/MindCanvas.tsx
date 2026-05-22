import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { useStore } from '../store/scriptoriumStore'
import type { MindNode, MindEdge } from '../types'

const H_GAP = 280, V_GAP = 110, MARGIN = 100

interface TreeNode {
  node: MindNode
  children: TreeNode[]
  x: number; y: number
}

function buildTree(nodes: MindNode[]): TreeNode | null {
  if (nodes.length === 0) return null
  const map = new Map<string, TreeNode>()
  nodes.forEach((n) => map.set(n.id, { node: n, children: [], x: 0, y: 0 }))
  const roots: TreeNode[] = []
  nodes.forEach((n) => {
    const tn = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(tn)
    else roots.push(tn)
  })
  if (roots.length === 1) return roots[0]
  if (roots.length > 1) {
    return { node: { id: '__vr__', parent_id: null, label: '', layer_depth: -1, status: 'stable', x: 0, y: 0, cognitive_dimension: '', description: '' }, children: roots, x: 0, y: 0 }
  }
  return null
}

function layoutTree(tn: TreeNode, depth: number, startY: number): number {
  const x = MARGIN + depth * H_GAP
  if (tn.children.length === 0) { tn.x = x; tn.y = startY + V_GAP / 2; return startY + V_GAP }
  let y = startY; const ys: number[] = []
  for (const c of tn.children) { y = layoutTree(c, depth + 1, y); ys.push(c.y) }
  tn.x = x; tn.y = Math.round((ys[0] + ys[ys.length - 1]) / 2)
  return y
}

const DIM_COLORS: Record<string, string> = {
  core: '#3b82f6', concept: '#8b5cf6', principle: '#06b6d4',
  practice: '#10b981', performance: '#f59e0b', security: '#ef4444',
  testing: '#6366f1', general: '#64748b',
}

let _ctx: CanvasRenderingContext2D | null = null
function measureText(text: string, fontSize: number): number {
  if (!_ctx) { const c = document.createElement('canvas'); _ctx = c.getContext('2d') }
  if (!_ctx) return text.length * fontSize * 0.7
  _ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`
  return _ctx.measureText(text).width
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let remaining = text
  while (remaining.length > maxChars) { lines.push(remaining.slice(0, maxChars)); remaining = remaining.slice(maxChars) }
  if (remaining) lines.push(remaining)
  return lines.length ? lines : ['']
}

const CANVAS_PAD = 2000

export default function MindCanvas() {
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId)
  const sessionId = useStore((s) => s.sessionId)
  const sessions = useStore((s) => s.sessions)

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tgRef = useRef<SVGGElement>(null)
  const transform = useRef({ x: 40, y: 40, scale: 1 })
  const panning = useRef(false)
  const start = useRef({ x: 0, y: 0 })
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  const { treeNodes, parentPairs, totalW, totalH } = useMemo(() => {
    if (nodes.length === 0) return { treeNodes: [], parentPairs: new Set<string>(), totalW: 600, totalH: 400 }
    const root = buildTree(nodes)
    if (!root) return { treeNodes: [], parentPairs: new Set<string>(), totalW: 600, totalH: 400 }
    const bottom = layoutTree(root, root.node.id === '__vr__' ? -1 : 0, MARGIN)
    const result: { node: MindNode; x: number; y: number; accent: string; tw: number; isRoot: boolean; descLines: string[]; truncated: boolean }[] = []
    let maxX = 0
    ;(function collect(tn: TreeNode) {
      if (tn.node.id !== '__vr__') {
        const isRoot = tn.node.layer_depth === 0
        const labelW = measureText(tn.node.label, isRoot ? 15 : 13)
        const maxLineW = Math.max(labelW, 200) - 8
        let lines: string[] = []
        let maxLinePx = labelW
        let truncated = false
        if (tn.node.description) {
          let current = ''
          for (const ch of tn.node.description) {
            if (measureText(current + ch, 11) > maxLineW) {
              lines.push(current)
              current = ch
              if (lines.length >= 5) { truncated = true; break }
            } else {
              current += ch
            }
          }
          if (lines.length < 5 && current) {
            lines.push(current)
          } else if (truncated && current) {
            const last = lines[lines.length - 1]
            const trim = last.slice(0, -2) + '…'
            if (measureText(trim, 11) <= maxLineW) lines[lines.length - 1] = trim
          }
          if (lines.length === 0) lines = ['']
          maxLinePx = Math.max(labelW, ...lines.map((l) => measureText(l, 11)))
        }
        const tw = Math.ceil(maxLinePx) + 32
        result.push({ node: tn.node, x: tn.x, y: tn.y, accent: DIM_COLORS[tn.node.cognitive_dimension] || DIM_COLORS.general, tw, isRoot, descLines: lines, truncated })
        maxX = Math.max(maxX, tn.x + tw / 2)
      }
      tn.children.forEach(collect)
    })(root)
    const pairs = new Set<string>()
    ;(function walk(tn: TreeNode) { for (const c of tn.children) { if (tn.node.id !== '__vr__') pairs.add(`${tn.node.id}->${c.node.id}`); walk(c) } })(root)
    return { treeNodes: result, parentPairs: pairs, totalW: Math.max(1200, maxX + MARGIN + CANVAS_PAD), totalH: Math.max(800, bottom + MARGIN + CANVAS_PAD) }
  }, [nodes])

  const posMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>()
    treeNodes.forEach((t) => m.set(t.node.id, { x: t.x, y: t.y }))
    return m
  }, [treeNodes])

  const applyTransform = useCallback(() => {
    const g = tgRef.current
    if (g) { const { x, y, scale } = transform.current; g.setAttribute('transform', `translate(${x}, ${y}) scale(${scale})`) }
  }, [])

  useEffect(() => { transform.current = { x: 40, y: 40, scale: 1 }; requestAnimationFrame(applyTransform) }, [nodes, applyTransform])

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const onWheel = (e: WheelEvent) => { e.preventDefault(); transform.current.scale = Math.min(2.5, Math.max(0.3, transform.current.scale * (e.deltaY > 0 ? 0.9 : 1.1))); applyTransform() }
    const onMouseDown = (e: MouseEvent) => { panning.current = true; start.current = { x: e.clientX - transform.current.x, y: e.clientY - transform.current.y } }
    const onMouseMove = (e: MouseEvent) => { if (!panning.current) return; transform.current.x = e.clientX - start.current.x; transform.current.y = e.clientY - start.current.y; applyTransform() }
    const onMouseUp = () => { panning.current = false }
    el.addEventListener('wheel', onWheel, { passive: false }); el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp)
    return () => { el.removeEventListener('wheel', onWheel); el.removeEventListener('mousedown', onMouseDown); window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [applyTransform])

  function downloadSVG() {
    const w = totalW, h = totalH
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#f8fafc"/>`
    treeNodes.forEach((t) => {
      const children = treeNodes.filter((c) => c.node.parent_id === t.node.id)
      children.forEach((child) => {
        svg += `<path d="M ${t.x} ${t.y} C ${(t.x + child.x) / 2} ${t.y}, ${(t.x + child.x) / 2} ${child.y}, ${child.x} ${child.y}" fill="none" stroke="#cbd5e1" stroke-width="2"/>`
      })
    })
    treeNodes.forEach((t) => {
      const warn = t.node.status === 'warning'
      const desc = t.node.description || ''
      const labelW = measureText(t.node.label, t.isRoot ? 15 : 13)
      const maxLineW = Math.max(labelW, 200) - 8
      let descLines: string[] = []
      if (desc) {
        let cur = ''
        for (const ch of desc) {
          if (measureText(cur + ch, 11) > maxLineW) { descLines.push(cur); cur = ch; if (descLines.length >= 5) break }
          else { cur += ch }
        }
        if (descLines.length < 5 && cur) descLines.push(cur)
      }
      const lc = descLines.length
      const tw = Math.min(Math.ceil(Math.max(labelW, ...descLines.map(l => measureText(l, 11)), 0)) + 32, 400)
      const th = lc > 0 ? 32 + lc * 15 : t.isRoot ? 44 : 32
      const rx = t.x - tw / 2, ry = t.y - th / 2
      svg += `<rect x="${rx}" y="${ry}" width="${tw}" height="${th}" rx="8" fill="${t.isRoot ? '#3b82f6' : warn ? '#fef2f2' : '#fff'}" stroke="${t.isRoot ? '#3b82f6' : warn ? '#fca5a5' : '#e2e8f0'}" stroke-width="${t.isRoot ? 0 : 1.5}"/>`
      if (!t.isRoot && !warn) svg += `<rect x="${rx + 1}" y="${ry + 6}" width="4" height="${Math.min(th - 12, 20)}" fill="${t.accent}" rx="2"/>`
      const tc = t.isRoot ? '#fff' : warn ? '#ef4444' : '#334155'
      const descH = lc > 0 ? (lc - 1) * 7 : 0
      const ly = lc > 0 ? t.y - 4 - descH : t.y + th / 2
      svg += `<text x="${t.x}" y="${ly}" text-anchor="middle" dominant-baseline="central" fill="${tc}" font-size="${t.isRoot ? 15 : 13}" font-weight="600" font-family="system-ui,sans-serif">${escapeXml(t.node.label)}</text>`
      const descFill = t.isRoot ? 'rgba(255,255,255,0.75)' : '#94a3b8'
      descLines.forEach((l, li) => svg += `<text x="${t.x}" y="${ly + 14 + li * 14}" text-anchor="middle" dominant-baseline="central" fill="${descFill}" font-size="11" font-family="system-ui,sans-serif">${escapeXml(l)}</text>`)
    })
    svg += '</svg>'
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const title = sessions.find(s => s.id === sessionId)?.title || 'mindmap'
    const a = document.createElement('a'); a.download = `${title}.svg`; a.href = URL.createObjectURL(blob); a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div ref={containerRef} className="w-[60%] relative overflow-hidden cursor-grab select-none bg-slate-50">
      <div className="absolute top-3 right-3 z-30 flex gap-1.5">
        <button onClick={downloadSVG} className="bg-white/90 backdrop-blur text-slate-500 hover:text-slate-700 text-xs px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 transition-colors">
          ⬇ 导出 SVG
        </button>
      </div>

      <svg ref={svgRef} width={totalW} height={totalH} className="block" onClick={() => setSelectedNodeId(null)}>
        <g ref={tgRef} onClick={(e) => e.stopPropagation()}>
          {/* Tree edges */}
          {treeNodes.map((t) => {
            const children = treeNodes.filter((c) => c.node.parent_id === t.node.id)
            return children.map((child) => (
              <path key={`${t.node.id}-${child.node.id}`}
                d={`M ${t.x} ${t.y} C ${(t.x + child.x) / 2} ${t.y}, ${(t.x + child.x) / 2} ${child.y}, ${child.x} ${child.y}`}
                fill="none" stroke="#cbd5e1" strokeWidth={2} />
            ))
          })}
          {/* Conflict edges */}
          {edges.filter((e) => e.type === 'conflict').map((e) => {
            const s = posMap.get(e.source_id), t = posMap.get(e.target_id)
            if (!s || !t) return null
            return <line key={e.id} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 4" opacity={0.5} />
          })}
          {/* Nodes */}
          {treeNodes.map((t) => {
            const warn = t.node.status === 'warning'
            const lineCount = t.descLines.length
            const th = lineCount > 0 ? 32 + lineCount * 15 : t.isRoot ? 44 : 32
            const rx = t.x - t.tw / 2, ry = t.y - th / 2
            const labelY = lineCount > 0 ? t.y - 4 - (lineCount - 1) * 7.5 : t.y
            return (
              <g key={t.node.id}
                onMouseEnter={(e) => { if (t.truncated) { const r = svgRef.current!.getBoundingClientRect(); setTooltip({ text: t.node.description, x: e.clientX - r.left, y: e.clientY - r.top }) } }}
                onMouseLeave={() => setTooltip(null)}
                onClick={(e) => { e.stopPropagation(); setSelectedNodeId(selectedNodeId === t.node.id ? null : t.node.id) }}
                style={{ cursor: 'pointer' }}
              >
                <rect x={rx} y={ry} width={t.tw} height={th} rx={8}
                  fill={t.isRoot ? '#3b82f6' : warn ? '#fef2f2' : '#ffffff'}
                  stroke={selectedNodeId === t.node.id ? '#3b82f6' : t.isRoot ? '#3b82f6' : warn ? '#fca5a5' : '#e2e8f0'}
                  strokeWidth={selectedNodeId === t.node.id ? 2.5 : t.isRoot ? 0 : 1.5}
                  filter={selectedNodeId === t.node.id ? 'url(#ds-sel)' : 'url(#ds)'}
                />
                {!t.isRoot && !warn && (
                  <rect x={rx + 1} y={ry + 6} width={4} height={Math.min(th - 12, 20)} fill={t.accent} rx={2} />
                )}
                <text x={t.x} y={labelY} textAnchor="middle" dominantBaseline="central"
                  fill={t.isRoot ? '#fff' : warn ? '#ef4444' : '#334155'}
                  style={{ fontSize: t.isRoot ? 15 : 13, fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif', fontWeight: 600 }}>
                  {t.node.label}
                </text>
                {t.descLines.map((line, li) => (
                  <text key={li} x={t.x} y={labelY + 14 + li * 14} textAnchor="middle" dominantBaseline="central"
                    fill={t.isRoot ? 'rgba(255,255,255,0.75)' : '#94a3b8'}
                    style={{ fontSize: 11, fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif' }}>
                    {line}
                  </text>
                ))}
              </g>
            )
          })}
        </g>
        <defs>
          <filter id="ds" x="-8%" y="-8%" width="116%" height="124%"><feDropShadow dx={0} dy={2} stdDeviation={3} floodOpacity={0.06} /></filter>
          <filter id="ds-sel" x="-8%" y="-8%" width="116%" height="124%"><feDropShadow dx={0} dy={2} stdDeviation={4} floodColor="#3b82f6" floodOpacity={0.25} /></filter>
        </defs>
      </svg>

      {tooltip && (
        <div className="absolute z-50 bg-slate-800 text-white text-xs px-3 py-2 rounded-lg shadow-lg max-w-[240px] pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>{tooltip.text}</div>
      )}

      {treeNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm pointer-events-none">
          <div className="text-center"><div className="text-4xl mb-3">{'\u{1F4AD}'}</div><p>在左侧输入话题，开始构建知识图谱</p></div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur text-slate-400 text-xs px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 pointer-events-none">
        滚轮缩放 · 拖拽平移
      </div>
    </div>
  )
}
