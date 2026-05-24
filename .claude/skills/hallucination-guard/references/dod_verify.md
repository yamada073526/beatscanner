# Trust Cliff DoD verify 手順

新 LLM endpoint を本番反映する前の operational checklist。 BAD pattern の網羅・違反条文・対策内容は `memory/feedback_diagram_quality_guard.md` が SSOT、 本 file はその skill 運用面 (実行 command) を補完。

## 検証 ticker

LP サンプル 5 銘柄 + 業種代表 3 銘柄 = 8 ticker で実行 (mega-cap + 業種分散):

```
mega-cap: AAPL NVDA TSLA MSFT META
業種代表: COST (consumer) NOW (b2b saas) JPM (bank)
```

## checklist

1. [ ] 上記 8 ticker で当該 endpoint を実行
2. [ ] BAD pattern 全件で 0 件 (詳細 BAD list は memory 参照)
3. [ ] citation: 全数値・固有名詞・因果文に source_url 紐付き (`memory/feedback_citation_required.md` 参照)
4. [ ] partial_failure: 1 source 失敗で全体 500 にならない (`memory/feedback_data_completeness_guard.md` 参照)
5. [ ] pre-commit hook 走行確認 (`git config core.hooksPath` が `scripts/` を指す)
6. [ ] frontend sanitize が当該 component で適用済 (useMemo 経由 sanitize 関数)

## verify command 例

`/api/visualize/{ticker}` を 8 ticker で実行、 BAD pattern を grep:

```bash
API="https://beatscanner-production.up.railway.app"
for t in AAPL NVDA TSLA MSFT META COST NOW JPM; do
  curl -s "${API}/api/visualize/${t}" | jq -c '.' > /tmp/viz_${t}.json
done

# BLOCKLIST_REGEX に該当する語を grep (確実 / 必ず / 絶対 / 世界 No.1 / 業界最強 / 圧倒 系)
# 正式な regex pattern は backend/app/visualizer/prompt_negatives.py:BLOCKLIST_REGEX が SSOT
grep -E '(確実|必ず|絶対|世界 No\.1|業界最強|圧倒)' /tmp/viz_*.json
```

## 違反検出時の挙動

- 1 件でも検出されたら **launch 延期**
- 真因が prompt 不足なら `prompt_negatives.py` の例追加
- 真因が backend 物理層なら `aggregator/` 側で数値生成に切替
- frontend sanitize で消えるが backend log に残るなら prompt 改善 priority high

## 関連

- `memory/feedback_diagram_quality_guard.md` — BAD pattern 全件 + 違反条文 + 対策の SSOT
- `memory/feedback_citation_required.md` — citation schema + 再生成ループ
- `memory/feedback_data_completeness_guard.md` — partial_failure 3 段階分岐 UI
