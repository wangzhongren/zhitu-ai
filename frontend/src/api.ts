const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:18674' : ''

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    throw new Error(`${res.status}`)
  }
  // SSE streaming responses return their body via reader, not json
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/event-stream')) return res
  return res.json()
}
