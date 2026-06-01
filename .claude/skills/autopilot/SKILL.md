---
name: autopilot
description: |
  user 不在中 (出社/就寝) に残タスク + dogfood feedback を安全に自律で進める orchestrator。
  「留守中に進めて」「就寝中に作業して」「自律で進めて」「残タスクを進めて」「自律PDCA」
  「朝/帰宅時にサマリーが欲しい」と依頼された際に使用する。
  実装そのものは各 domain skill (designing-workspace-ui / hallucination-guard / screener 等) に委譲し、
  本 skill は triage / 検証規律 / sub-agent review / SPEC 化判断 / handover+サマリー の枠組みを担う。
---

# autopilot — 自律作業セッション orchestrator

user が席を外す間 (出社 10h / 就寝) に、安全に進められるものだけ ship し、判断が要るものは SPEC 化して
起床/帰宅時に承認をもらう。**「無監視で危険なものを ship しない」 が最重要規律**。

## 関連 docs / memory (必読 anchor)
- `feedback_deploy_verify_discipline.md` — 検証してない hash を「検証済」 と書かない。 deploy→bundle grep→dogfood の規律
- `feedback_cost_efficient_operation.md` — sub-agent は `model: "sonnet"` default、 Opus は finance/§38 verdict のみ
- `visual_harness_exception.md` — preview server 禁止、 snap-*.mjs (headless 55s teardown) のみ例外
- `feedback_bypass_token.md` — authed chart の headless 描画は BYPASS_TOKEN 必要 (ローカル .env 未配置なら不可)
- `feedback_japanese_output.md` / `feedback_subagent_japanese.md` — 出力・sub-agent は日本語
- `feedback_pre_release_priority.md` — pre-release は コンテンツ→release準備→集客 の順

## ワークフロー

### 1. Intake — feedback/backlog をタスクに分解
user メッセージ + handover の残タスクを discrete なタスクに割る。各タスクに「何を / どの file / 期待結果」 を1行で。

### 2. Triage — 各タスクを 3 分類
| 分類 | 条件 | 扱い |
|---|---|---|
| **SAFE-SHIP** | 局所 frontend/backend、 UX/§38/pricing 判断なし、 既存 pattern の踏襲、 公開ビュー or build+logic で検証可 | 実装→deploy→検証 |
| **NEEDS-REVIEW** | design/strategy 判断が絡むが方向は収束しうる (破線の見せ方 / chip 配色 等) | sub-agent review → 収束すれば実装、 しなければ DEFER |
| **DEFER-SPEC** | user 判断必須 — 新 design token (色 taxonomy) / §38 重 (LLM narration / 将来予測) / pricing / Phase-gate / 大型 UX 再構成 | **ship せず SPEC/提案を書く** |

判断に迷ったら DEFER 側に倒す (無監視 ship のミスは取り返しにくい)。

### 3. SAFE-SHIP の実行ループ (1 タスクずつ)
1. 該当 domain skill を経由 (例: workspace UI = `designing-workspace-ui`、 LLM endpoint = `hallucination-guard`、 screener = `screener`)
2. 実装 → `cd frontend && npm run build` (構文) → CSS/component を触ったら **design-system-check** (raw hex/!important/発光バグ)
3. commit (co-author 行) → push → **deploy poll** (`/health.commit` が新 hash になるまで background loop)
4. **検証 (必須・捏造禁止)**:
   - frontend: 本番 entry から BFS で該当 chunk を辿り、 変更の固有文字列 (JP ラベル等) を grep
   - backend: 該当 endpoint を curl して期待 state/値 (dogfood)。 複数 ticker で異常監査
   - 公開ビュー (指数 `?layout=workspace&tab=indices&ticker=%5EGSPC`) は snap-*.mjs で視覚検証可
   - ⚠️ **authed chart (個別株 detail `?detail=t:TICKER`) は login 必要 → headless 描画不可**。 build+logic+bundle grep に留め、 朝 dogfood 項目に回す
5. 1 行ログに記録 (commit hash + 検証結果)

### 4. NEEDS-REVIEW
- sub-agent を **並列 background 起動** (`model: "sonnet"` default、 finance/§38/O'Neil verdict のみ `opus`、 全員「日本語で回答」)
- 観点を分ける (可視化 / UI デザイナー / 金融 / Trust Cliff 等)、 各 prompt は自己完結 (現状値 + 制約 + §38/色ルール)
- verdict 収束 → SAFE-SHIP ループへ。 収束せず or 安全性に懸念 → DEFER-SPEC へ
- review 数は `multi-review` の 3体/6体基準に準拠 (LLM品質/Trust Cliff/新endpoint の 3軸で 2+ active なら 6体、 局所なら 2-3体)

### 5. DEFER-SPEC
- 「推奨アプローチ + user が決めるべき具体的選択肢」 を簡潔に書く (full SPEC は `planner` skill / `docs/specs/`、 軽量なら handover 内 section)
- **ship しない**。 例: 新カテゴリ色 5 token / extended を buy candidate 化 (誤シグナル gate 設計) / transcript ガイダンス (§38)

### 6. 終了処理
- **handover 更新**: `handover_YYYY-MM-DD_v*.md` を vN+1 に (旧版削除)。 完了 commit 一覧 + DEFER-SPEC + 危険箇所
- **サマリー** (user 帰宅/起床用) を 3 section で:
  - **A. 目視 dogfood してほしい** — ticker + 画面 + 期待表示 (authed chart 等、 headless 検証不可だったもの)
  - **B. 判断待ち** — DEFER-SPEC の選択肢
  - **C. 自動検証済み (確認不要)** — ship + 検証済みの要約

## 危険箇所 (無監視で触らない)
- 発光系 `.panel-card/.bs-panel/.surface-card` / sticky 検索バー / VITE_ ARG/ENV / aggregator LLM import 禁止
- 新 design token (色 taxonomy) の確定 / LLM narration 追加 / §38 将来予測 / pricing / Stripe 配線
- Cup-Handle 閾値変更時は LLY/GE/META/NVDA dogfood 必須 (`feedback_cup_handle_thresholds.md`)
- `railway up` は使わない (deploy = main push → Railway 自動 build)

## コスト
sub-agent Sonnet default。 deploy poll は 20s 間隔 background loop。 handover lazy read (`fetch-handover`)。
1 セッションの sub-agent は Opus を finance/§38 の 1-2 体に限定。
