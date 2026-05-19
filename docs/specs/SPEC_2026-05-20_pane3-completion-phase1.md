# SPEC 2026-05-20: Pane 3 Completion Backlog Phase 1 — 旧 SPA classic 比 3 ブロック品質補完

## 0. メタ情報

| 項目 | 値 |
|---|---|
| 起票日 | 2026-05-20 |
| 起票者 | Planner subagent (user PGE 自律依頼経由) |
| 対象 | workspace mode の Pane 3 detail view (`features/judgment/components/detail/JudgmentDetail.jsx` 配下) |
| Phase | Phase 1 / 全 4 Phase 中の最優先 |
| 工数見積 | 8-12 人日 (3 sprint 合計) |
| sprint 数 | 3 (上限 6 以下) |
| multi-review | Phase 完了時に **3 体合議** (ui-designer + frontend-architect + qa-dogfooder)、 sprint 中は不要 |
| user 承認 gate 1 | **省略** (user 10h 留守、 pre-release Top 1、 PGE 自律ループ承諾済) |

## 1. Context

### user prompt 原文

> Pane 3 Completion Backlog Phase 1 を起票してください。 対象は workspace mode の Pane 3 detail view (判定詳細)。 旧 SPA classic mode の judgment detail と比べて欠落している 7 ブロックのうち、 Phase 1 では「5 条件 PASS/FAIL バッジ + ミニチャート」「AI 詳細レポート (Saga-like ビジュアル分析)」「過去推移グラフ (売上高 / EPS / CFPS)」 の 3 ブロックを移植する。

### なぜ今やるか

- **handover v86 §7**: 「pre-release Top 1」 として明示 (`feedback_pre_release_priority.md` で順序確認済)
- **memory `project_pane3_completion_backlog.md` (2 日前)**: workspace mode Pane 3 は旧 SPA judgment detail と比べ 7 ブロック欠落と記載。 本 SPEC で Top 3 ブロックを Phase 1 として着地
- **現状診断 (2026-05-20 実装読込)**: 実は v82 Phase 1-5 で **3 ブロックは全て mount 済**:
  - FiveConditionsCard.jsx (213 行、 ConditionRow 配下に展開)
  - EarningsHistoryChart.jsx (450 行、 small multiples 3 段、 売上 / EPS / CFPS)
  - DetailReport.jsx (981 行、 lazy mount + DiagramCard.jsx 2108 行)
- したがって本 Phase 1 の真の目的は **「mount 済の 3 ブロックを旧 SPA classic 体感品質まで polish」**:
  - **Sprint 1**: FiveConditionsCard の各 ConditionRow に **per-condition ミニチャート** を埋め込み (現状は数値のみ、 推移可視化が無い)
  - **Sprint 2**: EarningsHistoryChart の表現を旧 SPA classic と比較 + (CFPS - EPS) 補助線 / Y 軸スケール最適化 / 8Q 表示確認 (現状最大 8Q だが実 data 件数不足の可能性、 dogfood で目視 verify)
  - **Sprint 3**: DetailReport + DiagramCard を「Saga-like ビジュアル分析」 として再認識 (現状実装の品質確認 + 旧 SPA で見える詳細図解 7 種 = バリュエーション 6 数値 / ビジネスモデル図 / 売上 EPS CFPS 営業 CF 4 年次グラフ / FCF / 強み × リスク / 経営ストーリー / 決算ハイライト) が **欠落なく出力されているか visual diff**

### 期待される成果 (5 原則対応)

| 原則 | 貢献 |
|---|---|
| §1 読み手に負担をかけない (2 秒理解) | ConditionRow ミニチャート = 数値文字列より 4-7x 速い理解 (Bloomberg sparkline anchor) |
| §2 毎日開きたくなる | per-condition ミニチャートの直近変化が「動きが見える」 リテンション起点 |
| §3 シンプルかつリッチ | mount 済 component の polish なので構造変化なし、 視覚密度のみ向上 |
| §4 1 クリックを減らす | DetailReport accordion 内の Saga-like 図解は既に lazy mount 1 タップ展開、 維持 |
| §5 図解で認知コストを下げる | ミニチャート + (CFPS - EPS) 補助線 + DiagramCard Saga-like = 全 sprint 共通主軸 |

### ブランド世界観への接続

「Aman/Ritz-Carlton 級のロビー」 比喩で言えば、 現状は「客室の家具は全部入っているが、 壁の絵が下絵のまま」 状態。 ConditionRow ミニチャート (壁の絵) + EarningsHistoryChart 補助線 (天井の照明) + DiagramCard Saga 完成度 (客室のアートワーク) を整えることで、 「**画面を見ているだけで楽しい**」 (5 感情中: 驚き + 興奮) が成立する。

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

5 感情のうち本 SPEC が effort する語彙:

- **驚き**: per-condition ミニチャートが「あれ、 ここに sparkline 出てる」 と気付かせる微小発見の連鎖 (Stripe Sigma / Bloomberg sparkline idiom 流)
- **豪華さ**: DetailReport + DiagramCard の Saga-like 図解が「これだけの分析量を瞬時に視覚化」 という質的密度
- **興奮**: (CFPS - EPS) 補助線が green / red で動いて見える瞬間 (じっちゃま 5 条件 §5 の心臓部)
- **洗練さ**: ConditionRow ミニチャートは neutral slate tone (緑/赤の意味色とは分離)、 視覚干渉なし
- **楽しい**: 3 sprint 共通 — 「閉じたまま 2 秒で本質、 展開すると詳細図解」 の Linear 流階層

`feedback_brand_aspiration.md` (修正禁止 anchor) 適合: 新規修飾語は追加せず、 既存 5 感情の中で「驚き + 興奮 + 楽しい」 を強化。

## 3. Trust Cliff チェックリスト

LP 訴求文言との整合を確認:

| LP 訴求 | 本 SPEC との整合 | 判定 |
|---|---|---|
| 「登録不要で 3 銘柄/日まで無料分析」 | 本 SPEC は判定詳細の **表示 polish** であり、 rate limit / login flow を一切変更しない | ✅ 整合 |
| 「ファンダメンタル 5 条件で銘柄を即座に判定」 | 本 SPEC は 5 条件カードの per-condition ミニチャート追加で、 5 条件の **視認性を強化** する方向 | ✅ 整合 |
| 「AI による詳細レポート」 | DetailReport + DiagramCard の品質補強。 「AI レポート出るが内容スカスカ」 を防ぐ Trust Cliff 対策 | ✅ 整合 |
| 「Premium / Pro 限定機能」 | 本 SPEC は free / Pro / Premium tier gate を一切変更しない (現状の tier gate 維持) | ✅ 整合 |

該当しない項目: なし。 全 4 項目で整合確認済。

## 4. Hallucination Guard 適合

| 質問 | 答え |
|---|---|
| LLM 呼び出しを含むか | **Yes (Sprint 3 のみ、 既存 `/api/visualize/{ticker}` + `/api/detail-report/{ticker}` を経由)** |
| 4 重防御の適用 | **既存実装を流用、 新規 LLM 呼出は追加しない** |

詳細:
- **Sprint 1 (ConditionRow ミニチャート)**: LLM 不要、 既存 `result.conditions[i]` の precomputed_metrics (数値 array) を Recharts sparkline で描画するのみ。 純粋 frontend 処理
- **Sprint 2 (EarningsHistoryChart 補助線)**: LLM 不要、 既存 backend `quarters` array 数値の derived value (CFPS - EPS) を frontend 計算
- **Sprint 3 (DetailReport / DiagramCard polish)**: LLM は既存 `/api/visualize/{ticker}` (Phase 4 で 4 重防御確立済) を流用、 **prompt / few-shot / NEGATIVE_EXAMPLES を一切変更しない**。 本 sprint は frontend rendering 側の品質確認のみ

### Hallucination Guard 違反防止 checklist (Sprint 3 dogfood で確認)

| 項目 | 確認方法 |
|---|---|
| `backend/app/visualizer/prompt.py` に LLM 数値計算指示を追加しない | git diff で確認 (pre-commit hook が自動 BLOCK) |
| `backend/app/aggregator/*.py` に LLM SDK import しない | git diff で確認 (pre-commit hook が自動 BLOCK) |
| BLOCKLIST_REGEX (frontend/src/lib/blocklist.js) の BAD-1〜6 sanitize が DiagramCard で正常動作 | LP 5 銘柄 (AAPL/NVDA/TSLA/MSFT/META) dogfood で `_sanitized: true` flag の console.warn を確認 |
| `_sources` schema / per-source data namespace の compound check 不変 | TriageBanner と DiagramCard の sources 参照 grep |

## 5. スプリント分割 (3 sprint、 上限 6 以下)

### Sprint 1: 5 条件 PASS/FAIL バッジ + per-condition ミニチャート (2-3 人日)

**目的**: ConditionRow に「数値だけ」 でなく「直近 4-8Q の推移 sparkline」 を埋め込み、 2 秒理解の質を改善。

**触るファイル** (Generator のみ編集):
- `frontend/src/features/judgment/components/detail/ConditionRow.jsx` (主)
- `frontend/src/features/judgment/components/detail/FiveConditionsCard.jsx` (props passthrough のみ、 logic 不変)
- 新規 (推奨): `frontend/src/features/judgment/components/detail/ConditionSparkline.jsx` (純粋 presentation、 50-80 行)

**呼ぶ既存 skill / pattern**:
- `chart-tab` skill: Recharts 4 層防御 (ErrorBoundary / conditional render / Number.isFinite / `isAnimationActive=false`)
- `design-system-check` skill: 完了時に raw hex 0 件 + token 経由のみ確認
- `pge-loop-debugger` skill: snap script 配置時に呼出

**設計詳細**:
- 各 ConditionRow の右端に **width 80-120px / height 28-36px** の sparkline
- 色は **neutral slate** (`rgba(148, 163, 184, 0.85)`) baseline、 最新 point のみ PASS=`var(--color-gain)` / FAIL=`var(--color-loss)` で 4-5px circle dot
- data source: `result.conditions[i].history_values` (backend 既存 schema、 無い場合は `result.history.eps[]` / `result.history.cfps[]` から derive)
- data 不在 (4Q 未満) なら sparkline 非 render (conditional render gate)
- accessibility: `aria-label="条件 N: 直近 8Q 推移 — 最新値 X、 PASS"`

**完了判定基準**:
- [ ] `npm run build` で error 0 / warning 0
- [ ] LP 5 銘柄 + 旧 SPA classic mode で対応 sparkline が visual 整合 (旧 SPA で existing なら同 idiom)
- [ ] data 不在銘柄でも Pane 3 真っ白にならない (ErrorBoundary catch + conditional gate)
- [ ] design-system-check pass (raw hex 0 / token 経由 100%)
- [ ] design_recipes.md §C-1〜C-4 違反なし (新規 `.surface-card` 入れ子 / `contain: paint` 0 件)

**自己評価メトリクス (Generator が回す 5 項目)**:
1. **構文/build**: `cd frontend && npm run build` exit 0
2. **selector 整合**: `data-testid="condition-row-N"` (N=0-4) を curl + grep で本番 HTML 照合 (`feedback_pge_loop_pitfalls.md` ルール 2)
3. **ミニチャート mount 確認**: `data-testid="condition-sparkline-N"` の `<svg>` が DOM 上に 5 件存在 (LP 銘柄 AAPL で)
4. **NaN safety**: console.error / console.warn の `MNaN` 文字列が **0 件**
5. **token 整合**: raw hex / `!important` 追加 0 件 (`design-system-check` skill 出力 PASS)

**Evaluator 4 層 (L1-L4) チェック項目**:
- **L1 (構文)**: `node --check` (ESM 制約) + `npm run build` PASS + raw hex 検出 0 件
- **L2 (機能)**: production curl + grep で `data-testid="condition-sparkline-0"` 〜 `condition-sparkline-4` が HTML に存在
- **L3 (デザイン整合)**: `snap-pane3.mjs` 系で sparkline の computed style (width 80-120px / height 28-36px / fill 色 neutral slate) verify
- **L4 (品質)**: 5 銘柄 (AAPL/NVDA/TSLA/MSFT/META) dogfood で sparkline が data 不在時 graceful skip + Pane 3 mount 成功

---

### Sprint 2: 過去推移グラフ (売上高 / EPS / CFPS) — (CFPS - EPS) 補助線 + Y 軸調整 (1-2 人日)

**目的**: EarningsHistoryChart の表現を旧 SPA classic と同等以上に。 じっちゃま 5 条件 §5 (CFPS > EPS) の心臓部を **green/red 補助線** で前面化。

**触るファイル**:
- `frontend/src/components/EarningsHistoryChart.jsx` (主、 small multiples 3 段の 1 段 = CFPS 段に補助線追加)
- `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (props passthrough のみ)

**禁止**: backend `app/aggregator/*.py` への変更は **不可** (LLM SDK import BLOCK + 数値計算は既存値再利用)。

**呼ぶ既存 skill / pattern**:
- `chart-tab` skill: 4 層防御継承
- `design-system-check` skill
- `stock-chart` skill: Recharts 共通 idiom

**設計詳細**:
- CFPS 段の各 Bar の **上端に薄い green/red horizontal line** (`(CFPS - EPS)` 値の符号で色分け)
- ただし「補助線が cup-handle ReferenceLine と同色化しない」 配慮: cup-handle は slate、 (CFPS - EPS) 補助線は `var(--color-gain)` / `var(--color-loss)` で意味色を持たせる (投資業界色ルール準拠)
- Y 軸スケール: 各段独立 (現状維持) を確認。 売上高だけ巨大で他 2 段が潰れる症状があれば log scale 検討 (sprint 内 dogfood で判断)
- (CFPS - EPS) 値が 0 や undefined なら補助線非 render (conditional gate)
- 8Q 表示確認: backend `result.quarters` の長さが 8 未満なら現状維持、 8 以上なら **直近 8Q** を slice (1 行)

**完了判定基準**:
- [ ] `npm run build` PASS
- [ ] LP 5 銘柄全てで EarningsHistoryChart が真っ白にならない (4 層防御維持)
- [ ] (CFPS - EPS) 補助線が **CFPS 段の中だけに** 描画される (他 2 段に漏れない)
- [ ] design-system-check pass
- [ ] 旧 SPA classic mode (`?layout=classic`) で同等以上の表示密度

**自己評価メトリクス (5 項目)**:
1. build exit 0
2. `data-testid="earnings-history-chart"` が DOM 1 件
3. (CFPS - EPS) 補助線 SVG line が `data-testid="cfps-eps-delta-Q{N}"` で 4-8 件存在
4. console エラー 0 件 (5 銘柄 dogfood で)
5. token 整合: 補助線色は `var(--color-gain)` / `var(--color-loss)` のみ参照

**Evaluator 4 層**:
- **L1**: build + raw hex 0
- **L2**: curl + grep で `data-testid="cfps-eps-delta-Q1"` 等が存在
- **L3**: snap script で補助線の computed style fill が `rgb(34, 197, 94)` (gain) または `rgb(248, 113, 113)` (loss) になっているか
- **L4**: 5 銘柄 dogfood で「CFPS > EPS 銘柄 (例: MSFT)」 は green / 「CFPS < EPS 銘柄」 は red、 視覚整合

---

### Sprint 3: AI 詳細レポート (Saga-like ビジュアル分析) 品質確認 + DiagramCard polish (3-4 人日)

**目的**: 既存 DetailReport + DiagramCard の Saga-like ビジュアル分析が 7 要素 (バリュエーション 6 数値 / ビジネスモデル図 / 4 年次グラフ / FCF / 強み × リスク / 経営ストーリー / 決算ハイライト) を **欠落なく** 出力しているか確認。 欠落要素があれば DiagramCard 側で補完表示。

**触るファイル**:
- `frontend/src/components/DiagramCard.jsx` (主、 2108 行の rendering 側の polish)
- `frontend/src/components/DetailReport.jsx` (主、 981 行の sectioning 確認)
- 新規 (任意): `frontend/src/components/DiagramSectionFallback.jsx` (要素欠落時の skeleton or empty state、 50 行程度)

**禁止 (Hallucination Guard 違反回避)**:
- `backend/app/visualizer/prompt.py` / `prompt_negatives.py` を **一切編集しない**
- `backend/app/agents/*.py` の few-shot / system 配列を **一切変更しない**
- 新規 LLM 呼び出しを追加しない (既存 `/api/visualize/{ticker}` + `/api/detail-report/{ticker}` のみ参照)
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX は変更しない (typo 修正のみ許可)

**呼ぶ既存 skill / pattern**:
- `hallucination-guard` skill: dogfood 時に 4 重防御 + BAD 1-6 sanitize 確認
- `visualizer` skill: DiagramCard rendering 規約
- `design-system-check` skill
- `prompt-cache-optimizer` skill: cache hit 80% 維持確認 (本 sprint は prompt 不変なので影響なし、 念のため)

**設計詳細**:
- 7 要素の **出力存在 visual checklist** を sprint 開始時に snap-pane3.mjs で baseline 取得 (LP 5 銘柄 × 7 要素 = 35 要素)
- 欠落 (`undefined` / 空 array / 空 string) を検出した場合:
  - **空 array / undefined** → skeleton 表示 (24px height grey box) + 「データ準備中」 文言
  - **string で空 or sanitize 後 0 chars** → DiagramSectionFallback で empty state
- DiagramCard 全体が真っ白にならない `sanitizeDiagramData()` の既存 fallback chain を維持 (Phase 4.5 commit 737e324 で確立済)
- Saga-like ビジュアル分析の **scroll narrative** (上→下で物語が進む) を視覚的に強化: section 間に 1px hairline border + 16-20px gap (token `var(--space-4)`)、 強い divider は使わない (Linear 流)

**完了判定基準**:
- [ ] `npm run build` PASS
- [ ] LP 5 銘柄全てで DetailReport accordion 展開 → 真っ白ゼロ
- [ ] 7 要素の存在確認: AAPL/NVDA/TSLA/MSFT/META 各銘柄で 5+ 要素は必ず可視 (一部要素が data 不在で missing は許容、 但し empty state を表示)
- [ ] BLOCKLIST_REGEX sanitize hit が **console.warn に 0-2 件以下** (Phase 4.5 baseline)
- [ ] BAD-5 (断定的将来予測) / BAD-6 (最上級表現) の sentence が画面上に出現しない (curl + grep で確認)
- [ ] design-system-check pass
- [ ] 既存 `_sources` schema + per-source data namespace 不変 (grep で確認)

**自己評価メトリクス (5 項目)**:
1. build exit 0
2. `data-testid="diagram-section-{N}"` (N=valuation/business-flow/yearly/fcf/strengths-risks/story/highlights) の 7 種が DOM に登場 (data 不在時は fallback testid)
3. BLOCKLIST 違反 console.warn 件数 LP 5 銘柄合計 **≤ 5 件**
4. sanitize 適用後の DiagramCard mount 真っ白率 0% (5/5 銘柄 OK)
5. `feedback_diagram_quality_guard.md` の Trust Cliff DoD 全 7 項目 PASS

**Evaluator 4 層**:
- **L1**: build + git diff で `prompt.py` / `prompt_negatives.py` / `aggregator/*.py` への変更 0 件確認 (pre-commit hook が enforce)
- **L2**: production curl で `/api/visualize/AAPL` を叩き、 response JSON の 7 要素 key 全て存在確認 (HTML 側でなく API 側でも verify)
- **L3**: snap-pane3.mjs で DiagramCard accordion 展開 → 7 要素の bounding box 全て render verify (height > 0)
- **L4**: LP 5 銘柄 manual dogfood で:
  - BAD-1〜6 違反 sentence 出現 0 件
  - 「世界 No.1」 / 「絶対」 / 「確実」 等の最上級・断定の grep 0 件
  - empty state の文言が brand voice 整合 (「データ準備中」 等)

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

**全 sprint 共通の禁止リスト**。 違反した時点で Evaluator L1 で reject。

### 絶対不可 (pre-commit hook が enforce)

- `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1)
- `backend/app/visualizer/prompt_negatives.py` (BAD 1-6 法務 anchor、 修正不可)
- `backend/app/aggregator/*.py` (LLM SDK import BLOCK、 数値物理層)
- `backend/app/agents/*.py` (LLM 呼出箇所、 Sprint 3 で内容変更しない)

### Pane 3 特有の凍結領域

- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域)
- `.sticky-search-band` 関連 CSS (CLAUDE.md §触ると危険な箇所)
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ v54-v59 教訓、 design_recipes.md §C-1〜C-4)
- `AccordionSection.jsx` / `AccordionSection.module.css` (Sprint 5 で確立した展開 logic、 構造変更不可)
- `EarningsHistoryChart.jsx` の **ErrorBoundary class** (Chart Overlay 4 層防御の 1 層目、 削除不可)
- `CompanyLogo.jsx` (3 段 fallback 確立済、 内部不変)
- `EarningsRing` 内部 SVG (発光制御済)
- `--ring-glow` token 3 層 halo (light/dark)
- `.hero-live-pulse` の `.panel-card:has()` scope
- `CandleShape` SVG 構造 (StockPriceChart.jsx 内、 chart hybrid Sprint 2 確立済)
- Cup-Handle `<ReferenceArea>` x1/x2/y1/y2 構造 (StockPriceChart.jsx cupArea / handleArea useMemo)
- `pivotLabelText` フォーマット (ASCII 制約)

### Cmd+K / 検索 layer

- `CmdPalette.jsx` line 40-46 の dedup logic (transaction/account 除外、 復活させると user 1 機能損失)
- `/api/search` response の `symbol` フィールド優先読み (`r.symbol || r.ticker` defensive pattern 維持)
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX (typo OK / sentence 削除 logic 不変)

### 設定 / 環境

- `.claude/launch.json` (人間用、 AI 編集禁止)
- `migrations/*.sql` (DB schema、 本 SPEC では DB 不要)
- `handover_*.md` (read-only reference)
- `railway.toml` cron 定義 (本 SPEC では cron 不要)
- `Dockerfile` の `VITE_*` ARG/ENV (新規 env 変数追加なし)

### localStorage key

- `pane3_chart_style_v1` (chart hybrid 専用)
- `pane3_v1` / `pane3_scroll_v1` (feature flag、 構造不変)

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 3 軸を本 SPEC に適用:

| 軸 | active? | 根拠 |
|---|---|---|
| LLM 出力品質 (景表法 / 金商法 / hallucination risk) | **半 active** (Sprint 3 のみ既存 LLM 出力 rendering、 prompt 不変) | 既存 4 重防御の rendering 確認のみ、 prompt / schema 変更なし |
| Trust Cliff (LP 訴求 vs 実装の整合) | **半 active** (Sprint 3 で「AI レポート出るが内容スカスカ」 防止) | LP 訴求「詳細レポート」 を満たす品質確認、 但し既存実装の polish のみ |
| 新 backend endpoint + RLS / 認証境界 + cache 設計 | **inactive** | backend 一切変更なし、 frontend 局所のみ |

**3 軸のうち active 2 が「半 active」、 完全 active は 0**。 機械的 port + rendering polish が中心で、 設計判断は limited (Explore で scope 縮小済の旧 SPA classic 比較が SSOT)。

### 判定: **3 体合議で十分** (Phase 1 完了時、 sprint 中は不要)

**根拠**: LLM prompt 不変 + 既存 schema 維持 + frontend 局所修正のみ → CLAUDE.md「3 体合議で十分」 条件に完全一致。

### 推奨 reviewer 構成 (Phase 1 完了時に起動)

- **ui-designer**: 旧 SPA classic vs workspace mode visual diff、 5 原則整合
- **frontend-architect**: Recharts 4 層防御 / accordion lazy chain / token 整合
- **qa-dogfooder**: LP 5 銘柄 + 旧 SPA classic mode の手動 dogfood、 Trust Cliff DoD 7 項目

sprint 中 (各 sprint 完了時) は Evaluator 4 層 (L1-L4) のみで進行、 multi-review は **Phase 1 全 3 sprint 完了後の単一 gate** で実施。

## 8. 想定リスク + roll-back plan

### リスク 1: Sprint 1 で ConditionRow sparkline が backend schema 不在 → 真っ白

- **原因**: `result.conditions[i].history_values` が backend response に無い場合、 sparkline data source なし
- **対策**: Sprint 1 開始時に AAPL / NVDA / MSFT の API response を `curl` で確認、 不在なら `result.history.eps[]` / `result.history.cfps[]` / `result.history.revenue[]` から derive (frontend 純計算、 LLM 不要)
- **roll-back**: ConditionRow.jsx を git revert 1 commit + Railway redeploy (5 分)

### リスク 2: Sprint 2 で (CFPS - EPS) 補助線が色干渉

- **原因**: green/red 補助線 と cup-handle slate ReferenceLine が同じ chart で同時表示されると視覚混雑
- **対策**: 本 sprint は **EarningsHistoryChart** (cup-handle なし) なので干渉なし。 ただし design-system-check で raw hex 0 件確認
- **roll-back**: EarningsHistoryChart.jsx を git revert 1 commit

### リスク 3: Sprint 3 で DiagramCard の 2108 行を弄って真っ白事故

- **原因**: DiagramCard.jsx は超重量 (2108 行)、 1 つの SVG path が壊れると Pane 3 detail 全体真っ白
- **対策**:
  - 既存 `StockChartErrorBoundary` 相当の wrapping を確認 (DiagramCard 内 ErrorBoundary 必須)
  - 編集は **追加のみ** (fallback 表示 / empty state) を原則、 既存 SVG path / Saga rendering ロジックには触らない
  - Sprint 3 開始時に LP 5 銘柄 + 旧 SPA classic mode の DiagramCard screenshot を baseline 取得 (`snap-pane3-diagram-baseline.mjs`)
  - 編集後 snap + diff で visual regression なし確認
- **roll-back**: DiagramCard.jsx を git revert 1 commit + Railway redeploy。 真っ白事故時は handover v75 §D の緊急 revert pattern 適用

### リスク 4: PGE 3 体ループ落とし穴 4 件 (handover v86 §2)

- **対策** (`feedback_pge_loop_pitfalls.md` 参照):
  - **worktree 非累積**: 各 sprint 完了時に main consolidate + commit (Generator 起動前)
  - **selector hallucination**: 新規 `data-testid` 追加時は production curl + grep verify
  - **ESM top-level return**: 新規 snap script で `node --check` 必須
  - **infinite animation finish() throw**: snap script で `a.finish()` を `try/catch` 必須
- **roll-back**: PGE ループ自体は Planner で SPEC 修正 → Generator 再起動可能

### 緊急 roll-back の手順

1. `git log --oneline -10` で対象 commit 特定
2. `git revert <commit-sha> --no-edit` で revert commit 作成
3. `git push origin main` (Railway 自動 deploy)
4. bundle hash 変化を curl で確認 (5-7 分)
5. 本番 Pane 3 を LP 5 銘柄で再 dogfood、 mount 成功確認

## 9. PGE 3 体ループ運用方針 (user 留守時の自律運用)

- user は 10 時間留守、 user 承認 gate 1 は **省略**
- 各 sprint 完了時に:
  1. Generator が自己評価メトリクス 5 項目を実行 → JSON で出力
  2. Evaluator が L1-L4 4 層で verify → PASS/WARN/FAIL を出力
  3. PASS なら main consolidate + commit (PGE 落とし穴 1 対策)
  4. WARN / FAIL なら Generator に hotfix 指示 → 同 sprint 内で 1-2 回まで retry
  5. retry 上限 (2 回) で FAIL なら次 sprint に進まず、 user 帰宅時に escalate
- 3 sprint 全完了後 (Phase 1 完了 gate):
  1. multi-review 3 体合議起動 (ui-designer + frontend-architect + qa-dogfooder)
  2. verdict 6/6 consensus or 4-6/6 賛成なら deploy 確定 + handover 更新
  3. verdict 2/3 以下 (5 体合議換算で 4 反対以上) なら Planner で SPEC v2 起票 → Phase 1.5

## 10. 関連 anchor / 参照

### 必読 memory

- `project_pane3_completion_backlog.md` — 7 ブロック欠落 SSOT (本 SPEC が Phase 1 を担当)
- `feedback_pre_release_priority.md` — pre-release Top 1 順序付け (本 SPEC が該当)
- `feedback_pge_loop_pitfalls.md` — PGE 3 体ループ 4 落とし穴 (sprint 完了時 verify 必須)
- `feedback_diagram_quality_guard.md` — Hallucination Guard 4 重防御 + BAD 1-6 + Trust Cliff DoD (Sprint 3 で verify)
- `feedback_chart_overlay_safety.md` — Chart Overlay 4 層防御 (Sprint 1-2 で適用)
- `feedback_new_ui_only.md` — 新 UI 集中方針 (本タスクは旧 UI port なので例外的)
- `workspace_path_map.md` — port 先 path 規約
- `feedback_brand_aspiration.md` — Aman 級世界観 anchor (修正禁止)
- `feedback_pane3_detail_view.md` — selectedTarget discriminated union + URL ?detail=PREFIX:ID

### 必読 SPEC / handover

- `handover_2026-05-20_v86.md` §7 — pre-release Top 1 として本 SPEC を起票指示
- `docs/specs/SPEC_2026-05-19_scroll-hierarchy.md` — Pane 3 既存 15 sections 構造の SSOT
- `docs/specs/SPEC_2026-05-19_vision-dogfood-agent.md` — Visual Diagnostic Harness の SSOT

### 既存 skill 参照

- `chart-tab` (Recharts 4 層防御)
- `stock-chart` (Pane 3 chart 共通 idiom)
- `hallucination-guard` (Sprint 3)
- `visualizer` (DiagramCard rendering 規約)
- `design-system-check` (各 sprint 完了時)
- `prompt-cache-optimizer` (Sprint 3 で cache hit 80% 維持確認)
- `pge-loop-debugger` (snap script 配置時)

## 11. 完了定義 (Phase 1 全体 DoD)

- [ ] Sprint 1-3 全完了 (自己評価メトリクス 5 項目 + Evaluator 4 層 全 PASS)
- [ ] main consolidate + commit 3 件 (sprint 毎 1 commit)
- [ ] LP 5 銘柄 (AAPL/NVDA/TSLA/MSFT/META) dogfood で Pane 3 detail mount 真っ白 0 件
- [ ] BAD-1〜6 違反 sentence 出現 0 件 (Trust Cliff DoD)
- [ ] 旧 SPA classic mode (`?layout=classic`) と比較し、 3 ブロック (5 条件 PASS/FAIL ミニチャート / 過去推移 / Saga-like 詳細) の体感品質が同等以上
- [ ] design-system-check 全 sprint で PASS (raw hex 0 / token 経由 100%)
- [ ] multi-review 3 体合議で 2/3 以上の賛成 (ui-designer + frontend-architect + qa-dogfooder)
- [ ] handover v87 (next session) に本 Phase 1 完了 + Phase 2 着手候補 (ガイダンス達成 / 8Q 履歴 polish / 四半期業績推移) を記載

---

**SPEC 完成、 user 承認 gate 1 省略 (user 10h 留守 + pre-release Top 1 + PGE 自律ループ承諾済)。 次は Generator skill を Sprint 1 (ConditionRow per-condition ミニチャート追加) で起動可能。**
