import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base


def gen_id():
    return uuid.uuid4().hex[:12]


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=gen_id)
    nickname = Column(String, default="旅人")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, default="未命名思辨")
    topic = Column(String, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="sessions")
    nodes = relationship("Node", back_populates="session", cascade="all, delete-orphan")
    edges = relationship("Edge", back_populates="session", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")


class Node(Base):
    __tablename__ = "nodes"
    pk = Column(Integer, primary_key=True, autoincrement=True)
    id = Column(String, nullable=False)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    parent_id = Column(String, nullable=True)
    label = Column(String, nullable=False)
    layer_depth = Column(Integer, default=0)
    status = Column(String, default="stable")
    x = Column(Float, default=300.0)
    y = Column(Float, default=220.0)
    cognitive_dimension = Column(String, default="general")
    description = Column(String, default="")

    session = relationship("Session", back_populates="nodes")


class Edge(Base):
    __tablename__ = "edges"
    pk = Column(Integer, primary_key=True, autoincrement=True)
    id = Column(String, nullable=False)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    source_id = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    type = Column(String, default="normal")
    description = Column(String, default="")

    session = relationship("Session", back_populates="edges")


class Message(Base):
    __tablename__ = "messages"
    id = Column(String, primary_key=True, default=gen_id)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    role = Column(String, nullable=False)  # "user" or "ai"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("Session", back_populates="messages")
