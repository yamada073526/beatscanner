import { useState } from 'react';
import { Info, Ruler, Lightbulb, ClipboardList, MessageSquare } from 'lucide-react';
import InfoModal from './InfoModal.jsx';
import { ModalDisclaimer } from './ModalSummary.jsx';
import FormulaDisplay from './FormulaDisplay.jsx';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400"><Info size={13} strokeWidth={2} aria-hidden="true" /> 概要</p>
        <p className="text-sm leading-relaxed text-slate-700">
          「株主の取り分」が薄められていないかを確認する指標です。ストックオプションや転換社債などがすべて行使されたと仮定した場合の、実質的な発行済株式の総数です。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400"><Ruler size={13} strokeWidth={2} aria-hidden="true" /> 各指標の計算式との関係</p>
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
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400"><Lightbulb size={13} strokeWidth={2} aria-hidden="true" /> なぜ重要か</p>
        <p className="text-sm leading-relaxed text-slate-700">
          たとえ会社の利益が増えていても、この株数がそれ以上に増えていれば、あなたの持ち分（<span style={{ color: 'rgb(56, 189, 248)', fontWeight: 500 }}>1株あたりの価値</span>）は相対的に小さくなってしまいます。これを「<span style={{ color: 'rgb(56, 189, 248)', fontWeight: 500 }}>株式の希薄化</span>」と呼びます。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400"><ClipboardList size={13} strokeWidth={2} aria-hidden="true" /> チェックポイント</p>
        <ul className="space-y-2 text-sm text-slate-700">
          <li>
            <span className="font-semibold text-slate-900">・理想は「横ばい」または「減少」</span><br />
            優良企業は<span style={{ color: 'rgb(56, 189, 248)', fontWeight: 500 }}>自社株買い</span>によってこの数字を減らし、1株あたりの価値を高める努力をします。Appleなどがその典型です。
          </li>
          <li>
            <span className="font-semibold text-slate-900">・「右肩上がり」は要注意</span><br />
            成長企業が社員への報酬として株を配りすぎている（株式報酬費用：SBC）場合や、資金繰りのために増資を繰り返しているサインです。
          </li>
        </ul>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><MessageSquare size={13} strokeWidth={2} aria-hidden="true" /> ポイント</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">
          利益が10%増えても株数が20%増えていれば、1株あたりの価値は目減りします。決算の数字と合わせて、ぜひこのチャートもチェックしてみてください。
        </p>
      </div>
      <ModalDisclaimer />
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
            className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[9px] font-bold transition-colors"
            style={{
              background: 'rgba(34,211,238,0.15)',
              color: 'rgb(56, 189, 248)',
              border: '1px solid rgba(34,211,238,0.4)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.30)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.15)'; }}
            aria-label="希薄化後発行済株式数の説明を表示"
          >
            ？
          </button>
        </div>
        <div className="flex flex-wrap gap-4">
          {periods.map((p) => (
            <div key={p.period} className="text-center">
              <div className="text-xs text-slate-400">FY{p.period}</div>
              <div className="text-sm font-medium tabular-nums text-slate-800">{formatShares(p.shares_diluted)}</div>
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
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400"><Info size={13} strokeWidth={2} aria-hidden="true" /> 概要</p>
        <p className="text-sm leading-relaxed text-slate-700">
          過去3期分の「売上高・EPS・CFPS」の推移を1つのグラフで確認できます。
        </p>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400"><ClipboardList size={13} strokeWidth={2} aria-hidden="true" /> 3指標をセットで見る理由</p>
        <p className="mb-2 text-sm leading-relaxed text-slate-700">この3つは単独ではなく、必ずセットで確認することが重要です。</p>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>・売上高が増加 → <strong style={{ color: 'rgb(56, 189, 248)' }}>本業の需要が拡大している証拠</strong>（成長の質）</li>
          <li>・EPSが増加 → 利益が成長している（<strong>ただし会計操作の可能性あり</strong>）</li>
          <li>・CFPSが増加 → <strong>実際の現金創出力が伸びている</strong>（ごまかしにくい）</li>
        </ul>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400"><Lightbulb size={13} strokeWidth={2} aria-hidden="true" /> チェックポイント</p>
        <p className="text-sm leading-relaxed text-slate-700">
          <strong style={{ color: 'rgb(56, 189, 248)' }}>3本の線がすべて右肩上がり</strong>であれば理想的です（トレンドの継続性）。もしEPSだけ上昇してCFPSが横ばい・下降している場合は、<strong>会計上の操作による見せかけの利益成長の可能性があるため注意が必要です。</strong>
        </p>
      </div>
      <ModalDisclaimer />
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
    <section className="panel-card rounded-2xl p-6 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="section-heading" style={{ marginBottom: 0 }}>
          過去推移（売上高 [{unit}] / EPS / CFPS）
        </h3>
        <button
          onClick={() => setShowChartModal(true)}
          className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[9px] font-bold transition-colors"
          style={{
            background: 'rgba(34,211,238,0.15)',
            color: 'rgb(56, 189, 248)',
            border: '1px solid rgba(34,211,238,0.4)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.30)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.15)'; }}
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
      {/* ── カスタム凡例（チャート上部・大型化） ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '12px',
        }}
      >
        {[
          { color: 'rgb(56, 189, 248)', label: `売上高 (${unit})` },
          { color: 'rgb(34, 197, 94)',  label: 'EPS ($)' },
          { color: 'rgb(245, 158, 11)', label: 'CFPS ($)' },
        ].map((it) => (
          <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span
              aria-hidden
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: it.color,
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontSize: '13px',
                marginLeft: '6px',
                color: 'var(--text-secondary)',
              }}
            >
              {it.label}
            </span>
          </span>
        ))}
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
            <XAxis dataKey="period" stroke="rgba(148, 163, 184, 0.7)" />
            <YAxis yAxisId="left" stroke="rgba(148, 163, 184, 0.7)" />
            <YAxis yAxisId="right" orientation="right" stroke="rgba(148, 163, 184, 0.7)" />
            <Tooltip />
            <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="rgb(56, 189, 248)" strokeWidth={2} name={`売上高 (${unit})`} />
            <Line yAxisId="right" type="monotone" dataKey="eps" stroke="rgb(34, 197, 94)" strokeWidth={2} name="EPS ($)" />
            <Line yAxisId="right" type="monotone" dataKey="cfps" stroke="rgb(245, 158, 11)" strokeWidth={2} name="CFPS ($)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SharesTrend periods={periods} />
    </section>
  );
}
