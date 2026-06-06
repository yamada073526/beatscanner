---
name: generator
effort: xhigh
description: BeatScanner PGE 自律 3 体ループの Generator 起動。 Planner が SPEC.md を生成して user 承認 (gate 1) を取得した後、 該当 sprint 1 機能を worktree 上で実装する。 既存 skill 群 (designing-workspace-ui / shadcn / chart-tab 等) を呼び出す orchestrator。 自己評価項目 PASS 後に Evaluator へ引き渡し。 「/generator <SPEC_PATH> <sprint>」「generator で sprint N 実装」 と依頼された際に呼び出す。
---

# Generator Skill (PGE 3 体ループ実装層 entry point)

Planner が生成し user 承認済みの SPEC.md と sprint 番号を入力に、 worktree 上で 1 機能を実装する。 既存 skill 群を呼び出す orchestrator。

## 依存

- `.claude/agents/generator.md` — Generator subagent 本体 (実装手順 / 自己評価項目 / selfcheck JSON schema の SSOT)
- 既存 BeatScanner skill 群 (`designing-workspace-ui` / `shadcn` / `chart-tab` / `stock-chart` 等) — Generator が orchestrate する domain skill
- skill `pge-loop-debugger` — Generator 完了時 checklist (node --check / production curl + grep / animation try/catch)
- subagent `planner` (前段) / `evaluator` (後段、 自動起動)
- CLAUDE.md「Visual Diagnostic Harness Exception」 — snap-*.mjs 4 条件
- `memory/feedback_generator_selfeval_incomplete.md` — Generator が self-eval 完遂しない pattern の SOP

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
- env / hook 等の起動条件は Generator subagent が自動 set (詳細は `.claude/agents/generator.md`)

### Step 2: Generator subagent を起動

Agent tool で `subagent_type: generator` を起動:

```
Agent({
  description: "PGE Generator sprint <N> 実装",
  subagent_type: "generator",
  prompt: "SPEC_PATH=<path>\nSPRINT_NUMBER=<N>\n\n指示: SPEC §5 の sprint <N> を worktree 上で実装し、 自己評価項目を全 PASS させてから Evaluator に引き渡してください。"
})
```

実装手順 / 自己評価項目 / selfcheck JSON 出力場所は `.claude/agents/generator.md` が SSOT。

### Step 3: Generator 完了後の自動引き渡し

Generator subagent が自己評価で全 PASS を確認すると、 自動的に Evaluator subagent を起動する (subagent 内部動作)。

`memory/feedback_generator_selfeval_incomplete.md` で記録されている「Generator が self-eval 完遂せず止まる」 pattern に該当した場合、 main 側で build / testid grep / NaN grep / Evaluator 起動を手動補完する SOP を実行。

### Step 4: 失敗時の escalate

Generator が retry 上限に達した、 または self-fix で解決できない error を検出した場合、 user に escalate:

```
AskUserQuestion で「Generator が sprint <N> 実装に失敗しました。 原因: <reason>。 対処を選んでください」
- 修正指示を渡す
- SPEC を見直す (Planner 再起動)
- sprint をスキップして次へ
- 中止
```

## 制約

- **worktree 上で作業** (main 直接編集禁止)
- **git commit / deploy しない** (user gate 2 必須)
- **必ず日本語で記述**
