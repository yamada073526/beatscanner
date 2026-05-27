# SPEC 2026-05-27: Russell 3000 universe 拡張 (段階展開: top 1000 → top 3000)

> **status**: Planner draft / **gate 1 (user 承認)** 待ち
> **対象 deliverable**: nightly batch (cup_scan / rs_scan) の universe を現状の **SP500 top 500** から **Russell 3000 相当 (market_cap top 3000)** に段階拡張。 独自プロトコル小型株重要性への適合。
> **想定工数**: **1.0 人日** (細分化は §4 参照、 段階展開で Phase 1 = 0.5 人日 / Phase 2 = 0.5 人日)
> **multi-review**: **3 体合議推奨** (金融-verdict + sre / 基盤 + frontend-architect)、 §6 参照
> **起票 trigger**: handover v124 残バックログ 最優先タスク (release MVP gate 前差別化機能)
> **作成元**: 5/27 深夜 自律 Task B (cron 1c4ac370 fire)

---

## 1. Context

### 1-1. user prompt 原文 (handover v123 / v124 backlog 由来)

> 「Russell 3000 拡張 — 独自プロトコル小型株重要、 market_cap top 3000 抽出が必要、 1.0 人日」

handover v124 「残バックログ 緊急度: 中」 の最優先項目。 5/27 dogfood で「daily-digest の銘柄は知らない小型株が多い」 という user 反応もあり、 universe が **既に screening 対象として小型株まで広がっている** が、 cup_scan / rs_scan の universe は SP500 top 500 に留まっている mismatch を解消する。

### 1-2. なぜ今やるか (根拠)

- **独自プロトコル の anchor (CLAUDE.md「ファンダメンタル5条件」)** は小型株含めた CF 率 / EPS 成長で判定する設計。 SP500 top 500 のみだと **「打診買い 3 点セット (ファンダ × Cup-Handle × RS80+)」 の対象が大型株に偏り**、 独自プロトコル本来の小型株 alpha を逃す
- **William O'Neil CAN SLIM の L (RS≥80)** は本来 Russell 3000 universe で計算 ([memory: feedback_oneill_screener_frontend_intersection.md](memory/feedback_oneill_screener_frontend_intersection.md))。 SP500 top 500 だと universe が小さく、 RS percentile rank が大型株 bias になる
- **handover v121 RS Screener 初回 cron 結果** で「Top 3 = 半導体 (MU/GLW/INTC) 一極集中」 が観測されたが、 これは **universe = SP500 だから半導体大型に偏った** 説あり。 Russell 3000 で計算すれば中小型 IT / バイオ / energy 等の RS 強者も登場 する見込み
- **competitor moat**: 日本人向け米国株 retail で Russell 3000 universe での O'Neil 流 screening を装備した tool は皆無 (IBD MarketSmith は $69/月、 BeatScanner Premium ¥1,800/月 は同価格帯で同等機能)
- **5/27 daily-digest-20260527 dogfood** で CODX / BRAI / VCIG / CPSH 等の small-cap が話題になっている事実から、 universe 拡大の market demand 確認済

### 1-3. 期待される成果

| 機能 | 現状 (SP500 top 500) | Russell 3000 拡張後 |
|---|---|---|
| Cup-Handle scan 対象 | 約 200 銘柄 (top 200 hardcode fallback) → 500 (Premium plan で 動的) | **3000 銘柄** |
| RS Screener universe | 197 銘柄 (5/27 calc_date) | **~3000 銘柄** |
| O'Neil 完全 chip 月間 該当数 | 月 5-15 銘柄想定 (金融 sub-agent verdict、 SP500 base) | **月 30-90 銘柄想定** (6 倍拡大) |
| 独自プロトコル 該当銘柄の小型株比率 | 5% 未満 (mostly mega-cap) | **30-50%** (小型株 alpha 取込) |
| RS 計算の universe percentile bias | 大型 IT 半導体 一極集中 | 業種 / 時価総額 分散 |

### 1-4. 必読 memory anchor (Generator が SPEC 適用前に必ず読む)

- [feedback_ticker_universe_validation.md](memory/feedback_ticker_universe_validation.md) — universe validation (~45k FMP stock-list) の SSOT、 cache file は本 SPEC と共有
- [feedback_oneill_screener_frontend_intersection.md](memory/feedback_oneill_screener_frontend_intersection.md) — O'Neil 完全 chip、 universe 拡大で月間該当数増の見積根拠
- [feedback_supabase_grant_bug.md](memory/feedback_supabase_grant_bug.md) — pattern_signals / rs_ratings table 拡張時の GRANT 漏れ防止
- [feedback_fmp_ttm_field_map.md](memory/feedback_fmp_ttm_field_map.md) — FMP screener endpoint の TTM field 配置
- [project_fmp_ultimate_deferred.md](memory/project_fmp_ultimate_deferred.md) — FMP Ultimate ($99/月) 見送り判断、 本 SPEC は Premium ($14/月) plan の範囲で完結する必要

---

## 2. 制約

### 2-1. data source 制約

- **FMP に Russell 3000 専用 endpoint は無い**。 ETF 構成 (IWV = iShares Russell 3000 ETF) の holdings 取得 endpoint もない (Premium plan で /etf-holdings は対応するが Ultimate でない)
- **代替**: `/stable/stock-screener?marketCapMoreThan=X&isActivelyTrading=true&exchange=NASDAQ,NYSE,AMEX` で market_cap top N 抽出
- 厳密な Russell 3000 構成と一致しない可能性あり (Russell の rebalance 規則は独自、 RGI 配点等)、 ただし「market_cap top 3000」 で 95%+ overlap 想定 (Russell 3000 自体が market_cap weighted)

### 2-2. FMP rate limit 制約

- Premium plan: 750 req/min
- 現状 cup_scan + rs_scan = 約 200 銘柄 × 2 scan = 400 req、 6 倍で 2400 req = 4 分 分散必要
- batch sleep (例: 50 銘柄/batch + 5 秒間隔) で 5 分 buffer 内に収まる見込み

### 2-3. Supabase 容量 制約

- 現状 `pattern_signals` / `rs_ratings` table 容量: 推定 ~10 MB (200 銘柄 × 90 日 retention)
- 拡張後: 3000 銘柄 × 90 日 = 270k 行 / table × 2 table = 約 540k 行
- 1 行 平均 200 byte → **~100 MB**、 Supabase Free 500MB の **20% 占有**
- Supabase Pro 8GB plan へ将来 アップグレード余地あり、 ただし当面 Free で OK

### 2-4. nightly cron 実行時間 制約

- 現状 cup_scan (UTC 23:00) ~3 分 / rs_scan (UTC 23:30) ~3 分 → 合計 6 分
- 拡張後: 並列化前 = ~18 分、 並列化 (3 workers) = ~6-8 分
- UTC 22:00 article-notify cron と競合しないか確認必要 (現状 article-notify は前日分 send、 24h 前の data 使用なので影響なし)

---

## 3. 設計

### 3-1. data source 実装

**新規 helper**: `backend/app/fmp_client.py` に `_fetch_market_cap_top_n(n: int) -> list[str]`

```python
async def _fetch_market_cap_top_n(n: int = 3000) -> list[str]:
    """FMP stock-screener から market_cap 降順 top N を抽出.

    既存 _fetch_sp500_top_n() と並列、 既存に影響を与えない.
    Returns: ticker symbol list (sorted by market_cap desc).
    """
    fmp_key = os.environ.get("FMP_API_KEY")
    if not fmp_key:
        return []
    # FMP /stable/stock-screener
    # query: marketCapMoreThan=500000000 で大型 + 中小型混在、 limit=3000 で top N
    url = f"https://financialmodelingprep.com/stable/stock-screener?marketCapMoreThan=500000000&isActivelyTrading=true&exchange=NASDAQ,NYSE&limit={n}&apikey={fmp_key}"
    # response: [{symbol, companyName, marketCap, sector, ...}]
    # market_cap desc sort + symbol 抽出
    ...
```

### 3-2. cup_scan / rs_scan の universe parameter 化

**現状**: `_fetch_sp500_top_n(500)` を hardcode で呼出
**改修後**: cron POST body の `universe_size` parameter (default 500、 3000 を渡せば Russell 3000 拡張)

```python
# main.py cron_cup_scan / cron_rs_scan
universe_size = int(body.get("universe_size", 500))
universe_source = body.get("universe_source", "sp500")  # "sp500" | "russell3000"

if universe_source == "russell3000":
    tickers = await _fetch_market_cap_top_n(universe_size)
else:
    tickers = await _fetch_sp500_top_n(universe_size)
```

### 3-3. batch 並列化

**現状**: `for ticker in tickers: ...` の sequential
**改修後**: `asyncio.gather` 3 workers + semaphore で rate limit 制御

```python
async def _scan_batch(tickers: list[str], worker_count: int = 3) -> list[dict]:
    sem = asyncio.Semaphore(worker_count)
    async def _scan_one(t):
        async with sem:
            return await _detect_cup_handle(t)  # or _compute_rs
    return await asyncio.gather(*[_scan_one(t) for t in tickers], return_exceptions=True)
```

### 3-4. Supabase 容量 + GRANT 確認

- pattern_signals / rs_ratings の現在の row count を `select count(*)` で確認
- 90 日 retention cron が機能しているか確認 (現状 月次 cleanup)
- 必要なら retention 60 日に短縮 (容量 33% 削減効果)
- 既存 GRANT は service_role only、 拡張で影響なし (feedback_supabase_grant_bug.md 確認)

### 3-5. UI 影響

- `frontend/src/components/CustomScreenerPanel.jsx` の RS Screener / Cup Scanner results 表示で **universe 範囲を明示** (`universe_size: 3000` を response から表示)
- 「全 3000 銘柄から N 件 (Russell 3000 相当)」 のような 1 行注記、 ProTeaser でも同表記
- chip / filter logic は不変、 backend の universe 拡大のみ frontend で透過的に伝達

### 3-6. railway.toml cron schedule 調整

- 現状: cup-scan UTC 23:00 / cup-notify 23:15 / rs-scan 23:30
- 拡張後 (並列化 ~8 分想定): cup-scan UTC 23:00 / cup-notify 23:15 (変更なし、 15 分 buffer 十分) / rs-scan 23:30 (変更なし、 8 分以内に完了)
- 並列化失敗で 30 分超過した場合の fallback: `--max-time 1200` (20 分) を超えた場合は cron 自体は SIGKILL されるため、 batch 内で 1 batch 完了ごとに progress log 出して途中で中断しても recoverable な設計

---

## 4. 工数細分化

| Phase | Task | 工数 |
|---|---|---|
| 1 | a. FMP stock-screener endpoint 検証 + `_fetch_market_cap_top_n()` 実装 | 0.3 人日 |
| 1 | b. cup_scan batch 並列化 (`_scan_batch()` + asyncio.gather) | 0.3 人日 |
| 1 | c. rs_scan batch 並列化 (cup_scan と共通 helper) | 0.2 人日 |
| 2 | d. Supabase 容量計測 + 90 日 retention 確認 + (必要なら) 60 日短縮 migration | 0.1 人日 |
| 2 | e. UI universe_size 表示 + dogfood verify | 0.1 人日 |
| **合計** | | **1.0 人日** |

**Phase 1 だけで 0.8 人日 = 「top 1000」 試行で release MVP gate 通過に十分**。 Phase 2 (top 3000 + UI 統合) は 1 週間運用後判断。

---

## 5. 段階展開 (リスク 分散)

### Phase 1: market_cap top 1000 試行 (3 倍拡大)
- nightly batch 時間 ~6 分以内に収まる見込み (現状 ~3 分 × 2 = 6 分、 並列化前)
- cost 影響軽微 (FMP Premium plan 内、 Supabase Free 内)
- 1 週間 dogfood: O'Neil 完全 chip の月間該当数 / RS Top 銘柄 分布 / 業種多様性 を計測
- **判定基準**: 月 30+ 銘柄、 業種 3+ 分散、 dogfood で「知らない小型株が出る」 体験

### Phase 2: top 3000 拡張 (Russell 3000 相当)
- Phase 1 で運用品質確認後 着手
- Supabase 容量 100MB 想定 (Free 500MB の 20%)、 容量 alert 設定推奨
- nightly batch 並列化 (3 workers) で 8 分以内 完了
- **判定基準**: 月 60+ 銘柄該当、 retention 90 日でも Supabase Free 内、 user dogfood ROI 確認

---

## 6. リスク

### 6-1. FMP rate limit 超過
- 並列化 3 workers + 50 銘柄/batch + 5 秒間隔 で 750/min 内に収める
- 万一超過: Premium plan upgrade ($14 → $99 = Ultimate) は最終 option、 まず batch interval を 10 秒に拡大

### 6-2. Supabase 容量 alert
- 100MB 占有想定、 Free 500MB の 20% で安全圏内
- ただし将来の他 table 拡張 (article body_md / notification_dispatch_log) で 圧迫する可能性
- 60 日 retention 短縮で 33% 削減効果あり、 Phase 2 で実施

### 6-3. nightly cron 30 分超過
- batch 並列化失敗時の fallback: 1 batch ごと Supabase upsert で途中中断でも 半 recover
- 究極的には Railway native cron の `--max-time 1200` (20 分) で SIGKILL される、 daily run なので 1 日 skip しても回復可能

### 6-4. universe 拡大による LLM 品質 影響
- writer.py source_facts は per-ticker fetch、 universe 拡大の影響なし
- ただし daily-digest gainers 抽出が universe 拡大で diverse 化、 writer は「知らない小型株」 に対する narrative 品質を保つ必要 → 文体憲法 v3 + ticker universe validation で 構造的に予防済 (5/27 着地)

### 6-5. competitor moat の 過剰演出
- 「Russell 3000 universe」 は marketing claim として強い、 ただし FMP stock-screener 経由の市況時総額 top 3000 = 100% 一致しない (Russell rebalance 規則は独自)
- LP / marketing で「Russell 3000 相当」 表記推奨 (景表法 §5「優良誤認」 回避)

---

## 7. multi-review 3 体合議推奨

**Phase 1 着手前に必須**:
1. **金融-verdict** (Opus): 独自プロトコル小型株重要性 + O'Neil 流 universe 妥当性、 marketing claim 整合
2. **sre / 基盤** (Sonnet): FMP rate limit + Supabase 容量 + nightly cron 実行時間 試算の妥当性
3. **frontend-architect** (Sonnet): universe_size 表示 + ProTeaser 文言 + chip / filter logic 影響範囲

合議 timing: SPEC §3-1 / §3-2 / §5 Phase 1 判定基準を 3 体で査読、 verdict 6/6 賛成で着手。

---

## 8. 実装着手の前提

- handover v124 残バックログ「FMP_API_KEY を GitHub Actions secret 化」 が 5/28 起床後 user setup 完了している前提 (tickers-cache.json 週次 cron 用と同 secret 流用)
- Phase 1 着手前に Phase 0 として「現状 Supabase 容量 計測」 1 SQL 実行で base line 確認 推奨

---

## 9. 関連 SPEC / 過去経緯

- `SPEC_2026-05-17_cup-handle-phase1.md` — Cup-Handle screener Phase 1 確定 SPEC (同 universe 拡大議論あり)
- handover v121 §RS Screener Phase 1 — 初回 cron 結果で半導体一極集中、 universe SP500 base が真因と推定
- memory `feedback_oneill_screener_frontend_intersection.md` — O'Neil 完全 chip の universe 拡大影響予測 (月 5-15 → 30-90)
- memory `project_fmp_ultimate_deferred.md` — FMP Ultimate plan 見送り判断、 本 SPEC は Premium plan 範囲で完結

---

## 10. 次 action

user 起床後の意思決定:
1. SPEC レビュー (本 file `docs/specs/SPEC_2026-05-27_russell3000-expansion.md`)
2. multi-review 3 体合議 (planner skill or 直接 3 sub-agent 並列起動)
3. verdict 6/6 賛成で Phase 1 着手 (0.8 人日 = 1-2 deploy)
4. 1 週間 dogfood 後 Phase 2 判定 (0.2 人日)
