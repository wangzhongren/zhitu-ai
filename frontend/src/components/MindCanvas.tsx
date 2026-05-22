import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { useStore } from '../store/scriptoriumStore'
import type { MindNode, MindEdge } from '../types'

const H_GAP = 280, MIN_GAP = 20, MARGIN = 100

interface TreeNode {
  node: MindNode
  children: TreeNode[]
  x: number; y: number
  h: number  // actual node height
}

function buildTree(nodes: MindNode[]): TreeNode | null {
  if (nodes.length === 0) return null
  const map = new Map<string, TreeNode>()
  nodes.forEach((n) => map.set(n.id, { node: n, children: [], x: 0, y: 0, h: 32 }))
  const roots: TreeNode[] = []
  nodes.forEach((n) => {
    const tn = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(tn)
    else roots.push(tn)
  })
  if (roots.length === 1) return roots[0]
  if (roots.length > 1) {
    return { node: { id: '__vr__', parent_id: null, label: '', layer_depth: -1, status: 'stable', x: 0, y: 0, cognitive_dimension: '', description: '' }, children: roots, x: 0, y: 0, h: 0 }
  }
  return null
}

function layoutTree(tn: TreeNode, depth: number, startY: number): number {
  const x = MARGIN + depth * H_GAP
  if (tn.children.length === 0) { tn.x = x; tn.y = startY + tn.h / 2; return startY + tn.h + MIN_GAP }
  let y = startY
  const ys: number[] = []
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
  const [toast, setToast] = useState('')

  const { treeNodes, parentPairs, totalW, totalH } = useMemo(() => {
    if (nodes.length === 0) return { treeNodes: [], parentPairs: new Set<string>(), totalW: 600, totalH: 400 }
    const root = buildTree(nodes)
    if (!root) return { treeNodes: [], parentPairs: new Set<string>(), totalW: 600, totalH: 400 }

    // Pass 1: compute node dimensions
    const nodeInfo = new Map<string, { lines: string[]; tw: number; h: number; accent: string; isRoot: boolean }>()
    ;(function computeDims(tn: TreeNode) {
      if (tn.node.id !== '__vr__') {
        const isRoot = tn.node.layer_depth === 0
        const labelW = measureText(tn.node.label, isRoot ? 15 : 13)
        const maxLineW = Math.max(labelW, 200) - 8
        let lines: string[] = []
        if (tn.node.description) {
          let cur = ''
          for (const ch of tn.node.description) {
            if (measureText(cur + ch, 11) > maxLineW) { lines.push(cur); cur = ch }
            else { cur += ch }
          }
          if (cur) lines.push(cur)
        }
        const lc = lines.length
        const h = lc > 0 ? 32 + lc * 15 : isRoot ? 44 : 32
        const tw = Math.ceil(Math.max(labelW, ...lines.map(l => measureText(l, 11)), 0)) + 32
        tn.h = h
        nodeInfo.set(tn.node.id, { lines, tw, h, accent: DIM_COLORS[tn.node.cognitive_dimension] || DIM_COLORS.general, isRoot })
      }
      tn.children.forEach(computeDims)
    })(root)

    // Pass 2: layout with actual heights
    const bottom = layoutTree(root, root.node.id === '__vr__' ? -1 : 0, MARGIN)

    // Pass 3: collect results
    const result: { node: MindNode; x: number; y: number; accent: string; tw: number; isRoot: boolean; descLines: string[] }[] = []
    let maxX = 0
    ;(function collect(tn: TreeNode) {
      if (tn.node.id !== '__vr__') {
        const info = nodeInfo.get(tn.node.id)!
        result.push({ node: tn.node, x: tn.x, y: tn.y, accent: info.accent, tw: info.tw, isRoot: info.isRoot, descLines: info.lines })
        maxX = Math.max(maxX, tn.x + info.tw / 2)
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

  function downloadHTML() {
    const PAD = 60
    // Build SVG with full descriptions (no truncation), using <title> for tooltips
    let svgContent = ''
    treeNodes.forEach((t) => {
      const children = treeNodes.filter((c) => c.node.parent_id === t.node.id)
      children.forEach((child) => {
        svgContent += `<path d="M ${t.x} ${t.y} C ${(t.x + child.x) / 2} ${t.y}, ${(t.x + child.x) / 2} ${child.y}, ${child.x} ${child.y}" fill="none" stroke="#cbd5e1" stroke-width="2"/>`
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
          if (measureText(cur + ch, 11) > maxLineW) { descLines.push(cur); cur = ch }
          else { cur += ch }
        }
        if (cur) descLines.push(cur)
      }
      const lc = descLines.length
      const tw = Math.min(Math.ceil(Math.max(labelW, ...descLines.map(l => measureText(l, 11)), 0)) + 32, 500)
      const th = lc > 0 ? 32 + lc * 15 : t.isRoot ? 44 : 32
      const rx = t.x - tw / 2, ry = t.y - th / 2
      svgContent += `<g>`
      if (desc) svgContent += `<title>${escapeXml(desc)}</title>`
      svgContent += `<rect x="${rx}" y="${ry}" width="${tw}" height="${th}" rx="8" fill="${t.isRoot ? '#3b82f6' : warn ? '#fef2f2' : '#fff'}" stroke="${t.isRoot ? '#3b82f6' : warn ? '#fca5a5' : '#e2e8f0'}" stroke-width="${t.isRoot ? 0 : 1.5}"/>`
      if (!t.isRoot && !warn) svgContent += `<rect x="${rx + 1}" y="${ry + 6}" width="4" height="${Math.min(th - 12, 20)}" fill="${t.accent}" rx="2"/>`
      const tc = t.isRoot ? '#fff' : warn ? '#ef4444' : '#334155'
      const descH = lc > 0 ? (lc - 1) * 7 : 0
      const ly = lc > 0 ? t.y - 4 - descH : t.y + th / 2
      svgContent += `<text x="${t.x}" y="${ly}" text-anchor="middle" dominant-baseline="central" fill="${tc}" font-size="${t.isRoot ? 15 : 13}" font-weight="600" font-family="system-ui,sans-serif">${escapeXml(t.node.label)}</text>`
      const descFill = t.isRoot ? 'rgba(255,255,255,0.75)' : '#94a3b8'
      descLines.forEach((l, li) => svgContent += `<text x="${t.x}" y="${ly + 14 + li * 14}" text-anchor="middle" dominant-baseline="central" fill="${descFill}" font-size="11" font-family="system-ui,sans-serif">${escapeXml(l)}</text>`)
      svgContent += `</g>`
    })
    const svgW = totalW + PAD * 2, svgH = totalH + PAD * 2
    let title = sessions.find(s => s.id === sessionId)?.title || ''
    if (!title || title === '新话题' || title === '未命名思辨') title = '知识图谱'
    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeXml(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f1f5f9;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;padding:50px 20px;overflow:hidden}
.container{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden;cursor:grab}
.container:active{cursor:grabbing}
svg{display:block}
.toolbar{position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:10}
.toolbar button{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:6px 14px;font-size:12px;color:#64748b;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.toolbar button:hover{background:#f8fafc;color:#334155}
.toolbar .level{font-size:11px;color:#94a3b8;padding:6px 8px}
</style></head><body>
<div class="toolbar">
  <span class="level" id="zoom-level">100%</span>
  <button id="zoom-in">放大 +</button>
  <button id="zoom-out">缩小 -</button>
  <button id="zoom-reset">重置</button>
</div>
<div class="container" id="container">
<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">
<rect width="${svgW}" height="${svgH}" fill="#f8fafc"/>
<g id="tg" transform="translate(${PAD},${PAD})">
${svgContent}
</g>
</svg>
</div>
<script>
(function(){
  var scale=1, tx=0, ty=0, panning=false, sx=0, sy=0
  var tg=document.getElementById('tg')
  var c=document.getElementById('container')
  var zl=document.getElementById('zoom-level')
  function apply(){tg.setAttribute('transform','translate('+(tx+${PAD})+','+(ty+${PAD})+') scale('+scale+')')}
  function setZ(s){scale=Math.min(3,Math.max(0.3,s));apply();zl.textContent=Math.round(scale*100)+'%'}
  c.addEventListener('wheel',function(e){e.preventDefault();setZ(scale*(e.deltaY>0?0.9:1.1))})
  c.addEventListener('mousedown',function(e){panning=true;sx=e.clientX-tx;sy=e.clientY-ty})
  window.addEventListener('mousemove',function(e){if(!panning)return;tx=e.clientX-sx;ty=e.clientY-sy;apply()})
  window.addEventListener('mouseup',function(){panning=false})
  document.getElementById('zoom-in').onclick=function(){setZ(scale*1.2)}
  document.getElementById('zoom-out').onclick=function(){setZ(scale/1.2)}
  document.getElementById('zoom-reset').onclick=function(){tx=0;ty=0;setZ(1)}
})()
<\/script>
</body></html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const a = document.createElement('a'); a.download = `${title}.html`; a.href = URL.createObjectURL(blob); a.click(); URL.revokeObjectURL(a.href)
    setToast(`已导出: ${title}.html`)
    setTimeout(() => setToast(''), 2000)
  }

  return (
    <div ref={containerRef} className="w-[60%] relative overflow-hidden cursor-grab select-none bg-slate-50">
      <div className="absolute top-3 right-3 z-30 flex gap-1.5">
        <button onClick={downloadHTML} className="bg-white/90 backdrop-blur text-slate-500 hover:text-slate-700 text-xs px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 transition-colors">
          ⬇ 导出 HTML
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
                onMouseEnter={(e) => { if (t.node.description) { const r = svgRef.current!.getBoundingClientRect(); setTooltip({ text: t.node.description, x: e.clientX - r.left, y: e.clientY - r.top }) } }}
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

      {toast && (
        <div className="absolute bottom-12 right-4 bg-green-500 text-white text-xs px-4 py-2 rounded-lg shadow-lg z-40 animate-settle-in">
          {toast}
        </div>
      )}
      <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur text-slate-400 text-xs px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 pointer-events-none">
        滚轮缩放 · 拖拽平移
      </div>
    </div>
  )
}
