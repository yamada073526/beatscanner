---
name: generator
description: BeatScanner PGE 自律 3 体ループの Generator 起動。 Planner が SPEC.md を生成して user 承認 (gate 1) を取得した後、 該当 sprint 1 機能を worktree 上で実装する。 既存 12 skill (designing-workspace-ui / shadcn / chart-tab 等) を呼び出す orchestrator。 自己評価 5 項目 PASS 後に Evaluator へ引き渡し。 「/generator <SPEC_PATH> <sprint>」「generator で sprint N 実装」 と依頼された際に呼び出す。
---

# Generator Skill (PGE 3 体ループ実装層 entry point)

Planner が生成し user 承認済みの SPEC.md と sprint 番号を入力に、 worktree 上で 1 機能を実装する。 既存 12 skill を呼び出す orchestrator として動作。

## 使用方法

```
/generator <SPEC_PATH> <SPRINT_NUMBER>
```

例:
```
/generator docs/specs/SPEC_2026-05-19_pane3-scroll-hierarchy.md 1
```

## 実行プロトコル

### Step 1: 前提確認

- SPEC.md が存在するか確認 (なければ `/planner` 起動を案内)
- 現 branch が main か確認 (main 以外なら user に確認)
- `BS_AUTONOMY_MODE=1` が set されるか確認 (Generator subagent が起動すれば自動 set)

### Step 2: Generator subagent を起動

Agent tool で `subagent_type: generator` を起動:

```
Agent({
  description: "PGE Generator sprint <N> 実装",
  subagent_type: "generator",
  prompt: "SPEC_PATH=<path>\nSPRINT_NUMBER=<N>\n\n指示: SPEC §5 の sprint <N> を worktree 上で実装し、 自己評価 5 項目を全 PASS させてから Evaluator に引き渡してください。"
})
```

### Step 3: Generator 完了後の自動引き渡し

Generator が `frontend/.visual/generator-selfcheck-sprint<N>.json` で 5 項目全 PASS を確認すると、 自動的に Evaluator subagent を起動する (Generator subagent 内部の Step 6 動作)。

### Step 4: 失敗時の escalate

Generator が retry 3 回上限に達した、 または self-fix で解決できない error を検出した場合、 user に escalate:

```
AskUserQuestion で「Generator が sprint <N> 実装に失敗しました。 原因: <reason>。 対処を選んでください」
- 修正指示を渡す
- SPEC を見直す (Planner 再起動)
- sprint をスキップして次へ
- 中止
```

## 関連 subagent / skill

- subagent `generator` (`.claude/agents/generator.md`) — 実体
- subagent `planner` (前段)
- subagent `evaluator` (後段、 自動起動)
- skill `designing-workspace-ui` / `shadcn` / `chart-tab` / `stock-chart` / 他 12 skill — Generator が orchestrate

## 制約

- **worktree 上で作業** (main 直接編集禁止)
- **git commit / deploy しない** (user gate 2 必須)
- **必ず日本語で記述**

## 参照

- `/Users/yamadadaiki/.claude/plans/handover-1-youttube-claude-code-user-streamed-wren.md`
- `docs/autoharness/poc_log.md`
