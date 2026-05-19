# PGE 自律 3 体ループ PoC ログ

PGE (Planner / Generator / Evaluator) 3 体自律開発ループの PoC 実行記録と評価。

## ループ全体像

```
user prompt (1-4 行)
  ↓
Planner subagent → SPEC.md (docs/specs/)
  ↓ user 承認 (gate 1)
Generator subagent → worktree 実装 + 自己評価 5 項目
  ↓ 自動引き渡し
Evaluator subagent → L1-L4 検査 (L4 は multi-review 3 体合議)
  ↓ user 承認 (gate 2)
user 手動 git merge + railway up
```

## 設計 SSOT

- 設計プラン: `/Users/yamadadaiki/.claude/plans/handover-1-youttube-claude-code-user-streamed-wren.md`
- subagent 定義: `.claude/agents/planner.md` / `generator.md` / `evaluator.md`
- skill wrapper: `.claude/skills/planner/SKILL.md` / `generator/SKILL.md` / `evaluator/SKILL.md`
- 禁止領域 hook: `.claude/hooks/pre_edit_autonomy_forbidden.sh`
- Evaluator L3 e2e: `frontend/scripts/snap-flow-pane3-scroll.mjs` (Phase 0 で新規)

## Phase 0 PoC 題材

**v84 P3 残課題**: scroll 5500px+ visual hierarchy 整理

- handover v84 §3 で次セッション着手必須と明示
- multi-review 3 体合議推奨済 (ui-designer + brand-aspiration + frontend-architect)
- Evaluator L4 主観 gate (3 体合議) の検証題材として最適

## 実行ログ

### Run #1 (未実行)

| 項目 | 値 |
|---|---|
| 日時 | YYYY-MM-DD HH:MM |
| user prompt | "" |
| SPEC path | docs/specs/SPEC_YYYY-MM-DD_<slug>.md |
| Planner 所要時間 | -- 分 |
| user 承認 gate 1 | 採用 / 修正指示 / 中止 |
| sprint 数 | N (1〜6) |
| Generator branch | claude/<slug>-sprint<N> |
| Generator 自己評価 | 5/5 PASS / FAIL |
| Generator retry 回数 | 0〜3 |
| Evaluator L1 | PASS / FAIL |
| Evaluator L2 | PASS / FAIL |
| Evaluator L3 | PASS / FAIL |
| Evaluator L4 (multi-review 3 体) | PASS / FAIL (賛成 X / 条件付賛成 Y / 反対 Z) |
| user 承認 gate 2 | 採用 / 修正指示 / 中止 |
| 総所要時間 | -- 分 |
| 採用判定 | 採用 / 棄却 |
| 採用後 deploy hash | index-XXXXXX.js |

## PoC 完了判定基準 (plan §8 Verification)

1. `/planner` 起動から SPEC.md 生成 + user 承認まで **30 分以内**
2. Generator が sprint 1 機能を worktree に実装、 自己評価 5 項目全 PASS
3. Evaluator L1-L3 機械検査が完走、 結果を JSON で出力
4. Evaluator L4 multi-review 3 体合議が起動、 「賛成 or 条件付賛成」 取得
5. user が gate 2 で承認、 user 自身が `railway up` で deploy
6. 本番バンドルハッシュが変化、 production URL でスクロール length が短縮されたか curl 検証

## 失敗判定の閾値

- 上記 1-6 のいずれかで retry 4 回以上必要
- Trust Cliff / Hallucination Guard 違反検出
- subagent timeout / multi-review 応答なし

→ Phase 0 中止、 改善案を memory anchor `project_autonomy_loop_poc.md` に記録して再設計

## 採用判定 後のアクション

### 採用 (PoC 成功)

- memory anchor `project_autonomy_loop_poc.md` を新規作成、 成功記録
- Phase 1 (半自律 Pilot) に進む
- 対象を拡張: 新規 React component (200 行未満) / regression test 追加 / dead code 削除

### 棄却 (PoC 失敗)

- 失敗 root cause を分析
- 改善案を新規 plan として記録
- 再 PoC するか、 PGE トリオ撤回するか user 判断

## v84 dogfood 教訓を Evaluator で個別 cover している項目

PoC では特に以下が L1-L3 で再現検証されることを確認:

1. **真っ白事故 (useEffect import 漏れ)** → L2 `snap-runtime-errors.mjs` で blank: false 検証
2. **Supabase service_role GRANT 漏れ** → L3 authenticated fetch smoke test
3. **schema fixture 乖離** → L3 本番 URL 経由 e2e 必須 (fixture trust 禁止)
4. **signal_quality envelope empty/error 混同** → L4 qa-dogfooder 主観 gate
5. **TriageBanner 3 段階修正ループ** → SPEC §1 で `feedback_triage_banner_pattern.md` 必読 inject
6. **dead code 削除巻き込み** → L1 build pass + autonomy hook

## 関連 memory anchor (PoC 着手前に Planner / Generator / Evaluator が読むべき)

- `feedback_dead_code_hook_dependency.md` — dead code 削除時の hook import dependency check
- `feedback_supabase_grant_bug.md` — service_role GRANT 漏れ pattern
- `feedback_triage_banner_pattern.md` — TriageBanner condition SSOT
- `feedback_data_completeness_guard.md` — per-source namespace + 3 段階分岐
- `feedback_brand_aspiration.md` — Aman/Ritz-Carlton 級世界観 (修正禁止 anchor)
- `feedback_design_principles.md` — 5 原則
