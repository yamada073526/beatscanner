# SPEC 2026-05-26: 機関投資家向け TTM バリュエーション panel (個別株 Pane 3)

> **status**: planner draft (user 承認待ち)
> **見積**: 2-3 人日 (handover v118 / v119 残バックログ転載と一致)
> **mount 位置**: 個別株 Pane 3 / ReturnGrid 直後 / TriageBanner より前

---

## 1. Context

### user prompt 原文
> 機関投資家向け改善: TTM 指標 / FCF Yield / EV/EBITDA panel を個別株 Pane 3 に追加。 handover v118 § 機関投資家向け改善 (2-3 人日)。

### なぜ今やるか (根拠)
1. **handover v118 § 残バックログ + v119 §「次 session 最優先タスク #2」 で 2 セッション連続 carry-over** された 2-3 人日の未着手案件。 release MVP 強化 phase で機関投資家層への訴求が薄いことが課題として明確化されている。
2. **既存 backend endpoint `/api/valuation-extras/{ticker}` が必要 raw data の 80%+ を既に fetch 済**: `ratios-ttm` + `key-metrics-ttm` + `cash-flow-statement?period=quarter&limit=4` の 3 source 並列 fetch + sources schema (per-source ok/empty/timeout/error) + 12h cache が稼働中。 これに **field を追加抽出するだけ** で本機能の 80% が満たせる。 ゼロから endpoint を作るより blast radius が圧倒的に小さい。
3. **FMP Premium plan ($49/月) は既に契約済**、 ratios-ttm + key-metrics-ttm + cash-flow 系は全て **Premium で取得可能** (Ultimate plan は別物、 見送り済 [[project-fmp-ultimate-deferred]])。 追加課金不要。
4. **KpiStrip は v112 multi-review で 6 chip にロックダウン済** (PEG 削除済、 「7 chip → 折返し」 解消)。 これに TTM 系を追加すると Pane 3 width 500-700px で再び 8 chip 折返し問題が発生する。 → **KpiStrip に追加せず別 panel として分離** する設計が user 制約に一致 (mount 位置「ReturnGrid 直後」 = KpiStrip と物理分離)。

### 期待される成果 (5 原則どれに貢献するか)
- **原則 1「読み手に負担をかけない (2 秒理解)」**: TTM / FCF Yield / EV/EBITDA を「バリュエーション」 section として 1 ブロックに集約、 KpiStrip (6 chip = 短期 / 株価 / verdict 系) とは別の意味階層を作る → 機関投資家は「バリュエーション section」 に直接視線が飛ばせる。
- **原則 3「シンプルかつリッチ」**: 機関投資家標準 3 指標 (TTM 売上高 / EPS / FCF Yield / EV/EBITDA / Op Margin / Debt-to-Equity) を **honest 数値のみ + sub-text 簡素説明** で出す。 「割安」「割高」 等の judgment 文言を一切付与しないことで Trust Cliff 0、 ブランド品格維持 (Aman ロビー比喩: 「数字を語らせる、 主観を語らない」)。

### ブランド世界観 (§-1) との関係
個別株 Pane 3 = §-1 ロビー (俯瞰モード) と villa (精読モード) のハイブリッド (handover v82 §-1-B postmortem 経由)。 今回の TTM panel は **villa 寄り (機関投資家が「数値を精読する」 時の空間)**。 「驚き」 ではなく **「洗練さ + 滋味 (subtle richness)」** に効く: Bloomberg Terminal や Koyfin に見られる「数値の整列美」 + 「桁数フォーマット統一」 + 「単位を視覚から逃さない」 デザイン語彙で機関投資家層の信頼を獲得する。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

### どの感情語彙に効くか
**洗練さ (sophistication)** が主、 **滋味 (subtle richness)** が従。

- **typography 階層**: 数値は `tabular-nums` (KpiStrip と同等)、 sub-text は `text-muted` で輝度を一段落とす。 「桁数を読み違えない」 安心感 = §-1 「洗練さ」 視覚表現の Linear-style focus-visible + Stripe Sigma の数値整列イディオムに準拠。
- **静寂 (適度な余白)**: ReturnGrid (8 chip × 4×2 grid) と FiveConditionsCard (情報密度高) の間に挟まる panel として、 **情報密度は中** (6-8 数値 + 各 1 行 sub-text) に抑え、 §-1-A 「静を 2 / 動を 1」 原則を維持。 緊急 chip / amber tint / pulse animation は一切なし。
- **「驚き」 を避ける**: 入場 ring / hover lift は KpiStrip と同強度の中強度 (`.is-arriving` 1 セット + hover compound 4 セット必須 §C-2)。 これ以上は villa の「脱力」 を破壊する。

### feedback_brand_aspiration.md anchor 不破壊
本 SPEC は §-1 / §-1-A / §-1-B の anchor を一切修正しない。 5 感情語彙を消費する側として「洗練さ」 を 1 つ追加するのみ。 既存 panel (KpiStrip / ReturnGrid) と並ぶ「3 つ目の主要 valuation surface」 になることで、 Pane 3 全体のレイヤー戦略 (短期 chip / cumulative return / TTM valuation / 5 条件) が明確化される。

---

## 3. Trust Cliff チェックリスト

### LP 訴求文言との整合
1. **「決算 Beat/Miss を 2 秒で判定」**: 本 panel は 5 条件判定の **補強情報** であり、 verdict を上書きしない (overall verdict は依然 5 条件で確定)。 LP の「Beat/Miss 判定 2 秒」 訴求と衝突せず、 むしろ「Beat だが PER 50 倍 EV/EBITDA 60 倍 = バリュエーション割高」 という補完情報を提供 → 訴求強化方向。
2. **「3 銘柄/日まで無料」**: 既存 `/api/valuation-extras/{ticker}` は `runAnalyze` 経由で初回 fetch される (現状 KpiStrip の Forward P/E / 配当性向 / 自社株買い 取得経路と同じ)。 **本 SPEC で rate limit / Pro tier gate を追加しない** (既存 demo IP rate limit 3 req/IP/day で十分、 LP 文言 unchanged)。
3. **「登録不要」**: backend endpoint は既存、 認証境界も既存 (`request: Request` の `_get_fmp_key` 経由)。 認証フロー一切不変。

### 文言整合追加チェック
- **「機関投資家向け」 という UI 表記禁止**: LP は「個人投資家向け」 のクラス課題提出物。 panel header は **「バリュエーション (TTM)」** 等 neutral 表記。 「機関投資家」 文字列を UI に出さない (内部資料・コメントには可)。
- **judgment 文言の禁止**: 「割安」「割高」「適正」 等の単語を UI に一切出さない (handover v82 §景表法 §5 / 金商法 §38 配慮、 valuation-extras endpoint の docstring 「narration / 警告 chip なし、 純数値のみ」 に準拠)。
- **「最新更新 X 分前」 の併記**: CLAUDE.md 「動的データには最終更新 X 分前を併記」 ルールに従い、 `valuationExtras.fetched_at` を panel footer に「最終更新 X 時間前」 等で表示 (12h cache のため「分」 でなく「時間」 単位で十分)。

---

## 4. Hallucination Guard 適合

### LLM 呼び出しを含むか
**No (LLM 不要、 Python 数値抽出 + 静的 dictionary label / sub-text で完結)**

### 適用方針
- **既存 4 重防御 2-4 層は変更不要** (本 SPEC で LLM 経路を一切追加しない)。
- backend は `aggregator/` パッケージへの LLM SDK import 既禁 (pre-commit Check 3)、 本 SPEC は `aggregator/` 不触で `main.py` 内 `/api/valuation-extras/{ticker}` 直編集 (現状の structure 踏襲)。
- frontend は新 component `TtmValuationPanel.jsx` を新規追加、 全 narration は **静的日本語 dictionary** (`TTM_LABEL_JP = { ttmRevenue: 'TTM 売上高', ... }` 形式、 Phase 5.5 condition pulse の `STATE_LABEL_JP` pattern 横展開 [[feedback-condition-pulse-pattern]])。
- 数値 fallback は既存 valuation-extras の sources schema を踏襲、 `sources.X === 'ok' && data.X != null` の compound check で「—」 表示 (Trust Cliff 防止)。
- BLOCKLIST_REGEX 経路は本 SPEC で発火しない (LLM 出力なし) が、 万一 sub-text に動的文字列を入れた場合に備え、 sub-text は **完全静的文字列のみ** とする (例: 「直近 4Q 合算」)。

### 「ちょっと LLM に補足解説させたい」 誘惑への対策
SPEC §6 で **「LLM narration を将来追加する場合は別 sprint で 6 体合議必須」** と明記する。 本 sprint は LLM 経路ゼロで完結させる。 これは handover v82 「ちょっとだけ LLM に narration を生成させたい近道は必ず Trust Cliff バグを生む」 anchor の遵守。

---

## 5. スプリント分割 (4 sprint、 上限 6 以下)

### Sprint 1: backend field 追加抽出 (0.5 人日)
**目的**: 既存 `/api/valuation-extras/{ticker}` response に TTM 系 6 field を追加抽出する。

**触るファイル**:
- `backend/app/main.py` の `get_valuation_extras` (line ~913-1100)

**呼ぶ既存 skill**:
- `hallucination-guard` (新規 endpoint ではないが、 valuation-extras 系 endpoint を編集する場合 pre-commit Check 3 確認のため)
- `fmp-api-retry` (新規 FMP key を増やさないことを confirm、 既存 5 endpoint 並列 fetch を維持)

**追加抽出 field** (key-metrics-ttm + ratios-ttm 既存 fetch 済 dict から `_pick` 関数で抽出):
| field 名 (response) | FMP key 候補 (優先順) | source data | 単位 |
|---|---|---|---|
| `ttmRevenue` | `revenuePerShareTTM × dilutedSharesOutstandingTTM` / fallback: `revenueTTM` | key-metrics-ttm | USD 絶対値 |
| `ttmEps` | `netIncomePerShareTTM` / fallback: `epsTTM` (ratios) | key-metrics-ttm / ratios-ttm | USD/株 |
| `ttmOperatingMargin` | `operatingProfitMarginTTM` | ratios-ttm | 0.0-1.0 |
| `fcfYield` | `freeCashFlowYieldTTM` / fallback: `freeCashFlowPerShareTTM ÷ price` | key-metrics-ttm | 0.0-0.1 |
| `enterpriseValue` | `enterpriseValueTTM` / `enterpriseValue` | key-metrics-ttm | USD 絶対値 |
| `debtToEquity` | `debtToEquityTTM` | ratios-ttm | 比率 (0.5 = 50%) |

**注意点**:
- `evToEbitda` は既に response に含まれている (line 1029) → 再利用、 重複追加禁止。
- `enterpriseValue` (絶対値 USD) は新規追加。 frontend で `_formatAum` 風の `$X.XXT/B` フォーマットで表示。
- 全 field が partial failure に対応: `key_metrics` source が `empty/timeout/error` なら該当 field を `None` で返す (frontend で「—」 表示)。
- ratios-ttm が timeout でも key-metrics-ttm が ok なら margin / DE 以外は表示可能、 frontend の per-source compound check で graceful degrade。

**完了判定基準**:
- `curl https://beatscanner-production.up.railway.app/api/valuation-extras/NVDA | jq '.ttmRevenue, .fcfYield, .enterpriseValue, .debtToEquity, .ttmOperatingMargin, .ttmEps'` で全 6 field が finite number で返る (NVDA で動作確認、 全 None でないこと)。
- `sources.key_metrics === 'ok' && sources.ratios === 'ok'` の場合、 全 6 field が non-null。

---

### Sprint 2: frontend primitive `TtmValuationPanel.jsx` (0.5 人日)
**目的**: 新 panel 1 component を作成する。 既存 ReturnGrid と同じ design grammar (SectionLabel + grid + frameless prop) で実装。

**触るファイル (新規作成)**:
- `frontend/src/features/judgment/primitives/TtmValuationPanel.jsx` (新規、 ReturnGrid.jsx と同一階層)

**触るファイル (既存編集)**:
- `frontend/src/features/judgment/primitives/index.js` (export 追加)

**呼ぶ既存 skill**:
- `designing-workspace-ui` (Pane 3 内 component 配置 + spacing + frameless prop pattern 確認)
- `design-system-check` (raw hex / shadow / !important whitelist 確認、 token 経由のみ)
- `shadcn` (Card primitive 経由で `<Card>` 包む、 ReturnGrid と同 idiom)

**設計**:
```
<section data-testid="ttm-valuation-panel" className="bs-panel" (or frameless)>
  <SectionLabel>バリュエーション (TTM)</SectionLabel>
  <div className="ttm-grid">                {/* 3×2 grid、 ReturnGrid 4×2 と同じ idiom */}
    <Metric label="TTM 売上高"      value="$165.2B"  sub="直近 4Q 合算" />
    <Metric label="TTM EPS"        value="$2.85"    sub="直近 4Q 合算" />
    <Metric label="TTM 営業利益率"   value="62.1%"    sub="営業利益 / 売上高" />
    <Metric label="FCF Yield"      value="2.85%"    sub="FCF / 時価総額" />
    <Metric label="EV/EBITDA"     value="52.8x"    sub="企業価値 / EBITDA" />
    <Metric label="D/E"            value="0.42"     sub="負債資本比率" />
  </div>
  <footer className="ttm-footer">出典: FMP TTM data ・ 最終更新 X 時間前</footer>
</section>
```

**Metric primitive 仕様** (inline / Stat.jsx 流用):
- `label`: text-muted、 font-size: var(--font-size-12)、 font-weight: 500、 letter-spacing: 通常
- `value`: var(--text-strong)、 font-size: var(--font-size-20)、 font-weight: 700、 tabular-nums、 line-height: 1.05
- `sub`: text-muted、 font-size: var(--font-size-11)、 opacity: 0.75
- 欠損: value="—" + opacity 0.5 (ReturnGrid と同 idiom)

**フォーマット規則**:
- TTM 売上高 / EV: `$X.XXT` (≥1T) / `$X.XXB` (≥1B) / `$X.XM` (≥1M) — `_formatAum` 流用
- TTM EPS: `$X.XX` (小数 2 桁 固定)
- TTM 営業利益率 / FCF Yield: `XX.XX%` (小数 2 桁、 dividend_yield 同様 0.0-1.0 を 100倍化)
- EV/EBITDA: `XX.Xx` (小数 1 桁、 末尾「x」 で multiple 単位明示)
- D/E: `X.XX` (小数 2 桁、 単位なし)

**完了判定基準**:
- `cd frontend && npm run build` 成功 (構文 OK)
- `grep "design-system-check" .claude/skills/` ルールに沿って raw hex / shadow なし
- `frontend/src/features/judgment/primitives/index.js` から `TtmValuationPanel` が export される

---

### Sprint 3: JudgmentDetail への mount + valuationExtras 連携 (0.5 人日)
**目的**: 既存 `valuationExtras` state を TtmValuationPanel に渡し、 ReturnGrid 直後に mount する。

**触るファイル**:
- `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (line 658-664 の ReturnGrid block 直後に挿入)

**呼ぶ既存 skill**:
- `designing-workspace-ui` (Pane 3 mount 位置 + spacing 確認)
- `pge-loop-debugger` (Edit replace_all drift 防止、 v118 R9.6 で発生した教訓 [[feedback-edit-replace-all-drift]])

**mount block** (推奨配置):
```jsx
{result && selectedTicker && (
  <ReturnGrid ticker={selectedTicker} frameless={true} testId="judgment-return-grid" />
)}

{/* SPRINT 3 NEW: TTM バリュエーション panel — ReturnGrid 直後、 TriageBanner 前 */}
{result && selectedTicker && valuationExtras && (
  <TtmValuationPanel
    data={valuationExtras}
    fetchedAt={valuationExtras.fetched_at}
    frameless={v2Frameless}
    testId="ttm-valuation-panel"
  />
)}

{/* 既存 EpsBeatStreakChip 以下不変 */}
```

**条件分岐**:
- ETF (5 条件結果なし + etfInfo あり) → EtfOverviewPanel の path に逃げる (line 460-462)、 TtmValuationPanel に到達しない (本 SPEC は個別株専用、 user 制約遵守)。
- `valuationExtras === null` (fetch 失敗 / cancelled) → panel mount しない (Trust Cliff 防止、 空 panel 出さない)。
- `valuationExtras` ok だが全 6 field None (rare な partial failure 全部失敗) → panel mount するが全 cell em-dash + sub-text 「データ取得失敗」 (sources schema を可視化、 honest fallback)。

**完了判定基準**:
- 本番デプロイ後 (Sprint 4 後) `curl https://...index-*.js | grep "TTM 売上高"` で TtmValuationPanel の文字列が bundle に含まれることを確認
- NVDA / AAPL / MSFT で TTM panel が表示され、 全 6 cell に数値 (or honest「—」) が出る
- ETF (SPY / VOO) で TtmValuationPanel が **表示されない** (EtfOverviewPanel に逃げる)

---

### Sprint 4: vision-eval + 3 体 multi-review + デプロイ (1 人日)
**目的**: 視覚品質 + design grammar 整合性 + Trust Cliff の最終 gate 通過後、 `railway up` でデプロイ。

**触るファイル**: なし (verification のみ)

**呼ぶ既存 skill**:
- `vision-eval` (Pane 3 全体の typography / spacing / aman 軸を 3 run mean で測定、 noise floor 接近時は polish-iteration-roi-decay 適用)
- `multi-review` (3 体合議: ui-designer + frontend-architect + qa-dogfooder、 multi-review 6 体 vs 3 体判断基準で本 sprint は **3 体で十分** = §7 で詳述)
- `design-system-check` (最終 token / hex / shadow check)
- `release-check` (CLAUDE.md 違反 + Trust Cliff + 4 重防御の release gate)

**3 体 multi-review 観点**:
- **ui-designer**: 6 metric の grid layout / typography 階層 (value 20px / label 12px / sub 11px) が KpiStrip + ReturnGrid と整合しているか、 §-1 「洗練さ」 軸が向上したか
- **frontend-architect**: `valuationExtras` state 経路 + per-source compound check + Number.isFinite guard + 「最終更新 X 時間前」 epoch 判定 (`< 1e12 ? *1000 : input`) が正しいか、 CLS envelope (panel minHeight) 設定済か
- **qa-dogfooder**: NVDA / AAPL / MSFT (大型株) + SHOP / SNOW (中型) + SPY / VOO (ETF 除外確認) + 任意 ticker SMCI 等 (FMP partial failure 確認) の 6 銘柄で表示テスト、 Trust Cliff (空 panel / NaN / 「割安」 言語) 0 件

**vision-eval 計測**:
```bash
cd frontend && node scripts/snap-pdca-loop.mjs \
  --check "Pane 3 個別株 ReturnGrid 直後に TTM バリュエーション panel が表示され、 6 metric (TTM 売上高 / TTM EPS / TTM 営業利益率 / FCF Yield / EV/EBITDA / D/E) が grid layout で整列、 KpiStrip / ReturnGrid と typography / spacing 階層が一貫しているか" \
  --selector "[data-testid='ttm-valuation-panel']" \
  --ticker NVDA
```

**完了判定基準**:
- vision-eval verdict = pass (1 run、 typography / spacing / color 軸は noise floor 外なら 1 run で十分 [[feedback-vision-api-noise]])
- multi-review 3 体合議 verdict 集約 = release 可
- `railway up` 後 production bundle hash が変わり、 grep で「TTM 売上高」 「FCF Yield」 「EV/EBITDA」 「最終更新」 4 文字列確認
- handover 更新 (本 SPEC 完了記録)

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

### CLAUDE.md / handover v118-v119 由来 (グローバル禁止)
- `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1、 本 sprint 該当しないが永続禁止)
- `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3、 永続禁止、 本 sprint 該当 sprint では aggregator/ を一切触らない)
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor、 永続禁止)
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX (typo は OK、 本 SPEC は静的文字列のみのため触らない)
- `.claude/launch.json` (人間用)
- `migrations/*.sql` (DB schema、 本 SPEC は migration 不要)
- `handover_*.md` (read-only reference)
- `railway.toml` cron 定義 (本 SPEC は cron 追加なし)
- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域)
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク、 §C-1〜C-4)

### 本 SPEC 固有の禁止 (user 制約より直接)
- **`frontend/src/features/judgment/components/detail/KpiStrip.jsx`**: chip 順序 + frameless mode + parseKpiValue / AnimatedStat 一切不触。 本 SPEC は新 panel 追加であって KpiStrip 拡張ではない。
- **`frontend/src/features/judgment/primitives/ReturnGrid.jsx`**: R9.5/R9.6/R9.6.1 着地済、 本 SPEC は触らない。
- **`frontend/src/components/EtfOverviewPanel.jsx`**: ETF 専用、 個別株 TTM 関係なし。 本 SPEC で個別株判定経路と排他構造を維持。
- **`frontend/src/index.css`** の v54-v62 残骸領域 (`.panel-card` `.bs-panel` `.surface-card` 系全 CSS rules): 新 panel は既存 `.bs-panel` class を再利用、 新規 CSS class 追加は最小限 (`.ttm-grid` 1 class + `.ttm-metric` 1 class 程度)。 入れ子 `surface-card` 禁止 (§C-1)。
- **`backend/app/main.py`** の `get_valuation_extras` 既存 logic (Forward P/E / PEG / 配当性向 / Buyback 計算、 line 1030-1110 周辺): 既存 4 field の計算ロジックは一切不触。 本 SPEC は **追加抽出のみ**。 既存 sources schema / `_classify` / `_pick` 関数は再利用、 改変禁止。
- **handover v118 NEW HARD CONSTRAINT 19 項目** (writer.py): article 系のため本 SPEC 該当しないが、 万一 narration を将来追加する場合は writer.py の 19 制約 + Hallucination Guard 4 重防御を全通過 (§7 で 6 体合議必須化)。

---

## 7. multi-review 必要性判定

### 3 軸の active check (handover v82 / CLAUDE.md 基準)

| 軸 | 本 SPEC で active か | 根拠 |
|---|---|---|
| **LLM 出力品質 (景表法 / 金商法 / hallucination risk)** | **NO** | 本 SPEC は LLM 経路ゼロ、 全て Python 数値抽出 + 静的日本語 dictionary。 既存 4 重防御は変更不要。 |
| **Trust Cliff (LP 訴求 vs 実装の整合)** | **NO** | LP 文言 unchanged、 demo rate limit unchanged、 認証フロー unchanged、 「機関投資家」 文字列を UI に出さないことで「クラス課題提出物」 訴求と整合維持。 |
| **新 backend endpoint + RLS / 認証境界 + cache 設計** | **NO** | 新 endpoint 不要、 既存 `/api/valuation-extras/{ticker}` への field 追加抽出のみ。 RLS 無関係 (FMP raw data、 user 別境界なし)。 cache は既存 12h を流用、 設計変更なし。 |

### 判定結果
**3 体合議で十分** (cost 30-50% 圧縮、 [[cost-efficient-operation]])

**根拠 1 行**: 「LLM 不変 + 既存 schema 維持 + frontend 局所修正のみ + 既存 endpoint への field 追加抽出のみ」 = 3 軸全 inactive、 CLAUDE.md 「LLM prompt 不変 + 既存 schema 維持 + frontend 局所修正のみ」 条件に厳密に該当。

### 推奨 reviewer 構成 (Sprint 4 で起動)
**ui-designer + frontend-architect + qa-dogfooder** (3 体、 全員 Sonnet 4.6/4.7 で並列起動、 [[cost-efficient-operation]] 遵守)

---

## 8. 想定リスク + roll-back plan

### リスク 1: FMP partial failure で TTM 系 field が全部 None
- **発生条件**: NVDA は test 済 ok だが、 小型株 / 新規上場銘柄 / SPAC の場合 FMP TTM endpoint が 404 / empty を返す可能性
- **影響**: TtmValuationPanel が全 cell em-dash 表示、 「データ取得失敗」 sub-text
- **対策**: per-source compound check + honest fallback で UI は壊れない、 NaN / undefined display なし
- **roll-back trigger**: 30% 以上の銘柄で全 None が出る場合 (想定外、 release 後 dogfood 5 銘柄で 1 件以下を許容範囲とする)

### リスク 2: KpiStrip + ReturnGrid + TtmValuationPanel + FiveConditionsCard の Pane 3 縦長化
- **発生条件**: Pane 3 width 500-700px (workspace mode 標準) で 4 panel 縦積みで scroll 量増大
- **影響**: §-1-A 「First fold 至上主義」 違反、 「2 秒理解」 5 原則違反の可能性
- **対策**: TtmValuationPanel は `<AccordionSection>` (既存 primitive) で **collapsed default** にして scroll 量抑制 (Sprint 2 で要検討)。 ただし機関投資家層は「展開状態で見たい」 ため、 default は expanded、 collapsed option はユーザー選択にする (Sprint 4 multi-review で再評価)
- **roll-back trigger**: vision-eval で「first fold (1280px viewport) に Hero + KpiStrip が見えない」 verdict が出た場合

### リスク 3: pre-commit hook の意図せざる発火
- **発生条件**: `aggregator/` 不触のはずだが、 万一 main.py 編集で意図せざる import を追加した場合
- **影響**: commit 拒否
- **対策**: Sprint 1 で `grep "from app.visualizer\|import.*claude\|import.*anthropic" backend/app/main.py` を実行前後で diff、 LLM SDK import 増加なきこと確認
- **roll-back trigger**: pre-commit Check 3 が発火した場合、 commit を分割 (main.py 編集と他を分離) して原因切り分け

### roll-back plan (緊急時)
**個別 sprint 単位の roll-back**:
- Sprint 1 (backend): `git revert <commit>` → backend のみ revert、 frontend は影響なし (TtmValuationPanel は valuationExtras null なら mount しないため graceful degrade)
- Sprint 2-3 (frontend): `git revert <commit>` → frontend のみ revert、 backend は既存 endpoint そのまま稼働
- Sprint 4 (deploy): `railway up` 前なら revert で完了、 deploy 後なら Railway dashboard の Deployments 履歴から前 deployment に rollback (5 分以内)

**最悪ケース** (Sprint 4 deploy 後に Pane 3 真っ白 / NaN 表示等):
1. Railway dashboard で前 deployment (P6 削除後の安定 build、 `index-C8VVXKdz.js` 系) に rollback (5 分)
2. handover に「TTM panel roll-back 記録」 を追記
3. 真因 (Number.isFinite 漏れ / Sources schema check 漏れ等) を memory anchor 化 ([[feedback-chart-overlay-safety]] と double anchor)
4. 再着手は別 sprint として SPEC v2 で起票

---

## 付録 A: 既存 endpoint response 構造の前提 (Sprint 1 起点)

```json
// GET /api/valuation-extras/NVDA (現状、 Sprint 1 前)
{
  "ticker": "NVDA",
  "payoutRatio": 0.012,
  "dividendYield": 0.0008,
  "buybackYield": 0.025,
  "dividendBuybackRatio": 0.031,
  "forwardPE": 38.2,
  "pegRatio": 1.45,
  "evToEbitda": 52.8,                  // ★ 既存 (再利用)
  "sources": {
    "ratios": "ok",
    "key_metrics": "ok",
    "analyst_estimates": "ok",
    "quote": "ok",
    "cash_flow": "ok"
  },
  "fetched_at": 1748259600.0
}

// GET /api/valuation-extras/NVDA (Sprint 1 後の追加 field 6 個)
{
  ...,
  "ttmRevenue": 165200000000,           // NEW
  "ttmEps": 2.85,                       // NEW
  "ttmOperatingMargin": 0.621,          // NEW
  "fcfYield": 0.0285,                   // NEW
  "enterpriseValue": 3450000000000,     // NEW
  "debtToEquity": 0.42,                 // NEW
  ...
}
```

---

## 付録 B: design grammar 横展開チェック

| design element | KpiStrip (既存) | ReturnGrid (既存) | TtmValuationPanel (新) |
|---|---|---|---|
| SectionLabel | "KPI" (implicit) | "期間別累積リターン" | **"バリュエーション (TTM)"** |
| grid pattern | 6 chip × auto-fit | 4×2 chip grid | **3×2 metric grid** |
| value font | 32px fw700 (動的) | 16-20px fw700 | **20px fw700** |
| label font | 11-12px fw500 muted | 11px fw500 muted | **12px fw500 muted** |
| sub-text | なし (KpiStrip は最小限) | hint なし (R9.5) | **11px fw500 opacity 0.75 muted** |
| frameless prop | 対応 | 対応 | **対応 (v2 mode 整合)** |
| Number.isFinite guard | あり | あり | **必須 (Sprint 2)** |
| em-dash fallback | あり | あり | **必須** |
| CLS envelope | あり (sticky) | あり (minHeight 80px) | **必須 (Sprint 2 で min-height 設定)** |

---

## 完了
本 SPEC は user 承認 (gate 1) を待つ。 採用承認後、 Sprint 1 を Generator subagent (Sonnet 4.6/4.7、 [[cost-efficient-operation]] 遵守) に渡す。
