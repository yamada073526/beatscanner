---
name: evaluator
effort: xhigh
description: BeatScanner PGE 自律 3 体ループの Evaluator 起動。 Generator が worktree で実装した sprint 成果を 4 層 (L1 機械 / L2 視覚 / L3 機能 / L4 主観) で検査し、 PASS/FAIL を JSON でフィードバックする。 L4 主観 gate は multi-review 3 体合議 を内部から呼ぶ。 通常は Generator が完了時に自動起動するが、 手動再検査したい場合は「/evaluator <sprint>」 で呼び出す。
---

# Evaluator Skill (PGE 3 体ループ検証層 entry point)

通常は Generator subagent が完了時に自動呼出するが、 手動再検査 / 既存 branch の検証 のために skill としても起動可能。

## 依存

- `.claude/agents/evaluator.md` — Evaluator subagent 本体 (4 層検査内容 / report JSON schema / selfcheck file path / branch 命名規則の SSOT)
- subagent `generator` (前段、 selfcheck JSON 出力)
- skill `multi-review` — L4 主観 gate で内部から 3 体合議として起動
- skill `design-system-check` — L1 で内部呼出 (Generator self-fix 漏れの再検証)
- skill `pge-loop-debugger` — Evaluator 完了後の dogfood 失敗時に 4 落とし穴 grep を全件走らせる SOP
- `memory/feedback_pge_loop_pitfalls.md` — Evaluator L3 PASS なのに dogfood で fail する pattern

## 使用方法

通常は **自動起動** (Generator subagent が完了時に呼ぶ)。 手動の場合:

```
/evaluator <SPRINT_NUMBER>
```

## 実行プロトコル

### Step 1: 前提確認

- Generator subagent の selfcheck JSON が存在するか確認 (なければ「Generator がまだ完了していない」 と escalate)
- 現 branch が sprint 用 worktree branch か確認 (違うなら user に確認)

selfcheck file path / branch 命名規則は `.claude/agents/evaluator.md` および `generator.md` が SSOT。

### Step 2: Evaluator subagent を起動

Agent tool で `subagent_type: evaluator` を起動:

```
Agent({
  description: "PGE Evaluator sprint <N> 検査",
  subagent_type: "evaluator",
  prompt: "SPRINT_NUMBER=<N>\n\n指示: 4 層 (L1-L4) 検査を実行し、 report JSON を Write してください。 L4 主観 gate は multi-review skill を 3 体構成で起動。"
})
```

4 層検査の詳細内容 / L4 で起動する reviewer 構成 / report JSON 出力場所は `.claude/agents/evaluator.md` が SSOT。

### Step 3: 結果の集約と user 通知

Evaluator が JSON を返したら、 結果サマリ (各層 PASS/FAIL + 詳細 + 総合判定) を user に表示。 表示 template は subagent 出力をそのまま使う (skill 側で format しない)。

### Step 4: PASS 時の user 承認 gate 2

```
AskUserQuestion で「sprint <N> が全層 PASS しました。 次のアクションを選んでください」
- 採用してこの sprint を main にマージ + deploy (user が手動で git merge + railway up)
- 次の sprint に進む (Generator を sprint+1 で起動)
- 修正指示を渡す (Generator に retry)
- 中止
```

### Step 5: FAIL 時の retry

`pass: false` の場合、 Generator subagent を再起動して report JSON を渡す。 Generator が `suggested_fix` を反映して再実装、 retry 上限は `.claude/agents/generator.md` で定義。

### Step 6: dogfood 失敗時の補完

L3 PASS でも production HTML / console で再 verify し、 dogfood で fail したら `pge-loop-debugger` skill の 4 落とし穴 grep を全件走らせる (selector hallucination / ES module return / infinite animation 等)。

## 制約

- **deploy / merge しない** (user gate 2 必須)
- **必ず日本語で記述**
