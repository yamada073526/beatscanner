---
name: planner
effort: xhigh
description: BeatScanner PGE 自律 3 体ループの Planner 起動。 user が 1-4 行の要望 (例「scroll 5500px+ visual hierarchy 整理」「ウォッチリストに sector フィルター追加」) を打ったときに使用する。 詳細 SPEC.md を `docs/specs/` に生成し、 user 承認 (gate 1) を取得した後 Generator に引き渡す。 「/planner」「planner で SPEC 起こして」「planner 起動」 と依頼された際に呼び出す。
---

# Planner Skill (PGE 3 体ループ起動 entry point)

user の 1-4 行の要望を、 BeatScanner 固有制約 (CLAUDE.md 5 原則 / ブランド世界観 / Trust Cliff / Hallucination Guard / 過去 dogfood 教訓) に紐付けた詳細 SPEC.md に展開する。 PGE トリオ (Planner → Generator → Evaluator) の entry point。

## 依存

- `.claude/agents/planner.md` — Planner subagent 本体 (SPEC 生成手順 / 内部 prompt の SSOT)
- `docs/specs/` — SPEC.md 出力先
- CLAUDE.md — 5 原則 / ブランド世界観 / 触ると危険な箇所 / Trust Cliff / Hallucination Guard 4 重防御
- `memory/feedback_pge_loop_pitfalls.md` — 過去 dogfood で発見した落とし穴 (sprint 越し file 触り等)
- skill `pge-loop-debugger` — Planner 起動前 checklist (同一 file 複数 sprint / selector / mjs scripts)
- skill `multi-review` — Planner が「6 体合議必要」 と判定した場合、 SPEC 承認前に起動
- skill `grill-me` — user 要望が曖昧すぎる場合の代替

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

Agent tool で `subagent_type: planner` を起動、 prompt に user 要望をそのまま渡す:

```
Agent({
  description: "PGE Planner 起動",
  subagent_type: "planner",
  prompt: "<user 要望そのまま>"
})
```

SPEC 生成の内部手順 (どの file を Read するか / どの memory を grep するか / SPEC 構造) は `.claude/agents/planner.md` が SSOT。

### Step 2: 起動前 checklist (pge-loop-debugger 連携)

SPEC が以下のいずれかに該当する場合、 `pge-loop-debugger` skill の Planner 起動前 checklist を必ず通す:

- 同一 file を複数 sprint で触る計画 → 「sprint 間 commit 必須」 を SPEC に明記
- selector / className を扱う sprint がある → 「primary selector は data-testid」 を SPEC に明記
- `frontend/scripts/*.mjs` を編集する sprint がある → ES module top-level return 禁止 + animation try/catch を SPEC に明記

### Step 3: user 承認 gate 1

Planner 内部で AskUserQuestion を呼び、 user に以下を聞く:

- **採用** → Generator skill (`/generator <SPEC_PATH> <sprint>`) を続けて起動
- **修正指示** → Planner を再起動 (user の修正指示を新 prompt として)
- **中止** → SPEC ファイルを残したまま終了 (将来再利用可)

### Step 4: SPEC 出力場所の保証

`docs/specs/` ディレクトリが存在しない場合、 Planner subagent が先に `mkdir -p docs/specs` で作成する。

## 制約

- **必ず日本語で記述** (SPEC 内部資料は OK、 ただし UI 文字列は CLAUDE.md「表示テキストのポリシー」 遵守 = 個人名禁止)
- **触ってはいけないファイル一覧を SPEC §6 に必ず inject** (CLAUDE.md「触ると危険な箇所」 参照)
- **SPEC の sprint 上限**: 本番運用済プロダクトのため小数推奨 (`.claude/agents/planner.md` で定義)
