---
name: prompt-cache-optimizer
description: |
  BeatScanner の Claude API cost を ephemeral prompt cache で 80-92% 削減するスキル。
  「Anthropic API のコストが高い」「prompt cache を導入したい」「cache hit ratio を上げたい」
  「LLM call の system block を整理したい」「few-shot examples を追加したい」
  「Haiku に切り替えたい」「Sentry に cache metric を出したい」と依頼された際に使用する。
  既存 `claude-api` skill の BeatScanner 固有数値 (月 $10 目標 / cache hit 80%+) を補完する SSOT。
---

# prompt-cache-optimizer スキル

## 目的

BeatScanner で Claude API を呼ぶ全 endpoint の cost を、 **system + few-shot examples + negatives を ephemeral cache** に乗せて 80-92% 削減する。

cost 試算: 1 日 100 ticker × 1 図解 = 100 call、 system 15K tok が full price なら月 $45。 cache hit 80% で **月 $4.5、 全 endpoint 合計でも月 $10 目標**。 cache 切ったら $80-100/月。

---

## いつ呼び出すか

- 新規 LLM endpoint 追加で system prompt を組む前
- 既存 endpoint の system / few-shot / negatives 構造を変更する前
- Anthropic Console の Usage tab で `cache_creation_input_tokens` が `cache_read_input_tokens` より極端に多い時
- Sentry alert で `prompt_cache_hit_ratio < 0.80` 通知が来た時
- model 切替 (Sonnet → Haiku / Opus) を検討する時
- LLM 月コストが想定 $10 を超えた時

---

## Anthropic SDK call の正しい形 (verbatim 例)

```python
resp = client.messages.create(
    model="claude-haiku-4-5-20251001",  # 図解は haiku で十分
    max_tokens=5120,
    system=[
        {"type": "text", "text": SYSTEM_PROMPT},  # cache 対象 (block 0)
        {"type": "text", "text": format_few_shot(FEW_SHOT_EXAMPLES),
         "cache_control": {"type": "ephemeral"}},  # cache 境界 1
        {"type": "text", "text": NEGATIVE_EXAMPLES,
         "cache_control": {"type": "ephemeral"}},  # cache 境界 2
    ],
    messages=[
        {"role": "user", "content": f"ticker={ticker}\ncontext={ctx}"}
        # user message は ticker ごとに変動、 cache hit しない
    ],
    tools=[VISUALIZE_TOOL_SCHEMA],
    tool_choice={"type": "tool", "name": "render_diagram"},
)
```

`cache_control: ephemeral` は 5 分 TTL。 5 分以内に同 system + few-shot で再 call すると **cache write $3.75/Mtok → cache read $0.30/Mtok** (92% off)。

---

## Cache 対象とすべきもの / すべきでないもの

### Cache すべき (全 ticker 共通の固定 content)

- **system prompt**: ロール定義 + 出力ルール + 禁止事項
- **few-shot examples**: 5-8 業種 (NVDA semiconductor / COST subscription_retail / NOW b2b_saas / JPM bank / XOM energy 等)
- **negative examples**: BAD 1-6 pattern (`prompt_negatives.py`)
- **schema 定義**: Tool use の JSON schema (固定なら inline でも OK)

### Cache すべきでない (毎回変動)

- **user message**: ticker-specific context (毎回変動)
- **会話履歴**: 通常無いが、 multi-turn なら最後の turn のみ cache 不要
- **動的 fact data**: material_facts list (毎日変動)
- **precomputed_metrics**: ticker / quarter で変動

---

## Break point 配分 (Anthropic 公式制約: 4 個まで)

```
[Block 0] instructions               (cache 境界なし、 デフォルト 5 分)
[Block 1] examples + negatives       (cache_control: ephemeral)
[Block 2] 銘柄別 KB context (Phase 5+) (cache_control: ephemeral) — 温存
[Block 3] locale / language hint     (Phase 5+) — 温存
```

handover v82 Phase 4 実装で **2/4 消費**、 残り 2 は Phase 5+ (銘柄別 KB / locale) のため温存。 軽率に消費しない。

---

## Cache hit ratio 計測 (Sentry metric)

```python
# backend/app/visualizer/api.py
resp = await client.messages.create(...)
usage = resp.usage
cache_hit_ratio = usage.cache_read_input_tokens / (
    usage.cache_read_input_tokens + usage.cache_creation_input_tokens + 1
)
sentry_sdk.set_measurement("prompt_cache_hit_ratio", cache_hit_ratio)
if cache_hit_ratio < 0.80:
    sentry_sdk.capture_message(
        f"Prompt cache hit ratio low: {cache_hit_ratio:.2%}",
        level="warning"
    )
```

### Anthropic Console での確認

`https://console.anthropic.com/` の Usage tab で `cache_read_input_tokens` / `cache_creation_input_tokens` を確認、 **hit 率 80%+ を維持**。

---

## 撤退基準 (cache hit 率 80% 切ったら)

順番に試す:

1. **few-shot を 5 → 3 件に削減** (NVDA / COST / NOW のみ残す)
2. **system prompt を簡素化** (negative examples を BAD-3 / BAD-5 / BAD-6 等違反条文系のみに絞る、 BAD-2 抽象等は削除候補)
3. **TTL 戦略の見直し**: 5 分超える呼び出し pattern (nightly batch 等) は別 cache 戦略 (1h cache + Sonnet) を検討
4. **endpoint 統合**: 関連 endpoint を 1 つに merge して system 共通化

---

## Model 選定の指針

| 用途 | Model | 理由 |
|---|---|---|
| 図解 (DiagramCard) / narration 短文 | `claude-haiku-4-5-20251001` | 速度 + cost 最小、 system block 重 (15K tok) でも cache 後 $5/月 |
| 要約 (summary-text / アナリスト視点) | `claude-sonnet-4-6-20251001` | citation tool use の精度が必要 |
| 大規模分析 / multi-step reasoning | `claude-opus-4-7` (Opus 4.7) | tool use 連鎖、 article generator 等 |

**Opus 4.7 + 1M context**: 単発 cost 高いが、 cache 効くなら 80% off で実用範囲。 ただし通常運用は Haiku / Sonnet で十分。

`claude-api` skill にも model migration patterns があるので併用。

---

## 実装すべき endpoint (Phase 4 で着地済)

| endpoint | system tokens | cache hit 想定 | 月 cost (cache 後) |
|---|---|---|---|
| `/api/visualize/{ticker}` | 15K tok | 90% (実測 60-70%) | $4.5 |
| `/api/guidance/{ticker}/basic` (narration) | 8K tok | 85% | $2.5 |
| `/api/analyst/{ticker}/narration` (Phase 3) | 10K tok | 80% | $3.0 |

**合計 月 cost 推定 $10/月** (cache 無しなら $80-100/月)。

handover v82 Phase 4 実装着地 (commit 65b7ecb + 2346bdf):
- `prompt_examples.py` (few-shot 8 件) / `prompt_negatives.py` (NEGATIVE 6 件) に物理 file 分離
- `prompt.get_system_blocks(years)` で 2 break points + `cache_control: ephemeral`
- `claude_client.py _system_param` を `system: str | list[dict] | None` に backward compat 拡張
- `/api/visualize` で `cache_creation_input_tokens` / `cache_read_input_tokens` log 出力 + hit_rate %
- Sentry metric は Phase 5+ で追加予定 (現状 log only)

---

## 落とし穴

### 1. cache 境界の置き方

- 境界 (`cache_control: ephemeral`) は **末尾 break point からの prefix が cache 対象**
- Block 0 (instructions) → Block 1 (examples + negatives `[cache]`) → Block 2 (空) → user message
- → cache 対象は Block 0 + Block 1 全て (Block 0 は境界なし、 5 分 TTL は last cache_control からの位置依存)

### 2. ephemeral 2k token 最小要件

cache 対象 prefix が 2k token 未満だと cache されない。 system + examples + negatives 合計で 2k+ 確保。 BeatScanner 現状は 6,676 token で余裕。

### 3. user message を system に入れない

「context が長いから system に」 と user message を system に移すと cache hit 0% に。 user message は **毎回変動する前提** で `messages=[...]` に置く。

### 4. tool_choice を変えると cache miss

`tool_choice={"type": "tool", "name": "X"}` を別 tool に切替えると cache miss。 同 endpoint で複数 tool 使い分けは避ける。

### 5. 再生成ループでの cost

[`feedback_citation_required.md`](memory/feedback_citation_required.md) の再生成ループ (max_retries=2) で 3 回 call が走る場合、 cache 無しなら 3x cost。 cache 有りなら 2 回目以降 92% off で許容範囲。

---

## 関連 memory / docs

- [feedback_prompt_cache_pattern.md](memory/feedback_prompt_cache_pattern.md) — SSOT (本 skill の元)
- [feedback_diagram_quality_guard.md](memory/feedback_diagram_quality_guard.md) — NEGATIVE_EXAMPLES の cache 構造
- [feedback_citation_required.md](memory/feedback_citation_required.md) — 再生成ループ cost を cache で 70% 削減
- [project_pane3_visual_explainer_redesign.md](memory/project_pane3_visual_explainer_redesign.md) — Phase 4 着地記録

## 関連 skill

- `claude-api` — Anthropic SDK general patterns / model migration
- `hallucination-guard` — NEGATIVE_EXAMPLES / 4 重防御と同居
- `summary-text` / `conference-analysis` / `visualizer` — 既存 LLM endpoint 群、 cache 適用対象
