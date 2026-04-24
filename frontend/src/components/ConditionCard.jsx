import { useEffect, useState } from 'react';
import Sparkline from './Sparkline.jsx';

// ── Delta helpers ────────────────────────────────────────────────────────────

function calcDeltaPct(series) {
  const prev = series?.[1];
  const curr = series?.[2];
  if (prev == null || curr == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

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

// ── Condition detail content ─────────────────────────────────────────────────

const CONDITION_DETAILS = {
  1: {
    title: '条件1：営業CFマージン ≥ 15%',
    summary: '営業キャッシュフロー・マージンとは、「一株あたり営業キャッシュフロー（CFPS）」を「一株あたり売上高（SPS）」で割り算して求められる割合（または営業キャッシュフロー÷売上高）です。',
    reason: '15%という基準は非常に達成が難しい厳しい足切り基準であり、これをクリアできる企業は極めて健康的で血色が良く、「高利益体質」であることを意味します。このような企業は、厳しい経営環境下でも稼ぐ力が低下しにくく、毎期現金がガンガン入ってくるため無駄な借金をする必要がなく、バランスシート（貸借対照表）も綺麗になります。このマージンが高い企業は、他を細かく調べる必要がないほど「美しいプロポーション」を持っていると評価できます。',
  },
  2: {
    title: '条件2：EPS（一株あたり利益）連続増加',
    summary: '過去3年などにわたり、EPSが毎年右肩上がりで着実に増加しているかを見ます。',
    reason: 'EPSは企業の収益力を示す最もポピュラーな指標であり、利益の成長は株価上昇の強力な原動力となるからです。企業が本業でしっかり稼ぎ、利益を成長させ続けている軌跡を確認することで、将来の企業価値の向上を期待できます。ただし、会計上の利益はいろいろな調整が可能で「ごまかし」が効くため、この指標単独ではなく、後述のキャッシュフローと併せてクロスチェックすることが不可欠です。',
  },
  3: {
    title: '条件3：CFPS（一株あたり営業キャッシュフロー）連続増加',
    summary: 'EPSと同様に、一株あたり営業キャッシュフローも年々着実に増えていることが求められます。',
    reason: '営業キャッシュフローは、企業がモノやサービスを販売して実際に得た「現金収支」であり、銀行口座の残高の動きに基づくため、会計的に一番ごまかしにくい客観的なデータだからです。利益（EPS）だけでなくCFPSも右肩上がりで増えていれば、その企業は実質的に現金を稼ぎ出しており、事業拡大・債務返済・配当に回せる資金的余裕があることが裏付けられます。',
  },
  4: {
    title: '条件4：売上高 連続増加',
    summary: '企業の総収入である売上高が、過去数年にわたり毎年増加しているかを確認します。',
    reason: 'トップライン（売上高）の持続的な成長は、その企業の製品やサービスに対する需要が強く、ビジネスそのものが順調に拡大していることを示すからです。とくにグロース投資においては、売上高の成長が将来の企業価値上昇の大きなカギを握るため、着実な増収トレンドが維持されていることが不可欠です。',
  },
  5: {
    title: '条件5：CFPS > EPS（直近期）',
    summary: '直近の業績において、一株あたり営業キャッシュフロー（CFPS）が、その年の一株あたり利益（EPS）よりも必ず大きくなければいけません。',
    reason: '「粉飾決算」のリスクを見抜くためです。EPS（利益）は会計上の操作で水増しすることが可能ですが、CFPS（現金収支）は実際の入出金であるためごまかせません。EPSは出ているのにCFPSがそれより少ない逆転現象は、粉飾決算や不健全な資金繰りの危険なサインとなります。',
  },
};

// ── Modal ────────────────────────────────────────────────────────────────────

function ConditionModal({ detail, onClose }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        {/* × ボタン */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="閉じる"
        >
          ✕
        </button>

        {/* タイトル */}
        <h2 className="pr-8 text-base font-bold text-slate-900">{detail.title}</h2>

        {/* 概要 */}
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📌 概要</p>
          <p className="text-sm leading-relaxed text-slate-700">{detail.summary}</p>
        </div>

        {/* なぜ必要か */}
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">💡 なぜ必要か</p>
          <p className="text-sm leading-relaxed text-slate-700">{detail.reason}</p>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

// ── ConditionCard ─────────────────────────────────────────────────────────────

export default function ConditionCard({ index, condition, isPro = true, onUpgradeClick }) {
  const [showModal, setShowModal] = useState(false);
  const passed = condition.passed;
  const color = passed ? '#22c55e' : '#ef4444';
  const detail = CONDITION_DETAILS[index];

  return (
    <>
      <div
        className={`flex flex-col gap-3 rounded-2xl border-2 bg-white p-5 shadow-sm transition ${
          passed ? 'border-pass/40' : 'border-fail/40'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 pr-2">
            <div className="text-xs font-medium text-slate-500">条件 {index}</div>
            <div className="mt-1 flex items-center gap-1 text-sm font-semibold leading-snug text-slate-900">
              <span>{condition.name}</span>
              {detail && (
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500 hover:bg-slate-300 hover:text-slate-700"
                  aria-label={`${condition.name}の説明を表示`}
                >
                  ？
                </button>
              )}
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

      {showModal && detail && (
        <ConditionModal detail={detail} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
