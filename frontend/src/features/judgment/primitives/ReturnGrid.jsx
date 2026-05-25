import React from 'react';
import { usePeriodReturns } from '../../../hooks/usePeriodReturns.js';

/**
 * ReturnGrid — 8 期間 (1W/1M/3M/6M/1Y/3Y/5Y/10Y) の cumulative return % を
 * chip 並列で表示する primitive。
 *
 * design anchor:
 *   - design_system.md §1 (color token: --color-gain / --color-loss / --text-muted)
 *   - design_recipes.md §C-9 (欠損は em-dash、 raw hex 禁止)
 *   - feedback_chart_overlay_safety.md (Number.isFinite guard)
 *   - SPEC §5 Sprint 2: 「年率」表記禁止、 1Y/3Y/5Y/10Y は hint「累積」のみ
 *
 * props:
 *   ticker     {string}  銘柄コード (ETF / 個別株共通)
 *   frameless  {boolean} true = border / background なし (外枠 caller が提供)
 *   testId     {string}  data-testid override (default: "return-grid")
 *
 * mount: Sprint 3 (JudgmentDetail) + Sprint 4 (EtfOverviewPanel) で行う。
 *        本 sprint は primitive 定義のみ。
 */

// 表示する期間の定義 (順序固定)
const PERIODS = [
  { key: '1W',  label: '1W',  hint: null },
  { key: '1M',  label: '1M',  hint: null },
  { key: '3M',  label: '3M',  hint: null },
  { key: '6M',  label: '6M',  hint: null },
  { key: '1Y',  label: '1Y',  hint: '累積' },
  { key: '3Y',  label: '3Y',  hint: '累積' },
  { key: '5Y',  label: '5Y',  hint: '累積' },
  { key: '10Y', label: '10Y', hint: '累積' },
];

/**
 * 1 つの期間 chip を描画する。
 * - return_pct が Number.isFinite でない場合 → em-dash で表示 (Trust Cliff 防止)
 * - available=false → em-dash + opacity 0.5 + hint「設定日前」
 * - 「年率」表記は一切しない (SPEC §「年率表記禁止」)
 */
function PeriodChip({ periodDef, periodData }) {
  const { label, hint: defaultHint } = periodDef;

  // available=false (inception_date 前など) → 灰色 em-dash
  const available = periodData?.available !== false;
  const returnPct = periodData?.return_pct;

  // Number.isFinite guard: null / undefined / NaN は全て em-dash (feedback_chart_overlay_safety.md)
  const isValid = available && Number.isFinite(returnPct);

  // 値の表示文字列: +X.XX% / -X.XX% / —
  let displayValue;
  if (isValid) {
    const sign = returnPct > 0 ? '+' : '';
    displayValue = `${sign}${returnPct.toFixed(2)}%`;
  } else {
    displayValue = '—';
  }

  // 色: > 0 → gain / < 0 → loss / それ以外 → muted
  let color;
  if (isValid && returnPct > 0) {
    color = 'var(--color-gain)';
  } else if (isValid && returnPct < 0) {
    color = 'var(--color-loss)';
  } else {
    color = 'var(--text-muted)';
  }

  // hint: available=false なら「設定日前」、それ以外は PERIODS 定義の hint (累積 / null)
  const hintText = !available ? '設定日前' : defaultHint;

  return (
    <div
      className="return-grid-chip ds-stat"
      style={{
        opacity: available ? 1 : 0.5,
        minWidth: 0, // grid auto-fit でオーバーフロー防止
      }}
    >
      {/* 値: tabular-nums + fw700 (ds-stat__value class が担当) */}
      <div
        className="ds-stat__value"
        style={{ color }}
      >
        {displayValue}
      </div>

      {/* ラベル: 期間文字列 (1W / 1M 等) */}
      <div className="ds-stat__label">
        {label}
      </div>

      {/* hint: 累積 / 設定日前 (.ds-stat__hint class が fontSize/color を担当) */}
      {hintText && (
        <div
          className="ds-stat__hint"
          style={{ marginTop: 'var(--space-1, 4px)' }}
        >
          {hintText}
        </div>
      )}
    </div>
  );
}

/**
 * SkeletonChip — loading 中の placeholder (8 個並列)
 */
function SkeletonChip() {
  return (
    <div
      className="return-grid-chip ds-stat"
      aria-hidden="true"
    >
      {/* 値 skeleton */}
      <div
        style={{
          height: '1.5em',
          width: '70%',
          background: 'var(--bg-muted)',
          borderRadius: 'var(--radius-sm, 4px)',
          animation: 'skel-pulse 1.5s ease-in-out infinite',
        }}
      />
      {/* ラベル skeleton */}
      <div
        style={{
          height: '0.8em',
          width: '40%',
          background: 'var(--bg-muted)',
          borderRadius: 'var(--radius-sm, 4px)',
          marginTop: 'var(--space-1, 4px)',
          animation: 'skel-pulse 1.5s ease-in-out infinite',
        }}
      />
    </div>
  );
}

export default function ReturnGrid({ ticker, frameless = true, testId = 'return-grid' }) {
  const { data, loading } = usePeriodReturns(ticker);

  // loading 中: skeleton chip 8 個
  if (loading) {
    return (
      <div
        data-testid={testId}
        className={frameless ? '' : 'ds-card-frameless'}
        style={{
          padding: frameless ? 0 : 'var(--space-4, 16px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 'var(--space-4, 16px)',
          minHeight: 80, // CLS envelope (feedback_cls_envelope_pattern.md)
        }}
      >
        {PERIODS.map((p) => (
          <SkeletonChip key={p.key} />
        ))}
      </div>
    );
  }

  // data がない場合: Trust Cliff 防止のため section 非表示
  if (!data || !data.periods) {
    return null;
  }

  // 全 8 期間が available=false (新 IPO 等) → section 自体非表示 (Trust Cliff 防止)
  const hasAnyAvailable = PERIODS.some(
    (p) => data.periods[p.key]?.available === true
  );
  if (!hasAnyAvailable) {
    return null;
  }

  return (
    <div
      data-testid={testId}
      className={frameless ? '' : 'ds-card-frameless'}
      style={{
        padding: frameless ? 0 : 'var(--space-4, 16px)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: 'var(--space-4, 16px)',
        minHeight: 80, // CLS envelope (feedback_cls_envelope_pattern.md)
      }}
    >
      {PERIODS.map((p) => (
        <PeriodChip
          key={p.key}
          periodDef={p}
          periodData={data.periods[p.key]}
        />
      ))}
    </div>
  );
}
