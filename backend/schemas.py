from __future__ import annotations
from pydantic import BaseModel
from typing import List, Optional


class ChatRequest(BaseModel):
    session_id: str
    text: str
    context_node_id: Optional[str] = None
    display_text: Optional[str] = None


class NodeSchema(BaseModel):
    id: str
    parent_id: Optional[str] = None
    label: str
    layer_depth: int = 0
    status: str = "stable"
    x: float = 300.0
    y: float = 220.0
    cognitive_dimension: str = "general"
    description: str = ""


class EdgeSchema(BaseModel):
    id: str
    source_id: str
    target_id: str
    type: str = "normal"
    description: str = ""


class MetricsSchema(BaseModel):
    depth: int = 0
    consistency: int = 0
    blind_zones: int = 3


class GraphState(BaseModel):
    nodes: List[NodeSchema] = []
    edges: List[EdgeSchema] = []
    metrics: MetricsSchema = MetricsSchema()


class SSEEvent(BaseModel):
    event: str  # "text_delta", "graph_sync", "done"
    data: str  # JSON string of the payload


class SessionCreate(BaseModel):
    title: Optional[str] = "未命名思辨"


class SessionResponse(BaseModel):
    id: str
    title: str
    topic: str
    created_at: str
    updated_at: str


class SessionListResponse(BaseModel):
    sessions: List[SessionResponse]
