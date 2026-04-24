import { useEffect, useRef, useState } from 'react';
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
    sections: [
      {
        label: '📌 概要',
        text: '「営業キャッシュフロー・マージン ≥ 15%」という基準は、企業の「真の稼ぐ力」や「財務の健全性」を測る上で極めて重要なチェック項目です。',
      },
      {
        label: '📐 計算方法',
        text: '営業キャッシュフロー・マージンは以下の式で求められます。',
        bullets: ['一株あたり営業キャッシュフロー（CFPS）÷ 一株あたり売上高（SPS）'],
        note: 'ここでいう「営業キャッシュフロー」とは、企業が商品やサービスを販売して得た売上高から、原材料費などの実際の支出を引き算して残った「現金収支」のことです。',
      },
      {
        label: '💡 なぜ「利益（EPS）」ではなく「営業キャッシュフロー」なのか',
        text: '**利益は会計上の操作（減価償却費の調整など）でごまかしや粉飾がしやすいのに対し、営業キャッシュフローは実際の銀行口座の現金残高の動きに基づくため、最もごまかしが効かない客観的なデータです。**帳簿上でいくら利益が出ているように見えても、実際に会社に現金が入ってきていなければ意味がありません。',
      },
      {
        label: '📊 なぜ「15%以上」という基準なのか',
        text: 'アメリカの平均的な企業の営業キャッシュフロー・マージンは概ね12〜15%程度とされています。「最低でも15%以上（理想的には15〜35%）」という基準は平均を上回る非常に達成が難しい足切り基準であり、この厳しいハードルを設けることで、最初から不健康な企業を投資対象から除外することができます。',
      },
      {
        label: '💪 15%以上をクリアする企業の強み',
        richBullets: [
          { title: 'バランスシートが綺麗になる', desc: '毎期現金がガンガン入ってくるため、無駄な借金をして資金調達をする必要がありません。自然とバランスシート（貸借対照表）が強固なものになります。' },
          { title: '不況に強く、大失敗しにくい', desc: 'このような「高利益体質」の企業は、景気後退などの厳しい経営環境下でも稼ぐ力が低下しにくく、赤字に転落する心配がほぼありません。' },
          { title: '他の指標を細かく調べなくても済むほど健全', desc: 'このマージンが高い企業は、他の細かい財務指標をいちいち確認しなくても良いほど、健康で血色の良い「美しいプロポーション」を持っていると評価できます。' },
        ],
      },
      {
        label: '📋 まとめ',
        text: '「営業CFマージンが15%以上あるか」という条件は、その企業が偽りなく現金を生み出す力を持っているかを見極める最強のリトマス試験紙です。この基準を満たし、さらに過去3年にわたってEPSやCFPSが着実に右肩上がりで成長している銘柄を選べば、個別株投資において大失敗するリスクを劇的に小さくすることができるとされています。',
      },
    ],
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

function renderBold(text) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-semibold text-slate-900">{part}</strong>
      : part
  );
}

function ConditionModal({ detail, onClose }) {
  const [atBottom, setAtBottom] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleScroll(e) {
    const el = e.currentTarget;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 10);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* fixed header */}
        <div className="px-5 pt-5 pb-3">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="閉じる"
          >
            ✕
          </button>
          <h2 className="pr-8 text-base font-bold text-slate-900">{detail.title}</h2>
        </div>

        {/* scrollable body */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="overflow-y-auto px-5"
          style={{ maxHeight: '65vh' }}
        >
          {detail.sections ? (
            detail.sections.map((s, i) => (
              <div key={i} className="mb-3">
                <p className="mb-1 text-xs font-semibold tracking-wider text-slate-400">{s.label}</p>
                {s.text && (
                  <p className="text-sm leading-relaxed text-slate-700">{renderBold(s.text)}</p>
                )}
                {s.bullets && (
                  <ul className="mt-1 space-y-0.5">
                    {s.bullets.map((b, j) => (
                      <li
                        key={j}
                        className="overflow-x-auto whitespace-nowrap rounded bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-800"
                      >
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                {s.note && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{s.note}</p>
                )}
                {s.richBullets && (
                  <ul className="mt-1 space-y-2 text-sm text-slate-700">
                    {s.richBullets.map((b, j) => (
                      <li key={j}>
                        <span className="font-semibold text-slate-900">・{b.title}</span><br />
                        {b.desc}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          ) : (
            <>
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📌 概要</p>
                <p className="text-sm leading-relaxed text-slate-700">{detail.summary}</p>
              </div>
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">💡 なぜ必要か</p>
                <p className="text-sm leading-relaxed text-slate-700">{detail.reason}</p>
              </div>
            </>
          )}
          {/* bottom padding inside scroll area */}
          <div className="h-4" />
        </div>

        {/* scroll fade */}
        {!atBottom && (
          <div
            className="pointer-events-none absolute bottom-16 left-0 right-0 h-12"
            style={{ background: 'linear-gradient(transparent, white)' }}
          />
        )}

        {/* fixed footer */}
        <div className="px-5 pb-5 pt-3">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            閉じる
          </button>
        </div>
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
