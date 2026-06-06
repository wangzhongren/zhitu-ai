const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined
const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:'

export const API_BASE = (isElectron || isFileProtocol) ? 'http://localhost:18674' : ''

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    // SSE responses that fail still need special handling
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/event-stream')) return res
    let detail = ''
    try { detail = await res.text() } catch { /* ignore */ }
    const err = new Error(`${res.status}`) as any
    err.status = res.status
    err.detail = detail
    throw err
  }
  // SSE streaming responses return their body via reader, not json
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/event-stream')) return res
  return res.json()
}
