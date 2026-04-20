const VERDICT_STYLE = {
  Beat:     { bg: 'bg-[#22c55e]', icon: '✅', label: '上振れ（Beat）' },
  'In-line':{ bg: 'bg-[#eab308]', icon: '🟡', label: '概ね一致（In-line）' },
  Miss:     { bg: 'bg-[#ef4444]', icon: '❌', label: '下振れ（Miss）' },
};

function formatEps(v) {
  if (v === null || v === undefined) return '—';
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function formatRevenue(v) {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function formatPct(v) {
  if (v === null || v === undefined) return '';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function Row({ label, estimated, actual, surprisePct, verdict, formatter }) {
  const style = verdict ? VERDICT_STYLE[verdict] : null;
  return (
    <div className="grid grid-cols-1 gap-2 border-t border-slate-100 py-3 md:grid-cols-[80px_1fr_auto] md:items-center md:gap-4">
      <div className="text-sm font-semibold text-slate-700">{label}</div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-slate-500">予想: </span>
          <span className="font-medium text-slate-900">{formatter(estimated)}</span>
        </div>
        <div>
          <span className="text-slate-500">実績: </span>
          <span className="font-medium text-slate-900">{formatter(actual)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {style ? (
          <>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white ${style.bg}`}
            >
              <span>{style.icon}</span>
              <span>{style.label}</span>
            </span>
            <span className="text-sm font-semibold text-slate-700">
              {formatPct(surprisePct)}
            </span>
          </>
        ) : (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
            データなし
          </span>
        )}
      </div>
    </div>
  );
}

export default function GuidanceCard({ guidance }) {
  if (!guidance) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            📊 ガイダンス達成状況
          </h3>
          <span className="text-xs text-amber-600">
            ※ データプランの制限により取得できませんでした。
          </span>
        </div>
      </section>
    );
  }

  const { fiscal_period, date, eps, revenue } = guidance;
  const subtitle = fiscal_period || date || '直近決算';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          📊 ガイダンス達成状況（直近決算）
        </h3>
        <span className="text-xs text-slate-500">{subtitle}</span>
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        ※ EPS: GAAP（報告値）基準。リストラ費用・資産売却等の非経常損益を含みます。調整後EPS（Non-GAAP）との乖離にご注意ください。
      </p>
      <p className="mt-0.5 text-[10px] text-slate-400">
        ※ 判定閾値 ±3%（上振れ Beat / 概ね一致 In-line / 下振れ Miss）。業種により適切な閾値は異なります。
      </p>
      <div className="mt-2">
        <Row
          label="EPS"
          estimated={eps?.estimated}
          actual={eps?.actual}
          surprisePct={eps?.surprise_pct}
          verdict={eps?.verdict}
          formatter={formatEps}
        />
        <Row
          label="売上高"
          estimated={revenue?.estimated}
          actual={revenue?.actual}
          surprisePct={revenue?.surprise_pct}
          verdict={revenue?.verdict}
          formatter={formatRevenue}
        />
      </div>
    </section>
  );
}
