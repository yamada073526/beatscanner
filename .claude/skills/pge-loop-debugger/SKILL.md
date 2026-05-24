---
name: pge-loop-debugger
description: |
  BeatScanner PGE 3 体ループ (planner / generator / evaluator) の運用で繰り返し発生する
  落とし穴を機械的に防ぐスキル。
  「PGE loop が空回りする」「Generator の成果が次 sprint に継承されない」
  「Evaluator L3 が PASS なのに本番で動かない」「ES module top-level return SyntaxError」
  「getAnimations().finish() で infinite animation error」
  「snap-*.mjs が timeout する」と依頼された際、 または PGE 自律 loop 起動前後に使用する。
---

# pge-loop-debugger スキル

## 目的

PGE 3 体自律 loop (`planner` / `generator` / `evaluator`) の運用で過去に発生した落とし穴を機械的に防ぐ。 PGE 自律性を信用しすぎず、 落とし穴 patten を Planner / Generator / Evaluator の各 phase で必ず check する。

## 依存

- `memory/feedback_pge_loop_pitfalls.md` — 落とし穴の発生事例 + 真因 SSOT
- `memory/feedback_press_feedback_delta.md` — 「animation forwards fill 罠」 double anchor (落とし穴 4)
- `memory/visual_harness_exception.md` — snap-*.mjs 4 条件 SSOT
- CLAUDE.md「Visual Diagnostic Harness Exception (preview 禁止の限定例外)」
- skill `planner` / `generator` / `evaluator` — 3 体ループ本体
- `frontend/scripts/snap-*.mjs` — visual diagnostic harness 群

## いつ呼び出すか

- `/planner <要望>` で sprint 群を生成する前
- `/generator <SPEC> <sprint>` 起動前
- `/evaluator <sprint>` 結果が PASS なのに dogfood で fail した時
- `frontend/scripts/snap-*.mjs` を新規追加 / 編集する時
- production HTML を curl + grep で selector 不在を発見した時
- ブラウザ console で `Illegal return statement` / `InvalidStateError: Cannot finish Animation` を見た時

## 落とし穴一覧

過去に発生した落とし穴とその対策詳細・hotfix code は `references/pitfalls.md` を参照。

| # | 症状 | 真因 | 主な対策 |
|---|---|---|---|
| 1 | sprint N+1 が前 sprint の変更を継承しない | `git worktree add` が main から fresh branch するため | 同一 file を複数 sprint で触る計画なら SPEC に「sprint 間 commit 必須」 明記 |
| 2 | Evaluator L3 PASS なのに dogfood で全 fallback 失敗 | selector grep が `className` ≠ React component 名の暗黙前提を見抜けず | primary selector を `data-testid` 化 + production HTML curl + grep verify |
| 3 | `Illegal return statement` で snap script 死亡 | ES module top-level (try 直下含む) で `return` 不可 | Evaluator L1 で `node --check` 必須化 |
| 4 | `InvalidStateError: Cannot finish Animation` | 無限 animation に `.finish()` 呼出 | `a.finish()` を try/catch + iterations check ラップ |

## 横展開: PGE 生成 script の 3 verify

PGE 3 体ループで生成された **未検証 script** は、 1 回目の実 dogfood で必ず以下 3 verify を通す (Evaluator L1 inject 候補):

1. `node --check <path>` — ES module syntax (落とし穴 3)
2. production curl + grep `<selector>` — selector 整合 (落とし穴 2)
3. 実行 → console 監視 — infinite animation / timeout / API key 漏れ (落とし穴 4 + その他)

## snap-*.mjs 例外条件との整合

CLAUDE.md「Visual Diagnostic Harness Exception」 で許可される条件 (name / headless / timeout / 出力先) は `memory/visual_harness_exception.md` 参照。 Generator が新規 snap-*.mjs を作成する場合、 **当該条件 + 落とし穴 3 / 4 対策を全て満たす** こと。

## Planner 起動前 checklist

- [ ] SPEC が **同一 file を複数 sprint で触る** 計画か grep で確認 (落とし穴 1)
  - 該当ありなら SPEC に「sprint 間 commit 必須」 を明記
- [ ] selector / className を扱う sprint か確認 (落とし穴 2)
  - 該当ありなら「primary selector は data-testid」 を SPEC に明記
- [ ] `frontend/scripts/*.mjs` を編集する sprint か確認 (落とし穴 3 + 4)
  - 該当ありなら「ES module top-level return 禁止 + `a.finish()` try/catch ラップ必須」 を SPEC に明記

## Generator 完了時 checklist

- [ ] 変更 file に `.mjs` 含むなら `node --check <path>` を全 file 通す (落とし穴 3)
- [ ] selector / className を追加したなら production curl + grep で実在確認 (落とし穴 2)
- [ ] `getAnimations().finish()` を呼ぶ箇所があれば try/catch + iterations check 確認 (落とし穴 4)
- [ ] 前 sprint で同 file を触っていたなら、 前 sprint の変更が含まれているか手動 verify (落とし穴 1)

## Evaluator 完了時 (L4 通過後の dogfood) checklist

- [ ] L3 PASS でも production HTML / console で再 verify
- [ ] selector 不在は L3 fail として扱う (curl + grep 実装まで semi-trust)
- [ ] dogfood で fail したら 4 落とし穴の grep を全件走らせる
