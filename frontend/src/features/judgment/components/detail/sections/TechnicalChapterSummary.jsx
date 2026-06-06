/**
 * TechnicalChapterSummary — Sprint 2 (CAN-SLIM Phase 1 UX)
 *
 * ライター憲法に準拠したテクニカル章のサマリーブロック。
 * ①結論先出し ②既知→未知/抽象→具体 ③並列情報は表示要素統一。
 *
 * § 38 / §5 ガード: 将来予測・最上級・推奨を含めない事実記述のみ。
 * LLM 不使用。テクニカルデータは StockPriceChart 側で個別 fetch されるため、
 * ここでは ticker を示し「チャート内の各指標で詳細を確認できます」という誘導文を表示する。
 * RS / Cup-Handle / DMA 等の具体値は StockPriceChart 側で直接表示される設計を維持する。
 *
 * 設計境界:
 *   - 新規 glow host を作らない (wrapper は div クラスなし)
 *   - raw hex 禁止 / semantic CSS token のみ
 *   - module-level component (inline 関数 component 禁止 = feedback_pane_error_boundary)
 *   - loading/errored/empty/main 全 render path に data-testid 付与
 */
import React from 'react';

const TESTID = 'technical-chapter-summary';

/**
 * @param {object} props
 * @param {string|null} props.selectedTicker - 選択中の ticker シンボル
 * @param {boolean} [props.isLoading=false] - データ取得中フラグ
 * @param {boolean} [props.hasError=false] - データ取得失敗フラグ
 */
export default function TechnicalChapterSummary({ selectedTicker, isLoading = false, hasError = false }) {
  // loading state
  if (isLoading && !selectedTicker) {
    return (
      <div data-testid={TESTID} data-state="loading" aria-busy="true" style={containerStyle}>
        <div style={skeletonLineStyle(180)} />
        <div style={skeletonLineStyle(140)} />
      </div>
    );
  }

  // error state
  if (hasError) {
    return (
      <div data-testid={TESTID} data-state="errored" style={containerStyle}>
        <p style={textStyle}>—(データなし)</p>
      </div>
    );
  }

  // empty state
  if (!selectedTicker) {
    return (
      <div data-testid={TESTID} data-state="empty" style={containerStyle}>
        <p style={textStyle}>—(データなし)</p>
      </div>
    );
  }

  // main render
  return (
    <div data-testid={TESTID} data-state="main" style={containerStyle}>
      <p style={summaryStyle}>
        RS 強度・移動平均線・カップ形成の状況は各カード内で確認できます。
      </p>
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
    // anp-skel-shimmer は index.css (line 5961) で定義済み。
    // background-position アニメーション = transform 不使用 = CLS 安全 (feedback_cls_envelope_pattern)
    animation: 'anp-skel-shimmer 1.6s linear infinite',
    backgroundImage: 'linear-gradient(90deg, var(--bg-subtle) 25%, var(--bg-hover) 50%, var(--bg-subtle) 75%)',
    backgroundSize: '200% 100%',
  };
}
