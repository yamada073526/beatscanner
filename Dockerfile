# ── Stage 1: Build Vite frontend ─────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend/
RUN cd frontend && npm run build
# cache-bust: 2026-04-24
# Output: /app/frontend/dist/


# ── Stage 2: Python runtime + compiled frontend ───────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# System deps for yfinance / httpx
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Backend Python deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/ ./backend/

# Compiled frontend (FastAPI's StaticFiles will serve this)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Working dir for uvicorn module resolution
WORKDIR /app/backend

# Railway injects $PORT; default to 8000 for local docker run
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
