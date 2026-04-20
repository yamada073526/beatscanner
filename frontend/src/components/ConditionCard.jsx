import Sparkline from './Sparkline.jsx';

// ── Delta helpers ────────────────────────────────────────────────────────────

function calcDeltaPct(series) {
  const prev = series?.[1];
  const curr = series?.[2];
  if (prev == null || curr == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

// Label shown in delta row per condition index (1-based)
const DELTA_LABELS = {
  1: 'CFマージン前回比',
  2: 'EPS前回比',
  3: 'CFPS前回比',
  4: '売上高前回比',
  5: 'CFPS-EPS差前回比',
};

function DeltaRow({ index, series, isPro, onUpgradeClick }) {
  const label = DELTA_LABELS[index];

  if (!isPro) {
    return (
      <button
        onClick={onUpgradeClick}
        className="mt-2 flex w-full items-center gap-1.5 border-t border-slate-100 pt-2 text-left text-xs text-slate-400 opacity-60 transition hover:opacity-100"
      >
        <span>🔒</span>
        <span>{label}（Pro限定）</span>
      </button>
    );
  }

  const delta = calcDeltaPct(series);
  if (delta === null) return null;

  const positive = delta > 0;
  return (
    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
      <span className="text-xs text-slate-400">{label}</span>
      <span
        className={`text-xs font-semibold tabular-nums ${
          positive ? 'text-green-600' : 'text-red-500'
        }`}
      >
        {positive ? '+' : ''}{delta.toFixed(1)}%
        <span className="ml-1 font-normal opacity-70">
          {positive ? '▲' : '▼'}
        </span>
      </span>
    </div>
  );
}

// 各条件の補足説明（ツールチップ用）
const CONDITION_TIPS = {
  1: '営業キャッシュフロー ÷ 売上高。会計処理に依存しない実質的な稼ぐ力を示す。※資本支出を差し引いたFCF（フリーCF）とは異なります。',
  2: '1株当たり純利益（年次・GAAP）の前年比成長。非経常損益（リストラ費用・資産売却等）を含むため、調整後EPSとの乖離を別途確認してください。',
  3: 'CFPS = 1株当たり営業CF（営業CF ÷ 希薄化後株式数）。前年比連続増加を確認。※FCF（営業CF−資本支出）のほうが株主にとっての真の稼ぐ力に近い場合があります。',
  4: '年次売上高の前年比成長。買収による非有機的成長を含む場合があります。有機成長率は別途アナリストレポートをご確認ください。',
  5: 'CFPS（1株当たり営業CF）> EPS（1株当たり純利益）。キャッシュ創出力が会計利益を上回ることで利益の質が高いことを示す。※CFPSは営業CF基準です。',
};

function InfoIcon({ tip }) {
  return (
    <span
      title={tip}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500 hover:bg-slate-300"
    >
      ？
    </span>
  );
}

export default function ConditionCard({ index, condition, isPro = true, onUpgradeClick }) {
  const passed = condition.passed;
  const color = passed ? '#22c55e' : '#ef4444';
  const tip = CONDITION_TIPS[index];

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border-2 bg-white p-5 shadow-sm transition ${
        passed ? 'border-pass/40' : 'border-fail/40'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 pr-2">
          <div className="text-xs font-medium text-slate-500">条件 {index}</div>
          <div className="mt-1 flex items-center text-sm font-semibold leading-snug text-slate-900">
            <span>{condition.name}</span>
            {tip && <InfoIcon tip={tip} />}
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold text-white ${
              passed ? 'bg-pass' : 'bg-fail'
            }`}
            aria-hidden="true"
          >
            {passed ? '✓' : '✕'}
          </div>
          <span
            className={`text-[9px] font-bold uppercase tracking-wider ${
              passed ? 'text-pass' : 'text-fail'
            }`}
            aria-label={passed ? 'PASS' : 'FAIL'}
          >
            {passed ? 'PASS' : 'FAIL'}
          </span>
        </div>
      </div>
      <div className="text-2xl font-bold tracking-tight text-slate-900">
        {condition.detail}
      </div>
      <Sparkline data={condition.series} color={color} />
      <DeltaRow
        index={index}
        series={condition.series}
        isPro={isPro}
        onUpgradeClick={onUpgradeClick}
      />
    </div>
  );
}
