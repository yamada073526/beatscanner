---
name: prompt-cache-optimizer
description: |
  BeatScanner の Claude API cost を ephemeral prompt cache で 80-92% 削減するスキル。
  「Anthropic API のコストが高い」「prompt cache を導入したい」「cache hit ratio を上げたい」
  「LLM call の system block を整理したい」「few-shot examples を追加したい」
  「Haiku に切り替えたい」「Sentry に cache metric を出したい」と依頼された際に使用する。
  既存 `claude-api` skill の BeatScanner 固有数値 (月 cost 目標 / cache hit 80%+) を補完する SSOT。
---

# prompt-cache-optimizer スキル

## 目的

BeatScanner で Claude API を呼ぶ全 endpoint の cost を、 system + few-shot examples + negatives を **ephemeral cache** に乗せて 80-92% 削減する。

cache hit 80% 維持で月 cost 1 桁 USD を死守、 cache 切れたら 1 桁前半 → 2 桁後半 USD に膨張する想定 (具体数値は `memory/feedback_prompt_cache_pattern.md` 参照、 cost 試算は時間で変動するため skill 内に書かない)。

## 依存

- `backend/app/visualizer/prompt.py` — `get_system_blocks(years)` で `cache_control: ephemeral` 配置
- `backend/app/visualizer/prompt_examples.py` — few-shot 業種別 examples (実装 SSOT)
- `backend/app/visualizer/prompt_negatives.py` — NEGATIVE_EXAMPLES + BLOCKLIST_REGEX
- `backend/app/claude_client.py` — `_system_param` (`system: str | list[dict] | None` backward compat)
- `backend/app/visualizer/api.py` 等 — `cache_creation_input_tokens` / `cache_read_input_tokens` log 出力
- memory `feedback_prompt_cache_pattern.md` — SSOT (Anthropic SDK call verbatim + Sentry metric code + 実装 endpoint 一覧)
- skill `claude-api` — Anthropic SDK general patterns / model migration / cache 公式 docs
- skill `hallucination-guard` — NEGATIVE_EXAMPLES の cache 同居

## いつ呼び出すか

- 新規 LLM endpoint 追加で system prompt を組む前
- 既存 endpoint の system / few-shot / negatives 構造を変更する前
- Anthropic Console の Usage tab で `cache_creation_input_tokens` が `cache_read_input_tokens` より極端に多い時
- Sentry alert で `prompt_cache_hit_ratio < 0.80` 通知が来た時
- model 切替 (Sonnet → Haiku / Opus) を検討する時
- LLM 月コストが想定を超えた時

## Anthropic SDK call の正しい形

system 配列に `{type, text, cache_control: ephemeral}` を **末尾近くに 1-2 個** 配置、 user message には ticker-specific context のみを入れる。 verbatim 例 (`messages.create(...)` 全体) は `memory/feedback_prompt_cache_pattern.md` を参照。

`cache_control: ephemeral` は **5 分 TTL**。 5 分以内に同 system + few-shot で再 call すると cache write → cache read で 92% off。

## Cache 対象 / 非対象

| 対象 (固定 content) | 非対象 (毎回変動) |
|---|---|
| system prompt (ロール定義 / 出力ルール / 禁止事項) | user message (ticker-specific context) |
| few-shot examples (業種別) | 動的 fact data (`material_facts` list) |
| negative examples (`prompt_negatives.py`) | `precomputed_metrics` (ticker / quarter で変動) |
| schema 定義 (Tool use JSON schema) | 会話履歴 (multi-turn の最新 turn) |

few-shot の業種選定 (どの ticker を入れるか) は `backend/app/visualizer/prompt_examples.py` が SSOT、 skill にコピーしない (追加で stale 化するため)。

## Break point 配分 (Anthropic 公式制約: system 配列内 4 個まで)

```
[Block 0] instructions               (cache 境界なし、 デフォルト 5 分)
[Block 1] examples + negatives       (cache_control: ephemeral)
[Block 2-3] 銘柄別 KB / locale 等     (将来拡張、 温存)
```

現状は 2/4 消費、 残り 2 は銘柄別 KB / locale 拡張のため温存。 軽率に消費しない。

## Cache hit ratio 計測

backend で `resp.usage.cache_read_input_tokens / (cache_read + cache_creation + 1)` を算出し Sentry `set_measurement("prompt_cache_hit_ratio", ratio)` で送信、 80% 割れで `capture_message(level="warning")`。 verbatim 実装 code は `memory/feedback_prompt_cache_pattern.md` を参照。

Anthropic Console (`https://console.anthropic.com/` Usage tab) でも `cache_read_input_tokens` / `cache_creation_input_tokens` を直接確認可能。 **hit 率 80%+ を維持**。

## 撤退基準 (cache hit 率 80% 切ったら)

順番に試す:

1. **few-shot を 5 → 3 件に削減** (主要業種のみ残す。 削減対象 ticker は `prompt_examples.py` で議論)
2. **system prompt を簡素化** (negative examples を景表法 / 金商法系の必須違反のみに絞る)
3. **TTL 戦略の見直し**: 5 分超える呼び出し pattern (nightly batch 等) は 1h cache + Sonnet の別 cache 戦略を検討
4. **endpoint 統合**: 関連 endpoint を 1 つに merge して system 共通化

## Model 選定の指針

| 用途 | model 系統 | 理由 |
|---|---|---|
| 図解 (DiagramCard) / narration 短文 | **Haiku** | 速度 + cost 最小、 system block 重くても cache 後 安価 |
| 要約 (summary-text / アナリスト視点) | **Sonnet** | citation tool use の精度が必要 |
| 大規模分析 / multi-step reasoning | **Opus** | tool use 連鎖、 article generator 等 |

具体的な model 名 (バージョン番号付き) は `backend/app/claude_client.py` または各 endpoint の `messages.create(model=...)` が SSOT。 model migration は skill `claude-api` 参照。

## 落とし穴

### 1. cache 境界の置き方

`cache_control: ephemeral` は **末尾 break point からの prefix が cache 対象**。 Block 0 (instructions) に境界がなくても、 Block 1 に境界があれば Block 0 + Block 1 全てが cache 対象 (5 分 TTL は last cache_control からの位置依存)。

### 2. ephemeral 2k token 最小要件

cache 対象 prefix が 2k token 未満だと cache されない。 system + examples + negatives 合計で 2k+ 確保 (BeatScanner 現状 6.6k token で余裕、 数値変動は実装 file で確認)。

### 3. user message を system に入れない

「context が長いから system に」 と user message を system に移すと cache hit 0% に。 user message は **毎回変動する前提** で `messages=[...]` に置く。

### 4. tool_choice を変えると cache miss

`tool_choice={"type": "tool", "name": "X"}` を別 tool に切替えると cache miss。 同 endpoint で複数 tool 使い分けは避ける。

### 5. 再生成ループでの cost

`hallucination-guard` skill の再生成ループ (max_retries=2) で 3 回 call が走る場合、 cache 無しなら 3x cost。 cache 有りなら 2 回目以降 92% off で許容範囲。

## 関連 skill

- `claude-api` — Anthropic SDK general patterns / model migration / cache 公式 docs
- `hallucination-guard` — NEGATIVE_EXAMPLES / 4 重防御と同居
- `summary-text` / `conference-analysis` / `visualizer` — 既存 LLM endpoint 群、 cache 適用対象
