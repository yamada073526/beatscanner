/**
 * UpgradeModal — shown when a Free (no-API-key) user touches a locked feature.
 *
 * Props:
 *   isOpen        boolean
 *   onClose       () => void
 *   featureName   string  e.g. "AI詳細レポート"
 *   onOpenSettings () => void  — opens the API key / onboarding wizard
 */

const PLAN_ROWS = [
  { label: '分析銘柄数',  free: '3銘柄/日',   pro: '無制限',       premium: '無制限'     },
  { label: 'AI詳細レポート', free: '—',        pro: '✓',           premium: '✓'          },
  { label: 'カンファレンス要点', free: '—',    pro: '✓',           premium: '✓'          },
  { label: 'ウォッチリスト',  free: '—',       pro: '✓',           premium: '✓'          },
  { label: 'プロトコルスクリーナー', free: '—', pro: '✓',          premium: '✓'          },
  { label: '決算速報通知', free: '—',          pro: '—',           premium: '✓'          },
  { label: '週次AIレポート', free: '—',        pro: '—',           premium: '✓'          },
  { label: '優先サポート',  free: '—',         pro: '—',           premium: '✓'          },
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

export default function UpgradeModal({ isOpen, onClose, featureName, onOpenSettings }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔒</span>
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
            <span className="font-semibold text-slate-900">「{featureName}」</span>
            はFMP APIキーを設定するだけで無料でご利用いただけます。
          </p>
        </div>

        {/* Plan comparison */}
        <div className="grid grid-cols-3 gap-3 px-6 py-4">
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

          {/* Premium */}
          <PlanCol heading="Premium" price="¥1,980/月" active={false}>
            {PLAN_ROWS.map((r) => (
              <FeatureRow key={r.label} label={r.label} val={r.premium} active={false} />
            ))}
          </PlanCol>
        </div>

        {/* Notice: BYOK = Pro for now */}
        <div className="mx-6 mb-4 rounded-lg bg-blue-50 border border-blue-100 px-4 py-2.5 text-xs text-blue-700">
          💡 現在、<strong>FMP APIキー（無料取得）</strong>を設定するだけでPro相当の全機能が利用できます。
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={() => { onClose(); onOpenSettings?.(); }}
            className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            APIキーを設定してProを開始 →
          </button>
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
