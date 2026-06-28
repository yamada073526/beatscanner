# SPEC 2026-06-29 — スクリーナー結果リスト 装飾横展開 + KB由来 追加指標

> 正本 mockup: `docs/specs/mockups/screener-result-table-v14.html`（user 添削反映・B案確定）。
> user 承認 (2026-06-29): ① gold 標榜=提案どおり / ② ガラス=B案(来期専用)+他カテゴリ hairline / ③ KB指標=提案どおり(別タスク起票)。
> 厳守: 件数SSOT不変(装飾は表示専用・PRESET_PREDICATES不触) / §38色ルール / Premium gate順序不変 / token のみ / deploy=PR。

---

## 背景
決算合格タブだけが「pip✓ / gold標榜行 / 来期ガラス2列」でリッチ、他 4 preset (new_high_break / sector_leader / quiet_quality / market_leading) は素の根拠列のみ (#105)。決算合格の演出を他タブへ展開し「どのタブも Aman/Ritz 級の豪華さ」を満たす (ブランド北極星 + 5原則①②)。

設計判断の核 (mockup v13→v14 添削):
- **pip✓ は横展開しない** — 他 preset は全行が戦略条件に合致済 → 全行 ✓ = ノイズ ([[feedback_minimalism_over_additive]])。pip は決算 verdict 専用。
- **gold 標榜は横展開する** — 戦略内の「別格」を上位サブセットのみ。gold continuity = signal ([[feedback_gold_accent_continuity]])。
- **ガラスは来期/将来値専用に維持 (B案)** — 来期列は決算合格のみ。他カテゴリは hairline 仕切り (§38 の将来値 signal を保全)。

---

## Part A — 装飾横展開 (frontend のみ)

### A1. ゴールド標榜行 (gold standout) 【本SPRINT 実装】

**概念**: 各 preset で「この戦略の条件を強く満たす別格」を上位サブセットだけ gold rail + wash で強調。既存 `.screener-grid-row.is-win` (index.css:14440-14441 = gold 5% wash + 3px gold gradient rail) を column-driven 行に再利用。

**§38 / 色ルール 適合**:
- gold は「過去/現在の事実で別格」を示すブランド「別格」マーカー。**将来予測でも買い推奨でもない** (景表法§5/金商法§38 非抵触)。既存 is-win=三拍子 (tri='ok') が precedent。
- gold は緑(上昇)でなくブランド色。色ルール (緑=上昇) と衝突しない。
- 意味を legend/tooltip で明示 (「★=この戦略の条件を強く満たす別格」)。

**per-preset criteria (本番 universe 2553件で較正・2026-06-29)** — 全て過去/現在事実・data欠落時は標榜しない(honest):

| preset | gold criteria | 較正(universe上限) |
|---|---|---|
| earnings_pass | `tri_verdict==='ok'` (三拍子・**既存維持**) | 317 |
| sector_leader | `is_sector_rs_leader===true && (roe>=17 \|\| ocf_margin_pct>=25)` | leader33件中 ~4 |
| market_leading | `rs_vs_spy_pct>=20 && latest_beat` | RS55-75&beat343件中 ~90(26%) ※vs_spy>=10は665件で緩すぎ→20に較正 |
| quiet_quality | `rs_percentile>=80 && volume_surge_pct<=0 && inst_holders_qoq_pct<=0` | ~19 |
| new_high_break | `is_new_52w_high===true && volume_surge_pct>=50` | **free fetchでは is_new_52w_high/breakout_state がPremium-masked=0件**。本preset は Premium専用list なので Premium には present。**post-deploy に Premium auth snap で較正**。 |

> 較正知見: absolute 閾値は母集団依存で脆い (market_leading は母集団全員が vs_spy≥5)。本SPRINTは上記較正値で出すが、**deploy後 本番で各preset の is-win 件数を snap し 0件/全件でないこと**を確認。将来 drift したら再較正 (将来候補: 「最厳 precision tier を通過」= 自己較正だが最厳表示時に全行gold化する辺ケースあり→今回は採らない)。

**実装点**:
- `ScreenerGridTable.jsx`: `presetWin(it, preset)` 純関数を追加 (export=unit test)。columnDriven 行 map に `win: presetWin(it, preset)` を追加し `ScreenerGridRow` へ `win` prop で渡す。
- `ScreenerGridRow.jsx`: `win` prop 追加。column-driven return の className に `win ? 'is-win' : ''`。leadCell の ticker 行に `win && columns` 時 ★ (winstar)。earnings 経路は従来 isWin(tri) 維持・★は出さない (左 pip ✓ が既にあるため)。
- `index.css`: `.screener-grid-winstar` (gold-mid ★) を is-win 群の近傍に追加 (token のみ)。

**検証**: presetWin unit test (較正 criteria を node env で固定) + vite build + 既存 vitest (件数SSOT 無傷) + **post-deploy 視覚 (user dogfood / Premium snap)**。

### A2. ガラス/hairline カテゴリ仕切り 【次SPRINT・要 列順決定】

- **B案確定**: glass(`--bg-future`)=来期/将来値のみ(決算合格)。他カテゴリ(収益の質/業種ローテ/提案列)=hairline。
- **未解決**: 現 `PRESET_COLUMNS` は category 順でない (例 new_high_break: nearHigh/vol/eps/beat/rs)。clean な zone 仕切りには列を category 順に grouping する必要 → #105 layout の列順変更 = 要 mockup 再承認。
- **方針**: 各 preset の列を {勢い/モメンタム, 収益の質, 機関, 実績} 等の category へ grouping し列順確定 → v15 mockup で承認 → hairline(`is-qualstart` 系) を zone 先頭に。**本SPRINTでは扱わない**。

---

## Part B — KB由来 追加指標 (backend 先行・別タスク)

出典: `investment-knowledge-base/knowledge_base/by_domain/trading.md` (投資条件の正本)。**閾値はKBが正・実装都合で変えない (Trust Cliff)**。gap 監査台帳=[[project_screener_condition_expansion]] (Phase2/3)。
規律: **数値計算=Python (aggregator層)・LLM不可** ([[feedback_llm_calc_separation]] / hallucination-guard pre-commit)。narration不要の物理指標。

### B1. CFPS>EPS (現金利益の質, gap#12)
- KB: trading.md:786-790 (オニール「CFPS が EPS を +20% 超で上回る=利益の質」)。
- data: FMP cash-flow の operatingCashFlow / sharesOutstanding / EPS。`cfps = OCF/shares`、指標 = `cfps_eps_ratio = cfps/EPS` または `(cfps-eps)/|eps|×100`。
- 物理層: aggregator で算出 → universe payload に `cfps_eps_ratio` 追加 (既存 cf_data 再利用=難易度 易)。
- 表示: 数値中立色(§38)。preset 根拠列 (収益の質カテゴリ) or facet。mockup v14 では「提案」ガラス無し hairline 列で提示済。
- §38: 過去確定実績の比率=中立表示。断定なし。

### B2. 業種グループRS (gap#5)
- KB: trading.md:3944/4347 (オニール「業種グループ上位50-100/下位回避」)。
- じっちゃま較正: 下位ハードカットせず加点扱い (忘却優良大型を下値で拾う逆張り・[[project_jijima_contrarian_quality_pattern]])。
- data: universe の sector 別 RS 集計 → 業種 percentile (既存 `sector_rs_median` 活用)。
- 物理層: aggregator で sector RS percentile 算出 → universe payload に `sector_group_rs_pct`。
- 表示: momentum/勢い 文脈列 (new_high_break 等)。中立色。

### B-tier/gate
Pro/Premium 判定は既存 `universe.locked_facets` 方式を踏襲 (新規 facet を locked に追加するか free かは funnel-cro 判断)。

### B-検証
hallucination-guard 4層該当チェック (LLM 経由しないなら数値physical層のみで可) / per-source namespace / 0件日の honest「—」。

---

## 実装順 (人力代替×容易性)
1. **【本SPRINT】A1 gold 標榜** — frontend のみ・既存 is-win CSS 再利用・較正済。PR。
2. A2 hairline カテゴリ — 列順 grouping 設計 → v15 mockup 承認 → 実装。
3. B1 CFPS>EPS — backend aggregator → universe payload → 列表示 (易)。
4. B2 業種グループRS — backend aggregator → 表示 (中)。

## Definition of Done (A1)
- [ ] `presetWin` 純関数 + unit test (5 preset criteria)。
- [ ] columnDriven 4 preset で gold rail+wash が上位サブセットに出る (earnings は従来維持)。
- [ ] 件数SSOT不変 (PRESET_PREDICATES/countPreset 不触・gold は表示専用)。
- [ ] §38: gold=過去/現在事実のみ・legend で意味明示・色ルール遵守。
- [ ] build + vitest pass。
- [ ] post-deploy 本番で各 preset の is-win 件数が 0件/全件でない (snap or dogfood)。new_high_break は Premium auth で確認。
