#!/bin/bash
# 決算分析ダッシュボード 起動スクリプト

ROOT="$(cd "$(dirname "$0")" && pwd)"

# バックエンド起動
echo "▶ バックエンド起動中..."
cd "$ROOT/backend"
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# フロントエンド起動
echo "▶ フロントエンド起動中..."
cd "$ROOT/frontend"
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ 起動完了"
echo "   フロントエンド: http://localhost:5173"
echo "   バックエンド:   http://127.0.0.1:8000"
echo ""
echo "終了するには Ctrl+C を押してください"

# Ctrl+C で両方を終了
trap "echo ''; echo '停止中...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT
wait
