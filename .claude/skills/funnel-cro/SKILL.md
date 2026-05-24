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

BeatScanner の「LP → demo 分析 → 結果 → Pro 課金」 ファネル全段の CVR 最適化判断を、 過去 memory + handover で確立した Trust Cliff 防止ルール / Sample Pass / ProTeaser 設計 / 費用効果判定に基づき機械的に行う。

CLAUDE.md 5 原則 #1 (読み手の負担) + #2 (毎日開きたく) + #4 (1 クリック削減) と直結。 ブランド世界観 (Aman/Ritz-Carlton 級) と必ず整合させる。

## 依存

- CLAUDE.md「Trust Cliff（信頼の崖）は最重要バグカテゴリ」/「投資業界の色ルール」/「プリフェッチ運用」/「動的データには『最終更新 X 分前』を併記」
- `frontend/src/components/LandingPage.jsx` / `SampleAnalysisSection*.jsx` / `ProTeaser*.jsx`
- `frontend/src/App.jsx` (`handleLPTickerClick`, prefetchAll, result cache)
- `backend/app/main.py` (`/api/analyze` rate limit, `/api/sample-pass`)
- memory: `feedback_sample_pass_design.md` / `feedback_cost_before_acquisition.md` / `feedback_lp_nav_decision.md` / `feedback_brand_aspiration.md` / `project_100point_roadmap.md`

## いつ呼び出すか

- LP テキスト (Hero / CTA / 価格 / 比較表 / FAQ) を変更する前
- Pro tier / Premium lock UI の変更前
- Sample Pass / ProTeaser の fallback policy / source / バッジ / variant 変更前
- 「無料お試し」 / 「登録不要」 / 「Pro 限定」 等の訴求文言を追加 / 変更する前
- 新規 onboarding / signup flow 設計時
- A/B テスト設計時
- ¥/$ コスト発生する集客施策の判断時

Claude は proactive に「この変更は funnel-cro skill 観点で Trust Cliff の可能性があります」 と呼出を提案してよい。

## ファネル定義

→ `references/funnel_definition.md` (ascii diagram + invariant + 数値の SSOT 一覧)

## Trust Cliff 防止 checklist

→ `references/trust_cliff_checklist.md` (DoD + アンチパターン)

## LP テキスト変更時の手順

1. `git diff frontend/src/components/LandingPage.jsx` (or 関連 component)
2. 新規 / 変更した訴求語 (「登録不要」「無料」「Pro 限定」「最新」「リアルタイム」 等) を列挙
3. 実装側 grep で対応実装の存在確認:
   ```bash
   grep -rEn '無料|登録不要|Pro 限定' frontend/src/ backend/app/
   ```
4. `references/trust_cliff_checklist.md` 通し
5. dogfood: production URL で当該 flow を 3 銘柄 click して挙動確認
6. デプロイ前に `release-check` skill (もしくは `design-system-check`) 通過

## Sample Pass / ProTeaser 拡張時のルール

設計 SSOT は `memory/feedback_sample_pass_design.md`。 主要 invariant:

- backend `/api/sample-pass` の cache policy / fallback 優先順 (5/5 → 4/5 → static) / response の `source` field
- frontend `SampleAnalysisSection` の skeleton / バッジ色 / 「最終更新 X 分前」 chip
- 動的 ticker クリックは `handleLPTickerClick` 経由 (CLAUDE.md「Trust Cliff」 必須)
- 「refresh ボタン」 は採用しない (PC 過剰)

数値 (TTL / fallback 閾値 / バッジ色) は memory 参照。 skill にコピーしない。

## A/B テスト設計 minimal テンプレート

PostHog / Plausible 未導入のため手動 A/B で運用 (`memory/project_100point_roadmap.md` Tier 3 で導入候補):

```markdown
### Test ID: AB-YYYYMMDD-<feature>
- **仮説**: <X を変えると Y が Z% 改善する>
- **計測指標**: <primary metric / 単位 / 集計方法>
- **対照 / 検証**: <A 案 = 現状 / B 案 = 変更後>
- **判定基準**: <delta ≥ X% / ≥ Y 日継続 / dogfood で違和感 0>
- **rollback 条件**: <Trust Cliff 発生 / 5 原則違反>
```

業界 metric (SaaS LP→signup CVR / Fintech freemium→paid CVR 等) は調査時点で都度 web 検索すること。 skill 内に数値を固定しない (時間で stale 化するため)。

## 費用判定ルール

¥/$ コスト発生する集客施策は着手前に user 承認を取る。 該当 / 非該当の判断基準・category 一覧は `memory/feedback_cost_before_acquisition.md` を参照。

判断ロジック: 「これに ¥X 払うことで、 free → paid CVR が Y% 上がる仮説があるか」 を user と議論。

## 関連 skill

- `multi-review` — Pro tier launch / 大規模 LP 変更時の 6 体合議
- `design-system-check` — LP 訴求 + token 整合の機械検査
- `release-check` — 本番デプロイ前のセルフレビュー (Trust Cliff も含む)
- `morning` — 朝の Sample Pass / 本番健全性確認
