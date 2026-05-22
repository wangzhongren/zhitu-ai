import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, text
from sqlalchemy.orm import Session as DBSession

from database import engine, Base, get_db
from models import User, Session, Node, Edge, Message
from schemas import ChatRequest, SessionCreate, SessionResponse, SessionListResponse
from socratic_agent import stream_conversation, generate_graph_ops, generate_title


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="心智书斋 API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _ensure_user(db: DBSession) -> User:
    user = db.query(User).first()
    if not user:
        user = User(id="default_user", nickname="旅人")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def _session_to_response(s: Session) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "topic": s.topic,
        "created_at": s.created_at.isoformat() if s.created_at else "",
        "updated_at": s.updated_at.isoformat() if s.updated_at else "",
    }


# --- Session endpoints ---

@app.get("/api/sessions")
def list_sessions(db: DBSession = Depends(get_db)):
    user = _ensure_user(db)
    sessions = db.query(Session).filter(Session.user_id == user.id).order_by(Session.updated_at.desc()).all()
    return {"sessions": [_session_to_response(s) for s in sessions]}


@app.post("/api/sessions", response_model=SessionResponse)
def create_session(body: SessionCreate, db: DBSession = Depends(get_db)):
    user = _ensure_user(db)
    s = Session(id=uuid.uuid4().hex[:12], user_id=user.id, title=body.title or "未命名思辨")
    db.add(s)
    db.commit()
    db.refresh(s)
    return _session_to_response(s)


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str, db: DBSession = Depends(get_db)):
    s = db.query(Session).filter(Session.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    nodes = [{"id": n.id, "parent_id": n.parent_id, "label": n.label, "layer_depth": n.layer_depth,
              "status": n.status, "x": n.x, "y": n.y, "cognitive_dimension": n.cognitive_dimension,
              "description": n.description or ""}
             for n in s.nodes]
    edges = [{"id": e.id, "source_id": e.source_id, "target_id": e.target_id,
              "type": e.type, "description": e.description} for e in s.edges]
    messages = [{"role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
                for m in s.messages]

    return {
        "session": _session_to_response(s),
        "nodes": nodes,
        "edges": edges,
        "messages": messages,
    }


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str, db: DBSession = Depends(get_db)):
    s = db.query(Session).filter(Session.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(s)
    db.commit()
    return {"ok": True}


# --- Chat endpoint (SSE streaming) ---

@app.post("/api/chat")
async def chat(body: ChatRequest, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == body.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Save user message
    user_msg = Message(id=uuid.uuid4().hex[:12], session_id=session.id, role="user", content=body.text)
    db.add(user_msg)
    db.commit()

    # Load history
    history = [{"role": m.role, "content": m.content}
               for m in db.query(Message).filter(Message.session_id == session.id)
               .order_by(Message.created_at.asc()).all()]

    existing_nodes = [{"id": n.id, "parent_id": n.parent_id, "label": n.label,
                       "layer_depth": n.layer_depth, "status": n.status,
                       "x": n.x, "y": n.y, "cognitive_dimension": n.cognitive_dimension,
                       "description": n.description or ""}
                      for n in session.nodes]
    existing_edges = [{"id": e.id, "source_id": e.source_id, "target_id": e.target_id,
                       "type": e.type, "description": e.description}
                      for e in session.edges]

    # Look up context node if provided
    context_node = None
    if body.context_node_id:
        ctx = db.query(Node).filter(Node.id == body.context_node_id, Node.session_id == session.id).first()
        if ctx:
            context_node = {"id": ctx.id, "label": ctx.label, "description": ctx.description or ""}

    # Check if this is the first message
    user_msg_count = db.query(Message).filter(Message.session_id == session.id, Message.role == "user").count()

    async def event_stream():
        full_response = ""

        # Step 0: Generate title first if this is the first message
        if user_msg_count == 1 and (session.title == "新话题" or session.title == "未命名思辨"):
            title = ""
            try:
                title, err = await asyncio.wait_for(generate_title(body.text), timeout=30)
            except asyncio.TimeoutError:
                err = "timeout"
            except Exception as e:
                err = str(e)
            if title:
                db.execute(text("UPDATE sessions SET title = :title WHERE id = :id"), {"title": title, "id": session.id})
                db.commit()
                yield f"data: {json.dumps({'event': 'title', 'data': title})}\n\n"
            else:
                yield f"data: {json.dumps({'event': 'text_delta', 'data': f' [标题空 err={err}]'})}\n\n"

        # Step 1: Agent 1 — 流式对话
        async for sse_line in stream_conversation(
            body.text, history, existing_nodes, existing_edges, context_node
        ):
            if '"event": "text_delta"' in sse_line:
                try:
                    _, json_str = sse_line.split("data: ", 1)
                    payload = json.loads(json_str)
                    full_response += payload.get("data", "")
                except (json.JSONDecodeError, ValueError):
                    pass
            yield sse_line

        # Persist AI response
        if full_response:
            ai_msg = Message(id=uuid.uuid4().hex[:12], session_id=session.id, role="ai", content=full_response)
            db.add(ai_msg)

        # Step 2: Agent 2 — 图谱编辑
        try:
            ops_data, diag = await generate_graph_ops(
                body.text, full_response, history, existing_nodes, existing_edges
            )
        except Exception as e:
            ops_data, diag = None, f"exception: {str(e)}"

        if ops_data:
            # Normalize: ensure only one root node in operations
            first_root_id = None
            for op in ops_data.get("operations", []):
                if op.get("action") == "add_node" and op.get("parent_id") is None:
                    if first_root_id is None:
                        first_root_id = op["id"]
                    else:
                        op["parent_id"] = first_root_id

            # Apply operations to DB
            for op in ops_data.get("operations", []):
                action = op.get("action")
                if action == "add_node":
                    if not op.get("id") or not op.get("label"):
                        continue
                    # Auto-create missing parent node
                    pid = op.get("parent_id")
                    if pid and not db.query(Node).filter(Node.id == pid, Node.session_id == session.id).first():
                        parent = Node(id=pid, session_id=session.id, parent_id=None, label="（自动生成）", layer_depth=0, cognitive_dimension="general")
                        db.add(parent)
                        db.flush()
                        ops_data["operations"].append({
                            "action": "add_node", "id": pid, "parent_id": None,
                            "label": "（自动生成）", "layer_depth": 0,
                            "cognitive_dimension": "general", "description": "",
                        })
                    existing = db.query(Node).filter(Node.id == op["id"], Node.session_id == session.id).first()
                    if existing:
                        existing.label = op.get("label", existing.label)
                        existing.parent_id = op.get("parent_id")
                        existing.layer_depth = op.get("layer_depth", existing.layer_depth)
                        existing.status = op.get("status", existing.status)
                        existing.cognitive_dimension = op.get("cognitive_dimension", existing.cognitive_dimension)
                        existing.description = op.get("description", existing.description)
                        db.add(existing)
                        db.flush()
                    else:
                        node = Node(
                            id=op["id"], session_id=session.id,
                            parent_id=op.get("parent_id"),
                            label=op.get("label", ""),
                            layer_depth=op.get("layer_depth", 0),
                            status=op.get("status", "stable"),
                            x=0, y=0,
                            cognitive_dimension=op.get("cognitive_dimension", "general"),
                            description=op.get("description", ""),
                        )
                        db.add(node)
                    db.flush()

                elif action == "update_node":
                    existing = db.query(Node).filter(Node.id == op["id"], Node.session_id == session.id).first()
                    if existing:
                        changes = op.get("changes", {})
                        for field in ("label", "status", "description", "parent_id", "layer_depth", "cognitive_dimension"):
                            if field in changes:
                                setattr(existing, field, changes[field])
                        db.add(existing)

                elif action == "delete_node":
                    node = db.query(Node).filter(Node.id == op["id"], Node.session_id == session.id).first()
                    if node:
                        db.query(Edge).filter(
                            Edge.session_id == session.id,
                            or_(Edge.source_id == op["id"], Edge.target_id == op["id"])
                        ).delete()
                        db.delete(node)

                elif action == "add_edge":
                    db.query(Edge).filter(Edge.id == op["id"], Edge.session_id == session.id).delete()
                    edge = Edge(
                        id=op["id"], session_id=session.id,
                        source_id=op.get("source_id", ""),
                        target_id=op.get("target_id", ""),
                        type=op.get("type", "normal"),
                        description=op.get("description", ""),
                    )
                    db.add(edge)

                elif action == "delete_edge":
                    db.query(Edge).filter(Edge.id == op["id"], Edge.session_id == session.id).delete()

            # DB-level consolidation: fix any remaining multi-root
            db_roots = db.query(Node).filter(Node.session_id == session.id, Node.parent_id == None).all()
            if len(db_roots) > 1:
                main = db_roots[0]
                for extra in db_roots[1:]:
                    extra.parent_id = main.id
                    db.add(extra)

            db.commit()
            yield f"data: {json.dumps({'event': 'graph_ops', 'data': json.dumps(ops_data, ensure_ascii=False)})}\n\n"

        session.updated_at = datetime.now(timezone.utc)
        db.commit()

        yield f"data: {json.dumps({'event': 'done', 'data': ''})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# --- Health check ---

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "has_api_key": bool(os.getenv("OPENAI_API_KEY") and os.getenv("OPENAI_API_KEY") != "sk-your-key-here"),
    }


# --- Settings ---

from pydantic import BaseModel

class SettingsBody(BaseModel):
    api_key: str = ""
    base_url: str = ""
    model: str = ""

def _env_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")

def _read_env() -> dict:
    result = {}
    path = _env_path()
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                result[k.strip()] = v.strip()
    return result

def _write_env(data: dict):
    existing = _read_env()
    existing.update({k: v for k, v in data.items() if v})
    lines = []
    for k, v in existing.items():
        lines.append(f"{k}={v}")
    with open(_env_path(), "w") as f:
        f.write("\n".join(lines) + "\n")

@app.get("/api/settings")
def get_settings():
    env = _read_env()
    key = env.get("OPENAI_API_KEY", "")
    masked = key[:8] + "****" + key[-4:] if len(key) > 12 else key
    return {
        "api_key": masked,
        "has_key": bool(key and key != "sk-your-key-here"),
        "base_url": env.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        "model": env.get("OPENAI_MODEL", "gpt-4o"),
    }

@app.post("/api/settings")
def update_settings(body: SettingsBody):
    updates = {}
    if body.api_key and body.api_key != "sk-your-key-here":
        updates["OPENAI_API_KEY"] = body.api_key
    if body.base_url:
        updates["OPENAI_BASE_URL"] = body.base_url
    if body.model:
        updates["OPENAI_MODEL"] = body.model
    if updates:
        _write_env(updates)
        # Reload env
        from dotenv import load_dotenv
        load_dotenv(override=True)
        return {"ok": True, "message": "配置已保存，重启后端后生效"}
    return {"ok": False, "message": "无更新"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
