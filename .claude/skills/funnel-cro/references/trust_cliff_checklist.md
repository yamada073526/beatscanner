# Trust Cliff 防止 checklist

LP テキスト / Pro 文言 / Sample Pass / ProTeaser 変更時の DoD。 全項目を確認してマージ。 1 つでも違反したら CVR 30-40% 落ちる前提 (業界 metric 由来、 一次ソース不明)。

## checklist

| # | 項目 | 確認方法 |
|---|---|---|
| 1 | LP 訴求と実装の完全一致 | LP に書いた文言 (例: 「登録不要」「3 銘柄/日無料」「Pro 限定」) を frontend 検索し、 実装と乖離がないか目視 |
| 2 | 「登録不要」と書いて登録要求モーダルを出していないか | `App.jsx` の auth gate 条件を grep。 demo モード経路を実機で 3 銘柄実行 |
| 3 | 「N 銘柄/日まで無料」と書いて固定ホワイトリストになっていないか | backend `/api/analyze` rate limit 実装を確認。 IP ベース rate limit が標準 |
| 4 | 「Pro 限定」と書いて実装ゼロ ( = Pro tier 未実装) になっていないか | Pro tier 機能が実際に lock されているか、 課金フローが Stripe Test mode で通るか確認 |
| 5 | Sample Pass の信頼性 | `memory/feedback_sample_pass_design.md` の fallback policy 通りか (PASS 5/5 → 4/5 → static、 3/5 以下は static) |
| 6 | Sample Pass の「最終更新 X 分前」表示 | 1 分毎 setInterval で再レンダー、 動的データには併記必須 (CLAUDE.md「動的データには『最終更新 X 分前』を併記」) |
| 7 | AI 生成短文を LP に出していないか | 景表法 + ステマ規制で「AI 生成例」 disclaimer 必須 → LP 効果半減。 ProTeaser で代替 (詳細 `memory/feedback_sample_pass_design.md`) |

## アンチパターン (過去 memory / handover で実発生)

過去に検出された Trust Cliff:

1. LP「登録不要」 + 結果画面で登録モーダル → CVR 30-40% 落ち
2. 「Pro 限定」 訴求 + 実装ゼロ → 最致命傷 (`memory/project_100point_roadmap.md` Tier 1)
3. Sample Pass を 1 銘柄 完全 hardcode → 「毎日同じサンプル」と再訪者に見抜かれ 信頼度 -30%
4. Sample Pass が 3/5 以下 → LP の「PASS 例」として不適切、 static fallback に戻す
5. AI 生成短文を「市場の声」 として LP 掲載 → ステマ規制違反、 ProTeaser 代替推奨
6. LP 銘柄クリックを `runAnalyze` 直接呼び → demo モード破壊、 必ず `handleLPTickerClick` 経由
7. 「上昇」 をシアン色で表現 → 投資業界の色ルール違反 (CLAUDE.md「投資業界の色ルール」)
