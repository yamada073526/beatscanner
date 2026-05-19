---
name: evaluator
description: BeatScanner PGE 自律 3 体ループの Evaluator 起動。 Generator が worktree で実装した sprint 成果を 4 層 (L1 機械 / L2 視覚 / L3 機能 / L4 主観) で検査し、 PASS/FAIL を JSON でフィードバックする。 L4 主観 gate は multi-review 3 体合議 を内部から呼ぶ。 通常は Generator が完了時に自動起動するが、 手動再検査したい場合は「/evaluator <sprint>」 で呼び出す。
---

# Evaluator Skill (PGE 3 体ループ検証層 entry point)

通常は Generator subagent が完了時に自動呼出するが、 手動再検査 / 既存 branch の検証 のために skill としても起動可能。

## 使用方法

通常は **自動起動** (Generator が完了時に呼ぶ)。 手動の場合:

```
/evaluator <SPRINT_NUMBER>
```

## 実行プロトコル

### Step 1: 前提確認

- `frontend/.visual/generator-selfcheck-sprint<N>.json` が存在するか確認 (なければ「Generator がまだ完了していない」 と escalate)
- 現 branch が `claude/<slug>-sprint<N>` か確認 (違うなら user に確認)

### Step 2: Evaluator subagent を起動

Agent tool で `subagent_type: evaluator` を起動:

```
Agent({
  description: "PGE Evaluator sprint <N> 検査",
  subagent_type: "evaluator",
  prompt: "SPRINT_NUMBER=<N>\nSELFCHECK_PATH=frontend/.visual/generator-selfcheck-sprint<N>.json\n\n指示: 4 層 (L1-L4) 検査を実行し、 frontend/.visual/evaluator-report-sprint<N>.json に結果を Write してください。 L4 主観 gate は multi-review skill を 3 体構成で起動。"
})
```

### Step 3: 結果の集約と user 通知

Evaluator が JSON を返したら、 結果サマリを user に表示:

```
✅ sprint <N> 検査結果 (Evaluator report):
- L1 機械: PASS / FAIL (詳細: ...)
- L2 視覚: PASS / FAIL (詳細: ...)
- L3 機能: PASS / FAIL (詳細: ...)
- L4 主観: PASS / FAIL (multi-review 3 体: 賛成 X / 条件付賛成 Y / 反対 Z)

総合: PASS → user 承認 gate 2 へ (deploy 判断)
      FAIL → Generator に retry 指示 (suggested_fix: ...)
```

### Step 4: PASS の場合の user 承認 gate 2

```
AskUserQuestion で「sprint <N> が全層 PASS しました。 次のアクションを選んでください」
- 採用してこの sprint を main にマージ + deploy (user が手動で `git merge` + `railway up`)
- 次の sprint に進む (Generator を sprint+1 で起動)
- 修正指示を渡す (Generator に retry)
- 中止
```

### Step 5: FAIL の場合の retry

`pass: false` の場合、 Generator subagent を再起動して `evaluator-report-sprint<N>.json` を渡す。 Generator が `suggested_fix` を反映して再実装、 retry 上限 3 回。

## 関連 subagent / skill

- subagent `evaluator` (`.claude/agents/evaluator.md`) — 実体
- subagent `generator` (前段)
- skill `multi-review` — L4 主観 gate で内部から起動
- skill `design-system-check` — L1 で内部呼出 (Generator self-fix 漏れの再検証)

## 制約

- **deploy / merge しない** (user gate 2 必須)
- **必ず日本語で記述**

## 参照

- `/Users/yamadadaiki/.claude/plans/handover-1-youttube-claude-code-user-streamed-wren.md`
- `docs/autoharness/poc_log.md`
- `handover_2026-05-19_v84.md` §8 (v84 dogfood 6 hotfix 教訓、 Evaluator L1-L3 で個別 cover)
