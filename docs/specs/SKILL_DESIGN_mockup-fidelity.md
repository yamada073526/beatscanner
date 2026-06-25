# Skill 設計案: mockup-fidelity (モックアップ忠実再現)

> 目的: 「1度起こした mockup を実装に忠実再現する」 を機械化する skill。screener で実証 → 銘柄詳細 / 図解生成 に再利用。
> 背景: 手動の目視監査は構造的に取りこぼす (2026-06-25 夜の手動監査でも subtitle 文言 / mode切替・見出し構造 / 条件動的サマリー を見落とした)。
> 本ファイルは sub-agent レビューで漏れを潰すための叩き台。

## 1. Purpose / Triggers
- mockup (正本 HTML) と実装の **見た目・文言・レイアウト drift** を機械検出 → 意図的変更を保全しつつ事故 drift を mockup 忠実値へ修正 → ground-truth で検証。
- trigger: 「mockup に合わせて」「デザイン復元」「忠実再現」「drift 監査」「<画面> を mockup 通りに」。
- 非対象: 条件ロジックの意味論 (どの銘柄が出るか) は別 skill (screener / hallucination-guard)。

## 2. Inputs
1. **正本 mockup HTML** path (file:// で開ける自己完結 HTML)。
2. **対象実装ファイル** (component JSX + index.css の該当 class 範囲)。
3. **保全リスト (preserve-list)**: mockup に戻さない意図的変更。出所 = ① git log の意図的 commit ② 既存 AUDIT の I-items ③ user 明示。
4. **到達情報**: 本番 URL + render 到達 selector/手順 + 必要なら auth 注入 (frontend/.env の DOGFOOD_TEST_*)。

## 3. Workflow

### Phase 0 — Scope & SSOT
- mockup を full-read。実装の render path を特定。**embedded↔単一ページの構造差**を明示 (mockup=フルページ / 実装=workspace 内ペイン → タイトル・見出し・配置が 1:1 にならない)。
- 危険箇所を列挙 (発光系 / sticky / §38 / token / VITE_)。design SSOT (design_system / design_recipes / elevation_scale) を参照。

### Phase 1 — Detect (2方式併用)
- **1a. code/copy diff (sub-agent)**: copy / typography / color / spacing / layout / icon / micro-interaction の drift を構造化列挙。各 mockup行 + 実装loc を引用。git log で意図性 1次判定。
- **1b. computed-style diff (snap harness・ground truth)**: mockup (file://) と 実装 (本番・auth 注入) を**同 viewport**で render → 対応要素の **resolved CSS を実測比較** (box-shadow / color / border-radius / font-size・weight / padding・gap / transition duration・delay)。
  - コード読みが見逃す差分を捕捉、かつ token 間接参照による false positive を排除。
  - **serialization 正規化**: `color(srgb …)` ⇔ `rgba(…)`、color-mix 解決値、`matrix()` ⇔ translateY を比較前に正規化。

### Phase 2 — Triage (各 drift)
- **意図的 (保全)**: preserve-list 該当 or git log に SPEC/review/§38/Trust-Cliff 理由 → **戻さない**。
- **構造差 (judgment)**: embedded≠standalone 由来 (タイトルがページ→ペイン 等) → user gate に回す。
- **事故 drift (修正)**: 理由なし・純 cosmetic・同要素 → 修正。
- **§38 / Trust-Cliff / pricing 隣接**: hallucination-guard / funnel-cro を経由。user gate 候補。

### Phase 3 — Fix (token 純化)
- mockup 忠実値を **semantic token** で適用 (生 hex 禁止 / tint は color-mix / --radius・--motion・--shadow token)。
- 発光系は compound 4-set / contain:paint 禁止 / 入れ子 surface-card 禁止 を遵守。

### Phase 4 — Verify (ground truth)
- build pass + design-system-check (raw hex/shadow/!important/発光 regression)。
- deploy 後: ① bundle grep (文字列反映) ② **computed-style snap 再 diff** (実装==mockup を許容誤差内で) ③ 全要素 snap で layout 破綻なし ④ halo/interaction 健在。
- **全 render path に反映** (testid 全 state)。**copy 編集後は occurrence 単一確認** (replace_all drift 防止)。

### Phase 5 — Preview-before-ship (layout/高リスク変更)
- 候補 CSS を本番に `addStyleTag` 注入 → screenshot + 実測 → 確認後に deploy (今夜のタイル cramping 修正で実証済)。

## 4. Outputs
- triaged AUDIT (fixed / preserved / deferred-judgment)。
- 適用 fix 一覧 (commit)。検証レポート (computed-style before→after)。
- 残 user-gate 項目 (構造/§38/pricing)。

## 5. 既知の落とし穴 (encode 必須・今夜 + memory 由来)
- computed-style serialization 差 (`color(srgb)` vs `rgba`) → 正規化してから diff。
- **viewport 基準 media query が embedded 半幅ペインで誤発火** (タイル cramping) → container 幅基準で評価。
- auth-gated / 深い操作が要る view → auth 注入 or user dogfood に defer。
- **過剰適用しない** (gold continuity / minimalism): accent は mockup が「その位置」に持つ場合のみ復元 (D-9 = 別位置への gold 追加は不可)。
- embedded≠standalone: 全 mockup 要素が 1:1 写像でない。
- mockup のデモ専用要素 (plan picker / mock data) は実装に写さない (Trust Cliff)。

## 6. 再利用性
- 入力 (mockup / 実装ファイル / preserve-list / 到達情報) を差し替えるだけで 銘柄詳細・図解生成 に適用可。
- snap harness は汎用化 (任意 selector の computed-style diff)。

## 7. レビューで埋めたい論点 (sub-agent への問い)
- 工程に漏れは? (検出の取りこぼし / 検証の false negative)
- intentional vs accidental の判定は git log だけで十分か? 誤判定リスクは?
- computed-style diff の失敗モード (dynamic content / フォント差 / DPR / アニメ途中) と許容誤差設計。
- embedded↔standalone の構造差を機械で扱う現実的手法。
- skill の粒度 (1画面1実行 / 段階) と user gate の置き所。
