/**
 * UpgradeModal — shown when a Free user touches a locked feature.
 *
 * Props:
 *   isOpen           boolean
 *   onClose          () => void
 *   featureName      string  内部 feature key (例: "ai_diagram" / "insider_trades")
 *   onCheckout       (plan: string) => void  — starts Stripe Checkout (Pro のみ配線済)
 *   checkoutLoading  boolean
 *   user             Supabase user object | null
 *
 * v138.7 (2026-05-30、 3 体合議 verdict): tier 対応化。
 *   - 旧: ヘッダー「Proプランで使えます」 固定 + Free/Pro 2 列のみ。 Premium 機能 (insider 等) を
 *     click しても "Pro ¥980 で使えます" と誤表示 = 「Pro 課金しても解放されない」 Trust Cliff。
 *   - 新: requiredPlan(featureName) で必要 tier を判定し文言を出し分け。 Premium checkout は
 *     未配線 (Phase 2 = Premium 公開 + LP Premium 列で対応) のため、 Premium 機能は壊れた CTA を
 *     出さず「近日公開予定」 と正直に表示。 Pro 機能は従来の 7 日間無料トライアル CTA を維持。
 */

import { Lock } from 'lucide-react';
import { requiredPlan, PLAN } from '../lib/planGating.js';

const PLAN_ROWS = [
  { label: '銘柄分析（5条件）',          free: '無制限', pro: '無制限' },
  { label: '市場の声（センチメント+要約）', free: '✓',    pro: '✓'     },
  { label: '詳細分析（強気/弱気）',       free: '—',     pro: '✓'     },
  { label: '図解（2秒で理解するAI解説）', free: '—',     pro: '✓'     },
  { label: 'カンファレンス要点',          free: '—',     pro: '✓'     },
  { label: 'ウォッチリスト',              free: '3銘柄', pro: '無制限' },
  { label: 'スクリーナー',               free: '決算合格', pro: '✓'     },
];

// Premium 機能の価値訴求 (Phase 1 は近日公開、 Phase 2 で checkout 配線)。
// v138.7 Phase 1.6 (user dogfood): 「Claude Opus 多面分析レポート」 は ① 実装 (DetailReport.jsx =
// 強気材料 / 弱気材料 / 総合判断 の両論併記レポート) と乖離、 ② Claude Opus は訴求不要、 で改名。
const PREMIUM_HIGHLIGHTS = [
  'カップ・ウィズ・ハンドル検出（強力な買いシグナル）',
  '売り／買いゾーン・支持線・ピボット価格',
  'Insider 取引（Form 4）・13F 機関保有',
  'AI 詳細分析レポート（強気・弱気の両論を併記）',
];

function PlanCol({ heading, price, active, children }) {
  return (
    <div
      className={`flex flex-col rounded-xl border p-4 ${
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-700'
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wider ${active ? 'text-slate-300' : 'text-slate-500'}`}>
        {heading}
      </p>
      <p className={`mt-1 text-lg font-bold ${active ? 'text-white' : 'text-slate-900'}`}>
        {price}
      </p>
      <div className="mt-3 space-y-1.5 text-xs">{children}</div>
    </div>
  );
}

function FeatureRow({ label, val, active }) {
  const isCheck = val === '✓';
  const isDash  = val === '—';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`leading-snug ${active ? 'text-slate-300' : 'text-slate-500'}`}>{label}</span>
      <span
        className={`shrink-0 font-semibold ${
          isCheck ? 'text-green-400' : isDash ? (active ? 'text-slate-600' : 'text-slate-300') : (active ? 'text-white' : 'text-slate-700')
        }`}
      >
        {val}
      </span>
    </div>
  );
}

// v138.6 R7-N (2026-05-30): feature key (内部 identifier) を user-facing 日本語 label に変換。
// 旧: 「earnings_8q」 「claude_opus_report」 等の internal key が modal にそのまま露出 (user dogfood
// 「figure click したのに earnings_8q と出る、 直したほうが」 報告)。
// 新: dict で internal key → 日本語 label に変換、 dict 未登録 key は raw を fallback で表示。
const FEATURE_LABEL_JP = {
  ai_diagram: '図解',
  earnings_8q: '過去 8Q 決算反応',
  claude_opus_report: 'AI 詳細レポート',
  insider_trades: 'Insider 取引 (Form 4 / 13F)',
  cup_handle_detection: 'カップ・ウィズ・ハンドル検出',
  technical_overlay: 'チャート テクニカル オーバーレイ',
  buy_zone_pivot: '買いゾーン (Pivot)',
  sell_zone_50dma: '売りゾーン (50DMA)',
  distribution_days: 'Distribution Days',
  guidance_full: 'ガイダンス AI 要約',
  search_unlimited: '銘柄分析 無制限',
  screener_custom: 'カスタム スクリーナー',
  csv_export: 'CSV エクスポート',
  earnings_alert: '決算アラート (メール)',
  movers_top_5: 'Movers Top 5',
  news_archive_full: '過去ニュース 全期間',
  line_morning_6am: 'LINE 朝 6:00 配信',
  analyst_estimates: 'アナリスト予想',
  segment_revenue: 'セグメント別売上',
  capital_return: '配当 / 自社株買い',
  sec_guidance: 'SEC ガイダンス 構造化',
};

function resolveFeatureLabel(name) {
  if (!name || typeof name !== 'string') return name || '';
  return FEATURE_LABEL_JP[name] || name;
}

export default function UpgradeModal({ isOpen, onClose, featureName, onCheckout, checkoutLoading, user }) {
  if (!isOpen) return null;
  const displayName = resolveFeatureLabel(featureName);

  // v138.7: 必要 tier を判定して文言・CTA を出し分け (Trust Cliff: lock 文言 = gate 一致)。
  const requiredTier = requiredPlan(featureName);
  const isPremiumFeature = requiredTier === PLAN.PREMIUM;
  const tierLabel = isPremiumFeature ? 'Premium' : 'Pro';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Lock size={20} className="text-slate-700" aria-hidden />
            <h2 className="text-base font-semibold text-slate-900">
              この機能は{tierLabel}プランで使えます
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Feature name */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">「{displayName}」</span>
            は{tierLabel}プランでご利用いただけます。
          </p>
        </div>

        {isPremiumFeature ? (
          /* ===== Premium 機能 — Phase 1 は checkout 未配線のため近日公開を正直に表示 ===== */
          <>
            <div className="px-6 py-4">
              {/* v138.7 Phase 1.6 (2026-05-30、 dark-mode skill): 旧 Tailwind の amber gradient
                  (from-amber-50 to-white) は dark mode で bg が light のまま残り text と同化して
                  読めなかった (user dogfood)。 semantic token (var(--text-*)) + 半透明 amber overlay に
                  書き換えて両モード対応 ([data-theme] 自動追従)。 amber は #f59e0b (--color-warning、 両モード共通)。 */}
              <div
                style={{
                  borderRadius: 14,
                  padding: '20px 18px',
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.14), rgba(245,158,11,0.04))',
                  border: '1px solid rgba(245,158,11,0.40)',
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Premium プラン — テクニカル分析 + 銘柄発見
                </p>
                <ul style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {PREMIUM_HIGHLIGHTS.map((h) => (
                    <li
                      key={h}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-warning)' }}>◆</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <p style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: 'var(--color-warning)' }}>
                  Premium プランは近日公開予定です。
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end border-t border-slate-100 px-6 py-4">
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                閉じる
              </button>
            </div>
          </>
        ) : (
          /* ===== Pro 機能 — 7 日間無料トライアル CTA (配線済) ===== */
          <>
            {/* Plan comparison */}
            <div className="grid grid-cols-2 gap-3 px-6 py-4">
              {/* Free */}
              <PlanCol heading="Free" price="¥0" active={false}>
                {PLAN_ROWS.map((r) => (
                  <FeatureRow key={r.label} label={r.label} val={r.free} active={false} />
                ))}
              </PlanCol>

              {/* Pro (highlighted) */}
              <PlanCol heading="Pro" price="¥980/月" active={true}>
                {PLAN_ROWS.map((r) => (
                  <FeatureRow key={r.label} label={r.label} val={r.pro} active={true} />
                ))}
              </PlanCol>
            </div>

            {/* Stripe CTAs — トライアルを最大化したデザイン */}
            {user ? (
              <div className="px-6 pb-4">
                {/* トライアル訴求バッジ + CTA */}
                <div
                  style={{
                    padding: '20px 18px',
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(34,211,238,0.12), rgba(34,211,238,0.04))',
                    border: '1px solid rgba(34,211,238,0.45)',
                    boxShadow: '0 0 16px rgba(34,211,238,0.15)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{
                    fontSize: 22, fontWeight: 800, color: '#22d3ee',
                    lineHeight: 1.2, marginBottom: 4,
                    letterSpacing: '0.02em',
                  }}>
                    🎁 7日間 完全無料
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted, #64748b)',
                    marginBottom: 14,
                  }}>
                    クレカ登録のみ・いつでも解約可
                  </div>
                  <button
                    onClick={() => { onClose(); onCheckout?.('monthly'); }}
                    disabled={checkoutLoading}
                    style={{
                      width: '100%',
                      padding: '13px',
                      borderRadius: 10,
                      background: '#22d3ee',
                      color: '#0f172a',
                      border: 'none',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: checkoutLoading ? 'not-allowed' : 'pointer',
                      opacity: checkoutLoading ? 0.6 : 1,
                      transition: 'all 0.2s',
                      boxShadow: '0 0 12px rgba(34,211,238,0.30)',
                    }}
                    onMouseEnter={(e) => { if (!checkoutLoading) e.currentTarget.style.background = '#06b6d4'; }}
                    onMouseLeave={(e) => { if (!checkoutLoading) e.currentTarget.style.background = '#22d3ee'; }}
                  >
                    {checkoutLoading ? '処理中...' : '今すぐ無料で試す →'}
                  </button>
                  <div style={{
                    fontSize: 11, color: 'var(--text-muted, #94a3b8)',
                    marginTop: 8,
                  }}>
                    その後 ¥980/月
                  </div>
                </div>

                {/* 年払いオプション（控えめ表示） */}
                <button
                  onClick={() => { onClose(); onCheckout?.('yearly'); }}
                  disabled={checkoutLoading}
                  className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
                >
                  年払いなら ¥9,800/年（¥817/月相当・約17%お得）
                </button>
              </div>
            ) : (
              <div className="mx-6 mb-4 rounded-lg bg-cyan-50 border border-cyan-100 px-4 py-2.5 text-xs text-cyan-700">
                💡 Googleアカウントでログインすると7日間無料で全機能を試せます。
              </div>
            )}

            {/* Secondary CTAs */}
            <div className="flex items-center justify-end border-t border-slate-100 px-6 py-4">
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                あとで
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
