# SPEC 2026-06-27: 銘柄詳細 (Pane 3) 情報アーキテクチャ 再構成（v6 IA）

> **位置づけ**: 設計シンセシス `docs/specs/pane3-rearchitecture-synthesis_2026-06-27.md`（§4 新 IA / §5 不触制約 / §9 Phase 4 3 体合議 verdict）と視覚正本 mockup `docs/specs/mockups/pane3-detail-v1.html` を **実装可能な SPEC へ形式化**する。
> **設計判断・multi-review は完了済**（Phase 0-4）。本 SPEC は「何を / なぜ / どの順で」のみを扱い、「どう作るか」は下流 Generator に委ねる（PGE 3 体ループ 仕様設計層）。
> **要件は全決定済**（synthesis §9-C / 起票指示）。本 SPEC で新たな設計判断は行わない（未決は L1 arrival glow のみ = §4-未決 / §8 で vision-eval A/B に委譲）。

---

## 1. 概要 + 5 原則マッピング

### なぜこの再構成か（現状の構造的問題・事実ベース）
- **6730px ≈ 7.5 画面分の flat scroll**（authed baseline snap AAPL 実測・synthesis §1-2）。8-10 個の accordion がフラット連続し、competitor finding [4]「連続 reading flow で accordion は避ける」に抵触。
- **一等地のミスアロケーション**（synthesis §1-1）: 最上部 StateCompass 直後の fold が **KPI（価格/前日比/Forward P/E/配当性向/自社株買い）+ 期間別リターン + TTM バリュエーション** で埋まる。これらは KB 優先順位で**下層**。本丸の「決算3点（EPS/売上/ガイダンス）詳細」「8Q 成長トレンド」が遥か下のファンダ章に沈む。
- **card 過多 / heading 階層不統一 / tab で cross-ref 分断 / 目次不在 / flag 12 個の組合せ爆発**（synthesis §1-3〜7）。

### 再構成の核心（synthesis §4 設計原則）
> **「2 秒の要約層 → 目次 → じっちゃま優先順位順の章 → 累進開示で深層」**。

決算3点（EPS / 売上 / **ガイダンス**）を**一等地（L1 判定サマリー）に昇格**、価格・期間別リターン・TTM は**全面降格**（価格は L0 で「判定でなく同定」、リターンは L4 へ）、決算 tab は**解体 → 目次 + subheading**へ。card は 5 条件カード（唯一の発光・単一焦点）のみ、他は whitespace + hairline。

### 5 原則への貢献
- **原則 1「読み手に負担をかけない（2 秒理解）」**: L1 で決算3点を named buckets に集約 → 「ALL ビートか / ガイダンスはどうか」が 2 秒。flat 6730px から「要約層 → drill」へ。
- **原則 4「1 クリックを減らせ（北極星: 人力の代替）」**: 投資家が毎日手作業でやる「決算3点をコンセンサスと照合 → 8Q の加速確認 → 5 条件チェック」を一等地に集約し、scroll なしで肩代わり。**情報の足し算でなく順序の是正 = 人力作業の代替**（CLAUDE.md 原則 4 北極星の 1 問 = Yes）。
- **原則 3「シンプルかつリッチ」**: 発光を 5 条件カードのみへ単一焦点化（v5 勝ち筋継承）+ whitespace 優先 = clutter 撲滅。
- **原則 5「図解で認知コストを下げろ」**: 8Q 成長トレンドを bar spark で傾き視覚化（数値併記）、L1 buckets で named グルーピング。

### 関連 memory（Generator 必読指定）
- `feedback_section38_buy_signal_boundary.md`（色信号 OK / 買い場断定 NG・状態コンパス 3 信号 + ⓘ・**§38-safe 語彙の SSOT**）
- `project_forward_visibility.md`（来期コンセンサス YoY = 条件4・色なし§38・金融来期売上抑止・EPS 保持）
- `feedback_data_completeness_guard.md`（per-source `sources.X==='ok' && data.X` compound + 3 段階分岐 + — fallback）
- `feedback_citation_required.md`（数値/固有名詞/因果文に source 必須・SEC/FMP > KB > news precedence）
- `glow_elevation_postmortem.md` / `feedback_glow_active_pattern.md`（発光 danger zone・compound `.is-arriving:hover` 4 セット・contain:paint 禁止・入れ子 surface-card 禁止）
- `feedback_judgmentdetail_dual_mount_paths.md`（!isV5 と pane3_v5 で別 mount・新規 section は両方に置く罠）
- `feedback_judgmentdetail_result_gate.md`（新規 section gate = `detail.error` で・result は正常時も null）
- `feedback_non_equity_chart_overlays.md`（`isNonEquityTicker` gate）/ `feedback_revenue_basis_mismatch.md`（DSO 含む sector 別閾値）
- `feedback_diagram_card_remount_cache.md`（DiagramCard unmount でキャッシュ破壊 → cost 膨張・mount 維持 + display:none）
- `feedback_feature_flag_dual_mode.md`（URL param 一時 + localStorage 永続・URL 優先で即 dogfood/revert）
- `project_pane3_chapter_restructure.md`（BLOCK_ORDER / §38 label rules / 章構成 SSOT）
- `reference_earnings_flash_summary.md`（HeadlineGrid/LowerGrid・surpriseColor vs deltaColor・L1 buckets data 流用元）

---

## 2. 新 IA 仕様（L0-L6 各層の構成・データ source・component 再利用 vs 新規）

> 視覚正本 = `mockups/pane3-detail-v1.html`。下表は各層の「構成 / データ source / 既存 component 再利用 or 新規」を Generator 向けに定義。**mockup と矛盾したら mockup を正とする**（mockup-fidelity 採点対象）。

| 層 | 構成（mockup 準拠） | データ source（§8 データ依存表に詳細） | component 戦略 |
|---|---|---|---|
| **L0 アイデンティティ & ライブ** | ロゴ + ticker + 社名/FY期 + 現在価格/前日比 + **1W/1M リターン**（dogfood で L0 へ・§9-A）+ 次決算カウントダウン pill + セクター pill + ウォッチ追加 | 既存 result（price/changePct）・price-history（1W/1M）・次決算（既存カウントダウン）・logo_sources 3 段 fallback | 既存ヘッダ要素を再構成（新規 surface 増やさない）。**価格は「同定」= verdict 扱いを外す** |
| **L1 判定サマリー** ★心臓部 | 単一 band。決算3点 named buckets（EPS/売上/ガイダンス・各 clickable → drill）+ 連続ビート mini + RS mini + 状態（条件充足 N/5・dot + ⓘ）+ 前提=地合い行 | EarningsFlashSummary data 流用（§9-B・fetch 重複なし）+ useEpsBeatStreak + RS + useFtdMap（地合い・**Pane3 import 追加要**）| **新規 `L1SummaryBuckets`**。StateCompass は**残置**し `?pane3_v6=1` で L1SummaryBuckets に置換（v6 で StateCompass を物理削除しない・§6 clean exit で一括除去） |
| **On This Page 目次** | chip 列（決算/品質・継続性/テクニカル・買い場/図解/その他）。クリックで該当章へ smooth scroll | 静的（章 id の固定リスト・非 equity 時は除外章を出さない） | **新規 TOC**。`smoothScrollToSelector(detailRoot, '#id', {offset})`（§5-4・StateCompass 既存パターン）+ fold auto-open |
| **L2 決算（本丸）** | ① 決算3点 detail（EPS/売上/ガイダンス vs コンセンサス）+ 来期コンセンサス strip（YoY）→ hairline → ② 成長トレンド 8Q（EPS/売上 YoY bar・全8値併記 + 直近強調 + 加速/横ばい注記）→ hairline → ③ **5 条件カード（★唯一の発光）** | EarningsFlashSummary（決算3点）+ guidance/basic next_q（来期 YoY）+ fetchQuarterlyHistory（8Q）+ 既存 5 条件 data | 決算3点/来期 strip = EarningsFlashSummary 再利用。8Q spark = 新規 or 既存トレンド component 再構成。5 条件カード = **既存 v5 発光カードを継承**（CSS 不触） |
| **L3 品質・継続性** | fold 4 行（営業CFマージン / ROE・PER・PEG / 機関保有トレンド / 会社概要・セグメント）。サマリー常時 + 詳細 on demand | OCF/ROE/PER/PEG（既存 fundamentals）+ 機関保有 QoQ + プロフィール/セグメント | fold = 既存 fold/accordion primitive 再利用。**入れ子 surface-card 禁止** |
| **L4 テクニカル・買い場** | チャート + PriceLadder（**1 ユニット化を v5 継承**）+ ブレイクアウト強度（参考）+ **期間別リターン（ここへ降格）** | price-history + chart/summary + PriceLadder data + cup-handle/breakout + period returns | チャート + PriceLadder = **v5 の 1 ユニット構造を継承**（不触）。期間別リターンを L0/一等地から移設 |
| **L5 図解（Pro/Premium）** | free = ぼかしプレビュー + Pro CTA（lock SVG・解錠ボタン）| DiagramCard（既存） | **DiagramCard は unmount 禁止**（mount 維持 + display:none・§7）。配置は本層で確定（synthesis §6-1 の「要約層直後 vs 下層」は **L5 下層で決定済**・paywall を早期に出さない funnel-cro 配慮） |
| **L6 その他** | fold（アナリスト視点 / 市場の声 / 過去8Q 決算反応 / Insider / ニュース・IR・10-K / 関連記事）。目次から到達 | 各既存 endpoint（analyst/insights/news/ir-links 等） | 既存 component を fold 配下へ集約 |

### v6 で**新規に作る**もの（最小に絞る）
1. `L1SummaryBuckets`（決算3点 named buckets + ビート/RS mini + 状態 + 前提地合い行）
2. `On This Page` TOC（smoothScrollToSelector + fold auto-open）
3. v6 章レイアウト wrapper（L0-L6 の順序・hairline 垂直リズム・whitespace 優先）

### v6 で**再利用**するもの（再発明禁止）
- EarningsFlashSummary（決算3点 + 来期 strip・L1 と L2 で同 data 流用）
- 5 条件発光カード（v5・CSS 不触）/ PriceLadder + Chart 1 ユニット（v5）/ DiagramCard / 各 fold primitive / fold/accordion / StateCompass（v6 では置換だが v4/v5 経路では残置）

---

## 3. スプリント分割（synthesis §9-C-8 ベース・上限 6・本番運用済のため小さく）

> 各 Sprint に **DoD + 検証手順（build / test / authed snap）**。Generator は `pge-loop-debugger` skill を S1 着手前に必ず呼ぶ（v86 落とし穴 4 件: sprint 累積なし / selector 幻覚 / ESM return / infinite animation）。
> **dual mount path 罠**（`feedback_judgmentdetail_dual_mount_paths.md`）: 新規 section は !isV5 と pane3_v5 の両 mount path を確認。v6 は§6 の通り **v5 経路を上書き**するため、v6 flag 分岐は 1 箇所に集約する（両 path にばら撒かない）。

### Sprint 1: foundation（L0 / L1 buckets / 目次 / 8Q）
- **目的**: v6 の骨格（一等地の決算3点化 + 目次 + 8Q 成長トレンド）を `?pane3_v6=1` 配下に立ち上げる。実データ結線済の source のみ使う（地合い import は S2、セクター地位/DSO は S3）。
- **触るファイル**: `frontend/src/features/workspace/.../JudgmentDetail.jsx`（v6 分岐の追加・flag 解決）・新規 `L1SummaryBuckets` component・新規 TOC component・8Q spark component（既存トレンド再構成 or 新規）。
- **呼ぶ既存 skill**: `pge-loop-debugger`（着手前）/ `designing-workspace-ui`（章レイアウト・whitespace 規律）/ `design-system-check`（token 準拠・raw hex 撲滅）/ `hallucination-guard`（§38-safe 語彙の表示確認・後述 §4）。
- **実装条件（DoD に含む）**:
  - L1 buckets は EarningsFlashSummary data を流用（**fetch 重複ゼロ** = `reference_earnings_flash_summary.md` 確認）。
  - bucket clickable → `smoothScrollToSelector(detailRoot, '#earnings', {offset})`（native `#id` は内側スクロールで効かない・§5-4）。
  - 8Q は全8値併記 + 直近強調 + 加速/横ばい注記（mockup 準拠）。`fetchQuarterlyHistory` の `eps_yoy_pct`/`revenue_yoy_pct`。
  - **§38-safe 語彙厳守**（§4 一覧）: 状態は色信号 + safe ラベル + ⓘ のみ。ガイダンス「維持」= **neutral 色**（amber は引き下げ時のみ）。
  - **Trust Cliff ガード**（§5）: per-source compound + — fallback + per-section citation footer。
  - **新規 section gate = `detail.error`**（result は正常時も null・`feedback_judgmentdetail_result_gate.md`）。
  - **testid 全 render path**（loading/errored/empty/main・`feedback_testid_all_render_paths.md`）。
- **DoD / 検証手順**:
  1. `cd frontend && npm run build`（構文 + token 違反ゼロ）。
  2. authed snap（`snap-*.mjs`・headless 4 条件遵守）で `?pane3_v6=1` の AAPL を撮影 → L0 価格同定 / L1 決算3点 buckets / 目次 / 8Q spark が mockup 構造と一致。
  3. Haiku vision-eval（typography/spacing/color は 1 run・aman/motion は 3 run mean）で mockup-fidelity。
  4. bucket クリック → 該当章へ scroll（fold 折りたたみ時は auto-open）を snap で確認。
  5. **件数 SSOT / 発光 CSS / sticky 検索に触れていないこと**を `git diff --stat` で main が独立裏取り。
- **blast radius**: `?pane3_v6=1` 配下のみ（default OFF）。既存 v4/v5 経路は不変。**rollback**: flag OFF（自動）/ `git revert`。

### Sprint 2: 章移動 + L3 fold + 地合い import
- **目的**: L2-L6 の章を新順序へ移動（価格/リターン/TTM の降格を確定）、L3 を fold 累進開示化、**地合い M ゲート**（KB 最上流）を L1 前提行へ結線。
- **触るファイル**: `JudgmentDetail.jsx`（章順序・L3 fold・L4 へリターン移設）・L1SummaryBuckets（地合い行追加）・地合い import（`useFtdMap`/`ftdRegime`/`/api/follow-through-day` を Pane3 へ import 追加・§9-B）。
- **呼ぶ既存 skill**: `pge-loop-debugger` / `designing-workspace-ui` / `hallucination-guard`（地合い §38: 「機械判定であり相場予測でない」明記必須）。
- **実装条件（DoD に含む）**:
  - 地合い = **上昇局面（指数 50/200DMA 上方）** + ⓘ「機械判定であり相場予測ではありません」（§38-safe・§4）。
  - 期間別リターンを L0/一等地から L4 へ全面降格（1W/1M のみ L0 残置・§9-A dogfood）。
  - L3 は fold 4 行（サマリー常時 + 詳細 on demand）。**入れ子 surface-card 禁止**。
  - PriceLadder + Chart の 1 ユニット構造を**そのまま L4 へ移設**（v5 継承・構造を作り変えない）。
- **DoD / 検証手順**:
  1. build pass。
  2. authed snap で L0-L6 の章順序が mockup と一致 / 地合い前提行が L1 に出る / リターンが L4 にある。
  3. 地合い行の §38 文言（機械判定注記）を snap + grep で裏取り。
  4. **狭幅 viewport の authed snap**（`feedback_snap_catches_layout_context_breaks.md`: code review PASS でも狭幅で崩れる）。
- **blast radius**: v6 配下のみ + 地合い import（Pane3 への新 import）。**rollback**: flag OFF / `git revert`。地合い fetch 失敗時は per-source — fallback で前提行を出さない（Trust Cliff 回避）。

### Sprint 3: セクター地位 + DSO（backend 拡張）
- **目的**: synthesis §9-B で「実データ来るまで非表示」とした 2 要素（セクター地位 / DSO）を backend 結線して復活。**実データが来るまでは非表示を維持**（Trust Cliff 回避）。
- **触るファイル**:
  - backend: `is_sector_rs_leader` を `guidance/basic` か `technical` の個別銘柄 endpoint へ追加配線（現状 `/api/scanner/universe` のみ・§9-B）/ DSO（FMP `key-metrics-ttm` `daysSalesOutstanding`）の取得・配線。
  - frontend: L1 の RS mini を「RS・セクター地位」へ拡張 / L3 に DSO fold 追加。
- **呼ぶ既存 skill**: `fmp-api-retry`（DSO の FMP fetch・fallback / plan / `/stable/`）/ `hallucination-guard`（数値物理層・LLM 不要確認）/ `designing-workspace-ui` / `pge-loop-debugger`。
- **実装条件（DoD に含む）**:
  - **backend は数値物理層**（DSO/セクター地位は FMP/計算値・LLM SDK import 禁止・pre-commit Check 3）。
  - **DSO sector gate**: 銀行/保険/不動産では DSO 非表示（`feedback_revenue_basis_mismatch.md` の sector 別判定）。
  - **per-source compound**: `sources.X==='ok' && data.X` で欠落時 — fallback（実データ来ない銘柄では非表示を維持）。
  - citation footer に FMP・更新日。
- **DoD / 検証手順**:
  1. backend テスト（`.venv` python3.12・`source backend/.venv/bin/activate`）。
  2. backend build/import OK + 個別 endpoint curl で `is_sector_rs_leader` / `daysSalesOutstanding` が返ること（main が独立裏取り・grep ヒット ≠ 結線）。
  3. DSO sector gate を銀行 ticker（JPM 等）で非表示確認（authed snap）。
  4. 実データ欠落 ticker で — fallback が出る（捏造数値を出さない）ことを snap で確認。
  5. authed snap で L1 セクター地位 / L3 DSO fold が実データで出る。
- **blast radius**: 新 backend フィールド追加（個別 endpoint）+ frontend v6 配下。既存 schema へのカラム追加は migration 要否を Sprint 3 着手時に確認（**必要なら user gate**）。**rollback**: frontend は flag OFF、backend は `git revert`（追加フィールドは additive のため既存 consumer 無影響）。

### Sprint 4: dogfood → v6 昇格 → 旧 flag sweep
- **目的**: v6 を default ON へ昇格し、v4/v5/compass/flash/order_v2 等の旧 flag 分岐を**一括削除（clean exit）**。flag 12 個の組合せ爆発を解消する。
- **触るファイル**: `JudgmentDetail.jsx`（v6 を default 化 + 旧分岐削除・dual mount path 両方）・関連 dead code（旧 component は import dependency check 後に削除・`feedback_dead_code_hook_dependency.md`）。
- **呼ぶ既存 skill**: `release-check`（CLAUDE.md 違反 + Trust Cliff + 4 重防御の最終 gate・内部で funnel-cro / hallucination-guard を順次呼ぶ）/ `pge-loop-debugger`。
- **実装条件（DoD に含む）**:
  - 昇格は **dogfood + vision-eval PASS 後・user gate 経由**（synthesis §6-5 v5 が辿った安全経路）。
  - 旧 flag 削除前に **import dependency を grep**（別 component の ReferenceError 防止）。
  - **L1 arrival glow の A/B 判定**（§4-未決）をこの Sprint で vision-eval（aman 軸 3 run mean）→ 採否確定。採用時は `.five` の ~70% 強度・compound `.is-arriving` 4 セット厳守（`glow_elevation_postmortem.md`）。
- **DoD / 検証手順**:
  1. build pass + `release-check` 全 gate PASS。
  2. default（flag なし）で v6 が出ること / 旧 flag を付けても v6 にならない（clean exit = 旧分岐消滅）ことを authed snap で確認。
  3. `git grep` で旧 flag key（pane3_v5/compass/flash/order_v2/header_v2/headroom 等）の残存ゼロを main が裏取り。
  4. 非 equity ticker / partial failure / Premium gate の regression が無いこと（authed snap・Premium は auth harness vision-eval）。
- **blast radius**: **default 経路を書き換える = 全 user に影響**（最大 blast）。だから dogfood + user gate を必須化。**rollback**: 昇格 commit を `git revert` で v5 default へ即時復帰（PR 経由 / `git add` は明示パス・並行セッション巻き込み防止）。

> **Sprint 上限内（4 Sprint）で完結**。Sprint 5-6 は使わない。

---

## 4. §38-safe 語彙一覧（generator への語彙 SSOT・synthesis §9-A 確定）

> 金商法§38（断定的判断の提供）/ 景表法§5（優良誤認）回避。**行動指示（買い/売り/脱出）を出さない**。色は色信号、ラベルは下記 safe 表現 + ⓘ 累進開示。SSOT = `feedback_section38_buy_signal_boundary.md`。

| 元の表現（NG / 要言い換え） | §38-safe 表現（採用） | 補足 |
|---|---|---|
| 損切り目安 | **リスク確認ライン（−8%）** | O'Neil −8% を「確認ライン」と中立化 |
| 買い目安 / pivot（買い） | **pivot 水準（観察点）** | 行動指示でなく観察点 |
| 地合い「強気」 | **上昇局面（指数 50/200DMA 上方）** | + ⓘ「機械判定であり相場予測ではありません」**必須** |
| 買い場の質 | **ブレイクアウト強度（参考）** | O'Neil 出来高 +40% は「目安」表記 |
| ガイダンス「維持」の amber 色 | **neutral 色**（amber は引き下げ時のみ） | 維持 = ネガティブでない |
| 「上回り」等の評価語 | **数値のみ**（+4.2% 等） | 評価語でなく事実数値 |

- 来期コンセンサス YoY は**色なし**（§38・`project_forward_visibility.md`）。金融 sector は来期売上抑止・EPS 保持。
- 状態（条件充足 N/5）は dot 色 + ラベル + ⓘ（根拠は累進開示）。行動指示文言を一切出さない。

---

## 5. Trust Cliff / 非 equity / partial failure ガード仕様（synthesis §9-C・DoD 化）

1. **Trust Cliff（per-source compound + — fallback）**: 各数値は `sources.X==='ok' && data.X` の compound check（`feedback_data_completeness_guard.md`）。欠落時は **— fallback**（捏造数値を出さない）。**セクター地位 / DSO は backend 結線（Sprint 3）まで非表示**・実データ来ない銘柄でも非表示維持。
2. **per-section citation footer**: 各セクションに SEC/FMP（数値）・更新日を footer 表記（`feedback_citation_required.md`・precedence = SEC/FMP > KB > news）。
3. **非 equity gate**: `isNonEquityTicker` true（指数/先物/為替）で **決算3点 / 5 条件カード / テクニカル買い場 を section ごと非表示 + 目次からも除外**（`feedback_non_equity_chart_overlays.md`）。チャートは価格 + SMA のみ（売買 overlay 非表示）。
4. **DSO sector gate**: 銀行/保険/不動産では DSO 非表示（`feedback_revenue_basis_mismatch.md`・偽 DSO シグナル回避）。
5. **TOC アンカー**: native `href=#id` は内側スクロールで無効 → `smoothScrollToSelector(detailRoot, '#id', {offset})`。アンカー先が fold 時は **fold auto-open してから scroll**（§3 各 Sprint DoD）。
6. **partial failure 全体方針**: 1 source 落ちても他継続（独立 try/except・既存方針踏襲）。loading/errored/empty/main 全 render path に testid 付与（`feedback_testid_all_render_paths.md`）。

---

## 6. feature flag 戦略（synthesis §9-C-6）

- **flag key = `pane3_v6`**。URL param（一時 dogfood/revert）+ localStorage（永続）、**URL 優先**（`feedback_feature_flag_dual_mode.md`）。
- **`pane3_v6` は isV5 の上位 opt-in ではなく v5 経路を上書き**する（v6 ON のとき v5 分岐は通らない）。これにより flag 組合せ爆発（現状 12 個）を増やさない。
- **clean exit path を SPEC で約束**: Sprint 4 の default ON 昇格時、v4/v5/compass/flash/order_v2/header_v2/headroom の分岐を **1 回で一括削除**できるよう、v6 分岐を **1 箇所に集約**して実装する（dual mount path にばら撒かない・`feedback_judgmentdetail_dual_mount_paths.md`）。
- **L1SummaryBuckets と StateCompass の関係**: StateCompass は v6 では置換だが **v4/v5 経路では残置**（v6 昇格・旧 flag sweep のタイミングで StateCompass を物理削除）。v6 実装中に StateCompass を壊さない。

---

## 7. danger zone（不触）+ 継承する v5 勝ち筋（synthesis §5）

### 触ってはいけないファイル / 領域（Generator への禁止指示）
| 領域 | 扱い |
|---|---|
| `.panel-card / .bs-panel / .surface-card` 系 CSS・**発光系全般**（v54-v59 で 6 セッション溶けた） | **不触**。新規 card 追加・CSS 変更前に `design_recipes.md §C-1〜C-4` 必読。発光は **5 条件カードのみ**（唯一の発光・単一焦点）。compound `.X.is-arriving:hover` 4 セット必須・`contain:paint` 禁止・**入れ子 surface-card 禁止** |
| **件数 SSOT**（`CustomScreenerPanel.jsx` `PRESET_PREDICATES` 等の件数定義） | **不触＝承認 gate**（本 SPEC は Pane3 詳細のみ・件数定義に触れない） |
| `frontend/src/App.jsx` の sticky 検索 div（8 回試行錯誤の安定領域） | **不触** |
| `.sticky-search-band` / backdrop-filter フェード境界（1px border 設計） | **不触**（CSS で消そうとしない） |
| DiagramCard の unmount | **禁止**（mount 維持 + display:none・cost 膨張回避・`feedback_diagram_card_remount_cache.md`） |
| `backend/app/aggregator/*.py` への LLM SDK import（pre-commit Check 3） | **禁止**（Sprint 3 backend は数値物理層） |
| `backend/app/visualizer/prompt.py`（Check 1）/ `prompt_negatives.py`（法務 anchor） | **本 SPEC では触らない**（LLM 不要） |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **本 SPEC では触らない**（typo 修正は可） |
| `migrations/*.sql`（DB schema） | Sprint 3 でカラム追加が必要なら **user gate**（既存 schema 改変は新規 migration） |
| `railway.toml` cron 定義 / `.claude/launch.json`（人間用） | **不触** |
| `handover_*.md`（read-only reference） | **read-only** |

### 継承する v5 勝ち筋（破棄せず上乗せ）
- **発光は 5 条件カードのみに集約**（単一焦点）。
- **hairline 垂直リズム**（card 過多を whitespace + 1px hairline で代替）。
- **L2 冠（章 heading）統一**。
- **chart + PriceLadder の 1 ユニット化**（L4 でそのまま継承・構造を作り変えない）。

---

## 8. データ依存表（どの要素 = どの endpoint・backend 拡張要否）

| L 層 / 要素 | データ source（endpoint / hook） | 実在 / 拡張要否 | Sprint |
|---|---|---|---|
| L0 価格 / 前日比 | 既存 result（price/changePct） | 実在✓ | S1 |
| L0 1W/1M リターン | price-history | 実在✓ | S1 |
| L0 次決算カウントダウン | 既存カウントダウン | 実在✓ | S1 |
| L1 決算3点（EPS/売上/ガイダンス） | EarningsFlashSummary data 流用（§9-B・fetch 重複なし） | 実在✓ | S1 |
| L1 連続ビート | `useEpsBeatStreak` + quarterly-history | 実在✓ | S1 |
| L1 RS | 既存 RS（universe percentile） | 実在✓ | S1 |
| L1 状態（条件充足 N/5） | 既存 5 条件 data | 実在✓ | S1 |
| L1 前提=地合い M | `useFtdMap` / `ftdRegime` / `/api/follow-through-day`（**Pane3 へ import 追加要**） | 実在✓（import 追加） | **S2** |
| L1 セクター地位 | `is_sector_rs_leader`（現状 `/api/scanner/universe` のみ → `guidance/basic` か `technical` へ配線） | **backend 拡張要** | **S3** |
| L2 決算3点 detail / 来期 strip | EarningsFlashSummary + guidance/basic `next_q.eps_yoy_pct`/`rev_yoy_pct` | 実在✓ | S1 |
| L2 8Q 成長トレンド | `fetchQuarterlyHistory` `eps_yoy_pct`/`revenue_yoy_pct` | 実在✓ | S1 |
| L2 5 条件カード | 既存 5 条件 data | 実在✓（CSS 不触で継承） | S1 |
| L3 OCF/ROE/PER/PEG | 既存 fundamentals | 実在✓ | S2 |
| L3 機関保有トレンド | 既存機関保有 QoQ | 実在✓ | S2 |
| L3 DSO | FMP `key-metrics-ttm` `daysSalesOutstanding`（全 endpoint 未取得） | **backend 拡張要** + sector gate | **S3** |
| L4 チャート + PriceLadder | price-history + chart/summary + PriceLadder data | 実在✓（v5 1 ユニット継承） | S2 |
| L4 ブレイクアウト強度（参考） | cup-handle / breakout | 実在✓ | S2 |
| L4 期間別リターン（降格） | price-history / period returns | 実在✓（L0/一等地から移設） | S2 |
| L5 図解 | DiagramCard（既存・unmount 禁止） | 実在✓ | S1/S2 |
| L6 その他（アナリスト/市場の声/8Q反応/Insider/ニュース・IR・10-K/関連記事） | 各既存 endpoint | 実在✓ | S2 |

> **backend 拡張は 2 要素のみ**（セクター地位 / DSO・いずれも S3）。それ以外は既存データで結線可。**実データが来るまで非表示**（Trust Cliff 回避・synthesis §9-B/§9-C-1）。

---

## 9. multi-review 必要性判定（CLAUDE.md 3 軸）

> 本 SPEC は **synthesis Phase 4 で既に 3 体合議済（ui-designer / frontend-architect / qa-dogfooder・満場一致 条件付き Go・No-Go 要素なし）**。以下は本 SPEC レベルの再判定。

| 軸 | active か | 根拠 |
|---|---|---|
| 1. LLM 出力品質 | **半 active** | LLM 新規生成なし（数値=既存/静的）。ただし §38-safe 語彙・状態ラベルの表示が景表法/金商法に直結 → 表示文言の verdict が要る |
| 2. Trust Cliff | **active** | 一等地を価格 verdict から決算3点 verdict へ置換 = ブランド訴求の根幹。セクター地位/DSO の per-source 非表示が Trust Cliff の核心 |
| 3. 新 backend endpoint + RLS / cache | **半 active** | Sprint 3 で個別 endpoint へフィールド追加（新 endpoint でなく additive）。RLS/認証境界の変更なし |

**判定: 既に Phase 4 で 3 体合議完了済 → 本実装での追加 multi-review は不要（3 体で十分）。**
- **根拠 1 行**: IA 方向は 3 体満場一致で承認済・新 endpoint/RLS/LLM 生成なし、scope は frontend 局所 + additive backend に縮小済。
- **例外で再合議を要する場合**: Sprint 3 で migration（schema 改変）が必要と判明 → 軸 3 が full active 化 → その時点で frontend-architect + 金融 verdict の 2-3 体を追加起動。L1 arrival glow の aman 軸判断は multi-review でなく **vision-eval 3 run mean**（§3 Sprint 4）で決する。

---

## 10. 想定リスク + roll-back plan

| リスク | 内容 | 検知 | roll-back |
|---|---|---|---|
| **発光バグ再発** | L1 arrival glow 採用や新 card 追加で v54-v59 の発光溶けが再発（高リスク領域） | vision-eval（aman 軸・角丸/box-shadow）/ design_recipes §C-1〜4 違反 | glow を不採用に戻す（A/B で OFF が baseline）/ `git revert`。発光は 5 条件カードのみへ即座に戻す |
| **default 昇格時の全 user regression** | Sprint 4 で v6 を default 化 = 全 user 影響（最大 blast）。非 equity / partial failure / Premium gate の regression | authed snap（非 equity/partial/Premium auth harness）/ dogfood | 昇格 commit を `git revert` で v5 default へ即時復帰（~30s・PR 経由・`/health` commit 確認） |
| **dual mount path 取り残し** | 新規 section を片方の mount path にしか置かず、もう片方で欠落 | 両 path の authed snap 比較 / grep | v6 分岐を 1 箇所集約（§6）で構造的に回避。取り残し発覚時は該当 path に追加 |
| **TOC アンカーが効かない** | native `#id` で内側スクロールが無効・fold 折りたたみで scroll 先が見えない | bucket/TOC クリックの snap | `smoothScrollToSelector` + fold auto-open（§5-5）。効かない場合 offset 調整 |
| **セクター地位/DSO の偽データ表示** | backend 結線前に表示 / 欠落で捏造値（Trust Cliff） | per-source compound の snap / 銀行 ticker の DSO gate snap | 非表示維持（— fallback）。S3 結線まで出さない設計を厳守 |
| **8Q / 5 条件の数値ズレ** | 既存 EarningsFlashSummary/quarterly data と表示値の不一致（Trust Cliff） | 既存タブの同 ticker 値と照合 | 同 data source を流用（fetch 重複なし）で構造的に一致。ズレ発覚時は data source を統一 |
| **DiagramCard unmount でコスト膨張** | v6 章移動で DiagramCard を条件 unmount してしまう | cost log / remount 観察 | mount 維持 + display:none（§7）。unmount している箇所を mount 維持へ修正 |

### 緊急 roll-back 手順
1. **dogfood 中（flag OFF が default の S1-S3）**: `?pane3_v6=1` を外すだけで原状（既存 v4/v5）。本番無影響。
2. **default 昇格後（S4）**: 昇格 commit を `git revert` → PR 経由で `git push origin main`（Railway auto-deploy ~30s）。`/health` の commit hash で確認。
3. **deploy は PR 経由必須**（main 直 push 禁止）・`git add` は明示パスのみ（並行セッション commit 巻き込み防止・`feedback_parallel_session_commit_entanglement.md`）。

---

## 11. 検証規律（Generator / main 必読）

- **build**: `cd frontend && npm run build`（構文 + token 違反ゼロ）。test/spec は build 非対象 → push 前に esbuild 検証（`feedback_test_spec_not_compiled_by_build.md`）。
- **backend テスト（S3）**: `.venv` python3.12（`source backend/.venv/bin/activate`）。system python3.8 は zoneinfo 無しで main import 不可。
- **authed snap**: `frontend/scripts/snap-*.mjs`（headless / 60s timeout / `.visual/` 出力 / HTTP server なし の 4 条件遵守）。狭幅 viewport も撮る（layout-context break 検出）。Premium gate 内は auth harness（headless 認証注入 + Haiku 採点・baseline→after Δ が信頼軸）。
- **vision-eval**: Haiku。typography/spacing/color/形状 = 1 run、motion/aman 軸 = **3 run mean 必須**（single ±4pt noise・`feedback_vision_api_noise.md`）。
- **正直さ規律（CLAUDE.md 最上位）**: grep ヒット / build pass / sub-agent 報告 / tool updated = 「存在」であり「機能」ではない。結線は curl/snap で main が独立裏取り。視覚・意味は user gate に回す。「完了」を言う前に「検証済みの事実か / 成果アピールか」を自問。
- **DoD は ground-truth で**: 各 Sprint の完了は build/test/snap/curl の機械検証 + user 視覚 gate。LLM の「OK」を根拠にしない。
