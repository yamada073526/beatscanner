---
name: mockup-fidelity
description: 承認済み mockup (HTML) を正本に、実装の見た目・文言・レイアウト drift を機械的に検出・修正・検証するスキル。「mockup に合わせて」「デザイン復元」「忠実再現」「drift 監査」「<画面> をモックアップ通りに」「乖離を直して」と依頼された際に使用する。screener / 銘柄詳細 / 図解生成 など正本 mockup のある画面に再利用する。意図的変更 (前 sprint で望んで変えた箇所) は保全し、事故 drift だけを mockup 値へ戻す。
---

# Mockup Fidelity (モックアップ忠実再現)

承認済み mockup HTML を正本に、実装との **見た目・文言・レイアウト drift** を機械検出 → 意図的変更を保全しつつ事故 drift を mockup 忠実値へ修正 → ground-truth (computed-style 実測) で検証する。

**核心思想**: 目視監査は構造的に取りこぼす。**機械的な exit-condition (grep / build / design-system-check / computed-style diff) を各 Phase に埋め**、「宣言 (遵守する)」でなく「検証 (PASS した)」で進める。条件ロジックの意味論 (どの銘柄が出るか) は対象外 — `screener` / `hallucination-guard` に委ねる。

## 依存 (BeatScanner 固有・変更時は本スキルの前提も見直す)

- `CLAUDE.md`: 設計思想 / 触ると危険な箇所 / 投資業界の色ルール / Trust Cliff / Hallucination Guard 4 重防御
- design SSOT: `docs/references/design_system.md` (token) / `design_recipes.md` (発光 §C) / `elevation_scale.md` (whitelist)
- 既存 skill: `designing-workspace-ui` (design 規律) / `design-system-check` (機械検査) / `hallucination-guard` (§38/景表) / `funnel-cro` (Trust Cliff) / `vision-eval` (形状採点)
- memory: `feedback_snap_catches_layout_context_breaks` / `glow_elevation_postmortem` / `feedback_gold_accent_continuity` / `feedback_minimalism_over_additive` / `feedback_edit_replace_all_drift` / `feedback_auth_harness_vision_eval` / `feedback_vision_api_noise`
- harness: `frontend/scripts/lib/auth-helper.mjs` (Premium 注入) / visual harness 例外 4 条件 (CLAUDE.md)

## Inputs (起動時に user と確定 = pre-flight)

1. **正本 mockup HTML** path (file:// で開ける自己完結 HTML)
2. **対象実装ファイル** (component JSX + index.css の該当範囲)
3. **element-map**: `mockup_selector → impl_selector → role` の対応表。class 名は mockup と実装で全く異なるため必須。mockup にあって実装に無い要素は `excluded: demo-only` と明記
4. **preserve-list**: 戻さない意図的変更。各項目に **anchor (`commit <hash>` + SSOT §節 or `docs/specs/` 参照)** を付与。anchor 失効項目は再評価。**実行中の追加は不可** (起動時に確定)
5. **到達情報**: 本番 URL + render 到達 selector/手順 + auth 注入要否 (`feedback_auth_harness_vision_eval` の SOP)

→ 詳細な入力フォーマットと pre-flight チェック → [references/detection-and-triage.md](references/detection-and-triage.md)

## ワークフロー (各 Phase の exit-condition を満たすまで次へ進まない)

- [ ] **Phase 0 — Scope & pre-flight**: mockup を full-read。実装 render path を特定。embedded↔standalone の構造差を明示 (mockup=フルページ / 実装=workspace ペイン)。**demo-only スキャン** (grep) で移植禁止要素を抽出。危険箇所列挙。
  - **⚠️ claim grounding ゲート (必須・非LLM)**: 上流の監査台帳 / drift 主張を **鵜呑みにしない**。各主張の「mockup 側」「impl 側」双方が ground-truth に実在するかを `scripts/verify-claims.sh <mockup.html> <claims.tsv>` で機械検証する。1 つでも FABRICATED (mockup に無い要素を「mockup にある」と主張) / PHANTOM (実在しない component / selector を参照) があれば **exit 1 → Phase 1 へ進まない**。当該行は `F (mockup 復元)` に分類禁止・台帳を root-cause 再検証。
    - 由来: 2026-07-01 C10 事件 — 監査台帳が実在しない `sections/L0IdentityBand.jsx` 基準で mockup 状態まで hallucinate し `F` 誤分類 (chip枠 / ゲージバー / 3セルgrid / X分前 は mockup に無かった)。両辺 grep/find すれば防げた ([`scripts/example-claims.tsv`](scripts/example-claims.tsv) が再現 fixture)。
  - exit: Inputs 1-5 が user 確定済 + demo-only リスト確定 + element-map に未対応 mockup 要素を `excluded` 記録 + **claim grounding ゲート PASS (`verify-claims.sh` exit 0)**
- [ ] **Phase 1 — Detect (2方式併用)**: ①code/copy diff (sub-agent で構造化列挙) ②**computed-style diff** (script で mockup file:// と本番を実測比較)。**全状態 × 全 viewport × light/dark** を網羅 (検出漏れが最大の失敗)。
  - exit: drift 表が両方式で生成 + copy は全 occurrence grep 済 (`feedback_edit_replace_all_drift`)
  - 検出網羅の完全な checklist → [references/detection-and-triage.md](references/detection-and-triage.md)
- [ ] **Phase 2 — Triage**: 各 drift を分類。git log は **参考情報** (証拠でない)。
  - exit: 全 drift にラベル付与。**意図不明 (理由なし・preserve-list 未登録) は accidental と決め打ちせず user gate**。§38/Trust-Cliff/pricing 隣接は `hallucination-guard`/`funnel-cro` 経由。accent 過剰追加は自動修正禁止 (user gate)
  - 分類ルール・preserve-list anchor 規約・embedded 構造差判定 → [references/detection-and-triage.md](references/detection-and-triage.md)
- [ ] **Phase 3 — Fix (token 純化)**: mockup 値を semantic token で適用 (生 hex 禁止)。**修正前に token 在庫チェック** (mockup の hex/rgba を token と照合、無ければ user gate)。発光系は `design_recipes §C` 遵守。
  - exit: `design-system-check` skill PASS + 発光 exit-condition grep PASS (`contain:paint` 無 / 新規 glow host の compound 4-set / glow host に `overflow:hidden` 無) + `npm run build` PASS
- [ ] **Phase 4 — Verify (ground truth)**: deploy → ①bundle hash 変化を assert ②bundle grep (文字列反映) ③**computed-style 再 diff** (実装==mockup を許容誤差内) ④全 render path に反映 ⑤copy occurrence 単一。
  - exit: 上記 5 点 PASS。1 つでも fail なら Phase 3 へ戻る
  - 検証手法・許容誤差・cache 回避・auth TTL → [references/verification.md](references/verification.md)
- [ ] **Phase 5 — Preview-before-ship (条件付き)**: layout/glow/sticky/z-index/複数 component 波及の変更は、deploy 前に候補 CSS を本番へ `addStyleTag` 注入して screenshot+実測で先取り確認。**Phase 3 の design-system-check PASS が前提** (token 違反を隠蔽しない)。
  - 対象基準と注入手順 → [references/verification.md](references/verification.md)

## Outputs

- triaged AUDIT (`docs/specs/AUDIT_<screen>_<date>.md`、行 prefix `F`=fixed / `I`=intentional保全 / `D`=deferred-judgment / `X`=excluded-demo)。**Phase 0 `verify-claims.sh` の PASS/FAIL/WARN サマリーを転記**する (grounding 済の証跡。転記無き AUDIT は不完全)。grounding FAIL 行は phantom/fabricated として drop・`F` 禁止
- 適用 fix の commit 一覧 + 検証レポート (computed-style before→after)
- 残 user-gate 項目 (構造 / §38 / pricing / 過剰追加 / 意図不明)

## 検証 (このスキル自体の品質)

- 3 体 sub-agent レビューで設計の漏れを検証済 (工程完全性 / 検証技術 / design-Trust-Cliff 安全性)。設計 spec: `docs/specs/SKILL_DESIGN_mockup-fidelity.md`
- 初回適用 = screener (`docs/specs/mockups/screener-strategy-presets-v8.html`)。以降 銘柄詳細 / 図解生成 に再利用
