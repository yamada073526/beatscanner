/**
 * PlanComparisonBanner — shown on the dashboard for Free (no-API-key) users.
 * Renders a 3-column plan table with upgrade CTAs.
 * Hidden for Pro users (hasFmpKey() === true).
 */

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '¥0',
    sub: '現在のプラン',
    highlight: false,
    cta: null,
    rows: [
      '3銘柄/日',
      '5条件 自動判定',
      '—',
      '—',
      '—',
      '—',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '¥980',
    sub: '/月',
    highlight: true,
    cta: 'Proにする',
    rows: [
      '無制限',
      '5条件 自動判定',
      'AI詳細レポート',
      'カンファレンス要点',
      'ウォッチリスト',
      'スクリーナー',
    ],
  },
  {
    key: 'premium',
    name: 'Premium',
    price: '¥1,980',
    sub: '/月',
    highlight: false,
    cta: 'Premiumにする',
    rows: [
      '無制限',
      '5条件 自動判定',
      'AI詳細レポート',
      'カンファレンス要点',
      '決算速報通知',
      '週次AIレポート',
    ],
  },
];

const ROW_LABELS = ['分析銘柄数', '判定機能', 'AIレポート', 'カンファレンス', '通知 / リスト', '追加機能'];

function PlanCard({ plan, onOpenSettings }) {
  return (
    <div
      className={`flex flex-col rounded-xl border p-4 ${
        plan.highlight
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white'
      }`}
    >
      {/* Heading */}
      <div className="mb-3">
        <p
          className={`text-xs font-semibold uppercase tracking-wider ${
            plan.highlight ? 'text-slate-300' : 'text-slate-500'
          }`}
        >
          {plan.name}
        </p>
        <div className="mt-0.5 flex items-baseline gap-0.5">
          <span
            className={`text-xl font-bold ${
              plan.highlight ? 'text-white' : 'text-slate-900'
            }`}
          >
            {plan.price}
          </span>
          <span
            className={`text-xs ${
              plan.highlight ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            {plan.sub}
          </span>
        </div>
      </div>

      {/* Feature rows */}
      <div className="flex-1 space-y-1.5">
        {plan.rows.map((val, i) => (
          <div key={i} className="flex items-start gap-1.5 text-xs">
            <span
              className={`mt-0.5 shrink-0 ${
                val === '—'
                  ? plan.highlight ? 'text-slate-600' : 'text-slate-300'
                  : 'text-green-400'
              }`}
            >
              {val === '—' ? '—' : '✓'}
            </span>
            <span
              className={`leading-snug ${
                val === '—'
                  ? plan.highlight ? 'text-slate-500' : 'text-slate-300'
                  : plan.highlight ? 'text-slate-200' : 'text-slate-600'
              }`}
            >
              {ROW_LABELS[i]}
              {val !== '—' && val !== '✓' && <span className="ml-1 text-[10px] opacity-70">({val})</span>}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-4">
        {plan.cta ? (
          <button
            onClick={() => onOpenSettings?.()}
            className={`w-full rounded-lg py-2 text-sm font-semibold transition ${
              plan.highlight
                ? 'bg-white text-slate-900 hover:bg-slate-100'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {plan.cta}
          </button>
        ) : (
          <div
            className="w-full rounded-lg border border-slate-200 py-2 text-center text-xs font-medium text-slate-400"
          >
            現在のプラン
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlanComparisonBanner({ onOpenSettings }) {
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">
          より多くの機能を使うにはプランをアップグレード
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          💡 現在、FMP APIキー（無料取得）を設定するだけでPro相当の全機能が利用できます
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.key} plan={plan} onOpenSettings={onOpenSettings} />
        ))}
      </div>
    </section>
  );
}
