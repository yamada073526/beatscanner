---
name: hallucination-guard
description: |
  BeatScanner の LLM 出力 hallucination 4 重防御を運用するスキル。
  「新しい LLM endpoint を追加したい」「LLM 出力に出典を付けたい」「景表法・金商法対応」
  「hallucination guard」「DiagramCard で BAD pattern が出る」「figure / 図解の品質を上げたい」
  「LLM に数値計算させない」「sources schema を設計したい」と依頼された際に使用する。
  CLAUDE.md「Hallucination Guard 4 重防御」の運用 SSOT。
---

# hallucination-guard スキル

## 目的

BeatScanner で Claude API を呼ぶ全 endpoint で、 景表法 §5 / 金商法 §38 / ステマ規制抵触リスクを **物理層で排除** する 4 重防御を運用する。

Trust Cliff (CLAUDE.md 最重要バグカテゴリ) と双子の最重要ガード。 1 件の hallucination 漏れで Refinitiv 2017 EPS misprint 事件級の brand 信頼毀損 6-12 ヶ月コスト。

## 依存

- CLAUDE.md「Hallucination Guard 4 重防御」
- `backend/app/visualizer/` (`prompt_negatives.py`, `prompt.py`, NEGATIVE_EXAMPLES + BLOCKLIST_REGEX の実装 SSOT)
- `backend/app/aggregator/` (LLM SDK 一切 import 禁止層)
- `frontend/src/lib/blocklist.js` (sanitize 関数群、 backend BLOCKLIST_REGEX を 1:1 mirror)
- `scripts/pre-commit-hook.sh` (Check 1 + Check 3 物理層 BLOCK)
- memory `feedback_diagram_quality_guard.md` — BAD pattern + Trust Cliff DoD SSOT
- memory `feedback_data_completeness_guard.md` — partial_failure + per-source namespace SSOT
- memory `feedback_citation_required.md` — citation schema + 再生成ループ SSOT
- memory `feedback_llm_calc_separation.md` — Python calc / LLM narration 物理層分離 SSOT

## いつ呼び出すか

- 新規 LLM endpoint (`/api/visualize/*`, `/api/guidance/*`, `/api/analyst/*` 等) を追加する前
- 既存 endpoint の prompt / schema / few-shot examples を変更する前
- DiagramCard / AnalystPanel / Pane 3 narration 等で BAD pattern を疑った時
- `aggregator/*.py` に新規 source を追加する時
- frontend で LLM 出力を render する component を新規作成する時
- リリース前の Trust Cliff DoD 検査時

Claude は proactive に「この変更は hallucination-guard skill 観点で 4 重防御を確認すべき」 と呼出を提案してよい。

## 4 重防御 overview

LLM endpoint は 4 層全てを通すこと。 違反した瞬間 brand 訴訟リスク。

### 第 1 層: pre-commit hook (物理層)

`scripts/pre-commit-hook.sh` の Check 1 + Check 3 で `prompt.py` への LLM 数値計算指示混入 / `aggregator/` への LLM SDK (`anthropic`, `openai`) import を BLOCK。 初回 setup: `git config core.hooksPath scripts/`。 sandbox / worktree で hook 無効化されているケース注意。

### 第 2 層: system block 内 NEGATIVE_EXAMPLES (LLM 制御)

`backend/app/visualizer/prompt_negatives.py:NEGATIVE_EXAMPLES` を system block に `<negative_examples><example id="BAD-X">` 形式で挿入、 `cache_control: ephemeral` で乗せる。

BAD pattern の全件・カテゴリ・違反条文・対策・実装場所は **`memory/feedback_diagram_quality_guard.md` が SSOT** (skill に複製しない、 BAD 追加で stale 化するため)。

### 第 3 層: frontend sanitize (表示直前防御)

`frontend/src/lib/blocklist.js` で backend `BLOCKLIST_REGEX` を 1:1 mirror、 `sanitizeText / sanitizeStringArray / sanitizeDiagramData` を export。 適用 component と sanitize 対象フィールドは memory が SSOT。 sanitize は **sentence 単位削除** (句点「。」 で区切り、 違反 sentence を drop) — 単語置換でなく削除で LLM 出力の自然性維持。

backend `prompt_negatives.py:BLOCKLIST_REGEX` を変更したら frontend `blocklist.js` も必ず追従 (両方変更必須、 片方のみ変更は禁止)。

### 第 4 層: sources schema + per-source data namespace

複数 source を集約する endpoint (`/api/analyst`, `/api/triage` 等) で **partial_failure を frontend が安全に partial render** する schema。

sources 4 値分類 (`ok | empty | timeout | error`) + per-source data namespace + frontend 3 段階分岐 UI (カバー外 / 一時失敗 / データあり) は **`memory/feedback_data_completeness_guard.md` が SSOT**。

## LLM Calc Separation (絶対原則)

`aggregator/` パッケージは **数値物理層**: LLM SDK 一切 import 禁止 (pre-commit Check 3 で enforce)、 narration は別 layer (`visualizer/`) に分離。

LLM 禁止項目 (数値計算 / 順位付け / 独自算出) / LLM 許可項目 (`precomputed_metrics` 引用 / business narrative 生成) / Prompt 設計の HARD CONSTRAINT block は **`memory/feedback_llm_calc_separation.md` が SSOT**。

## Citation Required (出典必須)

LLM が生成する文章に **数値・固有名詞・因果文** が含まれる場合、 必ず `source_url` を `material_context` から 1 つ紐付ける。 該当無しなら null、 `confidence=low` の文が 15% を超えたら破棄して再生成 (max 2 周)。

tool use schema / 再生成ループ実装 / UI 表示方針 (出典 chip 強制 / hover popover) は **`memory/feedback_citation_required.md` が SSOT**。

## Trust Cliff DoD (本番反映前の必須 gate)

新 LLM endpoint を本番反映する際の operational checklist と verify command は `references/dod_verify.md` を参照 (LP サンプル 5 銘柄 + 業種代表 3 銘柄 = 8 ticker で BAD pattern 全件 0 件確認まで launch 延期)。

BAD pattern の網羅 / 違反条文 / 対策内容は `memory/feedback_diagram_quality_guard.md` が SSOT。

## 新規 LLM endpoint 追加時の手順

1. **目的の確認**: narration か数値か？ narration なら `visualizer/`、 数値なら `aggregator/` + 静的 dictionary
2. **sources schema 設計**: 1 source なら単一 data、 2+ source なら per-source namespace 必須
3. **pre-commit hook 確認**: `git config core.hooksPath` が `scripts/` を指しているか
4. **system block 構築**: instructions + examples + negatives を `cache_control: ephemeral` で構成 (詳細は skill `prompt-cache-optimizer`)
5. **tool use schema**: citation 必須なら memory の CITATION_SCHEMA を tools に追加
6. **frontend sanitize 適用**: `sanitizeDiagramData(rawData)` を useMemo で wrap
7. **partial_failure UI**: 3 段階分岐 (カバー外 / 一時失敗 / データあり)
8. **Trust Cliff DoD 通過**: `references/dod_verify.md` の checklist 全件 PASS
9. **release-check skill 実行**: design-system-check + funnel-cro + 本 skill の同時検査

## 「ちょっとだけ LLM に narration 生成させたい」 という近道は禁止

**必ず Trust Cliff バグを生む**。 代替案: **静的 dictionary + sanitize layer のみで narration を出す** (`memory/feedback_condition_pulse_pattern.md` の `STATE_LABEL_JP` が canonical 例)。

LLM を呼ぶか呼ばないかは all-or-nothing、 中間の「軽い narration だけ LLM」 は禁止。

## 関連 skill

- `funnel-cro` — Trust Cliff 防止 checklist (LP 訴求と実装の整合)
- `prompt-cache-optimizer` — 再生成 cost を ephemeral cache で 70% off
- `claude-api` — Anthropic SDK general patterns
- `multi-review` — 大規模 LLM 機能追加時の 6 体合議
- `design-system-check` — token 違反 + 本 skill を release-check skill 内で同時走行
