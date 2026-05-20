# SPEC 2026-05-20: Pane 3 Phase 1.5 dogfood hotfix (EarningsHistoryChart grouped bars + ConditionSparkline trend chip)

## 0. メタ情報

| 項目 | 値 |
|---|---|
| 起票日 | 2026-05-20 |
| 起票者 | Planner subagent (PGE 3 体ループ) |
| 起点 | handover v87 deploy 後の user dogfood feedback (2 件) |
| sprint 数 | 2 (Sprint A: EarningsHistoryChart 1 段化 / Sprint B: ConditionSparkline trend chip) |
| 想定工数 | 2.5 - 4.0 人日 (Sprint A 1.5-2.0 + Sprint B 1.0-2.0 + 3 体合議 0.3) |
| multi-review 判定 | **3 体合議** (ui-designer + frontend-architect + qa-dogfooder)、 3 軸 0 active |
| user 採択 status | autonomous mode で起票 → Generator 起動許可 default 期待 |
| 関連 SPEC | SPEC_2026-05-20_pane3-completion-phase1.md (Phase 1 完了済、 本 SPEC は Phase 1.5 = dogfood hotfix) |

---

## 1. Context

### user prompt 原文 (dogfood feedback 2 件、 handover v87 deploy 後)

**Sprint A 起点 (最優先)**:
> 「実装されてますが、 y 軸の高さが小さすぎて、 3 期の差が視認できないレベルです。 改善願います (例: 1 期分の 3 指標を 1 グループにまとめて、 3 つのグループを並列すれば、 スペースを節約できると思います)」

**Sprint B 起点**:
> 「線は出ていますが、 なんとなくパッとしません。 緑・赤の判定はあるし、 展開すれば詳細も "?" チップもありますが、 なんとなくイマイチです。 (曖昧な感覚ですが、 "緑の場合、 これがどれだけ凄いのか。 赤の場合はどれだけ悪いのか" が、 ユーザーはパッと見で判断できないからかと思います)」

### なぜ今やるか

- **Phase 1 deploy 直後の dogfood feedback** を即座に反映するのが PGE 3 体ループ自律運用の理想形 (v87 で確立した workflow を回し続ける)
- **Sprint A** は既に 2 体合議 (金融 + UI/UX) で SSOT (`project_earnings_history_grouped_redesign.md`) が完全に揃っており、 設計判断は不要 (実装のみ)
- **Sprint B** は handover v87 §3 残課題の最後の "polish gap"。 chip 追加は frontend 局所のみで blast radius 最小、 LLM 不要 = 4 重防御の verify だけで済む
- 両 Sprint とも **pre-release context** (`feedback_pre_release_priority.md`)、 release 前にコンテンツ品質を埋め切る最後の 1 押し

### 期待される成果 (5 原則対応)

| 原則 | Sprint A の貢献 | Sprint B の貢献 |
|---|---|---|
| §1 読み手に負担をかけない (2 秒理解) | small multiples 縦 3 段 → grouped bars 1 段で **scroll -66%** + cluster 認知で 3 指標の力学が瞬時に伝わる | 緑/赤 dot だけでは「どれだけ凄い / 悪いか」 が伝わらない → trend % chip で **量** を視覚化 (2 秒で「+12%」 が読める) |
| §2 毎日開きたくなる | 1 段化で密度が上がり「今ここで何が起きたか」 が即座に分かる | sparkline の 5 セットが「強い/弱い」 で見分けられ、 5 条件カードの一覧性向上 |
| §3 シンプルかつリッチ | cyan/teal/slate の brand tone palette で Aman 級洗練さ維持、 派手色 4 色 (ZAI 流) は採用しない | chip は Stripe Sigma / Linear inline metric idiom (洗練さ) |
| §4 1 クリックを減らせ | expanded 不要で grouped bars 1 段なら collapsed のままで 5 年俯瞰可 | chip は collapsed 状態で常時表示、 expanded 不要で「どれだけ」 が分かる |
| §5 図解で認知コストを下げろ | cluster 配置で同年 3 指標の対比が瞬時 | sparkline + chip の 2 層 (推移 + 量) で長文不要 |

### 関連 memory anchor (Generator 必読)

- `project_earnings_history_grouped_redesign.md` (Sprint A SSOT、 2 体合議 verdict + 設計 6 項目 + DPS 条件付き 4 本目)
- `feedback_pge_loop_pitfalls.md` (v86 4 落とし穴、 各 sprint で verify)
- `feedback_chart_overlay_safety.md` (4 層防御 SSOT、 Sprint A grouped bars + Sprint B chip 両方で適用)
- `feedback_no_baseline_cyan.md` (baseline cyan 濫用禁止、 grouped bars の SPS = cyan は brand emphasis として OK)
- `feedback_pre_release_priority.md` (pre-release context、 priority 判断)
- `feedback_generator_selfeval_incomplete.md` (Generator self-eval 完遂不良の手動補完 SOP)
- `feedback_multi_review_3_panel_workflow.md` (3 体合議 1 メッセージ並列起動 workflow)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

「最高級ホテルのロビー」 比喩で言えば、 現状は:
- Sprint A 対象: 「3 部屋を縦に並べた狭い廊下」 状態 (small multiples 3 段、 各段の高さが小さすぎて差が読めない)
- Sprint B 対象: 「ロビーに置かれた絵画は美しいが、 サイズが分からない」 状態 (sparkline は推移を見せるが量を見せない)

**Sprint A** = 廊下を「3 つの肖像画を 1 枚のタブローに統合した壁面」 に変える (grouped bars 1 段 + cyan/teal/slate の brand tone)。 5 感情語彙のうち **驚き** (cluster 配置の対比) + **洗練さ** (Aman 級 tone palette) に貢献。

**Sprint B** = 絵画に「実寸 cm 表記」 を添える (trend % chip)。 5 感情語彙のうち **興奮** (+12% / -8% が瞬時に伝わる) + **楽しい** (パッと見で「強い/弱い」 が分かる達成感) に貢献。

`feedback_brand_aspiration.md` の anchor 修正禁止項目 (5 感情語彙 / Aman 比喩) は **不変**、 新しい修飾語追加なし。

---

## 3. Trust Cliff チェックリスト

| 項目 | 状態 |
|---|---|
| LP 訴求文言「3 銘柄/日まで無料」 と本 SPEC の整合 | N/A: LP UI には触らず、 判定タブ Pane 3 内部の polish のみ |
| LP「登録不要」 と本 SPEC の整合 | N/A: 認証境界触らず、 demo モードも温存 |
| 「Pro 限定」 表記の整合 | Sprint A の **DPS 条件付き 4 本目** は配当銘柄全員 (Pro 不要)、 Pro lock 追加なし。 既存 Pro lock (DeltaRow / 過去業績拡張) と矛盾なし |
| 価格表記 (¥2K/月 etc) の整合 | N/A: 課金 UI 触らず |
| じっちゃま表記の漏れ | UI 文字列 0 件期待 (内部 comment OK)。 EarningsHistoryInfoModal の凡例追記時に「独自プロトコル §5」 表記維持、 「じっちゃま」 出さない |

**結論**: Trust Cliff risk = **低**。 LP 訴求への影響なし、 内部 polish のみ。

---

## 4. Hallucination Guard 適合

| 項目 | 値 |
|---|---|
| LLM 呼び出しを含むか | **No** (Sprint A / B 両方とも frontend 純計算 + backend 数値拡張のみ) |
| Sprint A の `salesPerShare` 取得方法 | FMP `/stable/key-metrics` (Premium plan)、 もしくは `revenue / diluted_shares` で backend `_compute_earnings_metrics` 内で計算。 **aggregator/ パッケージへの LLM SDK import は厳禁** (pre-commit Check 3) |
| Sprint B の `trend %` 計算方法 | frontend 純計算 `(series[last] - series[0]) / Math.abs(series[0]) * 100`、 Number.isFinite ガード必須 |
| BLOCKLIST_REGEX 適用 | 該当 UI 文字列に「圧倒的 / 確実」 等の最上級表現を含めない (chip の aria-label は「直近 NQ 比 +X%」 のみ) |
| NEGATIVE_EXAMPLES BAD 1-6 違反 | 該当なし (LLM 出力経路 0) |

**結論**: LLM 不要、 静的計算 + sanitize layer のみで完結。 4 重防御の verify は「LLM 呼び出し 0 件」 を git diff で確認するのみで OK。

---

## 5. スプリント分割

### Sprint A: EarningsHistoryChart grouped bars 1 段化 (最優先)

**目的**: small multiples 縦 3 段 (現状、 y 軸高さ 100px で差が視認不能) を grouped bars 1 段 (年次 5 年 × 3 指標 cluster) に置換、 SPS 採用で per-share view に統一。

**触るファイル** (3-4 件想定):

| file | 変更種別 | 想定行数 |
|---|---|---|
| `backend/app/main.py` | `_compute_earnings_metrics` に **sps** 計算追加 (`revenue / diluted_shares`) + 既存 endpoint response に sps field 追加 | +10 / -0 |
| `backend/app/main.py` | `/api/guidance/{ticker}/quarterly-history` の history dict に `sps_actual` 追加 (income_q.revenue / income_q.weightedAverageShsOutDil で計算) | +15 / -2 |
| `frontend/src/components/EarningsHistoryChart.jsx` | `SmallMultipleBar` 3 段 → `<BarChart>` 1 段 + 3 系列 grouped bars + tone palette (cyan/teal/slate) + 年次 5 年 (`periods.slice(-20)` で 4 quarters/year × 5 = 20 → 年集計) + YoY% badge/tooltip + DPS 条件付き 4 本目 | +180 / -200 |
| `frontend/src/components/EarningsHistoryChart.jsx` (InfoModal 部分) | グルーピング解説 + cyan/teal/slate 凡例 + YoY% badge 凡例 に置換 | +30 / -25 |

**呼ぶ既存 skill** (Generator 段階):
- `chart-tab` (Recharts grouped bars 拡張)
- `design-system-check` (cyan/teal/slate token 整合 + raw hex 0 件)
- `release-check` (sprint 完了時の最終 gate)

**完了判定基準**:
- [ ] backend `/api/guidance/AAPL/quarterly-history` response に `sps_actual` field が含まれる (curl + jq で verify)
- [ ] frontend EarningsHistoryChart が 1 段表示で 3 indicators (SPS / EPS / CFPS) を grouped bars で描画
- [ ] 年次集計 (5 年) になっている (X 軸 label = `'21 / '22 / '23 / '24 / '25` 等)
- [ ] DPS 条件付き 4 本目: `dividend_yield > 0.5%` 時のみ 4 本目 (default は 3 本)
- [ ] YoY% は緑/赤 badge (tooltip 内文字色) で表現、 bar 色は cyan/teal/slate 維持
- [ ] cluster hover で 4 指標 + YoY% 同時表示 (CustomTooltip 拡張)
- [ ] CFPS-EPS 補助線 (Sprint 2 で追加) は **撤去 or grouped bars 対応に再配置** (small multiples 撤去のため)
- [ ] `npm run build` PASS (chunk size warning 増加なし)
- [ ] design-system-check PASS (raw hex 0、 elevation_scale.md whitelist 内のみ)
- [ ] Production 5 銘柄 dogfood (AAPL / NVDA / TSLA / MSFT / META) で 5 年 cluster 描画 + Number.isFinite 違反 0 件

**自己評価メトリクス 5 項目** (Generator self-eval JSON 出力):
1. `npm run build` exit code = 0
2. `grep -c "MNaN" frontend/dist/assets/*.js` = 0 件 (NaN safety)
3. `grep "data-testid=\"earnings-grouped-bar-\(sps\|eps\|cfps\|dps\)\"" frontend/src/components/EarningsHistoryChart.jsx` = 3-4 件 hit
4. `grep "isAnimationActive={false}" frontend/src/components/EarningsHistoryChart.jsx` = 全 `<Bar>` で hit (新規 Bar / ReferenceLine 追加分すべて)
5. design-system-check PASS

**Evaluator 4 層** (sprint 完了後に Evaluator subagent が check):
- **L1 syntax**: `npm run build` PASS / ESLint error 0
- **L2 selector**: 新規 testid `earnings-grouped-bar-{sps|eps|cfps|dps}` が source + dist 両方で grep hit
- **L3 mount**: production curl で `/assets/EarningsHistoryChart-*.js` を取得し `grouped` / `cluster` キーワード grep
- **L4 visual** (任意): snap script で Pane 3 scroll + screenshot、 1 段化 + 5 cluster 描画確認 (Visual Diagnostic Harness Exception 4 条件遵守)

**重要 risk (Sprint A 固有)**:
- handover v87 Sprint 2 で追加した **(CFPS - EPS) 補助線**は small multiples の CFPS 段に依存。 grouped bars 1 段化で削除する場合、 EarningsHistoryInfoModal の「色の凡例」 から CFPS-EPS 補助線説明 (7 行) も整合的に削除する必要あり。 削除 vs 移植は Generator の判断 (推奨: 削除して別 anchor に温存、 grouped bars では `cfps_bar > eps_bar` という cluster 内対比で自然に伝わる)。
- 年次集計の元データ shape: `periods` が `slice(-8)` 四半期だと年次 5 年に足りない。 backend で `limit=20` 取得 + frontend で年次集約 (Q4 = annual の慣行) または backend `/api/guidance/{ticker}/annual-history` 新規 endpoint 検討。 **Generator は backend endpoint 新設より frontend 集約を優先** (blast radius 小)。

---

### Sprint B: ConditionSparkline trend % chip 追加

**目的**: collapsed 状態の per-condition sparkline 右隣に **trend % chip** を 1 つ追加、 「緑/赤の dot だけでは強度が伝わらない」 という dogfood feedback を解消。

**触るファイル** (3 件想定):

| file | 変更種別 | 想定行数 |
|---|---|---|
| `frontend/src/features/judgment/components/detail/ConditionSparkline.jsx` | `<div>` wrapper の隣に新規 `<TrendChip>` を追加 (size 28-36px height、 inline)。 計算: `(series[last] - series[0]) / Math.abs(series[0]) * 100`。 `Number.isFinite` + `series.length < 2` で conditional gate | +60 / -2 |
| `frontend/src/features/judgment/components/detail/ConditionRow.jsx` | `gridTemplateColumns` を `24px 1fr 80px 96px 16px` → `24px 1fr 80px 96px 56px 16px` に拡張 (chip 56px column 追加)、 ConditionSparkline component の周りに `<div style={{ display: 'flex', gap: 4 }}>` で sparkline + chip を inline 配置 | +15 / -2 |
| `frontend/src/features/judgment/components/detail/ConditionRow.jsx` (もしくは ConditionSparkline.jsx 内) | aria-label に「直近 NQ 比 +X%」 を追記 (既存 sparkline の aria-label と chip aria-label を別個または合成) | +5 / -2 |

**呼ぶ既存 skill** (Generator 段階):
- `design-system-check` (緑/赤 token 整合 + raw hex 0 件 + Stripe Sigma / Linear chip idiom)
- `release-check` (sprint 完了時の最終 gate)

**完了判定基準**:
- [ ] ConditionRow 5 行すべてで sparkline の右隣に trend % chip が描画
- [ ] PASS 条件 → 緑 chip / FAIL 条件 → 赤 chip / trend ±0% 近傍 (±0.5% 以内) → neutral muted chip
- [ ] chip 内テキスト = `+12%` / `-8%` 形式、 小数点 0 桁 (整数表示)、 1000% 超は `>999%` で打ち切り
- [ ] `series.length < 2` または `Number.isFinite(series[0]) === false` で chip 非 render (sparkline と同じ conditional gate)
- [ ] aria-label に「直近 NQ 比 +X%」 が含まれる (NVDA testid 等で querySelector + getAttribute で verify)
- [ ] chip size = height 28-32px / padding 2px 8px / border-radius var(--radius-sm)、 layout 圧迫しない
- [ ] sparkline (96px) + gap 4px + chip (56px) = 156px、 grid column 構成と整合
- [ ] design-system-check PASS (var(--color-gain) / var(--color-loss) / var(--text-muted) のみ、 raw hex 0)
- [ ] Production 5 銘柄 dogfood で 5 条件 × 5 chip = 25 chip 全て描画 + Number.isFinite 違反 0 件

**自己評価メトリクス 5 項目**:
1. `npm run build` exit code = 0
2. `grep -c "MNaN" frontend/dist/assets/*.js` = 0 件
3. `grep "data-testid=\"condition-trend-chip-" frontend/src/features/judgment/components/detail/ConditionSparkline.jsx` = 1 件 hit
4. `grep "var(--color-gain)\|var(--color-loss)\|var(--text-muted)" frontend/src/features/judgment/components/detail/ConditionSparkline.jsx` = chip 部分で hit (raw hex 0)
5. design-system-check PASS

**Evaluator 4 層**:
- **L1 syntax**: `npm run build` PASS
- **L2 selector**: 新規 testid `condition-trend-chip-{N}` (N=0-4) が source + dist 両方で grep hit
- **L3 mount**: production curl で `/assets/JudgmentDetail-*.js` 取得 → `trend-chip` grep
- **L4 visual** (任意): snap script で AAPL の 5 conditions row 全部 capture、 chip 5 個描画 + 色配色確認

**重要 risk (Sprint B 固有)**:
- **trend % 計算式の選択**: `series` は backend 由来の T-2 / T-1 / T の 3 点 (条件 1-5 で意味が異なる可能性)。 「最古点 vs 最新点」 で問題ない条件もあれば、 「絶対値変化率」 が読みにくい条件もあり得る (条件 5 = CFPS > EPS は cfps_minus_eps の絶対変化、 比率は意味不明)。 **Generator は条件 type に応じた formula 切替を検討せず、 すべて同一式 `(last - first) / Math.abs(first) * 100` で統一**、 first = 0 のときは chip 非 render (Number.isFinite ガード)。 ユーザーから条件別に意味づけを変えてほしいと feedback あれば Sprint C で再対応。
- chip 自体に `:hover` cyan ring を焼き込まない (baseline は muted neutral 維持、 `feedback_no_baseline_cyan.md`)。 色は意味色 (gain / loss / muted) のみで brand 色 (cyan) は使わない。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

### CLAUDE.md 由来 (永続)

- `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1)
- `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) — Sprint A backend は **main.py + 必要に応じて fmp_client.py のみ**、 aggregator/ 触らない
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor)
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX (typo 修正は OK だが本 SPEC では不要)
- `.claude/launch.json` (人間用)
- `migrations/*.sql` (DB schema)
- `handover_*.md` (read-only)
- `railway.toml` cron 定義
- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域)
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク)

### handover v87 §4 由来 (Phase 1 で追加された触らない領域)

- `ConditionSparkline.jsx` の **SparklineErrorBoundary class** (Chart Overlay 4 層防御 1 層目、 削除禁止)
- `ConditionSparkline data source `result.conditions[i].series`** (`history_values` ではない、 backend field name 不変)
- `DiagramCard.jsx` 2257+ 行 (追加のみ、 既存 SVG path / Saga rendering / narrative-appear / flashRef 不変)
- `DiagramCard empty state 文言 6 種` (v87 hotfix 確立済、 「データ準備中」 への退行禁止)
- `EarningsHistoryInfoModal 凡例` の brand voice (「独自プロトコル §5」 表記、 「じっちゃま」 0 件)

### Sprint A 固有 (新規追加の禁止指示)

- `frontend/src/components/EarningsHistoryChart.jsx` の **EarningsHistoryChartErrorBoundary class** (Chart Overlay 4 層防御 1 層目、 削除禁止)
- `_compute_earnings_metrics` 関数の **既存 eps / cfps 計算ロジック** (sps 追加のみ、 既存 field の semantics 不変)

### Sprint B 固有

- `ConditionRow.jsx` の **expanded detail 部分** (DeltaRow + Sparkline 56px height + ConditionModal、 chip 追加で expanded 構造は不変)
- `gridTemplateColumns` 文字列 (`24px 1fr 80px 96px 16px`) は **慎重に拡張**: 既存 5 column → 6 column 追加なので、 chip 削除されてもレイアウトが破綻しないよう default を維持
- `ConditionSparkline.jsx` の ResponsiveContainer / LineChart / ReferenceDot 既存構造 (chip は別 sibling div、 内部に injection しない)

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 3 軸を本 SPEC に適用:

| 軸 | active? | 根拠 |
|---|---|---|
| 1. LLM 出力品質 (景表法 / 金商法 / hallucination risk) | **No** | LLM 呼び出し 0 件、 backend aggregator/ 触らず、 frontend sanitize 経路触らず |
| 2. Trust Cliff (LP 訴求 vs 実装の整合) | **No** | 判定タブ Pane 3 内部 polish のみ、 LP / 課金 UI / 認証境界触らず |
| 3. 新 backend endpoint + RLS / 認証境界 + cache 設計 | **No** (もしくは弱 active) | 既存 `/api/guidance/{ticker}/quarterly-history` に sps_actual field 追加のみ、 endpoint URL / RLS / cache TTL 不変。 仮に新 endpoint 必要になった場合のみ弱 active |

**結論**: 3 軸 0 active = **3 体合議で十分** (推奨構成: ui-designer + frontend-architect + qa-dogfooder)。

**起動 timing**: Sprint A + Sprint B 両方完了 + main merge 後の Phase 1.5 完了 gate で 1 メッセージ並列起動 (`feedback_multi_review_3_panel_workflow.md` の workflow 踏襲)。 sprint 毎の起動は不要。

**6 体合議への昇格条件**: 3 体合議の最中に 「年次集計 vs 四半期集計」 「DPS の brand 整合性」 「chip の意味色 vs brand 色の対立」 等で対立が表面化したら 6 体合議に昇格 (金融アナリスト + brand-aspiration + web-marketer 追加)。

---

## 8. 想定リスク + roll-back plan

### Sprint A の想定 risk

| risk | 影響 | mitigation | roll-back |
|---|---|---|---|
| 年次集計式 (Q4 = annual vs Q1+Q2+Q3+Q4) で銘柄ごとに差異 | grouped bars の値が機関投資家の正しい annual と一致しない (Trust Cliff) | backend の `_compute_earnings_metrics` で `sum(Q1..Q4) / 4` ではなく **fiscal year 単位の sum** (revenue) / **平均** (eps / cfps) を採用、 calendar year ベース。 FMP `/stable/income-statement?period=annual` を使う案も検討 | `git revert <Sprint A commit hash>` で small multiples 3 段に戻る (Sprint 1-3 復元) |
| EarningsHistoryChart bundle size 増加 (grouped bars + custom tooltip + tone palette) | initial bundle +5-10 KB、 Pane 3 lazy chunk 増加 | React.lazy 維持 (既存 lazy 候補)、 raw chart code は code-split で chunk 分離維持 | bundle size warning 出たら chunk 分割 review |
| CFPS-EPS 補助線 (Sprint 2 で追加) 削除に伴う Info Modal 凡例 drift | dogfood で「凡例にあるのに表示されない」 と feedback | Sprint A で **EarningsHistoryInfoModal の CFPS-EPS 補助線説明 7 行を必ず削除** + cyan/teal/slate 凡例 + YoY% badge 凡例で置換 | git revert で凡例復活 |
| DPS 条件付き 4 本目の condition (`dividend_yield > 0.5%`) を取得する data source 不明 | DPS 4 本目が出ない or 配当 0 銘柄でも出る (誤表示) | 既存 `/api/guidance/{ticker}/basic` または `/api/insights/{ticker}` の dividend_yield field を再利用、 取得不可なら 3 本固定 fallback | DPS 4 本目を一旦カット、 Sprint A.1 で延期 |

### Sprint B の想定 risk

| risk | 影響 | mitigation | roll-back |
|---|---|---|---|
| 条件 type 別の formula 統一で意味不明 chip 表示 (例: 条件 5 CFPS-EPS で `-100%` が出る) | dogfood で「この -100% は何?」 と疑問が出る | 統一式 `(last - first) / Math.abs(first) * 100`、 `Math.abs(first) < epsilon` のとき chip 非 render (Number.isFinite ガード) | git revert で chip 削除、 Sprint C で条件別 formula に再対応 |
| chip 56px column 追加で mobile (375px) の row が overflow | layout 圧迫、 PASS/FAIL badge が改行 | mobile breakpoint で chip 非 render or chip width 縮約 (40px、 +X% を `+12` 表示)。 `@media (max-width: 480px)` の condition row CSS は touch せず、 chip 自身が `display: none` するか | git revert で chip 削除 |
| chip に baseline cyan 焼き込み (色ルール違反) | 強調が分かりにくい + brand 整合崩壊 | gain (緑) / loss (赤) / muted (中立) のみ使用、 cyan は brand 色なので使わない (`feedback_no_baseline_cyan.md`) | design-system-check で block されるので発生しない想定 |
| aria-label の reading 過多 (sparkline + chip 両方読み上げる) | スクリーンリーダーで重複 | sparkline の既存 aria-label を保持 + chip を `aria-hidden="true"` にして、 sparkline の aria-label に「直近 NQ 比 +X%」 を merge | 別個 aria-label でも accessibility 仕様上 OK、 dogfood で feedback あれば調整 |

### 緊急 roll-back 手順

1. Phase 1.5 deploy 後 5 銘柄 dogfood で重大 visual 不具合 (Pane 3 真っ白 / chart 描画 0 / chip layout 破綻) → 即時 `git revert <merge commit>` で Phase 1 状態に戻す
2. Railway redeploy: `railway up --detach` で 5-10 分以内に復旧
3. handover v88 で問題分析 + 再着手 SPEC (Phase 1.5b) 起票

---

## 9. PGE 3 体ループ運用方針 (v87 SOP 踏襲)

### sprint 単位の自動化フロー (gate 1/2 省略)

```
Planner (本 SPEC 起票完了)
  ↓
Generator subagent (Sprint A worktree 派生 → 実装 → self-eval → commit)
  ↓ main merge (手動 or auto)
Evaluator subagent (Sprint A worktree で L1-L4 検証)
  ↓ PASS
Generator subagent (Sprint B worktree 派生、 Sprint A 完了 main から fresh branch)
  ↓ main merge
Evaluator subagent (Sprint B 検証)
  ↓ PASS
3 体合議 (Phase 1.5 完了 gate、 1 メッセージ並列起動)
  ↓ verdict 集約 + hotfix 1 commit
Railway deploy (`railway up --detach`)
  ↓
LP 5 銘柄 dogfood + handover v88 起票
```

### v86 4 落とし穴の回避

| 落とし穴 | 本 SPEC での回避策 |
|---|---|
| worktree 非累積 | Sprint A 完了 → main commit → Sprint B 起動 で順次累積 |
| selector hallucination | 新規 testid `earnings-grouped-bar-{sps\|eps\|cfps\|dps}` / `condition-trend-chip-{N}` を source + dist 両方で grep verify |
| ESM top-level return | snap script を本 SPEC では新規生成しない (既存 snap-active.mjs / snap-debug-pane3.mjs 流用可能、 Visual Diagnostic Harness Exception 4 条件遵守) |
| infinite animation finish() | 全 Recharts `<Bar>` / `<Line>` / `<ReferenceLine>` に `isAnimationActive={false}` 明示 |

### v87 落とし穴 (Generator self-eval 完遂不良) の回避

`feedback_generator_selfeval_incomplete.md` の SOP に従い、 main 側で必ず手動補完:
1. Generator subagent report が「design-system-check PASS」 だけで終わったら、 **build verify (`npm run build`) 手動実行**
2. **testid grep verify 手動実行** (selector hallucination 防止)
3. **NaN safety verify 手動実行** (`grep -c "MNaN" frontend/dist/assets/*.js` = 0 件)
4. **Evaluator subagent 手動起動** (`Agent({ subagent_type: 'evaluator', ... })`)

---

## 10. 関連 anchor / 参照

### 必読 memory anchor (Generator が Sprint 起動前に Read)

- `project_earnings_history_grouped_redesign.md` — Sprint A 2 体合議 SSOT、 設計 6 項目 + DPS 条件付き 4 本目
- `feedback_pge_loop_pitfalls.md` — v86 4 落とし穴
- `feedback_chart_overlay_safety.md` — Chart Overlay 4 層防御 SSOT
- `feedback_diagram_quality_guard.md` — Hallucination Guard 4 重防御 (本 SPEC は LLM 不変だが verify)
- `feedback_pre_release_priority.md` — pre-release context
- `feedback_brand_aspiration.md` — Aman 級世界観
- `feedback_no_baseline_cyan.md` — baseline cyan 禁止 + chip 配色
- `glow_elevation_postmortem.md` — 発光バグ root cause
- `elevation_scale_canonical.md` — shadow / hex / !important whitelist
- `feedback_generator_selfeval_incomplete.md` — Generator self-eval 完遂不良 SOP
- `feedback_multi_review_3_panel_workflow.md` — 3 体合議 workflow

### 必読 handover / SPEC

- `handover_2026-05-20_v87.md` §3 §7 — 次セッション action 候補 + 触らない領域
- `docs/specs/SPEC_2026-05-20_pane3-completion-phase1.md` — Phase 1 SPEC、 EarningsHistoryChart Sprint 2 で追加した CFPS-EPS 補助線の経緯

### 必読 implementation file

- `frontend/src/components/EarningsHistoryChart.jsx` 全 511 行 (Sprint A 主編集対象)
- `frontend/src/features/judgment/components/detail/ConditionSparkline.jsx` 全 152 行 (Sprint B 主編集対象)
- `frontend/src/features/judgment/components/detail/ConditionRow.jsx` 32-200 行 (Sprint B grid 拡張)
- `backend/app/main.py` 2975-3045 `_compute_earnings_metrics` + 4863-5003 `/api/guidance/{ticker}/quarterly-history` (Sprint A backend 拡張)

---

## 11. 完了定義 (Phase 1.5 全体 DoD)

### コード品質

- [ ] Sprint A + B の全 commit が `npm run build` PASS
- [ ] design-system-check PASS (raw hex 0、 elevation_scale.md whitelist 内)
- [ ] `grep -c "MNaN" frontend/dist/assets/*.js` = 0 件
- [ ] `grep -c "isAnimationActive" frontend/src/components/EarningsHistoryChart.jsx` >= 既存 + 新規 Bar 数 (全 Bar / Line / ReferenceLine に明示)
- [ ] `grep -c "じっちゃま" frontend/src/components/EarningsHistoryChart.jsx frontend/src/features/judgment/components/detail/ConditionSparkline.jsx frontend/src/features/judgment/components/detail/ConditionRow.jsx` = 0 件 (UI 文字列、 内部 comment は OK)

### Trust Cliff DoD

- [ ] LP 訴求文言「3 銘柄/日まで無料」「登録不要」 への影響なし (LP UI 触らず、 grep で App.jsx 変更行 = 0)
- [ ] 「Pro 限定」 機能の追加なし (DPS 4 本目は配当銘柄全員、 Pro lock 追加 0)
- [ ] 既存の Pro lock (DeltaRow) と矛盾なし

### multi-review 3 体合議 (Phase 1.5 完了 gate)

- [ ] ui-designer / frontend-architect / qa-dogfooder の 3 体を 1 メッセージで並列起動
- [ ] 3 体共通結論 + 各体差別化提案 + 対立論点を main 側で集約
- [ ] 「条件付賛成」 verdict の場合、 hotfix 1 commit で対応
- [ ] verdict サマリを handover v88 §0 に記録

### Production deploy 後の dogfood (Phase 1.5 真の完了)

- [ ] Railway deploy 成功 (`railway up --detach` exit 0)
- [ ] bundle hash 確認 (新 `EarningsHistoryChart-*.js` / `JudgmentDetail-*.js` / `index-*.js` 名)
- [ ] LP 5 銘柄 dogfood (AAPL / NVDA / TSLA / MSFT / META) で:
  - [ ] EarningsHistoryChart grouped bars 1 段、 5 年 cluster 描画、 cyan/teal/slate tone
  - [ ] DPS 配当銘柄 (AAPL / MSFT 等) で 4 本目描画、 growth 銘柄 (NVDA / TSLA / META) で 3 本固定
  - [ ] ConditionRow 5 行すべてに sparkline + chip 表示、 chip 値が「強い/弱い」 を瞬時に伝える
  - [ ] Pane 3 真っ白事故 0 件
  - [ ] mobile 375px viewport で row layout 圧迫 0 件
- [ ] dogfood 結果を handover v88 §1 に記録

### memory anchor 更新

- [ ] `project_earnings_history_grouped_redesign.md` を 「Phase 1.5 で実装完了 mark」 推奨
- [ ] handover v87 §4 「v87 追加候補」 を v88 で再評価

---

## 付録 A: Generator subagent 起動時の引き渡し情報

### Sprint A 起動 prompt 雛形

```
SPEC_PATH: /Users/yamadadaiki/Projects/beatscanner/docs/specs/SPEC_2026-05-20_pane3-phase15-hotfix.md
SPRINT: A
WORKTREE_BRANCH: claude/pane3-phase15-sprint-a
TARGET_FILES:
  - backend/app/main.py (_compute_earnings_metrics + /api/guidance/{ticker}/quarterly-history で sps_actual 追加)
  - frontend/src/components/EarningsHistoryChart.jsx (small multiples 3 段 → grouped bars 1 段 + cyan/teal/slate + 年次 5 年 + DPS 条件付き 4 本目)
MANDATORY_READS:
  - memory/project_earnings_history_grouped_redesign.md (SSOT)
  - memory/feedback_chart_overlay_safety.md (4 層防御)
  - memory/feedback_pge_loop_pitfalls.md (4 落とし穴)
  - memory/feedback_no_baseline_cyan.md
  - memory/glow_elevation_postmortem.md
SELF_EVAL_JSON: frontend/.visual/generator-selfcheck-sprint-a.json (必ず Write tool で出力)
EVALUATOR_HANDOFF: Agent({ subagent_type: 'evaluator', ... }) を必ず起動
```

### Sprint B 起動 prompt 雛形

```
SPEC_PATH: /Users/yamadadaiki/Projects/beatscanner/docs/specs/SPEC_2026-05-20_pane3-phase15-hotfix.md
SPRINT: B
WORKTREE_BRANCH: claude/pane3-phase15-sprint-b (Sprint A merge 済 main から派生)
TARGET_FILES:
  - frontend/src/features/judgment/components/detail/ConditionSparkline.jsx (TrendChip 新規追加)
  - frontend/src/features/judgment/components/detail/ConditionRow.jsx (grid 6 column 拡張)
MANDATORY_READS:
  - memory/feedback_chart_overlay_safety.md (chip でも Number.isFinite + ErrorBoundary)
  - memory/feedback_no_baseline_cyan.md (chip 配色)
  - memory/feedback_pge_loop_pitfalls.md
SELF_EVAL_JSON: frontend/.visual/generator-selfcheck-sprint-b.json
EVALUATOR_HANDOFF: Agent({ subagent_type: 'evaluator', ... }) を必ず起動
```

---

**SPEC 起票完了**。 Generator subagent を Sprint A から起動して下さい。 user gate 1 は autonomous mode により自動承認とみなします。
