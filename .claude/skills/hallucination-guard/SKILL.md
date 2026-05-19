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

Trust Cliff (CLAUDE.md 最重要バグカテゴリ) と双子の最重要ガード。 1 件の hallucination 漏れで Refinitiv 2017 年 EPS misprint 事件級の brand 信頼毀損 6-12 ヶ月コスト。

---

## いつ呼び出すか

- 新規 LLM endpoint (`/api/visualize/*`, `/api/guidance/*`, `/api/analyst/*` 等) を追加する前
- 既存 endpoint の prompt / schema / few-shot examples を変更する前
- DiagramCard / AnalystPanel / Pane 3 narration 等で BAD 1-6 pattern を疑った時
- `aggregator/*.py` に新規 source を追加する時
- frontend で LLM 出力を render する component を新規作成する時
- リリース前の Trust Cliff DoD 検査時

Claude は proactive に「この変更は hallucination-guard skill 観点で 4 重防御を確認すべき」 と呼出を提案してよい。

---

## 4 重防御 (CLAUDE.md SSOT)

LLM endpoint は 4 層全てを通すこと。 違反した瞬間 brand 訴訟リスク。

### 第 1 層: pre-commit hook (物理層)

`scripts/pre-commit-hook.sh` ([CLAUDE.md 参照](../../CLAUDE.md)):

- **Check 1**: prompt.py への LLM 数値計算指示混入を BLOCK
- **Check 3**: `backend/app/aggregator/*.py` への LLM SDK (`anthropic`, `openai`) import を BLOCK

**初回 setup**: `git config core.hooksPath scripts/` で有効化

新規 endpoint 追加時は **必ず pre-commit hook が走るか確認**。 sandbox / worktree で hook 無効化されているケース注意。

### 第 2 層: system block 内 NEGATIVE_EXAMPLES (LLM 制御)

`backend/app/visualizer/prompt_negatives.py:NEGATIVE_EXAMPLES` を **system block** に `<negative_examples><example id="BAD-X">` 形式で挿入、 `cache_control: ephemeral` で乗せる。

#### 6 BAD pattern (SSOT)

| ID | カテゴリ | 違反条文 | 例 | 対策 |
|---|---|---|---|---|
| BAD-1 | 英語混在 | UX | `"Operating Income +12%"` | 括弧併記「営業利益 (Operating Income) +12%」 |
| BAD-2 | detail 抽象 | 訴求弱 | 「業績好調」「強い」 | precomputed_metrics の数値で具体化 |
| BAD-3 | 数値捏造 | **景表法 §5** | 「世界シェア 80%」 | material_facts に無い数値は削除 |
| BAD-4 | step 不足 | UX 不足 | businessFlowSteps 2 件 | 3-5 件 (default 4 件) |
| BAD-5 | **断定的将来予測** | **金商法 §38** | 「EPS +20% 確実」 | シナリオ提示形式 (「強気シナリオでは...」) |
| BAD-6 | **最上級表現** | **景表法 §5** | 「世界 No.1」「業界最強」 | 具体数値で代替、 出典明示 |

BAD-5 / BAD-6 は handover v82 Phase 4 multi-review (金融 + Anthropic + マーケ 一致) で追加。 BAD-3 と違反条文が違うため分離。

### 第 3 層: frontend sanitize (表示直前防御)

`frontend/src/lib/blocklist.js` で backend `BLOCKLIST_REGEX` を **1:1 mirror**:

- `sanitizeText` / `sanitizeStringArray` / `sanitizeDiagramData` を export
- DiagramCard / AnalystPanel 等で `useMemo` 経由で適用
- 違反検出時に `_sanitized: true` flag + `console.warn` で log
- sanitize は **sentence 単位削除** (句点「。」 で区切り、 違反 sentence を drop) — 単語置換でなく削除で LLM 出力の自然性維持

backend prompt_negatives.py の BLOCKLIST_REGEX (8 件: 確実/必ず/絶対 + 世界 No.1/業界最強/圧倒 系) と **1:1 完全同期**。 片方変更時はもう片方を必ず追従。

### 第 4 層: sources schema + per-source data namespace

複数 source を集約する endpoint (`/api/analyst`, `/api/triage` 等) で **partial_failure を frontend が安全に partial render** する schema:

```json
{
  "sources": {"holdings": "ok", "pattern_signals": "ok", "peers": "ok"},
  "data": {
    "holdings": {"owns": true, "shares": 100} | null,
    "pattern_signals": {"state": "...", "state_label": "..."} | null,
    "peers": {"passing_count": 7} | null
  },
  "signal_quality": "high" | "medium" | "low"
}
```

#### source 4 値分類

```python
SourceStatus = Literal["ok", "empty", "timeout", "error"]
def _classify_result(name, raw) -> tuple[SourceStatus, Any]:
    if isinstance(raw, Exception):
        msg = str(raw).lower()
        if "timeout" in msg or "timed out" in msg:
            return "timeout", None
        return "error", None
    if raw is None or (isinstance(raw, list) and len(raw) == 0):
        return "empty", []
    return "ok", raw
```

#### frontend 3 段階分岐

1. **state 3 カバー外**: `Object.values(sources).every(s => s === 'empty')` → 「カバー外」 専用文言 (9984.T 等日本株 / smallcap)
2. **state 4 partial_failure**: sub-view 単位で `Number.isFinite()` チェック + 個別空表示、 panel 全体は描画継続
3. **state 5 データあり**: 全 view + signal_quality chip (公式 / 推定 / 未確認 3-tier)

#### 反パターン

- ❌ 1 source の例外で全 endpoint を 500 にする
- ❌ partial データを「データなし」 として隠す (UI は dim にして枠は残す)
- ❌ 「アナリストカバー外」 と「一時失敗」 を区別せず同じ文言で出す
- ❌ signal_quality を attach せずに「データあり」 だけで信頼性差を見せない

---

## LLM Calc Separation (絶対原則)

`aggregator/` パッケージは **数値物理層**: LLM SDK 一切 import 禁止 (pre-commit Check 3 で enforce)、 narration は別 layer (`visualizer/`) に分離。

### LLM に禁止

- 数値計算 (足し算・引き算・割り算・% 計算)
- 「前年同期比」「QoQ」 等の独自算出
- 順位付け (「最も大きい」 等)
- 数値の出典なし参照

### LLM に許可

- `precomputed_metrics` JSON からのそのまま引用
- material_facts (出典 URL 付き fact list) からの引用
- business narrative の生成 (200 字以内)
- 出典 URL を 1 つ選んで引用

### Prompt 設計 (verbatim 例)

```python
ANALYST_VIEW_SYSTEM = """
# 役割分離 (HARD CONSTRAINT)
あなたは「narration layer」 専属です。 以下は禁止です:
- 数値計算 (足し算・引き算・割り算・% 計算)
- 「前年同期比」「QoQ」 等の独自算出
- 順位付け (「最も大きい」 等)

すべての数値・比率・順位は `precomputed_metrics` JSON から **そのまま引用**してください。
"""
```

---

## Citation Required (出典必須)

LLM が生成する文章に「**数値・固有名詞・因果文**」 が含まれる場合、 必ず `source_url` を `material_context` から 1 つ紐付ける。 該当無しなら null、 confidence=low の文が **15% を超えたら破棄して再生成** (max 2 周)。

### Tool use schema (verbatim 例)

```python
{
  "summary": "...",
  "claims": [
    {"text": "売上 +12%", "source_url": "https://...10-Q", "confidence": "high"},
    {"text": "AI 需要拡大", "source_url": null, "confidence": "low"}
  ]
}
# confidence=low が claims 全体の 15% を超えた場合は regenerate=true を返す
```

### 再生成ループ (max_retries=2)

```python
async def generate_with_citation_guard(ticker, ctx, max_retries=2):
    for attempt in range(max_retries + 1):
        result = await claude.complete(
            model="claude-sonnet-4-6-20251001",
            system=[
                {"type": "text", "text": HALLUCINATION_GUARD_SYSTEM,
                 "cache_control": {"type": "ephemeral"}},
            ],
            tools=[CITATION_SCHEMA],
            tool_choice={"type": "tool", "name": "emit_summary"},
        )
        low_conf_ratio = count_low_conf(result) / len(result["claims"])
        if low_conf_ratio < 0.15:
            return result
    return fallback_template(ticker)  # 完全静的に降格
```

### UI 表示

- **出典 chip 強制**: 各数値・固有名詞の直近に `<Chip variant="source" />` ([chip_primitive_canonical.md](../../../.claude/projects/-Users-yamadadaiki-Projects-beatscanner/memory/chip_primitive_canonical.md) 準拠)
- **hover で source URL popover**: Linear changelog 流の `[1]` superscript + Pane 3 最下部に出典 list
- **confidence=low の文は表示しない**: Python 側で filter、 frontend には渡さない

---

## Trust Cliff DoD (Definition of Done)

新 LLM endpoint を **本番反映する際の必須 checklist** (1 件でも違反したら launch 延期):

1. ✅ **LP サンプル 5 銘柄** (AAPL/NVDA/TSLA/MSFT/META) で dogfood
2. ✅ **BAD-1 英語混在** = 0 件
3. ✅ **BAD-2 抽象 detail** = 0 件 (precomputed_metrics 数値で具体化)
4. ✅ **BAD-3 数値捏造** = 0 件 (material_facts に無い数値・固有名詞は排除)
5. ✅ **BAD-4 step 不足** = 0 件 (businessFlowSteps 3-5 件)
6. ✅ **BAD-5 断定的将来予測** = 0 件 (frontend sanitize で hit なし)
7. ✅ **BAD-6 最上級表現** = 0 件 (frontend sanitize で hit なし)
8. ✅ **citation**: 全数値・固有名詞・因果文に source_url 紐付き
9. ✅ **partial_failure**: 1 source 失敗で全体 500 にならない
10. ✅ **pre-commit hook 走行確認** (Check 1 + Check 3 通過)

検証コマンド (`/api/visualize/{ticker}` 例):

```bash
# 8 ticker (mega-cap 5 + 業種代表 3) で実行 + grep
for t in AAPL NVDA TSLA MSFT META COST NOW JPM; do
  curl -s "${API}/api/visualize/${t}" | jq -c '.' > /tmp/viz_${t}.json
done
# BAD pattern grep (詳細は prompt_negatives.py BLOCKLIST_REGEX)
grep -E '(確実|必ず|絶対|世界 No\.1|業界最強|圧倒)' /tmp/viz_*.json
```

---

## 新規 LLM endpoint 追加時の手順

1. **目的の確認**: narration か数値か？ narration なら visualizer/、 数値なら aggregator/ + 静的 dictionary
2. **Sources schema 設計**: 1 source なら単一 data、 2+ source なら per-source namespace 必須
3. **pre-commit hook 確認**: `git config core.hooksPath` が `scripts/` を指しているか
4. **system block 構築**:
   - Block 0: instructions (`SYSTEM_PROMPT`)
   - Block 1: examples + negatives (`prompt_examples.py` + `prompt_negatives.py`) + `cache_control: ephemeral`
5. **Tool use schema**: citation 必須なら CITATION_SCHEMA を tools に追加
6. **frontend sanitize 適用**: `sanitizeDiagramData(rawData)` を useMemo で wrap
7. **partial_failure UI**: 3 段階分岐 (カバー外 / 一時失敗 / データあり)
8. **Trust Cliff DoD 通過**: 8 ticker で BAD 1-6 違反 0 件
9. **release-check skill 実行**: design-system-check + funnel-cro + 本 skill の同時検査

---

## 「ちょっとだけ LLM に narration 生成させたい」 という近道は禁止

**必ず Trust Cliff バグを生む** (Refinitiv 2017 EPS misprint 事件で機関投資家が 6 ヶ月離れた前例)。

代替案: **静的 dictionary + sanitize layer のみで narration を出す** (Phase 5.5 condition pulse pattern の `STATE_LABEL_JP` が canonical 例)。

LLM を呼ぶか呼ばないかは **all-or-nothing**、 中間の「軽い narration だけ LLM」 は禁止。

---

## 関連 memory / docs

- [feedback_diagram_quality_guard.md](memory/feedback_diagram_quality_guard.md) — BAD 1-6 + Trust Cliff DoD SSOT
- [feedback_citation_required.md](memory/feedback_citation_required.md) — source_url 必須化 + 再生成ループ
- [feedback_data_completeness_guard.md](memory/feedback_data_completeness_guard.md) — partial_failure + per-source namespace
- [feedback_llm_calc_separation.md](memory/feedback_llm_calc_separation.md) — Python calc + LLM narration の物理層分離
- [feedback_triage_banner_pattern.md](memory/feedback_triage_banner_pattern.md) — Phase 5 per-source namespace 実装例
- [feedback_condition_pulse_pattern.md](memory/feedback_condition_pulse_pattern.md) — 静的 dictionary で narration を出す pattern
- [CLAUDE.md](../../CLAUDE.md) §「Hallucination Guard 4 重防御」

## 関連 skill

- `funnel-cro` — Trust Cliff 防止 7 項目 (LP 訴求と実装の整合)
- `prompt-cache-optimizer` — 再生成 cost を ephemeral cache で 70% off
- `claude-api` — Anthropic SDK general patterns
- `multi-review` — 大規模 LLM 機能追加時の 6 体合議
- `design-system-check` — token 違反 + 本 skill を release-check skill 内で同時走行
