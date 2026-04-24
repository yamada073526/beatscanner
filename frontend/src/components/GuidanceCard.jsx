import { useState } from 'react';
import InfoModal from './InfoModal.jsx';

// ── Guidance explanation modal ────────────────────────────────────────────────

function GuidanceInfoModal({ onClose }) {
  return (
    <InfoModal title="ガイダンス達成状況とは" onClose={onClose}>
      <div className="mb-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📌 概要</p>
        <p className="text-sm leading-relaxed text-slate-700">
          「ガイダンス」が事前のコンセンサス予想を上回ること（ガイダンス達成）は、株価の上昇を決定づける極めて重要な要素です。
        </p>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📖 ガイダンスとは何か？</p>
        <p className="text-sm leading-relaxed text-slate-700">
          ガイダンスとは、企業側（特に財務部長）が公式に示す、来期や今年度通年の「売上高」および「EPS（一株当たり利益）」の業績見通しのことです。財務部長は誰よりも自社の業績見通しについて精密な予想を立てられる立場にあり、通常、ガイダンスは「これなら達成できるだろう」という控えめな努力目標として提示されます。
        </p>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">💡 なぜガイダンス達成が重要か</p>
        <div className="space-y-3 text-sm leading-relaxed text-slate-700">
          <div>
            <p className="font-semibold text-slate-900">① アナリストの「コンセンサス予想」を動かす決定的な要因だから</p>
            <p className="mt-1">証券会社のアナリストたちが業績予想を立てる際、最も参考にするのが会社側から示されるガイダンスです。決算発表で新しいガイダンスが示されると、アナリストたちはそれを基に一斉に予想数字を変更します。ガイダンスがコンセンサス予想を上回れば（上方修正）アナリスト予想も引き上げられ、市場全体のコンセンサス予想がジワジワと上昇します。逆に下回れば、予想もすぐに下がり始めます。</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">② 予想の上方修正が「株価上昇」に直結するから</p>
            <p className="mt-1">株価はアナリストのコンセンサス予想がスルスルと上昇しているときに上がりやすく、逆に下がっているときには下がる傾向があります。ガイダンスがコンセンサスを上回って予想が上方修正されることは、「おのずと今後株価が上昇する理由を含んでいる」と考えるのが自然です。</p>
          </div>
        </div>
      </div>

      <div className="mb-3 rounded-lg bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-500">📋 まとめ</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">
          過去の「実績（直近のEPSと売上高）」がどれだけ良くても、未来の「見通し（ガイダンス）」が弱ければ、投資家は失望し株価は売られてしまいます。企業が強気な未来を示すこと（ガイダンス達成）こそが、アナリストの予想を引き上げ、株価を持続的に押し上げる最大の原動力です。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          だからこそ「EPS」「売上高」「ガイダンス」の3つすべてがコンセンサス予想を上回ることを、「良い決算」の絶対条件としています。
        </p>
      </div>
    </InfoModal>
  );
}

const GuidanceSkeleton = () => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-3 h-4 w-40 rounded bg-slate-200" style={{animation:'pulse 1.5s infinite'}} />
    <div className="mt-2 space-y-4">
      {/* EPS row */}
      <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
        <div className="h-4 w-10 rounded bg-slate-200" style={{animation:'pulse 1.5s infinite'}} />
        <div className="h-4 w-44 rounded bg-slate-200" style={{animation:'pulse 1.5s infinite'}} />
        <div className="ml-auto h-6 w-24 rounded-full bg-slate-200" style={{animation:'pulse 1.5s infinite'}} />
      </div>
      {/* Revenue row */}
      <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
        <div className="h-4 w-14 rounded bg-slate-200" style={{animation:'pulse 1.5s infinite'}} />
        <div className="h-4 w-48 rounded bg-slate-200" style={{animation:'pulse 1.5s infinite',animationDelay:'0.1s'}} />
        <div className="ml-auto h-6 w-24 rounded-full bg-slate-200" style={{animation:'pulse 1.5s infinite',animationDelay:'0.1s'}} />
      </div>
    </div>
    {/* SEC section placeholder */}
    <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
      <div className="mb-3 h-3 w-20 rounded bg-blue-200" style={{animation:'pulse 1.5s infinite'}} />
      {[140, 200, 170, 190, 155].map((w, i) => (
        <div key={i} className="mb-2.5 h-3 rounded bg-blue-100"
          style={{width:`${w}px`, animation:'pulse 1.5s infinite', animationDelay:`${i * 0.1}s`}} />
      ))}
    </div>
    <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
  </section>
);

const SecSkeleton = () => (
  <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
    <div className="mb-3 h-3 w-20 rounded bg-blue-200" style={{animation:'pulse 1.5s infinite'}} />
    {[140, 200, 170, 190, 155].map((w, i) => (
      <div key={i} className="mb-2.5 h-3 rounded bg-blue-100"
        style={{width:`${w}px`, animation:'pulse 1.5s infinite', animationDelay:`${i * 0.1}s`}} />
    ))}
    <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
  </div>
);

const VERDICT_STYLE = {
  beat:     { bg: 'bg-[#22c55e]', icon: '✅', label: '上振れ（Beat）' },
  'in-line':{ bg: 'bg-[#eab308]', icon: '🟡', label: '概ね一致（In-line）' },
  miss:     { bg: 'bg-[#ef4444]', icon: '❌', label: '下振れ（Miss）' },
};

function formatEps(v) {
  if (v === null || v === undefined) return '—';
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function formatRevenue(v) {
  if (v === null || v === undefined) return null;
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
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

function RevenueRow({ revenueActual, revenueEstimated }) {
  const formatted = formatRevenue(revenueActual);

  if (!formatted) {
    return (
      <div className="grid grid-cols-1 gap-2 border-t border-slate-100 py-3 md:grid-cols-[80px_1fr_auto] md:items-center md:gap-4">
        <div className="text-sm font-semibold text-slate-700">売上高</div>
        <div className="text-sm text-slate-500">—</div>
        <div>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
            データなし
          </span>
        </div>
      </div>
    );
  }

  if (revenueEstimated == null) {
    return (
      <div className="grid grid-cols-1 gap-2 border-t border-slate-100 py-3 md:grid-cols-[80px_1fr_auto] md:items-center md:gap-4">
        <div className="text-sm font-semibold text-slate-700">売上高</div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <div>
            <span className="text-slate-500">予想: </span>
            <span className="text-xs text-slate-400 italic">準備中</span>
          </div>
          <div>
            <span className="text-slate-500">実績: </span>
            <span className="font-medium text-slate-900">{formatted}</span>
          </div>
        </div>
        <div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
            予想比較は準備中
          </span>
        </div>
      </div>
    );
  }

  const surprisePct = ((revenueActual - revenueEstimated) / Math.abs(revenueEstimated)) * 100;
  const verdict = surprisePct >= 3 ? 'beat' : surprisePct <= -3 ? 'miss' : 'in-line';
  const style = VERDICT_STYLE[verdict];
  return (
    <div className="grid grid-cols-1 gap-2 border-t border-slate-100 py-3 md:grid-cols-[80px_1fr_auto] md:items-center md:gap-4">
      <div className="text-sm font-semibold text-slate-700">売上高</div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-slate-500">予想: </span>
          <span className="font-medium text-slate-900">{formatRevenue(revenueEstimated)}</span>
        </div>
        <div>
          <span className="text-slate-500">実績: </span>
          <span className="font-medium text-slate-900">{formatted}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white ${style.bg}`}>
          <span>{style.icon}</span>
          <span>{style.label}</span>
        </span>
        <span className="text-sm font-semibold text-slate-700">
          {(surprisePct > 0 ? '+' : '') + surprisePct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

const renderBold = (line) => {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
};

const renderGuidanceText = (text) => {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return null;
    if (/^[・•\-]/.test(line.trim())) {
      return (
        <li key={i} style={{
          marginBottom: '6px',
          lineHeight: '1.6',
          fontSize: '0.9em',
          listStyle: 'none',
          paddingLeft: '0',
          display: 'flex',
          gap: '6px'
        }}>
          <span style={{color:'var(--color-text-secondary)', flexShrink:0}}>・</span>
          <span>{renderBold(line.replace(/^[・•\-]\s*/, ''))}</span>
        </li>
      );
    }
    if (/[：:]\s*$/.test(line.trim())) {
      return (
        <p key={i} style={{ fontWeight: 'bold', marginTop: '10px', marginBottom: '4px', fontSize: '0.9em' }}>
          {renderBold(line)}
        </p>
      );
    }
    return (
      <p key={i} style={{ fontSize: '0.9em', lineHeight: '1.6' }}>
        {renderBold(line)}
      </p>
    );
  }).filter(Boolean);
};

export default function GuidanceCard({ guidance, isLoading = false, isSecLoading = false }) {
  const [showModal, setShowModal] = useState(false);
  if (isLoading && !guidance) return <GuidanceSkeleton />;

  if (!guidance) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-700">
            📊 ガイダンス達成状況
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500 hover:bg-slate-300 hover:text-slate-700"
              aria-label="ガイダンス達成状況の説明を表示"
            >
              ？
            </button>
          </h3>
          <span className="text-xs text-amber-600">
            ※ データプランの制限により取得できませんでした。
          </span>
        </div>
        {showModal && <GuidanceInfoModal onClose={() => setShowModal(false)} />}
      </section>
    );
  }

  const { fiscal_period, date, eps, revenue_actual, revenue_estimated, sec_guidance_text, sec_guidance_source } = guidance;
  const subtitle = fiscal_period || date || '直近決算';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-900">
          📊 ガイダンス達成状況（直近決算）
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500 hover:bg-slate-300 hover:text-slate-700"
            aria-label="ガイダンス達成状況の説明を表示"
          >
            ？
          </button>
        </h3>
        <span className="text-xs text-slate-500">{subtitle}</span>
      </div>
      {showModal && <GuidanceInfoModal onClose={() => setShowModal(false)} />}
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
        <RevenueRow
          revenueActual={revenue_actual}
          revenueEstimated={revenue_estimated}
        />
      </div>
      {isSecLoading && !sec_guidance_text ? (
        <SecSkeleton />
      ) : sec_guidance_text ? (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-blue-700">📄 次期見通し</span>
            {sec_guidance_source && (
              <span className="text-[10px] text-blue-400">{sec_guidance_source}</span>
            )}
          </div>
          <div className="text-sm text-slate-700 leading-relaxed">
            <div>
              <ul style={{paddingLeft:'0', margin:'0'}}>
                {renderGuidanceText(sec_guidance_text)}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
