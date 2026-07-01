# handover v314 — main session model policy を Sonnet 5 既定へ変更 (2026-07-01)

前任: v313 (autopilot: mockup-fidelity guard 機械化 + Phase D gate 材料)。
本セッションは **コード変更なし・CLAUDE.md 運用ポリシー変更のみ** の短命セッション。

## 🎯 本セッションの内容と結論

1. user から「Sonnet 5 と Opus 4.8、BeatScanner 開発にはどちらが適するか」の質問 → 価格・性能を skill (`claude-api`) で裏取りして回答:
   - Sonnet 5 は Opus 4.8 と**同一 tokenizer**、coding/agentic 品質は Opus 級に迫る、価格は Opus 比 **40% 安**（導入価格〜2026-08-31 は **60% 安 = $2/$10 per 1M**）。
   - 推奨: sub-agent 既定を Sonnet 5 に昇格（無リスク）、main は「重い判断＝Opus 維持 / 実装中心＝Sonnet 5 切替検討」のハイブリッド。
2. user 決定: **main session の既定モデルも常に Sonnet 5 を選択**する運用に変更。「サブエージェントレビュー」「ultrathink」「/deep-research」選択時は**内部処理のみ自動で Opus 4.8 に引き上げ**てほしいとの要望。
3. 技術的に正直に線引きして実装:
   - **できる（sub-agent = 内部処理）**: Claude が `model` を決定論的に指定できるため完全自動化可能。→ `multi-review` の user 明示起動時 reviewer / research の verify・synthesis 段を Opus 4.8 に自動指定するルールを CLAUDE.md に明記。
   - **できない（ultrathink / main の主判断）**: ultrathink は **effort** であり model ではない。main session の model は `/model`（= user 手動操作）でしか変わらず、Claude はセッション中に自分の model を切り替える手段を持たない。ここを「自動 Opus 化」と偽って書くと Trust Cliff（実際は Sonnet 5 なのに Opus と誤認）になるため、**通知制（Claude が着手前に「Opus 推奨、`/model opus` で」と提案 → user 手動切替）** として明記。

## ✅ 変更・commit・push (ground-truth 確認済)

- 対象: [`CLAUDE.md`](CLAUDE.md) 「コスト効率運用」節 / [`.claude/skills/multi-review/SKILL.md`](.claude/skills/multi-review/SKILL.md) model 配分記述
- commit: `50f0fc8` (`docs(claude-md): main session を Sonnet 5 既定へ変更、Opus 4.8 は sub-agent escalation で自動化`)
- push 先: `claude/pane3-phase-c-handover-lf2tfc`
- 検証: `git rev-parse HEAD` と `git ls-remote --heads origin <branch>` が一致 (`50f0fc8...`) — hook 発火を信用せず ground-truth で裏取り済。

### 新運用の要点（次セッション以降が従うべきルール）
- **main session 既定 = Sonnet 5** (`claude-sonnet-5`) + effort `high`。Opus 4.8 default は終了。
- **ultrathink = Sonnet 5 @ max effort**（model は上がらない）。
- **user 明示の「サブエージェントレビュー」「マルチレビュー」起動 = reviewer を自動 Opus 4.8 中心へ**。
- **`/deep-research` 等の research fan-out = 探索/fetch は Sonnet 5、adversarial verify + synthesis 段のみ Opus 4.8**。
- **design 美意識 gate / Trust Cliff 判断 / Hallucination Guard 4 層設計などの main 主判断 = 自動では上がらない**。Claude が着手前に「Opus 4.8 推奨、`/model opus` で」と proactive 通知 → user 手動切替。
- sub-agent 既定も Sonnet 4.6/4.7 → **Sonnet 5** に昇格済（Agent tool の `model: "sonnet"` 指定で解決）。

## 🟡 引き継ぎ事項（本セッション由来の残タスクなし・v313 backlog は未変化のまま繰り越し）

本セッションはコードに一切触れておらず、本セッション発の残タスクは無い。ただし v313 時点の残バックログは**未着手のまま変化なし**なので、以下にそのまま明示的に carry forward する（詳細背景は `handover_2026-07-01_v313_autopilot-mockup-guard.md` 参照）:

## 📊 残バックログ (v313 から繰り越し・本セッション未着手・推奨着手順)
1. **PR #162 レビュー + merge** (draft・dev tooling のみ・低リスク)。
2. **[gated] 監査台帳 `AUDIT_pane3_2026-07-01.md` (PR #155) の L0 #3-8/C10 訂正** — 訂正内容は main の `AUDIT_pane3-L0-fidelity_2026-07-01.md` に完全記載。**台帳変更は user gate**。#155 branch = `claude/pane3-phase-c-spec-rignjx`。
3. **Phase D**: S2-S5 の gate 判断材料は v313 参照。推奨は **S3 (SAFE候補) → S4 (#117判断) → S2 (danger) → S5 (§38・6体)**。
4. **[低優先]** 2-1 判定サマリー callout (現状維持推奨) / 微差。

## ⚠️ 触ると危険 / 検証規律 (CLAUDE.md 準拠・厳守、変更なし)
- **danger zone**: 発光系 (`.panel-card`/`.bs-panel`/`.surface-card`) / gold accent / sticky検索バー / `index.css` / `StockPriceChart.jsx`（全文取込み禁止・grep+offset）。
- **検証 = build + vitest + §38/raw-hex grep が ground-truth**（報告/LLM を証拠にしない）。
- **deploy = PR draft → user承認 → squash-merge (or `git push origin main`) → Railway auto-deploy (user gate)**。
- **`git add -A` 禁止**（対象のみ stage）/ tool-call 崩壊兆候で即停止。

## 📎 メモ（次回棚卸し候補・今回は未対応）
リポジトリ直下・`frontend/scripts/` に大量の未追跡ファイル（`docs/specs/*.md`, `docs/specs/mockups/*.html`, `frontend/scripts/snap-*.mjs`, 旧 `handover_*.md` 多数）が存在。**いずれも本セッション以前からの残置物で、本セッションでは未着手・未確認**。次回 user 判断でコミット/削除の棚卸しを検討してよい（`git status` で一覧可能）。
