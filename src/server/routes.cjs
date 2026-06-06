const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, genId } = require('./database.cjs');
const { streamConversation, generateGraphOps, generateTitle, hasApiKey, getConfig } = require('./socratic-agent.cjs');

const router = Router();
const upload = multer({ dest: path.join(__dirname, '..', '..', 'uploads') });

// ── Health ──
router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', has_key: hasApiKey() });
});

// ── Sessions list ──
router.get('/api/sessions', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, title, topic, created_at, updated_at FROM sessions WHERE user_id = ? ORDER BY updated_at DESC'
  ).all('default_user');
  res.json({ sessions: rows.map(r => ({
    id: r.id,
    title: r.title,
    topic: r.topic,
    created_at: r.created_at,
    updated_at: r.updated_at,
  })) });
});

// ── Create session ──
router.post('/api/sessions', (req, res) => {
  const id = genId();
  const title = (req.body && req.body.title) || '未命名思辨';
  db.prepare('INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)').run(id, 'default_user', title);
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  res.json({ id: s.id, title: s.title, topic: s.topic, created_at: s.created_at, updated_at: s.updated_at });
});

// ── Get session ──
router.get('/api/sessions/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, 'default_user');
  if (!s) return res.status(404).json({ error: 'not found' });

  const nodes = db.prepare('SELECT id, parent_id, label, layer_depth, status, x, y, cognitive_dimension, description FROM nodes WHERE session_id = ?').all(s.id);
  const edges = db.prepare('SELECT id, source_id, target_id, type, description FROM edges WHERE session_id = ?').all(s.id);
  const messages = db.prepare('SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(s.id);

  res.json({
    session: { id: s.id, title: s.title, topic: s.topic, created_at: s.created_at, updated_at: s.updated_at },
    nodes,
    edges,
    messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at })),
  });
});

// ── Delete session ──
router.delete('/api/sessions/:id', (req, res) => {
  const result = db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(req.params.id, 'default_user');
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ── Settings: GET ──
router.get('/api/settings', (_req, res) => {
  const { apiKey, baseURL, model } = getConfig();
  const masked = apiKey ? apiKey.slice(0, 4) + '***' + apiKey.slice(-4) : '';
  res.json({
    api_key: apiKey,
    base_url: baseURL,
    model,
    has_key: hasApiKey(),
    masked_key: masked,
  });
});

// ── Settings: POST ──
router.post('/api/settings', (req, res) => {
  const { api_key, base_url, model } = req.body || {};
  const envPath = path.join(__dirname, '..', '..', '.env');

  // Read existing .env
  let content = '';
  try { content = fs.readFileSync(envPath, 'utf-8'); } catch { /* file may not exist */ }

  const lines = content.split('\n');
  const updated = new Set();

  const newLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return line;
    const key = trimmed.slice(0, eq).trim();

    if (key === 'OPENAI_API_KEY' && api_key !== undefined) {
      updated.add(key);
      return `OPENAI_API_KEY=${api_key}`;
    }
    if (key === 'OPENAI_BASE_URL' && base_url !== undefined) {
      updated.add(key);
      return `OPENAI_BASE_URL=${base_url}`;
    }
    if (key === 'OPENAI_MODEL' && model !== undefined) {
      updated.add(key);
      return `OPENAI_MODEL=${model}`;
    }
    return line;
  });

  // Add keys that weren't in the file
  if (api_key !== undefined && !updated.has('OPENAI_API_KEY')) newLines.push(`OPENAI_API_KEY=${api_key}`);
  if (base_url !== undefined && !updated.has('OPENAI_BASE_URL')) newLines.push(`OPENAI_BASE_URL=${base_url}`);
  if (model !== undefined && !updated.has('OPENAI_MODEL')) newLines.push(`OPENAI_MODEL=${model}`);

  // Also ensure DATABASE_URL exists
  if (!newLines.some(l => l.startsWith('DATABASE_URL='))) {
    newLines.push('DATABASE_URL=sqlite:///./scriptorium.db');
  }

  fs.writeFileSync(envPath, newLines.join('\n') + '\n');

  // Update process.env
  if (api_key !== undefined) process.env.OPENAI_API_KEY = api_key;
  if (base_url !== undefined) process.env.OPENAI_BASE_URL = base_url;
  if (model !== undefined) process.env.OPENAI_MODEL = model;

  res.json({ message: '设置已保存' });
});

// ── File upload ──
router.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });

  const ext = (req.file.originalname || '').split('.').pop()?.toLowerCase() || '';
  const filePath = req.file.path;

  try {
    if (ext === 'docx') {
      // For docx files, return the filename as content (basic support)
      res.json({ content: `[文档: ${req.file.originalname}]（docx 文件内容需在本地查看）` });
    } else {
      const content = fs.readFileSync(filePath, 'utf-8').slice(0, 50000);
      res.json({ content });
    }
  } catch (e) {
    res.json({ content: `[读取文件失败: ${e.message}]` });
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
});

// ── Chat (SSE) ──
router.post('/api/chat', async (req, res) => {
  const { session_id, text, context_node_id, display_text } = req.body || {};
  if (!session_id || !text) return res.status(400).json({ error: 'session_id and text required' });

  const userText = display_text || text;

  // Verify session exists
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id);
  if (!session) return res.status(404).json({ error: 'session not found' });

  // Save user message
  const existingMessages = db.prepare(
    'SELECT id FROM messages WHERE session_id = ?'
  ).all(session_id);

  const isFirstMessage = existingMessages.length === 0;
  const msgId = genId();
  db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)')
    .run(msgId, session_id, 'user', userText);

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`data: ${JSON.stringify({ event, data })}\n\n`);
  };

  try {
    // Load history
    const historyMessages = db.prepare(
      'SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC'
    ).all(session_id);
    const nodes = db.prepare(
      'SELECT id, parent_id, label, layer_depth, status, x, y, cognitive_dimension, description FROM nodes WHERE session_id = ?'
    ).all(session_id);
    const edges = db.prepare(
      'SELECT id, source_id, target_id, type, description FROM edges WHERE session_id = ?'
    ).all(session_id);

    // Load context node if provided
    let contextNode = null;
    if (context_node_id) {
      contextNode = db.prepare('SELECT * FROM nodes WHERE id = ? AND session_id = ?').get(context_node_id, session_id);
    }

    // ── Title generation (first message) ──
    if (isFirstMessage && hasApiKey()) {
      const title = await generateTitle(userText);
      if (title) {
        db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, session_id);
        send('title', title);
      }
    }

    // ── Agent 1: Stream conversation ──
    let fullResponse = '';
    for await (const line of streamConversation(text, historyMessages, nodes, edges, contextNode)) {
      const evt = JSON.parse(line);
      send(evt.event, evt.data);
      if (evt.event === 'text_delta') {
        fullResponse += evt.data;
      }
    }

    if (!fullResponse) fullResponse = '(空响应)';

    // Save AI message
    const aiMsgId = genId();
    db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)')
      .run(aiMsgId, session_id, 'ai', fullResponse);

    // ── Agent 2: Graph operations ──
    const opsResult = await generateGraphOps(text, fullResponse, historyMessages, nodes, edges);
    if (opsResult && opsResult.operations) {
      applyOperations(session_id, opsResult.operations);
      send('graph_ops', JSON.stringify(opsResult));
    }

    // Update session timestamp
    db.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(session_id);

    send('done', '');
  } catch (e) {
    console.error('[chat] error:', e);
    send('text_delta', `[服务器错误: ${e.message}]`);
    send('done', '');
  } finally {
    res.end();
  }
});

// ── Apply graph operations to database ──
function applyOperations(sessionId, operations) {
  // Normalize: only one root node
  let rootOps = operations.filter(op => op.action === 'add_node' && op.parent_id === null);
  if (rootOps.length > 1) {
    const firstRoot = rootOps[0];
    for (let i = 1; i < rootOps.length; i++) {
      rootOps[i].parent_id = firstRoot.id;
    }
  }

  for (const op of operations) {
    switch (op.action) {
      case 'add_node': {
        // If parent doesn't exist, create a placeholder
        if (op.parent_id) {
          const parent = db.prepare('SELECT id FROM nodes WHERE id = ? AND session_id = ?').get(op.parent_id, sessionId);
          if (!parent) {
            const placeholderId = genId();
            db.prepare(`
              INSERT INTO nodes (id, session_id, parent_id, label, layer_depth, status, x, y, cognitive_dimension, description)
              VALUES (?, ?, NULL, ?, 0, 'stable', 300.0, 220.0, 'general', '')
            `).run(placeholderId, sessionId, '（自动生成）');
            // Update the operation's parent_id to the new placeholder
            op.parent_id = placeholderId;
          }
        }

        const existing = db.prepare('SELECT id FROM nodes WHERE id = ? AND session_id = ?').get(op.id, sessionId);
        if (existing) {
          // Update
          db.prepare(`
            UPDATE nodes SET parent_id=?, label=?, layer_depth=?, status=?, cognitive_dimension=?, description=?
            WHERE id=? AND session_id=?
          `).run(
            op.parent_id || null, op.label || '', op.layer_depth || 0,
            op.status || 'stable', op.cognitive_dimension || 'general', op.description || '',
            op.id, sessionId
          );
        } else {
          db.prepare(`
            INSERT INTO nodes (id, session_id, parent_id, label, layer_depth, status, x, y, cognitive_dimension, description)
            VALUES (?, ?, ?, ?, ?, ?, 300.0, 220.0, ?, ?)
          `).run(
            op.id, sessionId, op.parent_id || null, op.label || '', op.layer_depth || 0,
            op.status || 'stable', op.cognitive_dimension || 'general', op.description || ''
          );
        }
        break;
      }

      case 'update_node': {
        const changes = op.changes || {};
        const fields = [];
        const values = [];
        for (const [k, v] of Object.entries(changes)) {
          if (['parent_id', 'label', 'status', 'layer_depth', 'cognitive_dimension', 'description', 'x', 'y'].includes(k)) {
            fields.push(`${k}=?`);
            values.push(v);
          }
        }
        if (fields.length > 0) {
          values.push(op.id, sessionId);
          db.prepare(`UPDATE nodes SET ${fields.join(',')} WHERE id=? AND session_id=?`).run(...values);
        }
        break;
      }

      case 'delete_node':
        db.prepare('DELETE FROM edges WHERE session_id = ? AND (source_id = ? OR target_id = ?)').run(sessionId, op.id, op.id);
        db.prepare('DELETE FROM nodes WHERE id = ? AND session_id = ?').run(op.id, sessionId);
        break;

      case 'add_edge': {
        db.prepare('DELETE FROM edges WHERE id = ? AND session_id = ?').run(op.id, sessionId);
        db.prepare(`
          INSERT INTO edges (id, session_id, source_id, target_id, type, description)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(op.id, sessionId, op.source_id, op.target_id, op.type || 'normal', op.description || '');
        break;
      }

      case 'delete_edge':
        db.prepare('DELETE FROM edges WHERE id = ? AND session_id = ?').run(op.id, sessionId);
        break;
    }
  }

  // Post-process: consolidate multiple roots
  const roots = db.prepare('SELECT id FROM nodes WHERE session_id = ? AND parent_id IS NULL').all(sessionId);
  if (roots.length > 1) {
    const first = roots[0];
    for (let i = 1; i < roots.length; i++) {
      db.prepare('UPDATE nodes SET parent_id = ? WHERE id = ? AND session_id = ?').run(first.id, roots[i].id, sessionId);
    }
  }
}

module.exports = router;
