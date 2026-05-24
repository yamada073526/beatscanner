# ── Stage 1: Build Vite frontend ─────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app

# v116: OGP PNG 生成 (build-articles.mjs + og-overlay.mjs + @resvg/resvg-js) で
# 日本語 + Latin glyph が描画されるよう alpine に Noto fonts を install する。
# 未 install だと resvg が text を空 glyph で render し、 OGP image が "中身が空" になる。
RUN apk add --no-cache font-noto font-noto-cjk

# Vite は import.meta.env.VITE_* をビルド時に静的展開するため、
# Railway の Service Variables を ARG/ENV 経由でビルドステージに注入する。
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# §11-D-Analytics: 計測基盤 (GA4 + Microsoft Clarity)。未設定時は完全 no-op。
ARG VITE_GA4_ID
ARG VITE_CLARITY_ID
# handover v66 §1 round 3: Sentry frontend error tracking。未設定時は silent skip (lib/sentry.js).
ARG VITE_SENTRY_DSN
# v113 P3: build-articles.mjs (SSG) が Supabase から記事を fetch するため必要。
# service_role key を渡すと RLS bypass で draft も含めてビルド可能 (P3.1 では anon でも published のみで動作)。
ARG SUPABASE_SERVICE_ROLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_GA4_ID=$VITE_GA4_ID \
    VITE_CLARITY_ID=$VITE_CLARITY_ID \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend/
# v116 cache-bust: echo を RUN 行内に置くことで Dockerfile string hash を強制更新
# (= layer cache miss → build-articles.mjs が再実行され Supabase fetch が走る)
RUN cd frontend && npm run build && echo "build-articles-ssg-2026-05-25-tldr-fix-dr"
# Output: /app/frontend/dist/ + /app/frontend/dist/articles/<slug>/index.html (build-articles.mjs)


# ── Stage 2: Python runtime + compiled frontend ───────────────────────────────
FROM python:3.11-slim-bookworm

WORKDIR /app

# System deps for yfinance / httpx + 日本語フォント (OGP画像生成 Pillow 用)
# 2026-05-21: apt-get install transient 障害 (Debian trixie repository or Railway
# build node) で 4 回連続 deploy failed。 Acquire::Retries で retry + fix-missing
# 追加で robust 化。
RUN apt-get -o Acquire::Retries=5 update && \
    apt-get -o Acquire::Retries=5 install -y --no-install-recommends --fix-missing \
    ca-certificates \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Backend Python deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# cache-bust: 2026-05-04-stripe
# Backend source
COPY backend/ ./backend/

# Phase 1 ナレッジベース用空ディレクトリ（.gitignore で insights/ を除外しているため明示作成）
RUN mkdir -p /app/backend/data/insights

# Compiled frontend (FastAPI's StaticFiles will serve this)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Working dir for uvicorn module resolution
WORKDIR /app/backend

# Railway injects $PORT; default to 8000 for local docker run
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
