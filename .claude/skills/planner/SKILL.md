---
name: planner
description: BeatScanner PGE 自律 3 体ループの Planner 起動。 user が 1-4 行の要望 (例「scroll 5500px+ visual hierarchy 整理」「ウォッチリストに sector フィルター追加」) を打ったときに使用する。 詳細 SPEC.md を `docs/specs/` に生成し、 user 承認 (gate 1) を取得した後 Generator に引き渡す。 「/planner」「planner で SPEC 起こして」「planner 起動」 と依頼された際に呼び出す。
---

# Planner Skill (PGE 3 体ループ起動 entry point)

user の 1-4 行の要望を、 BeatScanner 固有制約 (5 原則 / ブランド世界観 / Trust Cliff / Hallucination Guard / v84 dogfood 教訓) に紐付けた詳細 SPEC.md に展開する。 PGE トリオ (Planner → Generator → Evaluator) の起動 entry point。

## 使用方法

```
/planner <user の 1-4 行の要望>
```

例:
- `/planner scroll 5500px+ visual hierarchy 整理して`
- `/planner ウォッチリストに sector フィルター追加`
- `/planner TriageBanner に最終更新時刻を併記`

## 実行プロトコル

### Step 1: Planner subagent を起動

Agent tool で `subagent_type: planner` を起動。 prompt に user 要望をそのまま渡す。

```
Agent({
  description: "PGE Planner 起動",
  subagent_type: "planner",
  prompt: "<user 要望そのまま>"
})
```

Planner subagent は以下を自動実行:
1. CLAUDE.md / design_system.md / design_recipes.md / 最新 handover を Read
2. 関連 memory anchor を grep で特定
3. SPEC_YYYY-MM-DD_<slug>.md を `docs/specs/` に Write

### Step 2: user 承認 gate 1

Planner 内部で AskUserQuestion を呼び、 user に「採用 / 修正指示 / 中止」 を聞く。

- **採用** → Generator skill を続けて起動 (`/generator <SPEC_PATH>` 相当を案内)
- **修正指示** → Planner を再起動 (user の修正指示を新 prompt として)
- **中止** → SPEC ファイルを残したまま終了 (将来再利用可)

### Step 3: SPEC 出力場所の保証

`docs/specs/` ディレクトリが存在しない場合、 Planner が先に `Bash("mkdir -p docs/specs")` で作成。

## 関連 subagent / skill

- subagent `planner` (`.claude/agents/planner.md`) — 実体
- subagent `generator` (`.claude/agents/generator.md`) — 承認後に起動
- subagent `evaluator` (`.claude/agents/evaluator.md`) — Generator 完了後に起動
- skill `multi-review` — Planner が「6 体必要」 と判定した場合、 SPEC 承認前に起動
- skill `grill-me` — user 要望が曖昧すぎる場合の代替

## 制約

- **必ず日本語で記述** (SPEC 内部資料は OK、 ただし UI 文字列は「じっちゃま」 禁止)
- **SPEC の sprint 上限 6** (BeatScanner 本番運用済プロダクトのため動画原典 10 sprint より制限)
- **触ってはいけないファイル一覧を SPEC §6 に必ず inject**

## 参照

- `/Users/yamadadaiki/.claude/plans/handover-1-youttube-claude-code-user-streamed-wren.md` (PGE 3 体ループ導入プラン SSOT)
- `docs/autoharness/poc_log.md` (PoC 結果蓄積)
