import { useState } from 'react';
import InfoModal from './InfoModal.jsx';
import FormulaDisplay from './FormulaDisplay.jsx';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const REVENUE_SCALE = { JPY: [1e12, '兆円'], KRW: [1e12, '兆KRW'], CNY: [1e9, 'B CNY'], HKD: [1e9, 'B HKD'] };

function formatShares(v) {
  if (!v || v === 0) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B株`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M株`;
  return `${v.toLocaleString()}株`;
}

// ── Shares modal ──────────────────────────────────────────────────────────────

function SharesModal({ onClose }) {
  return (
    <InfoModal title="希薄化後発行済株式数（Diluted Shares Outstanding）" onClose={onClose}>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📌 概要</p>
        <p className="text-sm leading-relaxed text-slate-700">
          「株主の取り分」が薄められていないかを確認する指標です。ストックオプションや転換社債などがすべて行使されたと仮定した場合の、実質的な発行済株式の総数です。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📐 各指標の計算式との関係</p>
        <p className="text-sm leading-relaxed text-slate-700">
          この株式数は、1株あたりの業績を計算するための「分母」として使われます。
        </p>
        <div className="mt-2 space-y-2">
          <FormulaDisplay items={['EPS', '純利益', '希薄化後株式数']} operators={['=', '÷']} />
          <FormulaDisplay items={['CFPS', '営業CF', '希薄化後株式数']} operators={['=', '÷']} />
          <FormulaDisplay items={['SPS', '売上高', '希薄化後株式数']} operators={['=', '÷']} />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          これらが年々右肩上がりかどうか、CFマージン（CFPS÷SPS）が15%以上かどうかが、企業評価の基本ルールとされています。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">💡 なぜ重要か</p>
        <p className="text-sm leading-relaxed text-slate-700">
          たとえ会社の利益が増えていても、この株数がそれ以上に増えていれば、あなたの持ち分（1株あたりの価値）は相対的に小さくなってしまいます。これを「株式の希薄化」と呼びます。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📋 チェックポイント</p>
        <ul className="space-y-2 text-sm text-slate-700">
          <li>
            <span className="font-semibold text-slate-900">・理想は「横ばい」または「減少」</span><br />
            優良企業は自社株買いによってこの数字を減らし、1株あたりの価値を高める努力をします。Appleなどがその典型です。
          </li>
          <li>
            <span className="font-semibold text-slate-900">・「右肩上がり」は要注意</span><br />
            成長企業が社員への報酬として株を配りすぎている（株式報酬費用：SBC）場合や、資金繰りのために増資を繰り返しているサインです。
          </li>
        </ul>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-500">💬 ポイント</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">
          利益が10%増えても株数が20%増えていれば、1株あたりの価値は目減りします。決算の数字と合わせて、ぜひこのチャートもチェックしてみてください。
        </p>
      </div>
    </InfoModal>
  );
}

// ── SharesTrend ───────────────────────────────────────────────────────────────

function SharesTrend({ periods }) {
  const [showModal, setShowModal] = useState(false);
  if (!periods?.length) return null;
  const hasShares = periods.some((p) => p.shares_diluted > 0);
  if (!hasShares) return null;

  return (
    <>
      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">希薄化後発行済株式数の推移</span>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500 hover:bg-slate-300 hover:text-slate-700"
            aria-label="希薄化後発行済株式数の説明を表示"
          >
            ？
          </button>
        </div>
        <div className="flex flex-wrap gap-4">
          {periods.map((p) => (
            <div key={p.period} className="text-center">
              <div className="text-xs text-slate-400">FY{p.period}</div>
              <div className="text-sm font-semibold text-slate-800">{formatShares(p.shares_diluted)}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          株数減少はEPS押し上げ効果（自社株買い）を示す可能性があります。
        </p>
      </div>

      {showModal && <SharesModal onClose={() => setShowModal(false)} />}
    </>
  );
}

// ── HistoryChartModal ─────────────────────────────────────────────────────────

function HistoryChartModal({ onClose }) {
  return (
    <InfoModal title="過去推移グラフの見方" onClose={onClose}>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📌 概要</p>
        <p className="text-sm leading-relaxed text-slate-700">
          過去3期分の「売上高・EPS・CFPS」の推移を1つのグラフで確認できます。
        </p>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">📋 3指標をセットで見る理由</p>
        <p className="mb-2 text-sm leading-relaxed text-slate-700">この3つは単独ではなく、必ずセットで確認することが重要です。</p>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>・売上高が増加 → <strong>本業の需要が拡大している証拠</strong></li>
          <li>・EPSが増加 → 利益が成長している（<strong>ただし会計操作の可能性あり</strong>）</li>
          <li>・CFPSが増加 → <strong>実際の現金創出力が伸びている</strong>（ごまかしにくい）</li>
        </ul>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">💡 チェックポイント</p>
        <p className="text-sm leading-relaxed text-slate-700">
          <strong>3本の線がすべて右肩上がりであれば理想的です。</strong>もしEPSだけ上昇してCFPSが横ばい・下降している場合は、<strong>会計上の操作による見せかけの利益成長の可能性があるため注意が必要です。</strong>
        </p>
      </div>
    </InfoModal>
  );
}

// ── HistoryChart ──────────────────────────────────────────────────────────────

export default function HistoryChart({ periods, currency = 'USD' }) {
  const [showChartModal, setShowChartModal] = useState(false);
  const [scale, unit] = REVENUE_SCALE[currency] ?? [1e9, 'B$'];
  const data = periods.map((p) => ({
    period: `FY${p.period}`,
    revenue: +(p.revenue / scale).toFixed(2),
    eps: p.eps,
    cfps: p.cfps != null ? +p.cfps.toFixed(2) : null,
  }));
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">
          過去推移（売上高 [{unit}] / EPS / CFPS）
        </h3>
        <button
          onClick={() => setShowChartModal(true)}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500 hover:bg-slate-300 hover:text-slate-700"
          aria-label="過去推移グラフの見方を表示"
        >
          ？
        </button>
      </div>
      {showChartModal && <HistoryChartModal onClose={() => setShowChartModal(false)} />}
      <p className="mb-1 text-xs text-slate-400">左軸: 売上高 ({unit}) ／ 右軸: EPS・CFPS ($)</p>
      <p className="mb-3 text-[10px] text-slate-400">
        ※ CFPS = 1株あたり営業CF（営業CF ÷ 希薄化後株式数）。資本支出を差し引いたFCF（フリーCF）とは異なります。
      </p>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" stroke="#64748b" />
            <YAxis yAxisId="left" stroke="#64748b" />
            <YAxis yAxisId="right" orientation="right" stroke="#64748b" />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name={`売上高 (${unit})`} />
            <Line yAxisId="right" type="monotone" dataKey="eps" stroke="#22c55e" strokeWidth={2} name="EPS ($)" />
            <Line yAxisId="right" type="monotone" dataKey="cfps" stroke="#f59e0b" strokeWidth={2} name="CFPS ($)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SharesTrend periods={periods} />
    </section>
  );
}
