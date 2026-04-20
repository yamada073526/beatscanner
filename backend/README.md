# Backend — Earnings Judgment API

FastAPI backend that fetches financials from FMP and applies the
じっちゃまプロトコル 第6条 5-condition judgment.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then edit and add your FMP_API_KEY
```

## Run tests

```bash
pytest -v
```

## Run server

```bash
uvicorn app.main:app --reload --port 8000
```

## Endpoints

- `GET /health`
- `GET /api/analyze/{ticker}` — run 5-condition judgment
- `GET /api/calendar?days=14` — earnings calendar
