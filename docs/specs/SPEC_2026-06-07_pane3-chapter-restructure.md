# SPEC 2026-06-07: Pane 3 入れ子章再編 (ファンダ/テクニカル親章化 + 新 5 ブロック構成)

> **Status**: planner 起票 (autopilot、user 就寝中のため gate 1 はスキップし推奨案で確定)
> **SSOT**: memory `project_canslim_screener_expansion.md` の §🟢 grill-me 確定設計 (v184)。本 SPEC は再設計ではなく **文書化 + sprint 分割 + 危険箇所 inject + gate 明記** が役割。
> **実装主体**: `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` の `isV4` return ブロック
> **進行**: SPEC 化 → 6 体合議 (Sprint 4 着手前 gate) → PGE 3 体ループ実装

> 🛑 **HOLD (2026-06-13 user 確認)** — **planner / generator / evaluator / autopilot は本 SPEC に着手禁止。**
> user 本人に「この SPEC を体系的にレビュー・承認した記憶があるか」を確認 → **「覚えていない」**。
> 本 SPEC は上の Status 行のとおり **autopilot (user 就寝中) で gate 1 (user 承認) を skip して推奨案で確定**したもの。
> handover letter (2026-06-13)「過去 Claude が書いた企画書を、別 Claude が紙に書いてある理由だけで信じて実装する自己参照ループ」の典型に該当しうる。
> **現状**: Sprint 1 (5 ブロック骨格) のみ着地。Sprint 2 (図解 free ぼかし) / Sprint 3 (章サマリー拡張 + SummaryBrief 廃止) / Sprint 4 (3 軸 §38 gate) は **未実装のまま保留**。`isPane3V5` は依然 default OFF (一度も昇格していない)。
> **再開条件**: ① 北極星 (悪循環を断つ / 時間を返す / 経済的自由) に照らした v5 章再編の**優先度を grill-me で user と再評価** ② 依拠する「v184 grill-me 確定設計」(memory `project_canslim_screener_expansion.md` §🟢) の**起源を実物確認** (本当に user との grill-me 逐語か、Claude のまとめか) ③ user が gate 1 を**明示承認**。
> **懸念 (再評価の論点)**: v5 章再編は「人間が見る道具 (Pane3) の磨き込み」寄りで、本丸 (中身の質 = 選別眼 / 配信) ではない疑い。letter「磨き込みに吸い寄せられるな」。

---

## 1. Context

### user prompt 原文 (grill-me で確定済の要望)
> ペイン3 を「入れ子の章再編」する。ファンダ・テクニカルを親章にし、子 section をまとめ直す (単純並び替えでない)。新 5 ブロック: ①ティッカー ②図解 ③ファンダ章 ④テクニカル章 ⑤その他。各章の冒頭に静的サマリー (判定バッジ + 文 + 指標 chip)。総合 AI 要約 (SummaryBrief) は廃止し各章サマリーに一本化。

### なぜ今やるか (根拠)
- **handover v183 §🔵 + memory v184**: CAN-SLIM Phase 3 S5 完了報告後、user が発表会 FB (§C) の実装結果を再確認 → 「ペイン3 2大分類」「screener 2本柱」は実装済 (S2 `70e39e3`) だが **user のイメージと相違**。section の並び順・粒度が希望と異なる。
- **grill-me で主要決定は完了済 (v184、grill 8 決定)**。本 SPEC は詰め直しでなく落とし込み。
- **根拠の核 (user 指摘)**: ①現状の「総合判定」は判定材料がファンダのみ → 「総合」名乗りは軽 Trust Cliff → ファンダ章へ移すのが筋。②5 条件クリアが全米 2 銘柄で厳しすぎ → 3 軸総合で「直近決算が良い銘柄」も評価可にしたい。

### 必読 memory anchor (Generator は実装前に必ず Read)
- `feedback_triage_banner_pattern.md` (章①の保有時のみ TriageBanner 最上位)
- `feedback_condition_pulse_pattern.md` (章サマリー = 静的 mapping + outline CSS、schema 不変)
- `feedback_diagram_quality_guard.md` / `feedback_llm_calc_separation.md` (§38 / §5、章サマリー LLM 不使用)
- `glow_elevation_postmortem.md` / `css_specificity_gotchas.md` (章サマリーを card 化する際の発光リスク)
- `feedback_pge_loop_pitfalls.md` (JudgmentDetail.jsx を複数 sprint で触る = 累積なし罠)
- `feedback_testid_all_render_paths.md` (全 state に data-testid)
- `feedback_minimalism_over_additive.md` (章サマリーの装飾は重要部のみ、全 section 拡張は regression)

### 期待される成果 (5 原則のどれに貢献するか)
- **原則 1 (読み手に負担をかけない / 2 秒理解)**: 散在する判定情報を「ファンダ章 / テクニカル章」の 2 つの静的サマリーに集約 → パッと見で各章の結論がわかる。
- **原則 3 (シンプルかつリッチ)**: 中学生でもわかる「2 大分類 + 各章の見出しサマリー」構造。装飾は既存 token のまま。
- **原則 5 (図解で認知コストを下げろ)**: 章サマリーの「判定バッジ + 指標 chip」が長文の代替。図解を 2 番目に前出しして視覚理解を早める。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情語彙 = **洗練さ (sophistication)** と **楽しい (joy)**。
最高級ホテルのロビー比喩で言えば、現状の Pane 3 は「判定 hero・AI 要約・5 条件・チャート・各種 card が一列に並ぶ廊下」で、どこが「ファンダの部屋」「テクニカルの部屋」かの導線がない。本再編は **「ロビー → 各章 (フロア) への明確な案内表示」** を作る。各章の冒頭サマリー (判定バッジ + 静的文 + 指標 chip) が「フロアごとの受付」となり、読み手は 2 秒で「このフロアの結論」を把握してから詳細へ降りられる。総合 AI 要約 (SummaryBrief) の廃止は「ロビーに置かれた冗長な総合パンフレット」を撤去し、各フロアの受付に役割を一本化する整理であり、洗練さに直結する。

`feedback_brand_aspiration.md` の **修正禁止 anchor を破壊しない**: 章サマリーは新規 token を導入せず既存 elevation / 投資色ルール (緑=上昇 / 赤=下落 / amber=警告 / cyan=ブランド emphasis 専用) のみ使用。判定バッジに cyan を「強い/良い」の意味で使わない (色ルール厳守)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言との整合を 3 項目以上検証 (詳細は §5 Sprint 4 の 6 体合議 gate に委譲する判断あり):

1. **「5 条件無料」訴求 vs 章サマリー 3 軸化**: ファンダ章サマリーが「ファンダ5条件 N/5 + 直近4半期 3+1条件 + 来4半期コンセンサス」の 3 軸 → 総合 3 段階 (強い/標準/弱い) になる。screener の「条件クリア/未達」は **5 条件ベースのまま維持** し、Pane 3 章サマリーだけ 3 軸にする **分離案が有力**。両者が矛盾しないか (例: screener で「5 中 2」の銘柄が Pane 3 章サマリーで「強い」と出ると Trust Cliff) は **§5 Sprint 4 の 6 体合議 gate ③ で verdict 必須**。
2. **「総合判定」表記の正当性**: 現状の判定 hero は実質ファンダのみで判定しているのに「総合」を名乗る軽 Trust Cliff (user 指摘)。本再編で判定 hero をファンダ章サマリーへ統合し、テクニカルは別章サマリー (強気/中立/弱気) に分離 → 「ファンダの結論」「テクニカルの結論」を明示分離することで誇張表記を解消する。
3. **図解の free/Pro gate (LP 課金訴求 vs 実装)**: 章②図解を free=ぼかしプレビュー + Pro CTA にする際、LP の Pro 訴求 (図解=Pro) と完全一致させる。具体 UI は `funnel-cro` skill の Trust Cliff 7 項目 checklist に委譲 (§5 Sprint 2)。現状 free=PremiumLock の minimal D 案 (`JudgmentDetail.jsx` L1092) からの変更となるため、CTA 文言・blur 度合いを funnel-cro で再検証。
4. **§38 (断定的判断の提供)**: テクニカル章サマリーの「強気/中立/弱気」は将来予測の断定でなく、現在のデータ状態 (RS percentile / Distribution Days 等) の静的記述に留める。LLM 不使用。詳細は §4。

---

## 4. Hallucination Guard 適合

### LLM 呼び出しを含むか: **no (新規 LLM 呼び出しなし)**

- 章サマリー (FundamentalsChapterSummary / TechnicalChapterSummary) は **静的 template の拡張** であり、判定バッジ・サマリー文・指標 chip はすべて **既存の Python 計算済データ (5条件 PASS/FAIL、3+1条件、forward_visibility、RS percentile、Distribution Days 等) を frontend で読んで静的 mapping で文字列化**する。`feedback_condition_pulse_pattern.md` の `STATE_LABEL_JP` パターンと同型。
- **総合 AI 要約 SummaryBrief は廃止**するため、むしろ既存の LLM narration 1 系統が減る (cost 減 + §38 安全 + 重複解消)。新規 LLM endpoint は追加しない。
- **§38 / §5 ガード**: テクニカル章サマリーは「強気/中立/弱気」の 3 段階だが、これは「上がる/下がる」の断定的将来予測ではなく **現在のテクニカル状態の分類ラベル** に留める。サマリー文は静的 dict で「RS が市場上位 X%」「直近 N 営業日で売り抜け日 M 回」等のデータ事実のみ。`feedback_sell_zone_static_dict.md` の「sell zone narration は静的 dict 一択、LLM 拡張 BAN」と同方針。
- **3 軸合成ロジック (何点で「強い」か)** は §38 直結のため **§5 Sprint 4 で 6 体合議 gate 通過後に実装** (本 SPEC では閾値を確定しない)。

→ **結論: LLM 不要、静的 dictionary / Python 計算済データの frontend mapping で完結。aggregator / visualizer への LLM SDK import 追加なし。**

---

## 5. スプリント分割 (上限 6、本 SPEC は 5 sprint)

> **設計方針 (grill 決定 8)**: `JudgmentDetail.jsx` の `isV4` return ブロックを並び替え + 章サマリー/図解を変数化。**並び順を config 配列化** (将来調整容易化)。classic (legacy `?layout=classic`) は後追い。
> **現状把握 (Explore 済)**: `isV4` (`isPane3V4()` L227) は **default ON** (`?pane3_v4=0` が kill switch)。並び順は L1071-1119 の `isV4` return で JSX ハードコード。各 block 変数は L860-1059 で定義済。図解は StickyDiagramAccordion (L1081)。technicalHeader (L905) + TechnicalChapterSummary は **isV4 ON では現状 render されない** (legacy return L1127 のみ)。
>
> **⚠️ 重要規律 (pge-loop-debugger Rule)**: 本 SPEC は **JudgmentDetail.jsx を複数 sprint で連続して触る**。Generator subagent は worktree で sprint を跨いでも累積しないため、**各 sprint 完了時に main へ commit してから次 sprint に進む** (sprint 間 commit 必須、`feedback_edit_replace_all_drift` + `feedback_pge_loop_pitfalls` 罠)。
> **⚠️ selector 規律**: snap-*.mjs 検証や testid 参照で selector を扱う場合、**primary selector は必ず data-testid** (selector hallucination 防止)。全 state (loading/errored/empty/main) に testid 付与 (`feedback_testid_all_render_paths`)。

### Sprint 1: config 配列化 + ブロック並び替え (SAFE-SHIP、判定ロジック不変)
- **目的**: 新 5 ブロック構成 (①ティッカー ②図解 ③ファンダ章 ④テクニカル章 ⑤その他) の **骨格だけ**を、判定ロジックを一切変えずに純粋な reorder で実現。`isV4` return の JSX ハードコードを **config 配列 (block 順序の宣言的定義)** に置き換える。
- **新並び順** (grill 決定 2):
  - ①ティッカー: 株価 hero (VerdictHero>Hero) + KpiStrip 統合。**保有時のみ** TriageBanner を最上位に (非保有は非表示 = 既存挙動踏襲)。
  - ②図解: StickyDiagramAccordion を **3 番目から 2 番目へ移動** (free 化は Sprint 2)。
  - ③ファンダ章: fundamentalsBlock (会社概要 + 5条件 + 決算タブ + TTM + EPS Beat) を章として束ねる。**判定 hero をファンダ章へ統合**するための受け皿は本 sprint で枠だけ用意 (実際の hero 移動は Sprint 3 の章サマリーと連動)。
  - ④テクニカル章: technicalHeader + chartBlock + ReturnGrid + targetZoneBlock (アナリスト目標/売りゾーン/Cup pivot+ピボット+買いゾーン/Distribution Days)。**isV4 で render されていなかった technicalHeader を復活**させ章扉に。
  - ⑤その他: marketEvalBlock (アナリスト視点+市場の声) → earningsReactionBlock (8Q決算反応) → insiderBlock (Insider) → contextBlock (ニュース/IR/10-K) → relatedArticle (関連記事)。
- **触るファイル**: `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (L1061-1119 の isV4 return を config 配列 + map レンダーに)。各 block 変数 (L860-1059) はそのまま流用。
- **呼ぶ既存 skill**: `pge-loop-debugger` (生成前の落とし穴回避)、検証は build + 本番 grep のみ (vision 不要の純 reorder)。
- **完了判定**: `cd frontend && npm run build` 成功 / 本番 bundle で新並び順の block が描画される (snap-*.mjs で `data-testid` 順序確認、または手動 grep)。判定 hero の文言・値が reorder 前後で不変 (回帰なし)。**SummaryBrief は本 sprint ではまだ残置** (廃止は Sprint 3)。

### Sprint 2: 図解を 2 番目へ + free ぼかしプレビュー (funnel-cro 連携)
- **目的**: 章②図解を「free = ぼかしプレビュー + Pro CTA」に。現状 free = PremiumLock minimal D 案 (blur なし小 CTA、L1092) を、grill 決定 2 の「ぼかしプレビュー + Pro CTA」へ。
- **触るファイル**: `JudgmentDetail.jsx` (L1080-1110 の図解 free 分岐)、必要なら StickyDiagramAccordion の placeholder。**具体 UI (blur 度合い・CTA 文言・配置) は `funnel-cro` skill に委譲** (Trust Cliff 7 項目 checklist 必須)。
- **呼ぶ既存 skill**: `funnel-cro` (Trust Cliff + LP「図解=Pro」訴求整合)、`design-system-check` (token 遵守)。
- **完了判定**: free で図解がぼかしプレビュー + Pro CTA 表示 / Pro・Premium で従来どおり StickyDiagramAccordion / funnel-cro 7 項目 PASS / build 成功。本番で plan=free / pro の両 path を grep または snap で確認。

### Sprint 3: 章サマリー静的 template 拡張 (書式対称、判定は現状流用) + SummaryBrief 廃止
- **目的**: 既存 FundamentalsChapterSummary / TechnicalChapterSummary を「**判定バッジ + 静的サマリー文 + 指標 chip**」へ育成し、**両章の書式を対称**にする。**この sprint では判定は現状の PASS/FAIL を流用** (枠だけ作り、3 軸 3 段階の合成ロジックは Sprint 4 へ分離)。同時に **総合 AI 要約 SummaryBrief を廃止** (各章サマリーに一本化)。
- **触るファイル**: `frontend/src/features/judgment/components/detail/sections/FundamentalsChapterSummary.jsx` / `TechnicalChapterSummary.jsx` (静的 template 拡張)、`JudgmentDetail.jsx` (SummaryBrief import L59 + render L676 を削除、章サマリーへ判定 hero 要素を統合)。
- **⚠️ 発光リスク最高 sprint**: 章サマリーを card 化する場合、§6 の発光ルール厳守。**入れ子 surface-card 禁止 / contain:paint 禁止 / compound `.is-arriving:hover` 4 セット必須**。既存 FundamentalsChapterSummary が card でないなら card 化を避け、既存の非 card surface のまま判定バッジ + chip を追加する方が安全 (`feedback_minimalism_over_additive` = 装飾は必要部のみ)。
- **§38 厳守**: テクニカルサマリーの「強気/中立/弱気」は静的 dict、断定的将来予測なし、色は投資色ルール。
- **呼ぶ既存 skill**: `summary-text` (静的サマリー文の書式)、`design-system-check` + `design-recipes §C-1〜C-4` (発光)、`dead-code` 確認用に `feedback_dead_code_hook_dependency` (SummaryBrief 削除時 import 依存 grep 必須)。
- **完了判定**: 両章サマリーが判定バッジ + 文 + chip で書式対称に描画 / SummaryBrief が DOM から消え import エラーなし (grep で残存 import 0) / 章サマリーの発光が二重 ring / フチ消失なし (snap-*.mjs で角の box-shadow 確認、`feedback_ai_diagram_visual_harness` 流用) / build 成功。

### Sprint 4: 【🔴 6 体合議 gate 通過後】3 軸 3 段階判定ロジック (§38) + テクニカル 3 段階
- **目的**: ファンダ章サマリーの 3 軸 (5条件 N/5 / 直近4半期 3+1条件 / 来4半期コンセンサス) → 総合 3 段階 (強い/標準/弱い)、テクニカル章サマリーの 3 段階 (強気/中立/弱気) の **実際の合成ロジック・閾値**を実装。
- **🔴🔴 実装前 BLOCK (6 体合議 gate、§7 で 6 体判定)**: 以下 4 項目のうち本 sprint は ①②③ が直結。gate 通過まで **Generator に着手させない**:
  - ① 3 軸 3 段階の閾値・合成ロジック (何点以上で「強い」か、3 軸の重み付け) — 金融 §38 直結
  - ② テクニカル 3 段階の判定材料選定 (チャート / RS self-history percentile / Cup-Handle / Distribution Days のどれを使い、どう合成するか) — §38 直結
  - ③ screener「条件クリア/未達」(5条件ベース) と Pane 3 章サマリー 3 軸の整合 (Trust Cliff、分離案が有力だが要 verdict)
- **触るファイル**: FundamentalsChapterSummary.jsx / TechnicalChapterSummary.jsx の判定ロジック (静的 mapping / Python 計算済データの閾値判定)。数値計算は **frontend の静的判定 or backend の既存計算済フィールド**を使い、新規 LLM 呼び出しなし (§4)。
- **呼ぶ既存 skill**: `multi-review` (6 体、gate)、`hallucination-guard` (§38 / §5)、`screener` (5条件 vs 3軸の整合確認)。
- **完了判定**: 6 体合議 verdict で閾値・合成・整合が確定 → 実装 → 章サマリーの 3 段階が確定ロジックで描画 / §38・§5 違反なし (BLOCKLIST_REGEX clean) / screener 判定と矛盾なし / build 成功。

### Sprint 5: 決算「今期↔来期コンセンサス」表示改善
- **目的**: ファンダ章の決算タブ「今期来期」内で、**今期実績 ↔ 来期サプライズの仕切りを緩和**し、来期コンセンサスを同タブに内包 (grill 決定 3、独立タブにしない = user 訂正: サプライズ比較のため同タブ必須)。
- **触るファイル**: 決算タブ関連 (GuidanceCard + ForwardOutlookSection の仕切り)。**具体レイアウトは `designing-workspace-ui` skill に委譲** (未決項目④)。
- **呼ぶ既存 skill**: `designing-workspace-ui` (レイアウト)、`hallucination-guard` (forward_visibility は §38 で色なし / EPS 保持 = `project_forward_visibility` 既存規律遵守)、`design-system-check`。
- **完了判定**: 今期実績と来期サプライズが 1 つの流れで読める (仕切り緩和) / 来期コンセンサスが同タブ内に表示 / forward_visibility の §38 規律 (色なし) 維持 / build 成功。

> **各 sprint は単独で deploy 可能・回帰しない粒度**。Sprint 1 (骨格) と Sprint 4 (判定ロジック §38) を分離したため、Sprint 1-3 + 5 は SAFE-SHIP で先行 deploy 可、Sprint 4 のみ 6 体合議 gate 待ち。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` | **触らない** (本再編は LLM 不使用、Hallucination Guard pre-commit Check 1) |
| `backend/app/aggregator/*.py` への LLM SDK import | **追加禁止** (pre-commit Check 3、本再編は frontend のみ) |
| `backend/app/visualizer/prompt_negatives.py` | **触らない** (法務 anchor) |
| `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX | **触らない** (typo 修正のみ可、章サマリー文は sanitize layer を通す) |
| `.claude/launch.json` | **触らない** (人間用) |
| `migrations/*.sql` | **触らない** (本再編は DB schema 変更なし、frontend reorder + 既存データ参照のみ) |
| `handover_*.md` | **read-only reference** |
| `railway.toml` cron 定義 | **触らない** |
| `frontend/src/App.jsx` の sticky 検索 div / `.sticky-search-band` | **触らない** (8 回試行錯誤の安定領域、`design_recipes.md §C-6` 永久凍結) |
| **`.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク)** | **章サマリー card 化で最高リスク。** Sprint 3 で触る場合 `design_recipes.md §C-1〜C-4` を必読。**入れ子 surface-card 禁止 / `contain: paint` 禁止 / `overflow:hidden` を glow host に置かない / compound `.X.is-arriving:hover` 4 セット (light arrival / light arrival:hover / dark arrival / dark arrival:hover) 必須** (`css_specificity_gotchas` / `glow_elevation_postmortem`)。新規 card-like クラス追加時は `elevation_scale.md` whitelist 同時記載。可能なら **既存の非 card surface のまま** 判定バッジ + chip を追加し card 化を回避 (リスク最小)。 |
| `VITE_*` 環境変数 / Dockerfile ARG/ENV | **触らない** (新規 VITE 変数追加なし) |
| `frontend/src/App.jsx` の `?layout=classic` legacy 分岐 | **本 SPEC では触らない** (classic は後追い、grill 決定 8)。再編は `isV4` (workspace mode) のみ。 |

**全 state testid 規律** (`feedback_testid_all_render_paths`): 章扉 wrapper・章サマリー・図解の testid は loading / errored / empty / main の **全 render path に付与**。現状 technical-section wrapper (L908) が `data-state` を持つ pattern を踏襲。

**§38 規律**: テクニカル章サマリーは断定的将来予測 (BAD-5) を出さない (静的 dict)。色は投資色ルール厳守 (緑=上昇 / 赤=下落 / amber=警告 / cyan=ブランド emphasis 専用、「強い/良い」に cyan を使わない)。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」3 軸を本 SPEC の各 sprint に適用:

| 3 軸 | active か | 根拠 |
|---|---|---|
| ① LLM 出力品質 (景表法/金商法/hallucination) | **△ 限定的** | 新規 LLM 呼び出しなし。ただし章サマリー (特にテクニカル 3 段階の §38、3 軸合成の §38) が「断定的判断の提供」に触れうる |
| ② Trust Cliff (LP 訴求 vs 実装) | **○ active** | 「5 条件無料」vs 章サマリー 3 軸化の整合 (gate ③)、図解 free/Pro gate、「総合判定」表記の正当性 |
| ③ 新 backend endpoint + RLS / 認証境界 + cache 設計 | **✗ 非該当** | backend 変更なし、frontend reorder + 既存データ参照のみ。blast radius 小 |

### 判定 (sprint で分岐):

- **Sprint 1-3 + 5 (骨格 reorder / 図解 free / 章サマリー枠 / 決算レイアウト)**: 軸②のみ active (図解 gate は funnel-cro で個別吸収)、LLM prompt 不変・既存 schema 維持・frontend 局所修正のみ → **3 体合議で十分** (ui-designer + frontend-architect + qa-dogfooder)。`feedback_multi_review_3_panel_workflow.md` の 1 メッセージ並列。
- **Sprint 4 (3 軸 3 段階判定ロジック + テクニカル 3 段階、§38)**: **🔴 6 体合議 (実装前 gate、BLOCK)**。
  - **根拠 1 行**: 軸① (テクニカル 3 段階 / 3 軸合成の §38 断定的判断) + 軸② (5 条件無料 vs 3 軸の Trust Cliff、gate ③) の **2 軸 active** → 6 体推奨基準を満たす。金融 verdict (§38 閾値の妥当性) + マーケ verdict (LP 訴求整合) が高 priority。
  - mixed model: 金融 / Anthropic engineer / マーケターは Opus、ui-designer / frontend-architect / qa-dogfooder は Sonnet (cost 効率運用 §4)。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
- **Sprint 1 (骨格 reorder)**: `isV4` return が **default ON で全 PC ユーザーの主分析ペイン**。config 配列化の map レンダーで key 欠落 → React 再マウント / CLS / block 欠落で「判定情報が消える」回帰。判定 hero の値ズレは Trust Cliff (誤った判定表示)。
- **Sprint 2 (図解 free)**: ぼかしプレビューの blur が効かず free に図解内容が漏れる → Pro 課金訴求の Trust Cliff (LP「図解=Pro」矛盾)。
- **Sprint 3 (章サマリー card 化)**: **発光バグ高リスク** (v54-v59 で 6 セッション溶かした領域)。二重 ring / フチ消失 / arrival glow クリップ。SummaryBrief 削除で import 依存の別 component が ReferenceError (`feedback_dead_code_hook_dependency`)。
- **Sprint 4 (判定ロジック §38)**: 閾値設定が甘いと「5 中 2」の銘柄を「強い」と誤表示 → 景表法 §5 (優良誤認) / 金商法 §38 (断定的判断) 抵触 risk + brand 信頼毀損 6-12 ヶ月コスト。
- **Sprint 5 (決算レイアウト)**: 仕切り緩和で今期実績と来期予想が視覚的に混同 → forward_visibility の §38 規律 (来期に色を付けない) 違反。

### 緊急 roll-back 手順
1. **feature flag kill switch (最速、deploy 不要)**: `isV4` は `?pane3_v4=0` で **即 legacy 順序に revert** (`isPane3V4()` L227、kill switch 残置済)。本番事故時は user に「URL に `?pane3_v4=0` を付けて旧表示に戻せる」と案内可能。`feedback_feature_flag_dual_mode` (URL param 即 revert)。
2. **git revert (sprint 単位)**: 各 sprint を独立 commit にしてあるため (sprint 間 commit 必須)、問題 sprint のみ `git revert <hash>` → `git push origin main` で Railway auto-deploy (~30s で反映、`railway_auto_deploy_on_push`)。
3. **発光バグ時 (Sprint 3)**: 章サマリーの card 化 commit のみ revert → 非 card surface に戻す。`design_recipes.md §C-1〜C-4` で root cause 特定。
4. **検証**: revert 後は本番 bundle hash 変更 + `/health` commit 一致 + 本番 chunk grep で文字列確認 (`feedback_deploy_verify_discipline`、未検証 hash を「検証済」と書かない)。

---

## 付録: Generator subagent への引き継ぎ (Sprint 1 着手指示)

- **SPEC path**: `docs/specs/SPEC_2026-06-07_pane3-chapter-restructure.md`
- **Sprint 1 のゴール**: `JudgmentDetail.jsx` の isV4 return (L1061-1119) を新 5 ブロック構成の **config 配列 + map レンダー**に置換。判定ロジック・block 変数 (L860-1059) は不変。SummaryBrief は本 sprint では残置 (Sprint 3 で廃止)。technicalHeader (L905、現状 isV4 で未 render) を④テクニカル章扉として復活。
- **検証**: build + 本番 grep / snap-*.mjs で data-testid 順序確認 (vision 不要の純 reorder)。
- **規律**: sprint 完了で main へ commit してから次 sprint。primary selector は data-testid。発光 CSS は Sprint 1 では触らない (純 JSX reorder)。

---

## 9. 6 体合議 verdict (2026-06-07、Phase gate、mixed model、全員「条件付賛成」・反対ゼロ)

autopilot で SPEC 起票直後に 6 体並列レビュー実施。設計方向は全員支持。実装前必須条件を統合。

### 全 sprint 共通の確定事項
- **feature flag = 新 `?pane3_v5=1` default OFF + 二重分岐** (frontend + Anthropic 一致)。isV4 が true のとき isV5 を追加チェック。user 朝 dogfood → OK で default ON 昇格 (isV4 が v125→v126 で辿った経路)。無監視 autopilot で全ユーザー主画面の即時変更を回避 + ?pane3_v4=0 より細い切り戻し粒度。→ **Sprint 1 で実装済**。
- **config 配列 key = 安定文字列 ID** (index 禁止、全員)。`BLOCK_ORDER_V5 = [ticker, diagram, fundamentals, technical, misc]`。chapter wrapper に data-testid + data-state。→ **Sprint 1 で実装済**。
- **章サマリー = 非 card surface** (UI + frontend 一致)。既存 Chip primitive + hairline separator (border-top 1px) で書式対称、card 化回避 (発光リスクゼロ)。→ Sprint 3。
- **章サマリーは AccordionTrigger 内側に配置** → 折りたたんでも結論バッジ可視 (UI)。→ Sprint 3 完了判定に明記。
- **SummaryBrief 廃止 = 「v4 経路からの切り離し」** (Anthropic + QA 重要)。物理削除でなく JudgmentDetail.jsx の import + render のみ削除。本体・api.js・css・backend endpoint は **classic (App.jsx:1626) が live で使う**ため残置。削除後 `grep -rn SummaryBrief frontend/src` で classic 2 件のみ残ることを確認。物理削除は ReferenceError で classic 即死。→ Sprint 3。

### Sprint 4 (3軸3段階判定 §38) の設計確定 — 6体 gate 通過条件
- **3軸合成 = 等価加点方式** (金融提案、恣意性最小で §5 説明責任)。各軸 0-2 点:
  - ①5条件 N/5: 4-5→2 / 2-3→1 / 0-1→0
  - ②直近4Q (3+1条件): 3-4充足→2 / 2→1 / 0-1→0
  - ③来4Q コンセンサスYoY: EPS+売上とも増→2 / 片方増→1 / 両減or欠損→0
  - 合計0-6 → 高(5-6) / 中(3-4) / 低(0-2)。「5条件2/5 + 直近絶好調 + 来期増 = 5点 = 高」が成立 (user 要望「5中2でも直近好調を評価」)。
- **ラベル文言 = 優良誤認語を回避** (金融 §5/§38 生命線、最重要):
  - ファンダ: 「**条件充足度: 高 / 中 / 低**」(「強い」は §5 優良誤認で使わない)
  - テクニカル: 「強気/中立/弱気」を捨て「**順張りシグナル: 点灯 / 一部 / 点灯なし**」等の観測事実ベース (§38 断定回避)
- **5条件 N/5 を必ず数値併記** (金融 + マーケ 必須、Trust Cliff 予防の要)。screener「条件クリア/未達」と数字が一致 → 「5条件未達だが総合充足度は中」と正しく読める。語彙を screener と物理分離 (Pane3 で「クリア/PASS」を使わない)。
- **3軸合成は backend 計算でフィールド返却、frontend は mapping に徹する** (Anthropic 重要、gate 条件に格上げ)。frontend 計算層新設は screener (backend) と二重定義 drift = Trust Cliff。
- **テクニカル材料 = DMA cross + RS percentile の2軸のみ** (金融)。Cup-Handle (Premium gate・希少) と Distribution Days (M地合いバナーで surfacing 済) はサマリー判定から除外し章内 card に留める。dead cross 未実装のため「点灯なし」は RS percentile≤25 でのみ発火 (売りシグナル化回避)。
- **色** = 弱気/低にも赤を使わず muted gray、§5 免責常時表示、cyan を「強い」に流用しない (金融 + UI)。
- **degrade** = 欠損軸は分母除外 + 1段保守寄せ、2軸欠損 or 直近4Qなしは「データ取得中」でラベル非表示 (金融)。来4Q 欠損は常態 (8-K coverage 25-35%) なので ①② で判定がデフォルト。
- **「高」を希少に保つ閾値** + 「推奨ではない」注記 (マーケ、オオカミ少年回避)。
- **非株式 gate** = テクニカル章サマリーに isNonEquityTicker() gate (QA)。^GSPC 等で RS/Distribution chip 非表示。

### 図解 free (Sprint 2、funnel-cro 委譲)
- ぼかしプレビュー支持 (マーケ + UI、完全Lockより CVR 高、Zeigarnik 効果)。`display:none` でなく `visibility:hidden` + blur overlay (DiagramCard remount cache 破壊回避、UI)。CTA は体験を動詞で (「図解で2秒理解する → ¥980/月」)、LP Pro訴求と逐語一致 (マーケ + funnel-cro 7項目)。ぼかし直下に「無料のファンダ判定は↓」導線1行 (マーケ)。

### PGE 規律 (frontend + Anthropic)
- Sprint 4 gate 通過まで Generator 着手禁止を PGE prompt に明示 inject。ラベル文言を SPEC 確定値で固定 (Generator 独自言い換え revert 事故防止)。Sprint 間 commit、後続 sprint で key ID 文字列を変えない。

### 総合判定マトリクス
| reviewer | model | 判定 |
|---|---|---|
| 金融アナリスト (§38) | Opus | 条件付賛成 |
| Web マーケター (CRO) | Opus | 条件付賛成 (反対点ゼロ) |
| Anthropic エンジニア | Opus | 条件付賛成 |
| UI/UX デザイナー | Sonnet | 条件付賛成 |
| frontend 開発エキスパート | Sonnet | 条件付賛成 |
| QA dogfooder | Sonnet | 条件付賛成 |

**6/6 条件付賛成・反対ゼロ。設計方向 GO。Sprint 1 (骨格) は本 verdict 反映で実装・deploy 済 (default OFF)。Sprint 2-5 は上記条件を満たして順次。Sprint 4 のみ実装前に本 §9 の閾値・ラベルで再確認 (§38)。**
