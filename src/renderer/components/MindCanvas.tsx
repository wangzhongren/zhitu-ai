import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { useStore } from '../store/scriptoriumStore'
import type { MindNode, MindEdge } from '../types'
import { Download } from 'lucide-react'

const H_GAP = 280, MIN_GAP = 24, MARGIN = 100

// Dark theme colors
const C = {
  bg: '#1e1e2e',
  primary: '#5E6AD2',
  text: '#cdd6f4',
  muted: '#8b8fa3',
  border: '#383850',
  accent: '#9b9da4',
  error: '#e03e3e',
  errorLight: '#3a2020',
  success: '#16a34a',
}

interface TreeNode {
  node: MindNode
  children: TreeNode[]
  x: number; y: number
  h: number
}

function buildTree(nodes: MindNode[]): TreeNode | null {
  if (nodes.length === 0) return null
  const map = new Map<string, TreeNode>()
  nodes.forEach((n) => map.set(n.id, { node: n, children: [], x: 0, y: 0, h: 28 }))
  const roots: TreeNode[] = []
  nodes.forEach((n) => {
    const tn = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(tn)
    else roots.push(tn)
  })
  if (roots.length === 1) return roots[0]
  if (roots.length > 1) {
    return {
      node: { id: '__vr__', parent_id: null, label: '', layer_depth: -1, status: 'stable', x: 0, y: 0, cognitive_dimension: '', description: '' },
      children: roots, x: 0, y: 0, h: 0,
    }
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
  core: '#5E6AD2', concept: '#8B5CF6', principle: '#06B6D4',
  practice: '#10B981', performance: '#F59E0B', security: '#EF4444',
  testing: '#6366F1', general: '#94A3B8',
}

let _ctx: CanvasRenderingContext2D | null = null
function measureText(text: string, fontSize: number): number {
  if (!_ctx) { const c = document.createElement('canvas'); _ctx = c.getContext('2d') }
  if (!_ctx) return text.length * fontSize * 0.7
  _ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`
  return _ctx.measureText(text).width
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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

    const nodeInfo = new Map<string, { lines: string[]; tw: number; h: number; accent: string; isRoot: boolean }>()
    ;(function computeDims(tn: TreeNode) {
      if (tn.node.id !== '__vr__') {
        const isRoot = tn.node.layer_depth === 0
        const labelW = measureText(tn.node.label, isRoot ? 14 : 12.5)
        const maxLineW = Math.max(labelW, 180) - 8
        let lines: string[] = []
        if (tn.node.description) {
          let cur = ''
          for (const ch of tn.node.description) {
            if (measureText(cur + ch, 10.5) > maxLineW) { lines.push(cur); cur = ch }
            else { cur += ch }
          }
          if (cur) lines.push(cur)
        }
        const lc = lines.length
        const h = lc > 0 ? 28 + lc * 14 : isRoot ? 36 : 28
        const tw = Math.ceil(Math.max(labelW, ...lines.map(l => measureText(l, 10.5)), 0)) + 28
        tn.h = h
        nodeInfo.set(tn.node.id, { lines, tw, h, accent: DIM_COLORS[tn.node.cognitive_dimension] || DIM_COLORS.general, isRoot })
      }
      tn.children.forEach(computeDims)
    })(root)

    const bottom = layoutTree(root, root.node.id === '__vr__' ? -1 : 0, MARGIN)

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
    let svgContent = ''
    treeNodes.forEach((t) => {
      const children = treeNodes.filter((c) => c.node.parent_id === t.node.id)
      children.forEach((child) => {
        svgContent += `<path d="M ${t.x} ${t.y} C ${(t.x + child.x) / 2} ${t.y}, ${(t.x + child.x) / 2} ${child.y}, ${child.x} ${child.y}" fill="none" stroke="${C.border}" stroke-width="1"/>`
      })
    })
    treeNodes.forEach((t) => {
      const desc = t.node.description || ''
      const labelW = measureText(t.node.label, t.isRoot ? 14 : 12.5)
      const maxLineW = Math.max(labelW, 180) - 8
      let descLines: string[] = []
      if (desc) {
        let cur = ''
        for (const ch of desc) {
          if (measureText(cur + ch, 10.5) > maxLineW) { descLines.push(cur); cur = ch }
          else { cur += ch }
        }
        if (cur) descLines.push(cur)
      }
      const tw = Math.min(Math.ceil(Math.max(labelW, ...descLines.map(l => measureText(l, 10.5)), 0)) + 28, 480)
      const th = descLines.length > 0 ? 28 + descLines.length * 14 : t.isRoot ? 36 : 28
      const rx = t.x - tw / 2, ry = t.y - th / 2
      svgContent += `<g>`
      if (desc) svgContent += `<title>${escapeXml(desc)}</title>`
      svgContent += `<rect x="${rx}" y="${ry}" width="${tw}" height="${th}" rx="6" fill="${t.isRoot ? C.primary : C.bg}" stroke="${t.isRoot ? C.primary : C.border}" stroke-width="${t.isRoot ? 0 : 1}"/>`
      if (!t.isRoot) svgContent += `<rect x="${rx + 1}" y="${ry + 5}" width="3" height="${Math.min(th - 10, 18)}" fill="${t.accent}" rx="1.5"/>`
      const tc = t.isRoot ? '#fff' : C.text
      const descH = descLines.length > 0 ? (descLines.length - 1) * 7 : 0
      const ly = descLines.length > 0 ? t.y - 3 - descH : t.y + th / 2
      svgContent += `<text x="${t.x}" y="${ly}" text-anchor="middle" dominant-baseline="central" fill="${tc}" font-size="${t.isRoot ? 14 : 12.5}" font-weight="500" font-family="system-ui,sans-serif">${escapeXml(t.node.label)}</text>`
      descLines.forEach((l, li) => svgContent += `<text x="${t.x}" y="${ly + 13 + li * 13}" text-anchor="middle" dominant-baseline="central" fill="${C.muted}" font-size="10.5" font-family="system-ui,sans-serif">${escapeXml(l)}</text>`)
      svgContent += `</g>`
    })
    const svgW = totalW + PAD * 2, svgH = totalH + PAD * 2
    let title = sessions.find(s => s.id === sessionId)?.title || ''
    if (!title || title === '新话题' || title === '未命名思辨') title = '知识图谱'
    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeXml(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1e1e2e;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;padding:50px 20px;overflow:hidden}
.container{background:#1e1e2e;border-radius:10px;border:1px solid #383850;overflow:hidden;cursor:grab}
.container:active{cursor:grabbing}
svg{display:block}
.toolbar{position:fixed;top:16px;right:16px;display:flex;gap:6px;z-index:10}
.toolbar button{background:#2a2a3c;border:1px solid #383850;border-radius:6px;padding:5px 12px;font-size:12px;color:#8b8fa3;cursor:pointer}
.toolbar button:hover{background:#45456a;color:#cdd6f4}
.toolbar .level{font-size:11px;color:#6b6f7a;padding:5px 8px}
</style></head><body>
<div class="toolbar">
  <span class="level" id="zoom-level">100%</span>
  <button id="zoom-in">+</button>
  <button id="zoom-out">−</button>
  <button id="zoom-reset">重置</button>
</div>
<div class="container" id="container">
<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">
<rect width="${svgW}" height="${svgH}" fill="#1e1e2e"/>
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
    <div ref={containerRef} className="flex-[1.5] relative overflow-hidden cursor-grab select-none rounded-xl border border-border" style={{ background: C.bg }}>
      {/* Export button */}
      <button
        onClick={downloadHTML}
        className="absolute top-3 right-3 z-30 flex items-center gap-1 text-[11px] text-[#6b6f7a] hover:text-[#8b8fa3] transition-colors px-2 py-1 rounded-md hover:bg-[#2a2a3c]"
      >
        <Download className="w-3 h-3" />
        导出
      </button>

      <svg ref={svgRef} width={totalW} height={totalH} className="block" onClick={() => setSelectedNodeId(null)}>
        <g ref={tgRef} onClick={(e) => e.stopPropagation()}>
          {/* Tree edges */}
          {treeNodes.map((t) => {
            const children = treeNodes.filter((c) => c.node.parent_id === t.node.id)
            return children.map((child) => (
              <path
                key={`${t.node.id}-${child.node.id}`}
                d={`M ${t.x} ${t.y} C ${(t.x + child.x) / 2} ${t.y}, ${(t.x + child.x) / 2} ${child.y}, ${child.x} ${child.y}`}
                fill="none"
                stroke={C.border}
                strokeWidth={1}
              />
            ))
          })}

          {/* Conflict edges */}
          {edges.filter((e) => e.type === 'conflict').map((e) => {
            const s = posMap.get(e.source_id), t = posMap.get(e.target_id)
            if (!s || !t) return null
            return <line key={e.id} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={C.error} strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
          })}

          {/* Nodes */}
          {treeNodes.map((t) => {
            const warn = t.node.status === 'warning'
            const lineCount = t.descLines.length
            const th = lineCount > 0 ? 28 + lineCount * 14 : t.isRoot ? 36 : 28
            const rx = t.x - t.tw / 2, ry = t.y - th / 2
            const labelY = lineCount > 0 ? t.y - 3 - (lineCount - 1) * 7 : t.y
            const isSelected = selectedNodeId === t.node.id

            return (
              <g
                key={t.node.id}
                onMouseEnter={(e) => {
                  if (t.node.description) {
                    const r = svgRef.current!.getBoundingClientRect()
                    setTooltip({ text: t.node.description, x: e.clientX - r.left, y: e.clientY - r.top })
                  }
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={(e) => { e.stopPropagation(); setSelectedNodeId(isSelected ? null : t.node.id) }}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={rx} y={ry} width={t.tw} height={th} rx={6}
                  fill={t.isRoot ? C.primary : warn ? C.errorLight : '#2a2a3c'}
                  stroke={isSelected ? C.primary : t.isRoot ? C.primary : warn ? '#fca5a5' : C.border}
                  strokeWidth={isSelected ? 1.5 : t.isRoot ? 0 : 1}
                />
                {!t.isRoot && !warn && (
                  <rect x={rx + 1} y={ry + 5} width={3} height={Math.min(th - 10, 18)} fill={t.accent} rx={1.5} />
                )}
                <text
                  x={t.x} y={labelY}
                  textAnchor="middle" dominantBaseline="central"
                  fill={t.isRoot ? '#fff' : warn ? C.error : C.text}
                  style={{
                    fontSize: t.isRoot ? 14 : 12.5,
                    fontFamily: "'Inter','Noto Sans SC',-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
                    fontWeight: 500,
                  }}
                >
                  {t.node.label}
                </text>
                {t.descLines.map((line, li) => (
                  <text
                    key={li}
                    x={t.x} y={labelY + 13 + li * 13}
                    textAnchor="middle" dominantBaseline="central"
                    fill={t.isRoot ? 'rgba(255,255,255,0.7)' : C.muted}
                    style={{
                      fontSize: 10.5,
                      fontFamily: "'Inter','Noto Sans SC',-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
                    }}
                  >
                    {line}
                  </text>
                ))}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 text-[11px] px-2.5 py-1.5 rounded-md max-w-[220px] pointer-events-none leading-relaxed"
          style={{ background: '#181825', color: '#cdd6f4', border: '1px solid #383850', left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Empty state */}
      {treeNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-[#6b6f7a] text-[13px]">对话后将自动生成知识图谱</p>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="absolute bottom-8 right-4 text-white text-[11px] px-3 py-1.5 rounded-md z-40 animate-settle-in"
          style={{ background: C.success }}
        >
          {toast}
        </div>
      )}

      {/* Hint */}
      <div className="absolute bottom-3 right-3 text-[10px] text-[#4a4d58] pointer-events-none">
        滚轮缩放 · 拖拽平移
      </div>
    </div>
  )
}
