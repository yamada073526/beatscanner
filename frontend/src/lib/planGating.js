/**
 * Plan detection + Feature gating (Pro + Premium 2 段階課金)
 *
 * Plans:
 *   - free       : 無料 (3 銘柄/日 + 基本機能のみ)
 *   - pro        : ¥980/月 (スクリーナーカスタム / CSV / アラート / Movers Top 5 全表示 / LINE 朝 6:00)
 *   - premium    : ¥1,800/月 (Pro + Insider/13F + Claude Opus 月 20 銘柄 + LINE 5:30 + Gold UI 等)
 *
 * 課金状態は subscriptions テーブルの tier カラム (free/pro/premium) で判定。
 *
 * 利用例:
 *   import { PLAN, getPlan, canUse } from './lib/planGating.js';
 *   const plan = getPlan(subscription);  // 'free' | 'pro' | 'premium'
 *   if (canUse('insider_trades', plan)) { ... }
 *   if (canUse('claude_opus_report', plan)) { ... }
 */

/** プラン enum (string literal) */
export const PLAN = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
  PREMIUM: 'premium',
});

/**
 * 機能ごとの最低必要プラン (機能ゲート)。
 * UI で「この機能は Pro/Premium で解放」を出す時の単一情報源。
 * key を絶対に変更しないこと (CSS class や URL state に紐づく可能性あり)。
 */
export const FEATURE_GATES = Object.freeze({
  // === 無料機能 (全員アクセス) ===
  search_basic:           PLAN.FREE,   // 銘柄検索 (3 銘柄/日まで)
  five_conditions:        PLAN.FREE,   // ファンダメンタル 5 条件
  movers_top_3:           PLAN.FREE,   // Movers Top 3
  news_recent_7d:         PLAN.FREE,   // 直近 7 日のニュース
  watchlist_basic:        PLAN.FREE,   // ウォッチリスト基本
  ir_links:               PLAN.FREE,   // IR リンク
  // Phase 3 Sub-3 (handover v72、 2026-05-16、 6 体合議不要): backtest 自体は LP 訴求の
  // 入口として Free 全開放を維持 (CLAUDE.md「Trust Cliff」 最重要バグカテゴリ、 LP hero に
  // 「過去 5 年 +32.56%」 を訴求しながら Premium 限定にすると即離脱)。
  // Premium 訴求は別 path: 銘柄別貢献度 / カスタム期間 / PDF / 10 年データ等。
  backtest_basic:         PLAN.FREE,   // バックテスト基本 (5y/3y/1y + 200 銘柄、 LP 訴求の数字)

  // === Pro 機能 (¥980/月) ===
  search_unlimited:       PLAN.PRO,    // 銘柄検索無制限
  screener_custom:        PLAN.PRO,    // スクリーナーカスタム条件 + 保存無制限
  csv_export:             PLAN.PRO,    // CSV エクスポート
  earnings_alert:         PLAN.PRO,    // 決算アラート (メール)
  movers_top_5:           PLAN.PRO,    // Movers Top 5 全表示
  news_archive_full:      PLAN.PRO,    // 過去ニュース全期間
  earnings_8q:            PLAN.PRO,    // 決算 8Q 履歴グラフ
  guidance_full:          PLAN.PRO,    // ガイダンス AI 要約 (簡易版から full 版へ)
  line_morning_6am:       PLAN.PRO,    // LINE 朝 6:00 配信
  analyst_estimates:      PLAN.PRO,    // アナリスト予想 (最新値)
  // v138.7 (2026-05-30、 3 体合議 verdict): 図解 (StickyDiagramAccordion) 専用 gate。
  // 旧実装は free placeholder が earnings_8q を流用していたため UpgradeModal が
  // 「過去 8Q 決算反応」 と誤表示する bug があった (user dogfood 12 巡目)。 専用 key で解消。
  ai_diagram:             PLAN.PRO,    // 図解 (5 条件・ビジネスを 2 秒で理解する AI 図解)
  // handover v82 Phase 5 (multi-review 6 体合議 verdict、 マーケ A 案):
  // 三層トリアージ「保有 × 5 条件 × Cup-Handle」 は最強訴求素材 → 最安 tier Pro に配置。
  // earnings_countdown_ring は LP 訴求素材として Free 全開放 (マーケ verdict)。
  triage_banner:          PLAN.PRO,    // 保有 × 5 条件 × Cup-Handle 三層 banner
  earnings_countdown_ring:PLAN.FREE,   // 決算カウントダウンリング (LP 訴求 hook、 全 tier 開放)
  referral_1_month:       PLAN.PRO,    // 紹介 1 ヶ月/人

  // === Premium 機能 (¥1,800/月) — 「プロ級意思決定支援」===
  insider_trades:         PLAN.PREMIUM,  // Form 4 / Insider 取引
  institutional_13f:      PLAN.PREMIUM,  // 13F 機関保有
  price_target_history:   PLAN.PREMIUM,  // アナリスト Price Target 履歴 (90 日)
  short_interest:         PLAN.PREMIUM,  // Short Interest + Days to Cover
  options_iv:             PLAN.PREMIUM,  // オプション IV / Put-Call ratio
  quant_score:            PLAN.PREMIUM,  // Quant スコア (Value/Growth/Momentum/Profitability)
  peer_compare:           PLAN.PREMIUM,  // 競合 5 社の決算同時表示
  earnings_whisper:       PLAN.PREMIUM,  // Earnings Whisper
  ten_conditions:         PLAN.PREMIUM,  // 8-10 条件拡張 (5+ROIC/FCF/OperLev)
  // Phase 3 Sub-3 (2026-05-16): 旧 `backtest: PREMIUM` (誰も canUse 呼出していなかった)
  // を `backtest_advanced` にリネームしてねじれ解消。 基本 backtest (5y/3y/1y, 200 銘柄)
  // は LP 訴求と整合する Free 全開放 (上 `backtest_basic`)、 advanced (銘柄別貢献度 /
  // カスタム期間 / PDF / 10 年データ / forex 込み実 P/L) のみ Premium 限定。
  backtest_advanced:      PLAN.PREMIUM,  // バックテスト高機能 (銘柄別貢献度 / カスタム期間 / PDF / 10y)
  sector_threshold:       PLAN.PREMIUM,  // セクター別閾値カスタム
  risk_analysis:          PLAN.PREMIUM,  // β / Sharpe / Max Drawdown
  // v138.7 (2026-05-30、 3 体合議 verdict): テクニカル系 gate キー。 従来は JudgmentDetail.jsx で
  // plan==='premium' を hardcode + FEATURE_LABEL_JP に label のみ存在し対応 gate キーが無い
  // 「孤児 label」 状態だった。 planGating を SSOT 化して解消。 Cup-Handle は自動売買 investor も
  // キャッチする強力シグナル (じっちゃま談) のため Premium 確定 (3 体合議全員一致)。
  cup_handle_detection:   PLAN.PREMIUM,  // Cup-with-Handle 検出 + Pivot カード
  buy_zone_pivot:         PLAN.PREMIUM,  // 買いゾーン (Pivot point)
  sell_zone_50dma:        PLAN.PREMIUM,  // 売りゾーン (50DMA extension)
  distribution_days:      PLAN.PREMIUM,  // Distribution Days (機関売り圧)
  technical_overlay:      PLAN.PREMIUM,  // チャート テクニカルオーバーレイ (Cup-Handle / zone)
  claude_opus_report:     PLAN.PREMIUM,  // Claude Opus 多面分析レポート (月 20 銘柄)
  ai_chat_ticker:         PLAN.PREMIUM,  // AI チャット (銘柄について質問)
  line_morning_530am:     PLAN.PREMIUM,  // LINE 朝 5:30 配信 (Pro より 30 分先行)
  gold_ui_theme:          PLAN.PREMIUM,  // Gold UI + Premium バッジ
  early_access:           PLAN.PREMIUM,  // 新機能 1 週間先行アクセス
  referral_2_months:      PLAN.PREMIUM,  // 紹介 2 ヶ月/人
  priority_support:       PLAN.PREMIUM,  // 優先サポート (Discord / 24h メール)
});

/** プラン階層 (free < pro < premium)。canUse の比較用。 */
const _PLAN_RANK = Object.freeze({
  [PLAN.FREE]: 0,
  [PLAN.PRO]: 1,
  [PLAN.PREMIUM]: 2,
});

/**
 * Subscription オブジェクトからユーザーの現在プランを判定。
 * Subscription は { tier: 'pro'|'premium', status: 'active'|... } 形式 (Supabase row)。
 *
 * @param {object|null} subscription - Supabase subscriptions テーブルの行
 * @returns {'free'|'pro'|'premium'}
 */
export function getPlan(subscription) {
  if (subscription && (subscription.status === 'active' || subscription.status === 'trialing')) {
    if (subscription.tier === PLAN.PREMIUM) return PLAN.PREMIUM;
    if (subscription.tier === PLAN.PRO) return PLAN.PRO;
  }
  return PLAN.FREE;
}

/**
 * 機能をユーザープランで使えるかチェック。
 * @param {keyof FEATURE_GATES} feature - 機能 key
 * @param {string} plan - 'free' | 'pro' | 'premium'
 * @returns {boolean}
 */
export function canUse(feature, plan) {
  const required = FEATURE_GATES[feature];
  if (required == null) {
    // 未定義機能は free 扱い (誤入力で誤ってロックしない)
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[planGating] Unknown feature:', feature);
    }
    return true;
  }
  return (_PLAN_RANK[plan] ?? 0) >= (_PLAN_RANK[required] ?? 0);
}

/**
 * 機能の必要プラン (UI で「Pro で解放」「Premium で解放」を出す時に使用)。
 * @param {keyof FEATURE_GATES} feature
 * @returns {'free'|'pro'|'premium'}
 */
export function requiredPlan(feature) {
  return FEATURE_GATES[feature] ?? PLAN.FREE;
}
