/**
 * UpgradeModal — shown when a Free user touches a locked feature.
 *
 * Props:
 *   isOpen           boolean
 *   onClose          () => void
 *   featureName      string  e.g. "AI詳細レポート"
 *   onCheckout       (plan: string) => void  — starts Stripe Checkout
 *   checkoutLoading  boolean
 *   user             Supabase user object | null
 */

import { Lock } from 'lucide-react';

const PLAN_ROWS = [
  { label: '銘柄分析（5条件）',          free: '無制限', pro: '無制限' },
  { label: '市場の声（センチメント+要約）', free: '✓',    pro: '✓'     },
  { label: '詳細分析（強気/弱気）',       free: '—',     pro: '✓'     },
  { label: 'AI詳細レポート',              free: '—',     pro: '✓'     },
  { label: 'カンファレンス要点',          free: '—',     pro: '✓'     },
  { label: 'ウォッチリスト',              free: '3銘柄', pro: '無制限' },
  { label: 'スクリーナー',               free: '—',     pro: '✓'     },
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
  earnings_8q: '過去 8Q 決算反応',
  claude_opus_report: 'AI 詳細レポート',
  insider_trades: 'Insider 取引 (Form 4 / 13F)',
  cup_handle_detection: 'カップ・ウィズ・ハンドル検出',
  technical_overlay: 'チャート テクニカル オーバーレイ',
  guidance_full: 'ガイダンス AI 要約',
  search_unlimited: '銘柄分析 無制限',
  screener_custom: 'カスタム スクリーナー',
  csv_export: 'CSV エクスポート',
  earnings_alert: '決算アラート (メール)',
  movers_top_5: 'Movers Top 5',
  news_archive_full: '過去ニュース 全期間',
  line_morning_6am: 'LINE 朝 6:00 配信',
  analyst_estimates: 'アナリスト予想',
  distribution_days: 'Distribution Days',
  sell_zone_50dma: '売りゾーン (50DMA)',
  buy_zone_pivot: '買いゾーン (Pivot)',
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Lock size={20} className="text-slate-700" aria-hidden />
            <h2 className="text-base font-semibold text-slate-900">
              この機能はProプランで使えます
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
            はProプランでご利用いただけます。
          </p>
        </div>

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
      </div>
    </div>
  );
}
