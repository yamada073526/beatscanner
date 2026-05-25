---
name: visualizer
description: |
  決算分析結果から「図解HTML」を自動生成する機能。
  「図解を作って」「図解ボタンを追加して」「プロンプトを調整して」
  「図解の品質を改善して」などの指示で呼び出す。
---

# 図解生成スキル (Visualizer)

決算分析データ (PASS/FAIL / 指標推移 / ガイダンス / CC コール要点) を Claude API で受け取り、 ビジュアルな図解 HTML を生成して新しいタブで表示する機能の SSOT。

設計思想: 「パッと見て 2 秒でわかる」 (CLAUDE.md 5 原則 #1) — 投資家がテキストではなく図解で瞬時に把握できるようにする。

## 依存

- `backend/app/visualizer/base.html` — HTML テンプレート (Tailwind + Lucide 額縁)
- `backend/app/visualizer/prompt.py` — `SYSTEM_PROMPT` + `build_user_prompt()` + `get_system_blocks(years)` (cache 構造)
- `backend/app/visualizer/prompt_examples.py` — few-shot examples (業種別)
- `backend/app/visualizer/prompt_negatives.py` — BAD pattern + BLOCKLIST_REGEX
- `backend/app/main.py` — `POST /api/visualize/{ticker}` endpoint
- `frontend/src/api.js` — `generateVisualization()`
- `frontend/src/components/DiagramCard.jsx` — 図解表示 + sanitize 適用
- `frontend/src/lib/blocklist.js` — frontend sanitize (backend BLOCKLIST_REGEX を 1:1 mirror)
- ANTHROPIC_API_KEY
- skill `hallucination-guard` — 4 重防御の SSOT (BAD pattern / sanitize / citation / partial_failure)
- skill `prompt-cache-optimizer` — ephemeral cache 戦略 (system + few-shot + negatives)
- memory `feedback_diagram_quality_guard.md` — BAD pattern + Trust Cliff DoD SSOT
- memory `feedback_citation_required.md` — 出典 chip / 再生成ループ
- memory `feedback_llm_calc_separation.md` — 数値は Python / narration は LLM の物理層分離

## いつ呼び出すか

- 図解生成機能の prompt 調整時
- 図解の品質改善 / 新セクション追加検討時
- DiagramCard で BAD pattern (英語混在 / 数値捏造 / 断定的将来予測 等) が出た時
- 図解 UI (HTML テンプレート / Tailwind class) の変更時

新規 LLM endpoint 追加や prompt 変更時は **`hallucination-guard` skill を必ず先に呼ぶ** (4 重防御の通過必須)。

## 図解の構成

セクション数 / 名前 / 順序は `backend/app/visualizer/prompt.py` の `SYSTEM_PROMPT` および `base.html` テンプレートが SSOT (skill に固定リストを書かない、 セクション追加で stale 化するため)。

各セクションの role / data 必須項目 / 図解化方針は `prompt.py` の SYSTEM_PROMPT を参照。 改修時は memory `feedback_diagram_quality_guard.md` の BAD 1-6 と citation 必須を遵守。

## プロンプトの調整方法

1. `hallucination-guard` skill の 4 重防御を確認 (BAD pattern / sanitize 同期 / citation / partial_failure)
2. `backend/app/visualizer/prompt.py` の `SYSTEM_PROMPT` を編集
3. `prompt_examples.py` (few-shot) を追加 / 変更する場合は `prompt-cache-optimizer` skill で cache 境界が壊れていないか確認
4. `prompt_negatives.py` の BLOCKLIST_REGEX を変更したら `frontend/src/lib/blocklist.js` を **必ず同時更新** (1:1 mirror、 片方のみ変更禁止)
5. 検証: LP サンプル 5 銘柄 + 業種代表 3 銘柄 = 8 ticker で `hallucination-guard/references/dod_verify.md` の checklist 全件 PASS

## モデル / cost

具体的な model 名 / 月 cost / cache hit 目標値は `prompt-cache-optimizer` skill および `backend/app/visualizer/api.py` の実装が SSOT (skill にベタ書きしない)。 図解は narration 系のため Haiku で十分。

## テスト方法

production URL の `/api/visualize/{ticker}` を curl で叩き response の HTML を確認。 ローカル test は backend が起動している場合のみ、 本番との挙動差は cache hit ratio + BLOCKLIST 適用有無で出る。

```bash
# 本番 URL 例 (curl)
API="https://beatscanner-production.up.railway.app"
curl -s -X POST "$API/api/visualize/AAPL" \
  -H "Content-Type: application/json" \
  -d '{"analysis_data": {"ticker": "AAPL", ...}}'
```

詳細な test ticker / payload 構造は `backend/app/main.py` の endpoint 実装を参照。

## 将来の拡張ポイント (未着手)

- Surge CLI / Cloudflare Pages API で永続 URL を発行して SNS シェア
- 生成 URL をウォッチリストと紐付けて保存
- Pro 機能として図解生成を有料 tier 限定 (実装時は `funnel-cro` skill で Trust Cliff 防止 7 項目 checklist)

## 注意

- LLM 出力に数値計算を任せない (memory `feedback_llm_calc_separation.md`)、 数値は `precomputed_metrics` JSON から引用
- 出典 chip は `memory/chip_primitive_canonical.md` の `<Chip variant="source">` 経由 (自前 div 禁止)
- 「ちょっとだけ LLM に narration 生成させたい」 近道は必ず Trust Cliff バグ → `hallucination-guard` skill「『ちょっとだけ LLM』 禁止」 を遵守
