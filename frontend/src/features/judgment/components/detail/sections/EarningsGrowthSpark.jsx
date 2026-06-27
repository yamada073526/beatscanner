/**
 * EarningsGrowthSpark — v6 IA 再構成: 8Q 成長トレンド bar spark
 *
 * @no-llm: 静的テンプレート整形専用。LLM API 呼び出し禁止。
 *
 * mockup §L2 準拠:
 *   - EPS 成長率 YoY / 売上 成長率 YoY を横並び 2 カラムの bar spark で表示
 *   - 全 8 値併記（各バー上に %値）
 *   - 直近 Q を強調（色つきバー）
 *   - 加速 / 横ばい / 減速 注記（baxis 左右）
 *
 * データ: fetchQuarterlyHistory(ticker, 8).history[].eps_yoy_pct / revenue_yoy_pct
 *
 * §38-safe:
 *   - 「加速 ↗」「横ばい →」「減速 ↘」は事実ベースの傾向注記（直近と8Q前の比較）
 *   - 行動指示・評価語なし
 *   - 来期予測を含まない（過去8Q実績のみ）
 *
 * Trust Cliff:
 *   - 欠損データの bar は非表示（— fallback なし。bar が少ない状態で正直に表示）
 *   - テストID: loading / errored / empty / main 全 path
 *
 * 発光系不触: bar は CSS token のみ（var(--color-gain) / var(--bg-muted)）
 */
import { useEffect, useState } from 'react';
import { fetchQuarterlyHistory } from '../../../../../api.js';

const TESTID = 'earnings-growth-spark';

const BAR_HEIGHT_MAX = 48; // px: 最大バー高さ
const BAR_HEIGHT_MIN = 4;  // px: 最小（値あり）バー高さ

// YoY% から bar 高さを計算
// 0% = min、最大値が max を占める。負は bg-muted で高さ proportional。
function calcBarHeight(pct, maxAbsVal) {
  if (!Number.isFinite(pct) || maxAbsVal <= 0) return BAR_HEIGHT_MIN;
  const ratio = Math.abs(pct) / maxAbsVal;
  return Math.max(BAR_HEIGHT_MIN, Math.round(ratio * BAR_HEIGHT_MAX));
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
  height: 64,
};

const baxisStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '9.5px',
  color: 'var(--text-muted)',
  marginTop: 6,
};

const skeletonStyle = {
  height: 64,
  borderRadius: 4,
  background: 'var(--bg-muted, #243447)',
  animation: 'shimmer 1.5s infinite',
};

// -------- SparkBar: 単一の四半期バー --------
function SparkBar({ pct, isLatest, maxAbsVal }) {
  const h = calcBarHeight(pct, maxAbsVal);
  const isPositive = Number.isFinite(pct) && pct >= 0;
  const barColor = isLatest
    ? isPositive
      ? 'var(--color-gain, #34ef81)'
      : 'var(--color-loss, #f87171)'
    : 'var(--bg-muted, #243447)';

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 3,
        height: '100%',
      }}
    >
      {Number.isFinite(pct) && (
        <span
          style={{
            fontSize: 9,
            color: isLatest ? 'var(--text-primary)' : 'var(--text-muted)',
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
        }}
        aria-hidden="true"
      />
    </div>
  );
}

// -------- SparkChart: EPS か売上の 8Q spark --------
function SparkChart({ label, data, quarterLabels }) {
  // data は新しい順（history[0] = 最新）→ 表示は古い順に reverse
  const reversed = [...data].reverse();
  const latestVal = data[0]; // 最新値（history[0]）

  const maxAbsVal = Math.max(
    ...reversed.filter(pct => Number.isFinite(pct)).map(Math.abs),
    1,
  );

  const trend = trendLabel(data);

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
      <div style={bchartStyle} role="img" aria-label={`${label} 8Q グラフ`}>
        {reversed.map((pct, i) => (
          <SparkBar
            key={i}
            pct={pct}
            isLatest={i === reversed.length - 1}
            maxAbsVal={maxAbsVal}
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

// -------- メインコンポーネント --------
/**
 * @param {object} props
 * @param {string} props.ticker
 */
export default function EarningsGrowthSpark({ ticker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
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
    if (q.period_label) return q.period_label;
    return '';
  });

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
            data={epsData}
            quarterLabels={quarterLabels}
          />
        )}
        {hasRev && (
          <SparkChart
            label="売上 成長率 YoY（%）"
            data={revData}
            quarterLabels={quarterLabels}
          />
        )}
      </div>
      {/* citation footer */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        出典: FMP（直近 8Q）· 更新: 本日
      </div>
    </div>
  );
}
