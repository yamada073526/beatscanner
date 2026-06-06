/**
 * FundamentalsChapterSummary — Sprint 2 (CAN-SLIM Phase 1 UX)
 *
 * ライター憲法に準拠したファンダメンタル章のサマリーブロック。
 * ①結論先出し ②既知→未知/抽象→具体 ③並列情報は表示要素統一。
 *
 * § 38 / §5 ガード: 将来予測・最上級・推奨を含めない事実記述のみ。
 * LLM 不使用。既存 backend 計算済値の静的テンプレート整形のみ。
 * 欠損データは「—(データなし)」で表示し、達成/未達扱いをしない。
 *
 * 設計境界:
 *   - 新規 glow host を作らない (既存 .bs-panel 流用不要、wrapper は div クラスなし)
 *   - raw hex 禁止 / semantic CSS token のみ
 *   - module-level component (inline 関数 component 禁止 = feedback_pane_error_boundary)
 *   - loading/errored/empty/main 全 render path に data-testid 付与
 */
import React from 'react';

const TESTID = 'funda-chapter-summary';

/**
 * EPS サプライズを「±X.X% 超過」形式の文字列に整形する。
 * @param {number|null} surprisePct
 * @returns {string}
 */
function formatEpsSurprise(surprisePct) {
  if (surprisePct == null || !Number.isFinite(surprisePct)) return null;
  const sign = surprisePct > 0 ? '+' : '';
  return `予想を ${sign}${surprisePct.toFixed(1)}% 超過`;
}

/**
 * 売上サプライズを「±X.X% 超過」形式の文字列に整形する。
 * @param {number|null} actual
 * @param {number|null} estimated
 * @returns {string|null}
 */
function formatRevenueSurprise(actual, estimated) {
  if (
    actual == null || !Number.isFinite(actual) ||
    estimated == null || !Number.isFinite(estimated) ||
    Math.abs(estimated) === 0
  ) return null;
  const pct = ((actual - estimated) / Math.abs(estimated)) * 100;
  const sign = pct > 0 ? '+' : '';
  return `予想を ${sign}${pct.toFixed(1)}% 超過`;
}

/**
 * 未達条件のラベルを返す。
 * @param {Array<{passed: boolean, label?: string, name?: string}>} conditions
 * @returns {string|null} - 「アナリスト評価」等の条件名、複数時は「2 項目」形式
 */
function formatFailedConditions(conditions) {
  if (!Array.isArray(conditions) || conditions.length === 0) return null;
  const failed = conditions.filter((c) => !c.passed);
  if (failed.length === 0) return null;
  if (failed.length === 1) {
    const label = failed[0].label || failed[0].name || null;
    return label ? `${label}(未達)` : '1 項目未達';
  }
  return `${failed.length} 項目未達`;
}

/**
 * @param {object} props
 * @param {object|null} props.result - JudgmentDetail の result (passedCount / totalCount / conditions)
 * @param {object|null} props.guidance - JudgmentDetail の guidance (eps / revenue_actual / revenue_estimated)
 * @param {boolean} [props.isLoading=false] - データ取得中フラグ
 * @param {boolean} [props.hasError=false] - データ取得失敗フラグ
 */
export default function FundamentalsChapterSummary({ result, guidance, isLoading = false, hasError = false }) {
  // loading state
  if (isLoading && !result) {
    return (
      <div data-testid={TESTID} data-state="loading" aria-busy="true" style={containerStyle}>
        <div style={skeletonLineStyle(160)} />
        <div style={skeletonLineStyle(120)} />
      </div>
    );
  }

  // error state
  if (hasError && !result) {
    return (
      <div data-testid={TESTID} data-state="errored" style={containerStyle}>
        <p style={textStyle}>—(データなし)</p>
      </div>
    );
  }

  // empty state (result は来たが条件データが空)
  if (!result) {
    return (
      <div data-testid={TESTID} data-state="empty" style={containerStyle}>
        <p style={textStyle}>—(データなし)</p>
      </div>
    );
  }

  // main render
  const passedCount = result.passedCount ?? 0;
  const totalCount = result.totalCount ?? 5;
  const conditions = result.conditions || [];

  const epsSurprise = formatEpsSurprise(guidance?.eps?.surprise_pct);
  const revSurprise = formatRevenueSurprise(
    guidance?.revenue_actual,
    guidance?.revenue_estimated
  );
  const failedNote = formatFailedConditions(conditions);

  // 条件サマリー文を組み立てる
  const conditionLine = (() => {
    if (passedCount === totalCount) {
      return `${totalCount} 条件すべてクリア。`;
    }
    const base = `${totalCount} 条件中 ${passedCount} クリア。`;
    return failedNote ? `${base} 唯一の未達は${failedNote}。` : base;
  })();

  // EPS / 売上サマリー文を組み立てる
  const financialLines = [];
  if (epsSurprise) {
    financialLines.push(`EPS: ${epsSurprise}。`);
  }
  if (revSurprise) {
    financialLines.push(`売上: ${revSurprise}。`);
  }
  // どちらもデータなしの場合 (Bloomberg idiom: 「—(データなし)」)
  if (financialLines.length === 0) {
    financialLines.push('—(データなし)');
  }

  return (
    <div data-testid={TESTID} data-state="main" style={containerStyle}>
      <p style={summaryStyle}>{conditionLine}</p>
      {financialLines.map((line, i) => (
        <p key={i} style={textStyle}>{line}</p>
      ))}
    </div>
  );
}

// --- インラインスタイル (semantic CSS token のみ、raw hex 禁止) ---

const containerStyle = {
  padding: 'var(--space-3) var(--space-4)',
  borderLeft: '2px solid var(--border)',
  marginBottom: 'var(--space-4)',
};

const summaryStyle = {
  margin: '0 0 var(--space-1) 0',
  fontSize: '0.8125rem', // 13px
  fontWeight: 500,
  lineHeight: 1.5,
  color: 'var(--text-secondary)',
};

const textStyle = {
  margin: '0 0 var(--space-1) 0',
  fontSize: '0.75rem', // 12px
  lineHeight: 1.5,
  color: 'var(--text-muted)',
};

function skeletonLineStyle(width) {
  return {
    height: 12,
    width,
    maxWidth: '100%',
    borderRadius: 4,
    background: 'var(--bg-subtle)',
    marginBottom: 'var(--space-2)',
    // ghost-shimmer は index.css (line 3193) で定義済み。
    // background-position アニメーション = transform 不使用 = CLS 安全 (feedback_cls_envelope_pattern)
    animation: 'anp-skel-shimmer 1.6s linear infinite',
    backgroundImage: 'linear-gradient(90deg, var(--bg-subtle) 25%, var(--bg-hover) 50%, var(--bg-subtle) 75%)',
    backgroundSize: '200% 100%',
  };
}
