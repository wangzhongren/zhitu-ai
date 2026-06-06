const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');

// ── System Prompts (same as Python) ──
const CONVERSATION_PROMPT = `# Role
你是一个技术学习助手，帮助用户理解技术概念、梳理知识结构。

# Rules
1. 用户提问时，先简要解答（涉及代码时必须给出代码示例），再追问引导深入。
2. **每次只问一个问题**。
3. 每次回复控制在 1000 字以内，解答和引导各占一半。
4. 发现用户新观点和已有知识点矛盾时，指出矛盾。
5. 你的输出只有纯文本，不要输出 JSON 或代码块。
`;

const GRAPH_EDITOR_PROMPT = `# Role
你是一个知识图谱编辑器。根据对话内容，对当前知识图谱执行增量操作。

# 操作指令
输出纯 JSON（无 markdown 标记）：
{
  "operations": [
    {"action": "add_node", "id": "n1", "parent_id": null, "label": "主题: XXX", "layer_depth": 0, "cognitive_dimension": "core", "description": "说明"},
    {"action": "update_node", "id": "n2", "changes": {"status": "warning"}},
    {"action": "delete_node", "id": "n3"},
    {"action": "add_edge", "id": "e1", "source_id": "n1", "target_id": "n2", "type": "normal", "description": "关系"},
    {"action": "delete_edge", "id": "e2"}
  ]
}

# 规则
- **整张图最多只有一个根节点（n1，parent_id=null）**，是全局唯一主题入口。已有根节点就不能再建。
- 用户开启新话题时，立即创建唯一根节点 n1（parent_id=null），标签为话题名。
- 讨论到新概念时，作为子节点添加（parent_id 指向已有节点，如 n1）。
- **严禁创建多个 parent_id=null 的节点。**
- 发现矛盾时，update_node 将 status 改为 "warning"。
- 不需要操作时 operations 为空数组。
- 节点 id: n1, n2, n3... 连线 id: e1, e2, e3...
- cognitive_dimension: core(主题), concept(概念), principle(原理), practice(实践), performance(性能), security(安全), testing(测试), general(通用)
- 每个节点必须写 description，不超过500字。
- **涉及代码的主题，description 必须包含简短代码示例**（如 CSS 属性写 \`position: sticky; top: 0;\`），不能只写文字释义。
`;

// ── Load .env config ──
function getConfig() {
  let apiKey = process.env.OPENAI_API_KEY || '';
  let baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  let model = process.env.OPENAI_MODEL || 'gpt-4o';

  // Try reading .env file
  const envPath = path.join(__dirname, '..', '..', '.env');
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key === 'OPENAI_API_KEY') apiKey = val;
        if (key === 'OPENAI_BASE_URL') baseURL = val;
        if (key === 'OPENAI_MODEL') model = val;
      }
    }
  } catch { /* ignore */ }

  return { apiKey, baseURL, model };
}

function hasApiKey() {
  const { apiKey } = getConfig();
  return !!(apiKey && apiKey !== 'sk-your-key-here');
}

function getClient() {
  const { apiKey, baseURL } = getConfig();
  return new OpenAI({ apiKey, baseURL, timeout: 300000, maxRetries: 1 });
}

// ── Build context string ──
function buildContext(historyMessages, nodes, edges) {
  const parts = ['## 历史对话\n'];
  const recentMsgs = historyMessages.slice(-12);
  for (const m of recentMsgs) {
    const role = m.role === 'user' ? '用户' : '助手';
    parts.push(`【${role}】: ${m.content.slice(0, 300)}`);
  }
  parts.push('\n## 当前图谱节点');
  if (nodes.length > 0) {
    for (const n of nodes) {
      parts.push(`- [${n.id}] ${n.label} (parent=${n.parent_id || 'root'}, status=${n.status})`);
    }
  } else {
    parts.push('(空)');
  }
  if (edges.length > 0) {
    parts.push('\n## 当前连线');
    for (const e of edges) {
      parts.push(`- [${e.id}] ${e.source_id} -> ${e.target_id} (${e.type})`);
    }
  }
  return parts.join('\n');
}

// ── Agent 1: Stream conversation ──
async function* streamConversation(userText, historyMessages, nodes, edges, contextNode) {
  if (!hasApiKey()) {
    yield JSON.stringify({ event: 'text_delta', data: '请先配置 OPENAI_API_KEY。' });
    return;
  }

  const { model } = getConfig();
  const client = getClient();
  const context = buildContext(historyMessages, nodes, edges);

  let nodeHint = '';
  if (contextNode) {
    nodeHint = `\n\n[用户选中了图谱节点「${contextNode.label}」：${contextNode.description || ''}。请围绕此节点展开讨论。]`;
  }

  const userMsg = nodeHint ? nodeHint + '\n' + userText : userText;

  const msgs = [
    { role: 'system', content: CONVERSATION_PROMPT },
    { role: 'system', content: context },
    ...historyMessages.slice(-8).map(m => ({
      role: m.role === 'ai' ? 'assistant' : m.role,
      content: m.content,
    })),
    { role: 'user', content: userMsg },
  ];

  try {
    const stream = await client.chat.completions.create({
      model, messages: msgs,
      temperature: 0.85, max_tokens: 4096, stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        yield JSON.stringify({ event: 'text_delta', data: delta });
      }
    }
  } catch (e) {
    yield JSON.stringify({ event: 'text_delta', data: `[对话错误: ${e.message}]` });
  }
}

// ── Agent 2: Generate graph operations ──
async function generateGraphOps(userText, assistantResponse, historyMessages, nodes, edges) {
  if (!hasApiKey()) return null;

  const { model } = getConfig();
  const client = getClient();
  const context = buildContext(historyMessages, nodes, edges);

  const msgs = [
    { role: 'system', content: GRAPH_EDITOR_PROMPT },
    { role: 'system', content: context },
    { role: 'user', content: userText },
    { role: 'assistant', content: assistantResponse },
    { role: 'user', content: '请根据以上对话，输出图谱操作 JSON。' },
  ];

  try {
    const stream = await client.chat.completions.create({
      model, messages: msgs,
      temperature: 0.3, max_tokens: 8192, stream: true,
    });

    let text = '';
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) text += delta;
    }

    if (!text) return null;
    const parsed = parseJson(text);
    return parsed;
  } catch (e) {
    console.error('[graph] error:', e.message);
    return null;
  }
}

// ── Generate title ──
async function generateTitle(userText) {
  if (!hasApiKey()) return '';

  const { model } = getConfig();
  const client = getClient();

  try {
    const resp = await client.chat.completions.create({
      model, temperature: 0.3, max_tokens: 2048,
      messages: [
        { role: 'user', content: `用不超过10个字总结下面这段话的主题，只输出标题文本：\n\n${userText.slice(0, 500)}` },
      ],
    });
    const text = (resp.choices[0]?.message?.content || '').trim();
    if (!text) return '';
    return text.replace(/"/g, '').replace(/'/g, '').replace(/标题[：:]/g, '').slice(0, 20);
  } catch {
    return '';
  }
}

// ── JSON parser ──
function parseJson(text) {
  text = text.trim();
  // Strip markdown fences
  text = text.replace(/^```\w*\s*/, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}

module.exports = { streamConversation, generateGraphOps, generateTitle, hasApiKey, getConfig };
