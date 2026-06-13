# SEED 2026-06-13: 決算 push MVP (北極星「管=配信」第一手・自分専用)

> これは planner への **入力 seed** (grill-me 2026-06-13 で user と確定)。planner がこれを正式 SPEC_*.md に展開する。
> 背景: 完全性台帳 (中身の第一手) が Sprint1-4 全着地 + eval PASS。次は北極星ロードマップ「信頼→中身→**管(配信)**」の管。
> ⚠️ 本 seed は tool reliability prevention P2 遵守でツール呼び出し構文を一切含まない。

## 一言
保有/WL 銘柄が決算を出したら、予想比(beat/miss) + 5条件 N/5 + 完全性台帳の取得状況 + アプリリンクを **朝 email で push** する nightly 機能。じっちゃまプロトコルの起点=決算という最高頻度の人力チェックを代替する (原則4 北極星「人力の代替」、letter の本丸=配信)。

## grill 確定事項 (5点)
1. **方向** = 管=配信の価値メカニズム。無料 (Stripe 前)。価値を先に作り PMF を測ってから有料 tier へ (feedback_cost_before_acquisition)。
2. **トリガー** = 保有 ∪ WL の **決算発表**。§38: ルール発火を**事実として通知** (買い/売り・将来予測なし)。letter の §38 鉄則「Claude が売れと言うのでなく、ユーザーが決めたルールの発火を事実通知」。
3. **チャネル** = email (cup_handle digest の Resend 基盤を再利用)。**channel 非依存設計**にして、将来 iPhone アプリの push 通知に拡張できるようにする (user 要望 2026-06-13 / project_mobile_app_goal)。
4. **同意モデル** = **大貴さん専用 MVP**。送信先を自分の user id に固定、設定 UI / consent / opt-in は後回し。spam/特商法 risk ゼロで最速 end-to-end → 価値検証後に opt-in トグル UI と一般公開。
5. **メール中身** = **minimal 高信号**。1 銘柄 = 1 ブロックで「ティッカー + 予想比 hero(beat/miss) + 5条件 N/5 + データ取得状況(漏れなし/欠落) + アプリの該当銘柄へのリンク」。EarningsFlashSummary の構造をメールに移植。決算が出た銘柄が複数なら並べる。2秒で読める。

## 未決 (SPEC/実装で詰める、推奨案あり)
- **決算発表の検出**: FMP earnings calendar × (保有 ∪ WL) ticker × 日付窓 (前回スキャン〜現在)。actual EPS が新着 = 発表とみなす。
- **保有/WL の取得**: Supabase の transactions から net holdings (net shares > 0) ∪ watchlist。cron は service_role で読む (GRANT 確認 = feedback_supabase_grant_bug)。
- **cron**: GitHub Actions (Railway native cron は停止 = feedback_railway_native_cron、CRON_SECRET 必須)。timing ~07:00 JST で overnight US after-hours 決算をカバー。
- **新規 backend endpoint**: CRON_SECRET 保護。既存 analyze / guidance(basic) / quarterly-history(sources) の集約を再利用。**@no-llm 静的テンプレ + blocklist sanitize** (EarningsFlash と同じ物理層分離、aggregator に LLM import しない)。
- **重複送信防止**: 同一決算 (ticker × fiscal_period or earnings_date) を2度送らない送信済み記録 (Supabase テーブル or 既存 digest の dedup パターン)。
- **§38 メールテンプレ**: 予想比は事実 (Beat/Miss/In-line ±3%、surpriseColor と同 dict)、5条件は判定の事実、台帳は取得状況の事実。買い/売り語ゼロ、blocklist 通過。

## 制約 (不変)
- §38 (ルール発火の事実通知のみ) / Hallucination Guard 4層を **outbound email にも適用** (frontend 画面と同じ guard を送信物にも)。
- pre-release (feedback_pre_release_priority): launch 前提を勝手に仮定しない。
- 関連 memory: project_signature_tier_10k_strategy (有料 nightly push の最終形) / news_article_distribution_roadmap / project_cup_handle_phase2 (既存 nightly+Resend 基盤) / feedback_daily_digest_structure / portfolio_account_schema / feedback_citation_required。

## gate
- 本 seed → planner が SPEC_*.md に展開 → **gate1 (user 承認)** → generator。
- blast radius 中〜大 (新 endpoint + cron + outbound email の §38 + per-user data) のため multi-review 要否を SPEC §7 で判定。
