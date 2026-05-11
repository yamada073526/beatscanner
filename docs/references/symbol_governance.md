# Symbol Governance — Tier 2「世界市場」銘柄追加 checklist

`workspace mode > 指数 tab > 世界市場` (Pane 2 Tier 2) に新規 symbol を追加するときの checklist。
v65 §4-B-1 で 3 体並列レビュー (金融 / マーケター / Anthropic engineer) の結論を集約したもの。

## 追加判断フロー

### 1. 銘柄選定の妥当性
- [ ] **重複チェック**: 既存 Tier 1 / Tier 2 と相関 0.85+ の銘柄ではないか (例: XLK vs SOXX は一部重複、XLF vs SPY は構成被り)
- [ ] **代替不能な軸**: その銘柄でしか表現できないマクロ軸があるか (例: TIP = break-even / BKLN = floating rate)
- [ ] **decay 系を回避**: BITO / USO / VIXY 等の contango decay / volatility decay 銘柄は長期保有不能 → 採用しない
- [ ] **active 運用を回避**: ARKK 等の active ETF は「マネージャー依存」で signal として劣化、採用しない
- [ ] **流動性**: 1 日平均出来高 100 万株 + AUM $1B+ を満たすか

### 2. 北極星整合性 (BeatScanner = 米国株決算分析)
- [ ] その銘柄が「決算シーズン文脈」と接続するか (例: XLE → ExxonMobil 決算、SOXX → NVIDIA 決算)
- [ ] LP 訴求文言 (「3 銘柄/日まで無料」「米国株決算 2 秒で判定」) と矛盾しないか — Trust Cliff 防止
- [ ] 「日本人ユーザー特化」と「米国株決算」のトレードオフを明示判断 (例: ^N225 / EWJ は議論が必要)

### 3. データ取得品質
- [ ] **yfinance** で安定取得できるか (Railway クラウド IP からブロックされない symbol か。^prefix / DX-Y.NYB / CL=F は yfinance のみ)
- [ ] **FMP** で取得できるか (FMP は ^ prefix / FX を返さないことが多い、fallback 設計あり)
- [ ] 取得失敗時の挙動: row が消えるか N/A 表示か。`backend/app/main.py` L3445-3456 の per-symbol fallback で対応済
- [ ] 60 秒 cache (`_MARKET_CACHE_TTL`) で十分か、追加 symbol で fetch 時間が伸びないか

### 4. 表示設計
- [ ] **`desc_ja` 必須**: backend `MARKET_SYMBOLS` の各 entry に日本語解説 (15-25 文字) を併記。frontend が 2 行 row で表示 (v65 §4-B-1)
- [ ] **TIER2_ORDER の位置**: `frontend/src/features/workspace/IndicesView.jsx` の TIER2_ORDER 配列で順序明示。グルーピング (米コア / セクター / テーマ / 海外 / 安全資産) を意識
- [ ] **Pro lock の要否**: 16 件超を追加する場合、Pro lock 適用は LP 訴求と矛盾しないか確認 (マーケター推奨)

### 5. デプロイ後検証
- [ ] `npm run build` pass (frontend)
- [ ] `python3 -c "import ast; ast.parse(open('backend/app/main.py').read())"` (backend syntax)
- [ ] `railway up --detach` → バンドルハッシュ変化を `curl` で確認
- [ ] 本番 `/api/market-indices` を curl → 新規 symbol が `desc_ja` 含めて返るか
- [ ] Chrome で `?layout=workspace` を開き、Pane 2 指数 tab で row 表示 OK か (ticker + 日本語解説 2 行)

### 6. 観測 KPI (デプロイ後 24h-7day)
- [ ] `/api/market-indices` p95 レスポンス時間 (基準: < 3s)
- [ ] per-symbol 取得成功率 (基準: 100%、欠落あれば fallback 設計見直し)
- [ ] Pane 2 → Pane 4/5 遷移率 (マーケター推奨、基準: 20%+)
- [ ] 期間 chip (1D/1W/1M/6M/1Y) 切替頻度
- [ ] group 折り畳み rate (将来 group 化したとき)

## 主要ファイル

| ファイル | 役割 |
|---|---|
| `backend/app/main.py` L3402-3426 | `MARKET_SYMBOLS` 定義 (ticker / label / type / desc_ja) |
| `backend/app/main.py` L3429-L3490 | `/api/market-indices` endpoint + 60 秒 cache + per-symbol fallback |
| `frontend/src/features/workspace/IndicesView.jsx` L27-45 | TIER1 (frontend 固定) / TIER2_ORDER (Tier 2 順序) |
| `frontend/src/features/workspace/IndicesView.jsx` L90-180 | IndicesRow (2 行 ticker + desc) |
| `memory/project_indices_tier2_v2.md` | Phase 1/2 判断根拠、除外/採用候補 |

## アンチパターン

- ❌ 「数を増やせばリッチに見える」発想で 22 一気追加 — マーケター/エンジニア両方が反対
- ❌ ticker のみで日本語解説なし — 米国株初学者には「XLK」だけでは何の指数か即わからない (5 原則 #1「2 秒で全体把握」違反)
- ❌ active 運用 ETF / decay 銘柄を「人気だから」採用 — 長期 signal として劣化
- ❌ LP 訴求と矛盾する銘柄構成 — Trust Cliff の温床
- ❌ 銘柄追加 → 即デプロイ、cold start 後の p95 を測らない — 「読み手に負担をかけない」5 原則と直接衝突
