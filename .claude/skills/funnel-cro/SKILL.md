---
name: funnel-cro
description: |
  BeatScanner の CVR / ファネル / Trust Cliff 対策を一元化するスキル。
  「LP の訴求を変えたい」「CVR を上げたい」「Pro tier の lock UI を変えたい」
  「Sample Pass を改善したい」「A/B テストを設計して」「LP 訴求と実装の整合を確認して」
  「ファネル分析」「funnel CRO」と依頼された際に使用する。
  CLAUDE.md「Trust Cliff（信頼の崖）は最重要バグカテゴリ」の運用 SSOT。
---

# funnel-cro スキル

## 目的

BeatScanner の「LP → demo 分析 → 結果 → Pro 課金」 ファネル全段の CVR 最適化を、 過去 memory で確立した **Trust Cliff 防止ルール / Sample Pass / ProTeaser 設計 / 費用効果判定** に基づき機械的・体系的に判断する。

5 原則 #1 (読み手の負担) + #2 (毎日開きたく) + #4 (1 クリック削減) と直結。 ブランド世界観 (Aman/Ritz-Carlton 級) と必ず整合させる。

---

## いつ呼び出すか

- LP テキスト (Hero / CTA / 価格 / 比較表 / FAQ) を変更する前
- Pro tier / Premium lock UI の変更前
- Sample Pass (`/api/sample-pass`) の fallback policy / source / バッジ変更前
- ProTeaser variant 追加・色味変更・コピー変更前
- 新規 onboarding / signup flow 設計時
- 「無料お試し」 / 「登録不要」 / 「Pro 限定」 等の訴求文言を追加/変更する前
- A/B テスト設計時
- ¥/$ コスト発生する集客施策の判断時

Claude は proactive に「この変更は funnel-cro skill 観点で Trust Cliff の可能性があります」と呼出を提案してよい。

---

## BeatScanner ファネル定義 (SSOT)

```
LP (showLP=true)
  ├─ Hero: キャッチコピー + CTA (未ログイン時のみ)
  ├─ SampleAnalysisSection: gainers Top10 → PASS 5/5 → 4/5 → static fallback
  ├─ ProTeaser: 「市場の声」 mockup の代替、 Premium 解禁訴求
  └─ 銘柄クリック → handleLPTickerClick (demo モード対応、 runAnalyze 直接呼び禁止)
        ↓
分析実行 (3 req/IP/day rate limit)
  ├─ prefetchAll 7 endpoint (guidance/basic, chart/summary, insights, news, ir-links, price-history, analyst)
  ├─ 結果 cache: useRef(Map) 10 分 TTL
  └─ 結果表示 (workspace mode Pane 3)
        ↓
Pro 課金 (Stripe Live 2 件で実損 ¥80 経験あり、 動作確認は test mode)
  ├─ ProTeaser onUpgrade コールバック
  ├─ Cup-Handle / 通知 / 過去 backtest 等 Premium 機能
  └─ ¥2,000/月 価格帯
```

**重要 invariant**:
- LP の銘柄クリックは必ず `handleLPTickerClick` 経由 (`runAnalyze` 直接呼びは demo モード破壊)
- Hero ブロックの表示条件は `!result && !user` (`showLP` でなく `user` で判定)
- 結果 cache (useRef Map 10 分 TTL) は F5 で消える設計、 SSR 化禁止

---

## Trust Cliff 防止 7 項目 checklist (LP / Pro 文言変更時の DoD)

LP テキスト / Pro 文言 / Sample Pass / ProTeaser を変更する PR は **以下 7 項目を全て確認** してからマージ。 1 つでも違反したら CVR 30-40% 落ちる前提。

| # | 項目 | 確認方法 |
|---|---|---|
| 1 | LP 訴求と実装の完全一致 | LP に書いた文言 (「登録不要」「3 銘柄/日無料」「Pro 限定」 等) を frontend 検索し、 実装と乖離がないか目視 |
| 2 | 「登録不要」と書いて登録要求モーダルを出していないか | App.jsx の auth gate 条件を grep。 demo モード経路を実機で 3 銘柄実行 |
| 3 | 「3 銘柄/日まで無料」と書いて固定ホワイトリストになっていないか | backend `/api/analyze` rate limit 実装を確認。 IP ベース 3 req/day が標準 |
| 4 | 「Pro 限定」と書いて実装ゼロ ( = Pro tier 未実装) になっていないか | Pro tier 機能が実際に lock されているか、 課金フローが Stripe Test mode で通るか確認 |
| 5 | Sample Pass の信頼性 | PASS 5/5 が取れているか、 取れない日は 4/5 fallback か、 3/5 以下は static に戻っているか (3/5 以下 LP 表示は Trust Cliff) |
| 6 | Sample Pass の「最終更新 X 分前」表示 | 1 分毎 setInterval で再レンダー、 動的データには併記必須 (CLAUDE.md) |
| 7 | AI 生成短文を LP に出していないか | 景表法 §5 + ステマ規制 (2023.10) で「AI 生成例」 disclaimer 必須 → LP 効果半減。 ProTeaser で代替 |

---

## アンチパターン (繰り返し見つかる Trust Cliff)

過去 memory + handover で実際に発生した Trust Cliff:

1. **LP「登録不要」 + 結果画面で登録モーダル** → CVR 30-40% 落ち
2. **「Pro 限定」 訴求 + 実装ゼロ** → 最致命傷 (`project_100point_roadmap.md` Tier 1)
3. **Sample Pass を NVDA 完全 hardcode** → 「毎日同じサンプル」と再訪者に見抜かれ 信頼度 -30%
4. **Sample Pass が 3/5 以下** → LP の「PASS 例」として不適切、 static fallback に戻す
5. **AI 生成短文を「市場の声」 として LP 掲載** → ステマ規制違反、 ProTeaser 代替推奨
6. **LP 銘柄クリックを `runAnalyze` 直接呼び** → demo モード破壊、 必ず `handleLPTickerClick` 経由
7. **「上昇」 をシアン色で表現** → 投資業界の色ルール違反 (緑=上昇、 赤=下落、 シアン=ブランド色)

---

## LP テキスト変更時の手順

1. **diff 取得**: `git diff frontend/src/components/LandingPage.jsx` (or 関連 component)
2. **訴求語抽出**: 新規追加 / 変更した文言から訴求語 (「登録不要」「無料」「Pro 限定」「3 銘柄/日」「最新」「リアルタイム」 等) を列挙
3. **実装側 grep**: 訴求語に対応する実装が存在するか確認
   ```bash
   grep -rEn '無料|登録不要|3 銘柄' frontend/src/ backend/app/
   ```
4. **Trust Cliff 7 項目 checklist** 通し
5. **dogfood**: production URL で実際にその flow を 3 銘柄 click して挙動確認
6. デプロイ前に `release-check` skill (もしくは `design-system-check`) 通過

---

## Sample Pass / ProTeaser 拡張時のルール

[`feedback_sample_pass_design.md`](memory/feedback_sample_pass_design.md) が SSOT。 概要:

- `backend/app/main.py` の `/api/sample-pass`:
  - 30 分 TTL in-memory cache + `asyncio.Lock` 必須 (cold start stampede 防止)
  - 優先順: PASS 5/5 → 4/5 → static (NVDA)。 **3/5 以下は static**
  - response に `source`: `"gainers_5_5" | "gainers_4_5" | "static_fallback"` 必須
- frontend `SampleAnalysisSection`:
  - skeleton は既存 hardcode の `opacity: 0.6` (LCP 悪化防止)
  - バッジ色: 5 → 緑 / 4 → amber / それ以下 → muted
  - 「最終更新 X 分前」 chip は `formatRelativeTime(input)` 流用、 1 分毎 setInterval 再レンダー
  - 動的 ticker クリックは `handleLPTickerClick` 経由 (CLAUDE.md 必須)
- 「refresh ボタン」 は採用しない (PC 過剰、 モバイル pull-to-refresh のみ将来検討)

---

## A/B テスト設計 minimal テンプレート

BeatScanner は currently solo dev / early stage で PostHog / Plausible 未導入 ([`project_100point_roadmap.md`](memory/project_100point_roadmap.md) Tier 3)。 導入までは以下の **手動 A/B** で運用:

```markdown
### Test ID: AB-YYYYMMDD-<feature>
- **仮説**: <X を変えると Y が Z% 改善する>
- **計測指標**: <primary metric = 例: LP→分析実行 CVR / 単位 = % / 集計 = Railway logs grep>
- **対照 / 検証**: <A 案 = 現状 / B 案 = 変更後 (1 銘柄試行で見比べる、 段階的 rollout)>
- **判定基準**: <delta ≥ X%、 ≥ Y 日継続、 dogfood で違和感 0>
- **rollback 条件**: <Trust Cliff 発生時 / 5 原則違反時>
- **業界 metric 参考**: <SaaS LP→signup CVR = 2-5%、 Fintech freemium→paid = 3-6%、 BeatScanner Pro 目標 3-6%>
```

PostHog / Plausible 導入後は同テンプレートを cohort 分析で自動化する。

---

## 費用判定ルール ([feedback_cost_before_acquisition.md](memory/feedback_cost_before_acquisition.md))

¥/$ コスト発生する集客施策は **着手前に user 承認** を取る:

| 該当 (要承認) | 該当しない (dev 時間のみ、 即着手可) |
|---|---|
| 独自ドメイン (~¥2-3K/年) | List-Unsubscribe header / footer 強化 |
| BIMI / VMC (~¥150K/年) | 通知設定 UI / chip primitive 拡張 |
| 商標登録 (~¥4-20 万) | mailer.py 改善 / backtest 改善 |
| 有料 SaaS upgrade | LP 文言変更 / ProTeaser variant 追加 |
| API 上位プラン (FMP / Anthropic) | A/B テスト (手動) |

判断ロジック: 「これに ¥X 払うことで、 free → paid CVR が Y% 上がる仮説があるか」 を user と議論する。

---

## 関連 memory / docs

- [feedback_sample_pass_design.md](memory/feedback_sample_pass_design.md) — Sample Pass 4/5 fallback + ProTeaser + 30 分 cache SSOT
- [feedback_lp_nav_decision.md](memory/feedback_lp_nav_decision.md) — PC nav 撤去 + drawer 一本化 (6 体合議)
- [feedback_cost_before_acquisition.md](memory/feedback_cost_before_acquisition.md) — 費用効果判定
- [project_100point_roadmap.md](memory/project_100point_roadmap.md) — Pro tier / Tab 削減 / CVR 改善優先順位
- [feedback_brand_aspiration.md](memory/feedback_brand_aspiration.md) — Aman/Ritz-Carlton 級世界観 (CVR ≠ 安売り)
- [CLAUDE.md](../../CLAUDE.md) §「Trust Cliff（信頼の崖）は最重要バグカテゴリ」

## 関連 skill

- `multi-review` — Pro tier launch / 大規模 LP 変更時の 6 体合議
- `design-system-check` — LP 訴求 + token 整合の機械検査
- `release-check` — 本番デプロイ前のセルフレビュー (Trust Cliff も含む)
- `morning` — 朝の Sample Pass / 本番健全性確認
