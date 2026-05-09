import React from 'react';
import { useJudgment } from '../../state/JudgmentContext.jsx';
import Hero from './Hero.jsx';
import KpiStrip from './KpiStrip.jsx';
import VerdictDetail from './VerdictDetail.jsx';
import SimpleSection from './SimpleSection.jsx';
import SectionDivider from './SectionDivider.jsx';
import PremiumLock from '../shared/PremiumLock.jsx';

/**
 * Pane 3: 判定タブ詳細ペイン (Step 6).
 *
 * セクション順 (handover §3 Step 6 + design_recipes.md §C-10):
 *   階層 1 Verdict:   Hero, KpiStrip, VerdictDetail
 *   階層 2 Fundamentals: BeatMiss, Profile, KeyStats
 *   階層 3 Context:   Analyst (Pro lock), IR, News
 *
 * @param {object} props
 * @param {string} [props.plan='free']
 * @param {(ticker: string) => object|null} [props.detailFor] - selected ticker の詳細データ取得
 *   返値: { result, guidance, price, changePct, lastAnalyzedAt? }
 *   result は判定結果 (overallPass, conditions, latestPeriod, companyName 等を含む).
 * @param {(ticker: string) => void} [props.onAnalyze] - 未分析時のリトリガー
 */
export default function JudgmentDetail({ plan = 'free', detailFor, onAnalyze }) {
  const { selectedTicker } = useJudgment();

  if (!selectedTicker) {
    return (
      <div
        className="bs-panel"
        style={{
          padding: 'var(--space-12, 48px) var(--space-6, 24px)',
          textAlign: 'center',
          color: 'var(--text-muted)',
          minHeight: 240,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        左のリストから銘柄を選択してください
      </div>
    );
  }

  const detail = detailFor ? detailFor(selectedTicker) : null;
  const result = detail?.result || null;
  const conditions = result?.conditions || [];
  const verdict = result
    ? result.overallPass
      ? 'beat'
      : 'miss'
    : 'unknown';

  // KPI 候補
  const kpis = [];
  if (detail?.price != null) {
    kpis.push({
      value: `$${Number(detail.price).toFixed(2)}`,
      label: '現在値',
      trend: detail.changePct > 0 ? 'up' : detail.changePct < 0 ? 'down' : 'neutral',
    });
  }
  if (detail?.changePct != null) {
    const pct = (detail.changePct * 100).toFixed(2);
    kpis.push({
      value: `${detail.changePct > 0 ? '+' : ''}${pct}% YTD`,
      label: 'リターン',
      trend: detail.changePct > 0 ? 'up' : detail.changePct < 0 ? 'down' : 'neutral',
    });
  }
  if (result) {
    kpis.push({
      value: `${result.passedCount ?? 0}/${result.totalCount ?? 5}`,
      label: '条件合致',
      trend: result.overallPass ? 'up' : 'neutral',
    });
  }
  // EPS Beat: 実績はあるが予想欠損 → Unknown を honest に表示 (recipes §C-9)
  kpis.push({
    value: result?.epsBeatPct != null
      ? `${result.epsBeatPct > 0 ? '+' : ''}${(result.epsBeatPct * 100).toFixed(1)}%`
      : '—',
    label: 'EPS Beat',
    verdict: result?.epsBeatPct == null ? 'unknown' : result.epsBeatPct > 0 ? 'beat' : 'miss',
    hint: result?.epsBeatPct == null ? '予想は更新待ち' : null,
  });

  return (
    <div className="ds-judgment-detail" style={{ display: 'grid', gap: 12 }}>
      {/* === 階層 1: Verdict === */}
      <SectionDivider tier={1} />
      <Hero
        ticker={selectedTicker}
        companyName={result?.companyName}
        verdict={verdict}
        period={result?.latestPeriod ? `FY${result.latestPeriod}` : null}
      />
      <KpiStrip stats={kpis} />
      <VerdictDetail
        conditions={conditions}
        passedCount={result?.passedCount}
        totalCount={result?.totalCount}
      />
      {!result && onAnalyze && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            この銘柄はまだ分析されていません
          </span>
          <button
            type="button"
            onClick={() => onAnalyze(selectedTicker)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              background: 'rgb(56, 189, 248)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            分析する
          </button>
        </div>
      )}

      {/* === 階層 2: Fundamentals === */}
      <SectionDivider tier={2} />
      <SimpleSection
        id="sec-beat-miss"
        title="Beat / Miss"
        label="EPS"
        empty={
          result?.epsBeatPct == null
            ? '予想を取得中 (FMP Free 制限により遅延あり)'
            : null
        }
      >
        {result?.epsBeatPct != null && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            EPS は予想を {result.epsBeatPct > 0 ? '上回り' : '下回り'} ました
          </div>
        )}
      </SimpleSection>
      <SimpleSection
        id="sec-profile"
        title="Profile"
        label="COMPANY"
        empty={result?.companyName ? null : '会社情報を取得中'}
      >
        {result?.companyName && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {result.companyName}
          </div>
        )}
      </SimpleSection>
      <SimpleSection
        id="sec-key-stats"
        title="Key Stats"
        label="FUNDAMENTALS"
        empty="拡充予定 (Phase 2)"
      />

      {/* === 階層 3: Context === */}
      <SectionDivider tier={3} />
      <PremiumLock
        feature="analyst_estimates"
        plan={plan}
        label="アナリスト予想 (Pro 解放)"
      >
        <SimpleSection
          id="sec-analyst"
          title="アナリスト予想"
          label="ESTIMATES"
          empty="Pro 有効化時にここに表示"
        />
      </PremiumLock>
      <SimpleSection
        id="sec-ir"
        title="IR Links"
        label="REFERENCES"
        empty="拡充予定"
      />
      <SimpleSection
        id="sec-news"
        title="News"
        label="RECENT"
        empty="拡充予定"
      />
    </div>
  );
}
