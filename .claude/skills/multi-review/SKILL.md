---
name: multi-review
description: BeatScanner の Phase gate / 重要設計判断で 6 体専門家サブエージェントを並列起動して並列レビューを実行する。「サブエージェント 6 人で並列レビュー」「マルチレビューして」「Phase gate review」「6 体一致確認」と依頼された際、または重要設計の意思決定前に使用する。
---

# Multi-Review

BeatScanner の重要設計判断 (新タブ構造、新機能 spec、リリース前確認、UI 大幅変更) を **6 体の専門家サブエージェント並列レビュー** で多面的に検証する。Anthropic エンジニア提案 (memory `migration_v61_to_v62.md` WS-1) で skill 化が決定。v62 の workspace 化方針確定 (2026-05-10) の際に実際に運用された 6 体パネルを SSOT 化したもの。

## 6 体パネル構成 (BeatScanner 標準)

| # | 専門家 | 観点 | 採用理由 |
|---|---|---|---|
| 1 | **UI/UX デザイナー** | 見やすさ・使い勝手・既存 UI との整合性 | Linear / Notion / VS Code / Figma 流のモダン UX 評価 |
| 2 | **Web アプリ設計エキスパート** | アーキテクチャ・モダンプロダクトデザイン | Linear / Vercel / Stripe Dashboard / Cursor の設計思想 |
| 3 | **Web アプリ開発エキスパート** | 実装観点・既存 stack との整合 | React 19 / Next.js 16 / Tailwind v4 / shadcn 実装に精通 |
| 4 | **金融アナリスト** | データ精度・ロジック・金融プロ視点 | Bloomberg / Refinitiv / TradingView / SBI / 楽天証券に精通 |
| 5 | **Anthropic エンジニア** | skill / hook / memory / Claude Code ベストプラクティス | 公式 docs と最新 skill API 知識 |
| 6 | **Web マーケター** | 集客 (SEO/AIO) ・コンバージョン・リリース戦略 | SaaS / Fintech / リテール投資家プロダクトの集客に精通 |

将来追加候補: UX リサーチャー / アクセシビリティ専門家 / セキュリティエンジニア

## 起動方法

ユーザーが以下のように依頼:
- 「サブエージェント 6 人で並列レビューしてほしい」
- 「マルチレビューして」
- 「Phase gate review (= Phase 完了判定) してほしい」
- 「6 体一致を確認したい」
- Claude が大きな設計判断前に **proactive に提案** (例: 「Phase 3 着手前に 6 体レビューを推奨します」)

## 実行プロトコル

### Step 1: コンテキスト準備

レビュー対象を以下の 5 要素で明確化:
- **判断対象**: 何の意思決定か (例: 「画面全体 workspace 化の方針」「新タブ追加」「リリース判断」)
- **背景**: BeatScanner の現状 + 直近の関連 commit
- **選択肢**: A 案 / B 案 / 現状維持 等
- **関連資料パス**: handover / RELEASE_TODO / memory / 参照リポジトリ
- **過去レビュー履歴**: 該当 RELEASE_TODO 番号 / handover §

### Step 2: 6 体並列起動 (Agent tool)

**1 メッセージで 6 つの Agent tool call を並列実行**。`subagent_type: general-purpose`。各エージェントの prompt は以下のテンプレートに従う:

```
あなたは [専門家種別] です。[専門領域の権威プロダクト/会社] に精通しています。

## 背景
[BeatScanner 概要 (200 字)]

## レビュー対象
[判断対象 + 選択肢 + 関連 commit/§]

## 参照資料
[memory / handover / 競合資料 path のリスト]

## 過去レビュー履歴
[該当 RELEASE_TODO § / 関連 memory entry]

## レビューしてほしいこと
[専門家観点の問いを 5-7 個、具体的に]

## 出力要件
- **必ず日本語で回答** (memory `feedback_subagent_japanese.md` 必須)
  - コード例 / file path / 専門用語は英語のままで OK
- 推奨案 + 理由 + 工数見積り
- BeatScanner 既存資産 (12 skill / 90+ memory / sticky 検索バー / 発光バグ教訓) を破壊しない
- レスポンスは 800-1500 字 (観点に絞る)
- 最後に **「賛成 / 条件付賛成 / 反対」の総合判定**
```

### Step 3: 結果統合

6 体の回答を以下の形で集約:
- **共通結論** (3 体以上が一致した提案を抽出)
- **エージェント別 差別化提案** (1-2 体だけが挙げた独自視点)
- **対立する論点** (採否判断要)
- **総合判定マトリクス** (各エージェントの賛否)
- **推奨実装プラン** (工数 + Phase 振り分け)
- **未決事項 (= grill-me で詰める対象)**

### Step 4: ユーザー判断支援

統合結果を `AskUserQuestion` でユーザーに提示 (`feedback_choice_format.md` に従い推奨案 1 + 代替案 2-3 + P/D 併記)。

## 起動タイミング (Phase gate)

CLAUDE.md / `migration_v61_to_v62.md` で以下の Phase 完了時に **自動起動推奨**:

- WS-2 (WorkspaceShell scaffold) 完了時 — UI 構造の方向性確認 ← **v62 で実運用された**
- WS-5 (Pane 1 DnD + 段階公開) 完了時 — dogfood 開始判断
- WS-6 (dogfood 結果) 完了時 — 道A 続行 vs Plan B
- リリース前 (release-check skill 内) — 集大成の最終確認
- 重要新機能着手前 (例: 11-B-22 / 11-C-6 等の差別化最強候補)

## v62 で実際に運用された事例 (2026-05-10)

**判断対象**: 画面全体 workspace 化の方針確定

**結果サマリー**:
- 6 体共通: WorkspaceShell 新設 + react-resizable-panels + URL = SSOT + Cmd+K palette
- UI/UX: ヘッダー tabs を Pane 1 nav に統合、検索を palette 完全移管
- 設計: URL 経由で Linear 流、frontend/ で完結 (Next.js 移行延期)
- 開発: localStorage 命名 `bs:ws:` namespace + `:v1` suffix
- 金融: **Pane 2 で 5 銘柄 × 5 条件 PASS/FAIL ヒートマップ (差別化最強)**
- Anthropic: `designing-workspace-ui` skill 即取り込み + `workspace_path_map.md` SSOT
- **マーケター (条件付賛成、軌道修正 5 件)**:
  - LP は workspace 化対象外 (SEO/AIO 死守)
  - MVP を 11-13 日 → 5-6 日に圧縮、dogfood 3 日
  - **11-B-7-B Phase B 買付クイック登録を workspace 前に先行** (1 日、CV +35-45%)
  - Pane 4 は AI chat → 11-B-22 マクロニュース連動
  - mobile は `/classic` 強制、launch は「ヒートマップ」一点突破

**統合結論**: マーケターの軌道修正を反映して MVP を 5-6 日に圧縮、買付登録を先行、ヒートマップを訴求軸に。

## 注意事項

- **必ず日本語で回答**を全エージェント prompt の末尾に明記 (memory `feedback_subagent_japanese.md`)
- 並列起動 = 1 メッセージ内で 6 つの Agent tool call (sequential だと 5-10 分かかる)
- 各エージェントは Agent.subagent_type で role を指定できないため、prompt 冒頭で「あなたは X です」と role を明示
- 6 体全員の意見が割れる論点は **そのまま grill-me skill に渡して 1 問ずつ詰める** のが効率的
- レビュー結果は **handover or memory に記録** (将来「あの判断の根拠は?」と問われたときに即取り出せる)

## 関連 memory / skill

- `memory/feedback_subagent_japanese.md` (日本語回答必須)
- `memory/feedback_choice_format.md` (選択肢提示の形式)
- `memory/migration_v61_to_v62.md` (v62 で実運用した記録)
- `memory/glow_elevation_postmortem.md` (発光バグ系のレビュー対象なら参照)
- skill `grill-me` (レビュー後の 1 問ずつ詰め)
- skill `release-check` (リリース前の集大成として multi-review を内包)
