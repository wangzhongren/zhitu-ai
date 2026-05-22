#!/bin/bash
# 心智书斋 - 一键启动脚本
# The Mind's Scriptorium - One-click Start

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================="
echo "  心智书斋 | The Mind's Scriptorium"
echo "  AI-Driven Cognitive Evolution Engine"
echo "========================================="
echo ""

# Check .env
if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
    echo "[!] 未检测到 backend/.env，正在从 .env.example 创建..."
    cp "$SCRIPT_DIR/backend/.env.example" "$SCRIPT_DIR/backend/.env"
    echo "[!] 请编辑 backend/.env 填入你的 OPENAI_API_KEY"
fi

# Kill existing processes on the ports
PORT=18674
lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true

echo "[1/2] 启动后端 (FastAPI :$PORT)..."
cd "$SCRIPT_DIR/backend"
python3 -m uvicorn main:app --host 0.0.0.0 --port $PORT --reload &
BACKEND_PID=$!

echo "[2/2] 启动前端 (Vite :5173)..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "========================================="
echo "  后端 API:  http://localhost:$PORT"
echo "  前端界面:  http://localhost:5173"
echo "  API 文档:  http://localhost:$PORT/docs"
echo "========================================="
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
