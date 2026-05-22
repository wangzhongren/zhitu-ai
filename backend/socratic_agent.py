import json
import os
import re
from typing import AsyncGenerator, List, Optional
from openai import AsyncOpenAI

CONVERSATION_PROMPT = """# Role
你是一个技术学习助手，帮助用户理解技术概念、梳理知识结构。

# Rules
1. 用户提问时，先简要解答（涉及代码时必须给出代码示例），再追问引导深入。
2. **每次只问一个问题**。
3. 每次回复控制在 1000 字以内，解答和引导各占一半。
4. 发现用户新观点和已有知识点矛盾时，指出矛盾。
5. 你的输出只有纯文本，不要输出 JSON 或代码块。
"""

GRAPH_EDITOR_PROMPT = """# Role
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
  ],
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
- **涉及代码的主题，description 必须包含简短代码示例**（如 CSS 属性写 `position: sticky; top: 0;`），不能只写文字释义。
"""


def _get_client() -> AsyncOpenAI:
    import httpx
    api_key = os.getenv("OPENAI_API_KEY", "")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    return AsyncOpenAI(
        api_key=api_key, base_url=base_url,
        timeout=httpx.Timeout(300.0, connect=10.0, read=60.0),
    )


def _get_model() -> str:
    return os.getenv("OPENAI_MODEL", "gpt-4o")


def _has_api_key() -> bool:
    key = os.getenv("OPENAI_API_KEY", "")
    return bool(key and key != "sk-your-key-here")


def build_context(history_messages: List[dict], nodes: List[dict], edges: List[dict]) -> str:
    parts = ["## 历史对话\n"]
    for m in history_messages[-12:]:
        role = "用户" if m["role"] == "user" else "助手"
        parts.append(f"【{role}】: {m['content'][:300]}")
    parts.append("\n## 当前图谱节点")
    if nodes:
        for n in nodes:
            parts.append(f"- [{n['id']}] {n['label']} (parent={n.get('parent_id', 'root')}, status={n['status']})")
    else:
        parts.append("(空)")
    if edges:
        parts.append("\n## 当前连线")
        for e in edges:
            parts.append(f"- [{e['id']}] {e['source_id']} -> {e['target_id']} ({e['type']})")
    return "\n".join(parts)


async def stream_conversation(
    user_text: str,
    history_messages: List[dict],
    nodes: List[dict],
    edges: List[dict],
    context_node: Optional[dict] = None,
) -> AsyncGenerator[str, None]:
    """Agent 1: 纯对话，流式输出文本"""
    if not _has_api_key():
        yield f"data: {json.dumps({'event': 'text_delta', 'data': '请先配置 .env 中的 OPENAI_API_KEY。'})}\n\n"
        return

    client = _get_client()
    context = build_context(history_messages, nodes, edges)

    node_hint = ""
    if context_node:
        node_hint = f"\n\n[用户选中了图谱节点「{context_node['label']}」：{context_node.get('description', '')}。请围绕此节点展开讨论。]"

    user_msg = user_text
    if node_hint:
        user_msg = node_hint + "\n" + user_text

    messages = [
        {"role": "system", "content": CONVERSATION_PROMPT},
        {"role": "system", "content": context},
        *[{"role": "assistant" if m["role"] == "ai" else m["role"], "content": m["content"]} for m in history_messages[-8:]],
        {"role": "user", "content": user_msg},
    ]

    try:
        stream = await client.chat.completions.create(
            model=_get_model(), messages=messages,
            temperature=0.85, max_tokens=4096, stream=True,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else ""
            if delta:
                yield f"data: {json.dumps({'event': 'text_delta', 'data': delta})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'event': 'text_delta', 'data': f'[对话错误: {str(e)}]'})}\n\n"


async def generate_graph_ops(
    user_text: str,
    assistant_response: str,
    history_messages: List[dict],
    nodes: List[dict],
    edges: List[dict],
) -> tuple:
    """Agent 2: 纯图谱编辑，返回 (操作指令JSON, 诊断信息)"""
    if not _has_api_key():
        return None, "no_api_key"

    client = _get_client()
    context = build_context(history_messages, nodes, edges)

    messages = [
        {"role": "system", "content": GRAPH_EDITOR_PROMPT},
        {"role": "system", "content": context},
        {"role": "user", "content": user_text},
        {"role": "assistant", "content": assistant_response},
        {"role": "user", "content": "请根据以上对话，输出图谱操作 JSON。"},
    ]

    try:
        print("[graph] calling API...", flush=True)
        stream = await client.chat.completions.create(
            model=_get_model(), messages=messages,
            temperature=0.3, max_tokens=8192, stream=True,
            extra_body={"thinking": None},
        )
        print("[graph] stream created, iterating...", flush=True)
        text = ""
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else ""
            if delta:
                text += delta
        print(f"[graph] done, text len={len(text)}", flush=True)

        if not text:
            return None, "empty_response"

        parsed = _parse_json(text)
        if parsed is None:
            return None, f"parse_failed: {text[:200]}"
        return parsed, "ok"
    except Exception as e:
        return None, f"api_error: {str(e)}"


async def generate_title(user_text: str) -> tuple:
    """Generate a topic title. Returns (title, error_message)."""
    if not _has_api_key():
        return "", "no_api_key"
    client = _get_client()
    try:
        resp = await client.chat.completions.create(
            model=_get_model(), stream=False,
            temperature=0.3, max_tokens=2048,
            messages=[
                {"role": "user", "content": f"用不超过10个字总结下面这段话的主题，只输出标题文本：\n\n{user_text[:500]}"},
            ],
        )
        msg = resp.choices[0].message
        text = (msg.content or "").strip()
        if not text:
            return "", "empty_response"
        title = text.replace('"', '').replace("'", '').replace('标题：', '').replace('标题:', '')[:20]
        return title, ""
    except Exception as e:
        return "", str(e)


def _parse_json(text: str) -> Optional[dict]:
    text = text.strip()
    # Remove markdown code fences if present
    if text.startswith("```"):
        text = re.sub(r"^```\w*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    # Find the outermost JSON object
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{": depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    return None
    return None
