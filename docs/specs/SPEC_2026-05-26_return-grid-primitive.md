# SPEC 2026-05-26: ReturnGrid primitive (ETF + 個別株 Pane 3 共通の各期間リターン chip grid)

> **Status**: 起票 (Planner 着地)、 user 承認待ち (gate 1)
> **想定総工数**: 1.8-2.4 人日 (Engineering agent 推奨 ~2 人日と整合)
> **multi-review**: **3 体合議** (ui-designer + frontend-architect + qa-dogfooder) で十分。 §7 で根拠記載
> **既存 verdict 引用元**: 本 session 直前の multi-review 3 体合議 (投資視点 + UI/UX + engineering 完全一致で最優先機能)

---

## 1. Context

### user prompt 原文
> ETF + 個別株 Pane 3 横断の ReturnGrid primitive を実装したい。 主目的: (1) 各期間 return % grid (1W/1M/3M/6M/1Y/3Y/5Y/10Y) を chip 並列で表示、 (2) ETF Panel (EtfOverviewPanel.jsx) の Row 1/Row 2 間に mount、 (3) 個別株 Pane 3 (JudgmentDetail.jsx) の KpiStrip 直後 or StockPriceChart 直上に mount、 (4) ETF Panel に StockPriceChart も mount。

### なぜ今やるか (根拠)
1. **multi-review 3 体合議 verdict (本 session 直前)**: 投資視点 / UI/UX / engineering の 3 観点完全一致で「最優先機能」 と converge。 ETF + 個別株 両方の「各期間リターン穴」 を 1 sprint で同時解消できる ROI が他施策を上回る。
2. **handover v118 §「次 session 最優先」** との非競合: R9.1 TL;DR box fix は記事系 frontend (article CSS) で本 SPEC scope と排他。 並走可能。
3. **既存資産再利用**:
   - `KpiStrip` (`auto-fit minmax(130px, 1fr)` grid) は 7-8 chip の折返しに自然対応 → ReturnGrid は KpiStrip と同じ grid pattern で「**adapter primitive**」 として軽量実装可能。
   - `FMPClient.historical_price` (`/stable/historical-price-eod/full`) は既に backtest / ETF panel で使用済、 新規 SDK / 認証作業不要。
   - `_fetch_close_map_for_backtest` (main.py:3981) と `_PORTFOLIO_HISTORY_CACHE` cache pattern を流用可。
4. **handover v85+ 「Chart hybrid (Webull 戦略)」 着手前の前提整備**: ETF Panel に StockPriceChart mount は chart hybrid 構想の小型 dry-run としても価値。

### 期待される成果 (5 原則 mapping)
- **§1 (読み手に負担をかけない、 2 秒理解)**: 1W〜10Y の return % が **1 row chip 並列** で並ぶ → 「3M -1.2% / 1Y +18% / 5Y +120%」 を 2 秒で把握。
- **§3 (シンプルかつリッチ)**: KpiStrip primitive の grid auto-fit で「8 chip 自然折返し + tabular-nums + 投資業界色ルール (gain 緑 / loss 赤)」 のリッチ表現を low effort で達成。
- **§4 (1 クリックを減らせ)**: 今まで StockPriceChart で期間切替 toggle が必要だった「3Y どうだった?」「10Y は?」 を **0 click で全期間並列**。
- **§5 (図解で認知コストを下げろ)**: 数字 + sparkline mini glyph (Phase 2 で検討、 Phase 1 では数値のみ) で長文説明を完全排除。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

「**驚き (surprise)** + **興奮 (excitement)** + **洗練さ (sophistication)**」 の 3 感情語彙に直接効く。

- **驚き**: 個別株を分析した瞬間「1Y +18%, 3Y +95%, 5Y +210%」 が一斉に並ぶ first impression は、 ロビー入場時の「壁面 8 連 chandelier 一斉点灯」 メタファに直対応。 v97 G-2 で確立した「Pane 3 上部 anchor 強化」 idiom の延長。
- **興奮**: gain 緑 / loss 赤 が 8 chip 上で混在することで「動いている市場の歴史」 を 1 row で表現 (§-1 表「動いている感」)。
- **洗練さ**: typography 階層 (Stat fw700 lh1.05) + tabular-nums + 「年率」 表記しない正確性 = 投資 verbose を避ける Bloomberg / Linear Insights idiom。

`feedback_brand_aspiration.md` の 5 感情語彙 anchor は不変、 本 SPEC は追記のみで違反なし。 修正禁止 anchor 不触。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言 / 既存 UI 表記との整合 4 項目:

| # | チェック項目 | 整合根拠 |
|---|---|---|
| 1 | LP 訴求「**登録不要で米国株を分析**」 と矛盾しない | ReturnGrid は判定タブ 内部表示、 登録 modal / 認証 gate を一切追加しない |
| 2 | LP 訴求「**3 銘柄/日まで無料**」 demo rate limit と矛盾しない | `/api/period-returns/{ticker}` も既存 3 req/IP/day demo limit middleware を継承 (`feedback_bypass_token.md` BYPASS_TOKEN 例外も継承) |
| 3 | 既存 KpiStrip の「Pane 3 上部 6 chip × 130px」 折返し設計と衝突しない | ReturnGrid は **KpiStrip の直後** (個別株) / **Row 2 の後** (ETF) に新規 section として配置、 既存 chip の幅 / 折返しを変更しない |
| 4 | 「年率」 表記禁止 (user 要求 §「制約」 #5) | 1Y/3Y/5Y/10Y は **cumulative return %** であることを period chip label 直下 hint (12px muted text)「累積」 で明示。 「年率換算 (CAGR)」 表記は Phase 2 以降に deferred |

数値の意味曖昧化リスクは 4 項全て事前防御。

---

## 4. Hallucination Guard 適合

**LLM 呼び出し: なし (no)**

`hallucination-guard` skill 不要。 静的 Python 計算 + 数値のみ表示で完結する idiom。 `STATE_LABEL_JP` (Phase 5.5 condition pulse) と同パターン。

- backend `/api/period-returns/{ticker}` は **`backend/app/` 直下 (aggregator/ でも visualizer/ でもない)** に置く新規 endpoint で、 LLM SDK import 不要 / `prompt.py` 不触 / `prompt_negatives.py` 不触。
- 数値計算は `(close_today - close_period_start) / close_period_start * 100` の純 Python 算術のみ、 narration / 評価文言 / 「強気」「絶対」 等は **生成しない**。
- frontend sanitize layer も不要 (LLM 出力経由しないので BLOCKLIST_REGEX 適用対象外)。 ただし表示 string は **数値 + period label のみ**、 narration string を `<p>` で render しないことを Generator に明示指示。

→ `feedback_llm_calc_separation.md` の「数値は Python」 原則そのまま、 違反 risk なし。

---

## 5. スプリント分割 (全 6 sprint、 1.8-2.4 人日)

### Sprint 1: backend `/api/period-returns/{ticker}` endpoint 新設 (0.5 人日)

**目的**: 個別株 + ETF 共通の「8 期間 cumulative return %」 を 1 call で返す軽量 endpoint を Python で実装。

**触るファイル**:
- `backend/app/main.py` (新規 `@app.get("/api/period-returns/{ticker}")` 追加、 既存 `_fetch_close_map_for_backtest` ロジック流用)

**呼ぶ既存 skill**: `fmp-api-retry` (FMP `/stable/historical-price-eod/full` retry / 429 handling)

**完了判定基準**:
- `curl https://beatscanner-production.up.railway.app/api/period-returns/AAPL` で以下 JSON が返る:
  ```json
  {
    "ticker": "AAPL",
    "as_of": "2026-05-26",
    "periods": {
      "1W":  { "return_pct": 1.23, "from_date": "2026-05-19", "to_date": "2026-05-26", "available": true },
      "1M":  { "return_pct": ..., "available": true },
      "3M":  { ... },
      "6M":  { ... },
      "1Y":  { ... },
      "3Y":  { ... },
      "5Y":  { ... },
      "10Y": { ... }
    },
    "source": "fmp",
    "cached": false
  }
  ```
- 設定日 (inception_date) 前は `{ "return_pct": null, "available": false }` で fallback。
- cache key `period_returns::{TICKER}::{TODAY_ISO}` で in-memory dict (TTL 6h、 既存 `CACHE_TTL_EARNINGS` 流用)。
- 1W は **7 calendar days** (土日 含む) で前日終値比較 → 該当日無ければ前後 ±10 日で fallback (`_PORTFOLIO_HISTORY_CACHE` の lookup idiom 流用)。 「week-over-week vs 5 営業日」 判定は **7 calendar days** で確定 (一般投資家の「先週比」 感覚に近い、 user 要求 §「(nice) 1W 休場日 handling」 の最簡 解)。
- FMP rate limit 配慮: 10Y fetch は `from=YYYY-MM-DD` 1 回 / `to=today` で 1 ticker あたり 1 request、 同 ticker 1 日 1 回まで cache hit。
- demo rate limit middleware を継承 (LP 「3 銘柄/日まで無料」 整合)。

---

### Sprint 2: ReturnGrid primitive (frontend) (0.4 人日)

**目的**: KpiStrip と同じ grid pattern で「8 期間 return % chip」 を render する軽量 component を新規作成。

**触るファイル**:
- `frontend/src/features/judgment/primitives/ReturnGrid.jsx` (**新規**)
- `frontend/src/hooks/usePeriodReturns.js` (**新規**、 fetch + cache wrapper)

**呼ぶ既存 skill**: `designing-workspace-ui` (Pane 3 primitive 配置 + token 遵守)、 `design-system-check` (raw hex 禁止 / elevation whitelist)

**完了判定基準**:
- `ReturnGrid({ ticker, asOf?, periods? })` で render 可能、 `Stat` primitive (既存) を 8 個 grid auto-fit で並べる。
- grid: `gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 'var(--space-4, 16px)'` (KpiStrip 130px より狭めて 8 chip 一行優先)。
- 各 chip:
  - label: `1W` / `1M` / `3M` / `6M` / `1Y` / `3Y` / `5Y` / `10Y` (英数字 uppercase、 KpiStrip と統一)
  - value: `+1.23%` / `-4.56%` / `—` (欠損は em-dash、 design_recipes §C-9 遵守)
  - trend: `return_pct > 0 ? 'up' : 'down' : 'neutral'` (Stat primitive が緑/赤色付け)
- `available: false` の chip は em-dash + opacity 0.5 + hint 「設定日前」 (12px muted)。
- `data-testid="return-grid"` 必須 (Generator self-eval の grep 通過)。
- raw hex 0 件、 `elevation_scale.md` whitelist 違反 0 件。

---

### Sprint 3: ReturnGrid を JudgmentDetail (個別株 Pane 3) に mount (0.3 人日)

**目的**: 個別株 Pane 3 で KpiStrip 直後に ReturnGrid を mount、 「各期間リターン穴」 解消。

**触るファイル**:
- `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (line ~648 KpiStrip 直後に挿入)

**呼ぶ既存 skill**: `designing-workspace-ui` (mount 位置の Pane 3 grammar 整合確認)

**完了判定基準**:
- `<KpiStrip stats={kpis} frameless={v2Frameless} />` の直後に `<SectionFade staggerIndex={...}><ReturnGrid ticker={selectedTicker} /></SectionFade>` を mount。
- `result && selectedTicker` を guard (ETF / data 無しでは render しない、 §6 ETF mount は Sprint 4 で別途)。
- `SectionFade` の `staggerIndex` は既存 `TriageBanner` (0) と `EpsBeatStreakChip` の間に挟むため `staggerIndex={0.5}` 相当の値を見て手動調整 (Generator 判断、 Planner は指定しない)。
- production deploy 後、 `curl ...` で bundle に `return-grid` testid が含まれ、 5 銘柄 (AAPL/MSFT/NVDA/GOOGL/SPY) で chip 8 個表示確認。
- CLS budget: ReturnGrid の `minHeight: 80px` envelope を root に設定 (`feedback_cls_envelope_pattern.md` 適用)。

---

### Sprint 4: ReturnGrid + StockPriceChart を EtfOverviewPanel に mount (0.4 人日)

**目的**: ETF Panel の Row 1 / Row 2 metric 間に ReturnGrid、 sector breakdown の後に StockPriceChart を mount。

**触るファイル**:
- `frontend/src/components/EtfOverviewPanel.jsx` (Row 1 直後に ReturnGrid 挿入、 sector breakdown の後に StockPriceChart 挿入)

**呼ぶ既存 skill**: `designing-workspace-ui` (ETF Panel 既存 grammar との整合)、 `chart-tab` (StockPriceChart ETF mount で fallback / 欠損 handling 確認)

**完了判定基準**:
- Row 1 (AUM / TER / 1Y Return / 設定日) の直後に SectionHeader「**各期間リターン**」 + ReturnGrid を mount。
  - ETF Panel 既存の Row 1 内の「1Y Return」 chip は **維持** (ReturnGrid 全体は補完情報として並走、 重複表示は 1 chip のみで許容)。 Phase 2 で削除判断 deferred。
- sector breakdown の後 (`</section>` 直前) に `<StockPriceChart ticker={ticker} isPremiumUser={false} />` を mount。
  - ETF は **常に free user 扱い** で mount (FMP plan 制約と本 SPEC 無関係、 chart は折れ線 default で表示)。
- ETF 入力時 (SPY/QQQ/VOO/IVV/VTI) の 5 銘柄で dogfood: chart 描画 + ReturnGrid 8 chip 描画 + Trust Cliff 文言「ETF 専用の主要指標をお届けします」 維持。
- `data-testid="etf-return-grid" / "etf-stock-chart"` 必須。

---

### Sprint 5: 3 体合議 multi-review (0.3 人日)

**目的**: ui-designer + frontend-architect + qa-dogfooder の 3 体並列 review で「最優先 fix 5 件以内」 を抽出、 Sprint 6 で着地。

**触るファイル**: なし (review session のみ)

**呼ぶ既存 skill**: `multi-review` (3 体合議 workflow、 `feedback_multi_review_3_panel_workflow.md` SSOT 遵守)

**完了判定基準**:
- 3 reviewer から各 5 verdict 以内 (合計 ≤ 15 verdict)。 重複 merge 後の Must-fix が 5 件以内であること。
- 主な review 軸:
  - ui-designer: Pane 3 上部密度 / KpiStrip と ReturnGrid の視覚区別 / chip label 表記 / 色運用
  - frontend-architect: usePeriodReturns hook の cache strategy / Suspense / error boundary / CLS envelope 適用
  - qa-dogfooder: 5 銘柄 + 5 ETF dogfood で欠損 chip / inception_date 前 / 10Y fetch timeout の actual behavior
- Verdict 集約後、 Sprint 6 で fix 着地、 もしくは Phase 2 へ deferred。

---

### Sprint 6: multi-review fix + production deploy (0.3 人日)

**目的**: Sprint 5 verdict の Must-fix 着地 + `railway up` deploy + 本番 smoke test。

**触るファイル**: Sprint 5 verdict で特定された箇所のみ (Planner 段階で予測不能、 Generator が動的判断)

**呼ぶ既存 skill**: `pge-loop-debugger` (deploy 後の bundle hash 変化 verify)、 `release-check` (CLAUDE.md 違反 + Trust Cliff + 4 重防御の最終 gate)

**完了判定基準**:
- `railway up` 完了、 bundle hash 変化確認、 production URL で 10 銘柄 (5 株 + 5 ETF) 動作確認。
- CLAUDE.md 違反 0 件 (raw hex / preview server / 「じっちゃま」 UI 露出 等)。
- demo rate limit smoke test: `feedback_demo_rate_limit_smoke_test.md` SOP 遵守 (`jq keys` で response 構造確認、 `{"detail":"本日の..."}` を regression と誤認しない)。
- handover_2026-05-XX_v119.md に commit hash / bundle hash / 着地ファイル一覧記録。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

本 SPEC 全 sprint 共通の禁止領域。 該当しない sprint でも明示遵守:

| ファイル / 領域 | 禁止理由 | 本 SPEC 該当 sprint |
|---|---|---|
| `backend/app/visualizer/prompt.py` | Hallucination Guard pre-commit Check 1 (LLM 数値計算指示 BLOCK) | 全 sprint 不触 (LLM 不要) |
| `backend/app/aggregator/*.py` への LLM SDK import 追加 | pre-commit Check 3 (aggregator は数値物理層) | Sprint 1 で `main.py` 直下に endpoint 追加、 aggregator/ には一切 import 追加しない |
| `backend/app/visualizer/prompt_negatives.py` | 法務 anchor (BAD 1-6) | 全 sprint 不触 |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` 配列 | typo 修正以外禁止 | 全 sprint 不触 (LLM 出力経由しない) |
| `.claude/launch.json` | 人間用 | 全 sprint 不触 |
| `migrations/*.sql` | DB schema 不変 | 全 sprint 不触 (本 SPEC は DB schema 変更なし) |
| `handover_*.md` (read-only reference) | 過去ログ | 全 sprint 不触 |
| `railway.toml` cron 定義 | 既存 cron 維持 | 全 sprint 不触 (新規 cron 不要) |
| `frontend/src/App.jsx` の sticky 検索 div (`.sticky-search-band`) | 8 回試行錯誤の安定領域 (`design_recipes §C-6`) | 全 sprint 不触 |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | 発光バグ高リスク (v54-v62 6 セッション溶解) | Sprint 4 で `EtfOverviewPanel` 既存 `.bs-panel` を維持、 CSS 改変しない (JSX 内で section 追加のみ) |
| `frontend/scripts/snap-*.mjs` の **既存** スクリプト | visual harness exception 4 条件遵守 | 全 sprint 不触 (新規追加 snap script は Sprint 5 dogfood 時のみ許容、 必要なら別途) |
| `KpiStrip.jsx` 内部 | v111 で確定済 chip 数 6 + minmax 130px の安定領域 | Sprint 3 で **直後に新規 mount するのみ**、 KpiStrip 内部編集禁止 |
| `EtfOverviewPanel.jsx` 既存 sector breakdown / MetricChip 内部 | v118 R9.4 multi-review 着地済 | Sprint 4 で **新規 section 追加のみ**、 既存 chip / SectorBar 内部編集禁止 |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 3 軸を本 SPEC に適用:

| 軸 | active 判定 | 根拠 |
|---|---|---|
| 1. LLM 出力品質 (景表法 / 金商法 / hallucination risk) | **inactive** | §4 で LLM 不使用確定、 純数値計算 |
| 2. Trust Cliff (LP 訴求 vs 実装の整合) | **partial** | LP 「3 銘柄/日まで無料」 demo limit 継承で対応済、 新規 訴求文言追加なし。 §3 で 4 項目整合確認済 |
| 3. 新 backend endpoint + RLS / 認証境界 + cache 設計 | **partial** | 新 endpoint 1 個 (`/api/period-returns/`) だが **既存 cache pattern 流用** (`_PORTFOLIO_HISTORY_CACHE` + `safe_fmp_get`) + RLS 不要 (auth 不要、 public endpoint)。 blast radius 小 |

**判定: 3 体合議で十分**

**根拠 1 行**: LLM 不使用 + 既存 endpoint pattern 流用 + frontend 局所 mount (KpiStrip 直後 + ETF Panel 内 2 箇所) のみ。 Anthropic verdict pattern「設計判断が limited」 完全該当。 reviewer 構成は **ui-designer + frontend-architect + qa-dogfooder** (Sprint 5)、 cost 30-50% 圧縮 適用。

---

## 8. 想定リスク + roll-back plan

### 想定リスク

| # | risk | 影響 | 確度 |
|---|---|---|---|
| R1 | FMP `/stable/historical-price-eod/full` で 10Y (3650 日) fetch が rate limit / timeout | ReturnGrid の 10Y chip が `—` で fallback、 UX 軽微劣化 | 中 |
| R2 | inception_date 前期間 (例: NVDA 1999 以前) の return 計算で start price null → division by zero | exception → 500 / endpoint 全体崩壊 | 中 (Sprint 1 で `available: false` fallback 必須) |
| R3 | ReturnGrid の grid auto-fit minmax(110px) が workspace mode (Pane 3 width 500-700px) で 4+4 / 3+3+2 折返しで美観劣化 | 「驚き」 感情語彙の violation、 user 体感低下 | 中 (Sprint 5 dogfood で確認、 minmax 値 fine-tune) |
| R4 | StockPriceChart の ETF mount で `isPremiumUser={false}` 固定が candle toggle UI 露出と矛盾 (FMP Premium plan 必要) | Trust Cliff (Premium UI が free user に見える) | 低 (StockPriceChart 既存実装が isPremiumUser 判定済、 false で candle hide 確認) |
| R5 | KpiStrip 直後 mount で Pane 3 上部「驚き」 chip 密度が過多 (8 + 6 = 14 chip 一気目視) | §-1-A「First fold 至上主義」 + 「写真集ではなくダッシュボード」 違反、 「詰め込み」 体感 | 中 (Sprint 5 で ui-designer 判定、 SectionHeader 「各期間リターン」 で hierarchy を作るのが Sprint 4 と同パターン) |

### Roll-back plan

| シナリオ | roll-back 手順 |
|---|---|
| Sprint 3 mount 後 Pane 3 が真っ白 | `git revert <commit>` → `railway up` で前 bundle 復帰。 ReturnGrid mount を JSX で `{false && <ReturnGrid .../>}` に短絡 (feature flag dual mode 適用、 `feedback_feature_flag_dual_mode.md`) |
| Sprint 4 後 ETF Panel が崩壊 | StockPriceChart mount を Conditional render で外す (`{false && <StockPriceChart .../>}`)、 ReturnGrid のみ残して partial deploy |
| `/api/period-returns/{ticker}` が 500 多発 | frontend hook で `data: null` fallback → ReturnGrid 全 chip `—` 表示 (graceful degradation)。 endpoint 自体は revert 不要、 Sprint 1 fix 後 redeploy |
| FMP rate limit で 429 連発 | 既存 `safe_fmp_get` retry が backoff 既定、 cache TTL を 6h → 24h に延長で対応 (main.py 定数 1 行変更) |
| 全体 abort | `git revert <Sprint 1〜4 の 4 commit>` で 1 commit ずつ revert、 production bundle hash で復帰確認 |

各 sprint 完了時に `git commit` (proactive commit `feedback_commit_proactive.md` 遵守) で revert 単位を細分化。

---

## 9. Generator への引き渡し情報 (gate 1 通過後)

user 承認後、 Generator subagent に渡す情報:

- **SPEC path**: `docs/specs/SPEC_2026-05-26_return-grid-primitive.md`
- **Sprint 1 開始指示**: 「`backend/app/main.py` に `/api/period-returns/{ticker}` 新規追加。 `_fetch_close_map_for_backtest` (line 3981) ロジック流用、 8 期間 (1W/1M/3M/6M/1Y/3Y/5Y/10Y) cumulative return %、 cache key `period_returns::{TICKER}::{TODAY_ISO}` TTL 6h。 LLM SDK import 一切なし。 完了判定は SPEC §5 Sprint 1。」
- **必読 anchor**: `feedback_llm_calc_separation.md` (数値 Python 物理層分離) / `feedback_demo_rate_limit_smoke_test.md` (smoke test SOP) / `feedback_cls_envelope_pattern.md` (Sprint 3 minHeight envelope)
- **呼ぶべき skill**: Sprint 1 = `fmp-api-retry` / Sprint 2-4 = `designing-workspace-ui` + `design-system-check` / Sprint 5 = `multi-review` (3 体構成) / Sprint 6 = `pge-loop-debugger` + `release-check`

---

## 10. 次のアクション (Planner → User → Generator)

user に AskUserQuestion で「採用 / 修正指示 / 中止」 の 3 択を仰ぐ。 採用なら Sprint 1 から Generator 起動。
