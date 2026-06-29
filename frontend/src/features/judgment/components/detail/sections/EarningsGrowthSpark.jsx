/**
 * EarningsGrowthSpark — v6 IA 再構成: 8Q 成長トレンド bar spark
 *
 * @no-llm: 静的テンプレート整形専用。LLM API 呼び出し禁止。
 *
 * mockup §L2 / pane3-full-v4 §WS2 準拠:
 *   - EPS 成長率 YoY / 売上 成長率 YoY を横並び 2 カラムの bar spark で表示
 *   - 全 8 値併記（各バー上に %値）
 *   - 直近 Q を強調（色つきバー）
 *   - 加速 / 横ばい / 減速 注記（baxis 左右）
 *   - Sprint 3: 各バー hover で四半期 tooltip（EPS/売上 の YoY + Beat/Miss 判定）。
 *     portal 方式で親 accordion の overflow:hidden を escape (QuarterlyHistoryTable InfoTip と同 idiom)。
 *
 * データ: fetchQuarterlyHistory(ticker, 8).history[].
 *   eps_yoy_pct / revenue_yoy_pct（bar 高さ）/ eps_verdict / revenue_verdict（tooltip の Beat/Miss）
 *
 * §38-safe:
 *   - 「加速 ↗」「横ばい →」「減速 ↘」は事実ベースの傾向注記（直近と8Q前の比較）
 *   - Beat/Miss は backend 計算済の過去事実（実績 vs コンセンサス）。買い/売り推奨・将来予測は出さない。
 *   - ガイダンス beat の「3点 判定」は backend per-Q guidance_verdict 待ち（Sprint 4）。本 sprint は EPS/売上 の 2 点のみ。
 *
 * Trust Cliff:
 *   - 欠損データの bar は非表示（— fallback なし。bar が少ない状態で正直に表示）
 *   - tooltip も欠損は「—」で誠実に欠落明示
 *
 * 発光系不触: bar は CSS token のみ（var(--color-gain) / var(--bg-muted)）。tooltip は inline rgba（hex 直書きなし）。
 */
import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchQuarterlyHistory } from '../../../../../api.js';

const TESTID = 'earnings-growth-spark';

const BAR_HEIGHT_MAX = 48; // px: 最大バー高さ
const BAR_HEIGHT_MIN = 4;  // px: 最小（値あり）バー高さ

// eps_verdict / revenue_verdict（"beat" | "miss" | "in-line"）→ 表示メタ。
// 投資業界色ルール: Beat=ポジティブ=緑 / Miss=ネガティブ=赤 / in-line=中立。過去事実の表示のみ（§38-safe）。
const VERDICT_META = {
  beat: { label: 'Beat', color: 'var(--color-gain)', bg: 'rgba(52, 239, 129, 0.16)' },
  miss: { label: 'Miss', color: 'var(--color-loss)', bg: 'rgba(248, 113, 113, 0.16)' },
  'in-line': { label: 'In-line', color: 'var(--text-muted)', bg: 'rgba(148, 163, 184, 0.16)' },
};
function verdictMeta(v) {
  if (v == null) return null;
  return VERDICT_META[String(v).toLowerCase()] || null;
}

// YoY% から bar 高さを計算
// 0% = min、最大値が max を占める。負は bg-muted で高さ proportional。
function calcBarHeight(pct, maxAbsVal) {
  if (!Number.isFinite(pct) || maxAbsVal <= 0) return BAR_HEIGHT_MIN;
  const ratio = Math.abs(pct) / maxAbsVal;
  return Math.max(BAR_HEIGHT_MIN, Math.round(ratio * BAR_HEIGHT_MAX));
}

// YoY% を符号付き整数 % 文字列へ（tooltip / aria 用）
function fmtYoY(pct) {
  if (!Number.isFinite(pct)) return '—';
  return `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
}

// 傾向注記（加速 / 横ばい / 減速）
// 直近3Q平均 vs 前5Q平均で判定（eventなし静的ラベル）
function trendLabel(data) {
  if (!data || data.length < 4) return null;
  const valid = data.filter(d => Number.isFinite(d));
  if (valid.length < 3) return null;
  const recent = valid.slice(0, 2);   // 直近2Q（新しい順）
  const older  = valid.slice(-3);     // 最古3Q
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg  = older.reduce((a, b) => a + b, 0) / older.length;
  const diff = recentAvg - olderAvg;
  if (diff > 3) return '加速 ↗';
  if (diff < -3) return '減速 ↘';
  return '横ばい →';
}

// バー 1 本の aria-label（四半期 + EPS/売上 の YoY + Beat/Miss）。
function buildBarAria(q) {
  const parts = [q.label || '四半期'];
  const epsV = verdictMeta(q.epsVerdict);
  const revV = verdictMeta(q.revVerdict);
  parts.push(`EPS 前年比 ${fmtYoY(q.epsYoY)}${epsV ? ` ${epsV.label}` : ''}`);
  parts.push(`売上 前年比 ${fmtYoY(q.revYoY)}${revV ? ` ${revV.label}` : ''}`);
  return parts.join('、');
}

// ------- スタイル -------
const wrapperStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--space-6, 24px)',
};

const sparkBoxStyle = {
  display: 'grid',
  gap: 8,
};

const sparkHeaderStyle = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
};

const bchartStyle = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 5,
  height: 80, // Phase2: 直近バー上の「直近」pill を収めるため 64→80（worst: pill16+gap+値9+gap+bar48）
};

const baxisStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '9.5px',
  color: 'var(--text-muted)',
  marginTop: 6,
};

const skeletonStyle = {
  height: 80, // bchartStyle.height と一致させ loading→main の CLS を防ぐ（Phase2 で 64→80 に追従）
  borderRadius: 4,
  background: 'var(--bg-muted, #243447)',
  animation: 'shimmer 1.5s infinite',
};

// -------- SparkBar: 単一の四半期バー --------
// mockup pane3-full-v4 準拠: バーは linear-gradient (上端=濃色 / 下端=半透明)。
// EPS=gain 緑グラデ / 売上=accent cyan グラデ / 悪い決算 (YoY 負)=loss 赤グラデ。過去Q は opacity で latest と区別。
const BAR_GRAD = {
  gain: 'linear-gradient(180deg, var(--color-gain), color-mix(in srgb, var(--color-gain) 45%, transparent))',
  loss: 'linear-gradient(180deg, var(--color-loss), color-mix(in srgb, var(--color-loss) 40%, transparent))',
  rev: 'linear-gradient(180deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 40%, transparent))',
};
function SparkBar({ pct, isLatest, maxAbsVal, quarter, metricType = 'eps', onHover, onLeave }) {
  const h = calcBarHeight(pct, maxAbsVal);
  const isPositive = Number.isFinite(pct) && pct >= 0;
  const barColor = !isPositive ? BAR_GRAD.loss : (metricType === 'rev' ? BAR_GRAD.rev : BAR_GRAD.gain);

  // tooltip は四半期に EPS か売上のどちらかでも値があれば出す。
  // role="img" + aria-label で screen reader は browse mode で各四半期を読める (tabIndex は付けない:
  // 8Q×2 列 = 16 タブストップで detail pane の keyboard nav を阻害するため。視覚 tooltip は mouse hover のみ)。
  const interactive = !!quarter && (Number.isFinite(quarter.epsYoY) || Number.isFinite(quarter.revYoY));
  const enter = (e) => { if (interactive && onHover) onHover(quarter, e.currentTarget.getBoundingClientRect()); };

  return (
    <div
      role={interactive ? 'img' : undefined}
      aria-label={interactive ? buildBarAria(quarter) : undefined}
      onMouseEnter={enter}
      onMouseLeave={interactive ? onLeave : undefined}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 3,
        height: '100%',
        cursor: 'default',
      }}
    >
      {/* 直近バーに「直近」cyan pill（右=直近を一目化・mockup v5 .nowpill 準拠。
          §38-safe: 位置/事実ラベルのみ、買い推奨でない）。 */}
      {isLatest && (
        <span
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            lineHeight: 1.5,
            color: 'var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
            borderRadius: 'var(--radius-xs, 4px)',
            padding: '0 5px',
            whiteSpace: 'nowrap',
          }}
        >
          直近
        </span>
      )}
      {Number.isFinite(pct) && (
        <span
          style={{
            fontSize: 9,
            color: isLatest ? 'var(--color-accent)' : 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
            fontWeight: isLatest ? 700 : 400,
          }}
        >
          {pct > 0 ? '+' : ''}{pct.toFixed(0)}
        </span>
      )}
      <div
        style={{
          width: '100%',
          height: Number.isFinite(pct) ? h : BAR_HEIGHT_MIN,
          background: Number.isFinite(pct) ? barColor : 'var(--bg-subtle, #1e2a3a)',
          borderRadius: '3px 3px 0 0',
          opacity: isLatest ? 1 : 0.75,
          // 直近バー: cyan ring(1.5px) + 軽い brightness/saturate で「右=直近」を強調（mockup v5 .bcol.latest .bar）
          filter: isLatest ? 'brightness(1.2) saturate(1.25)' : undefined,
          boxShadow: isLatest ? '0 0 0 1.5px color-mix(in srgb, var(--color-accent) 55%, transparent)' : undefined,
        }}
        aria-hidden="true"
      />
    </div>
  );
}

// -------- SparkChart: EPS か売上の 8Q spark --------
// quarters は新しい順（[0] = 最新）。metricKey で epsYoY / revYoY を選択。
function SparkChart({ label, metricKey, quarters, latestVal, quarterLabels, onHover, onLeave }) {
  // 表示は古い順に reverse（直近=右で株価チャートと同方向）
  const reversed = [...quarters].reverse();

  const maxAbsVal = Math.max(
    ...quarters.map(q => q[metricKey]).filter(Number.isFinite).map(Math.abs),
    1,
  );

  const trend = trendLabel(quarters.map(q => q[metricKey]));

  return (
    <div style={sparkBoxStyle}>
      <div style={sparkHeaderStyle}>
        <span>{label}</span>
        {Number.isFinite(latestVal) && (
          <span
            style={{
              fontWeight: 700,
              color: latestVal >= 0 ? 'var(--color-gain, #34ef81)' : 'var(--color-loss, #f87171)',
            }}
          >
            直近 {latestVal > 0 ? '+' : ''}{latestVal.toFixed(0)}%
          </span>
        )}
      </div>
      <div style={bchartStyle}>
        {reversed.map((q, i) => (
          <SparkBar
            key={i}
            pct={q[metricKey]}
            isLatest={i === reversed.length - 1}
            maxAbsVal={maxAbsVal}
            quarter={q}
            metricType={metricKey === 'revYoY' ? 'rev' : 'eps'}
            onHover={onHover}
            onLeave={onLeave}
          />
        ))}
      </div>
      <div style={baxisStyle}>
        <span>{quarterLabels?.[quarterLabels.length - 1] ?? '8Q前'}</span>
        {trend && (
          <span style={{ color: trend.includes('加速') ? 'var(--color-gain, #34ef81)' : 'var(--text-muted)' }}>
            {trend}
          </span>
        )}
        <span>{quarterLabels?.[0] ?? '直近'}</span>
      </div>
    </div>
  );
}

// -------- GrowthTooltip: portal で body 直下に描画する四半期 tooltip --------
// position:fixed + viewport 座標で親 overflow/transform を escape（QuarterlyHistoryTable InfoTip 踏襲）。
// 描画後に幅を測って viewport 左右へのはみ出しを内側補正。
function TipRow({ k, yoy, verdict }) {
  const vm = verdictMeta(verdict);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        fontSize: 11,
        margin: '4px 0',
      }}
    >
      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          前年比 {fmtYoY(yoy)}
        </span>
        {vm && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 4,
              padding: '1px 7px',
              color: vm.color,
              background: vm.bg,
            }}
          >
            {vm.label}
          </span>
        )}
      </span>
    </div>
  );
}

function GrowthTooltip({ tip }) {
  const ref = useRef(null);
  const { quarter, x, y } = tip;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const m = 8;
    let dx = 0;
    if (r.right > window.innerWidth - m) dx = (window.innerWidth - m) - r.right;
    if (r.left + dx < m) dx = m - r.left;
    if (dx !== 0) el.style.left = `${x + dx}px`;
  }, [x, y]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        transform: 'translate(-50%, calc(-100% - 8px))',
        width: 208,
        background: 'rgb(30, 41, 59)', // .qh-tip と同色 (slate-800)
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md, 12px)',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45)',
        padding: '10px 12px',
        zIndex: 2000,
        pointerEvents: 'none',
        textAlign: 'left',
        animation: 'qh-tip-in 0.12s ease-out',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
        {quarter.label || '—'}
      </div>
      <TipRow k="EPS" yoy={quarter.epsYoY} verdict={quarter.epsVerdict} />
      <TipRow k="売上" yoy={quarter.revYoY} verdict={quarter.revVerdict} />
    </div>,
    document.body,
  );
}

// -------- メインコンポーネント --------
/**
 * @param {object} props
 * @param {string} props.ticker
 */
export default function EarningsGrowthSpark({ ticker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tip, setTip] = useState(null); // { quarter, x, y } | null

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setTip(null);
    fetchQuarterlyHistory(ticker, 8)
      .then((res) => {
        if (cancelled) return;
        if (!res || !Array.isArray(res.history) || res.history.length === 0) {
          setData(null);
        } else {
          setData(res.history); // 新しい順（history[0] = 最新）
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'fetch error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ticker]);

  const handleHover = (quarter, rect) => {
    setTip({ quarter, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top) });
  };
  const handleLeave = () => setTip(null);

  if (loading) {
    return (
      <div data-testid={TESTID} data-state="loading" aria-busy="true">
        <div style={wrapperStyle}>
          <div style={skeletonStyle} />
          <div style={skeletonStyle} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid={TESTID} data-state="errored">
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
          成長トレンドデータを取得できませんでした
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div data-testid={TESTID} data-state="empty">
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
          成長トレンドデータがありません
        </div>
      </div>
    );
  }

  // eps_yoy_pct / revenue_yoy_pct を抽出（新しい順）
  const epsData = data.map(q => q.eps_yoy_pct ?? null);
  const revData = data.map(q => q.revenue_yoy_pct ?? null);

  // 四半期ラベル（新しい順 → reverse して軸ラベルに）
  const quarterLabels = data.map(q => {
    if (q.fiscal_year && q.fiscal_quarter) return `FY${String(q.fiscal_year).slice(-2)} Q${q.fiscal_quarter}`;
    if (q.fiscal_period) return q.fiscal_period;
    if (q.period_label) return q.period_label;
    return '';
  });

  // 四半期ごとに EPS/売上 の YoY + verdict をまとめた tooltip 用レコード（新しい順）。
  const quarters = data.map((q, i) => ({
    label: quarterLabels[i] || '',
    epsYoY: Number.isFinite(epsData[i]) ? epsData[i] : null,
    revYoY: Number.isFinite(revData[i]) ? revData[i] : null,
    epsVerdict: q.eps_verdict ?? null,
    revVerdict: q.revenue_verdict ?? null,
  }));

  const hasEps = epsData.some(v => Number.isFinite(v));
  const hasRev = revData.some(v => Number.isFinite(v));

  if (!hasEps && !hasRev) {
    return (
      <div data-testid={TESTID} data-state="empty">
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
          YoY 成長率データがありません
        </div>
      </div>
    );
  }

  return (
    <div data-testid={TESTID} data-state="main">
      <div style={wrapperStyle}>
        {hasEps && (
          <SparkChart
            label="EPS 成長率 YoY（%）"
            metricKey="epsYoY"
            quarters={quarters}
            latestVal={epsData[0]}
            quarterLabels={quarterLabels}
            onHover={handleHover}
            onLeave={handleLeave}
          />
        )}
        {hasRev && (
          <SparkChart
            label="売上 成長率 YoY（%）"
            metricKey="revYoY"
            quarters={quarters}
            latestVal={revData[0]}
            quarterLabels={quarterLabels}
            onHover={handleHover}
            onLeave={handleLeave}
          />
        )}
      </div>
      {/* hover で各バーの「各四半期の YoY + Beat/Miss」を表示（バーに hover）の注記 */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        バーに hover で各四半期の前年比と Beat/Miss · 出典: FMP（直近 8Q）
      </div>
      {tip && <GrowthTooltip tip={tip} />}
    </div>
  );
}
