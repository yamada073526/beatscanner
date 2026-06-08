/**
 * DetailBreadcrumb — C-3 競合ナビ パンくずバー (SPEC 2026-06-09)
 *
 * workspaceStore.detailHistory (ticker 文字列 stack) を直読みし、
 * 「⌂ › AAPL › NVDA」形式で横並び表示する 28px 独立バー。
 *
 * 設計確定事項 (3 体合議 ui/frontend/qa + user gate1 通過):
 *   - stack が 0〜1 件 (ルートのみ、まだ辿っていない) は render しない (2 件以上で表示)
 *   - ⌂ = lucide HomeIcon のみ (文字なし)、aria-label="スクリーナーに戻る"
 *   - 区切り › = --text-muted
 *   - 現在地 (末尾) = --text-primary / fw600
 *   - 祖先 = --text-secondary (hover で下線)
 *   - 5 段以上: ⌂ › … › 直前 › 現在 に省略
 *   - 発光系 class (.panel-card / .bs-panel / .surface-card) 不使用
 *   - raw hex 禁止 (全 token 経由)
 *
 * パンくずクリックの無限ループ防止:
 *   setActiveTicker(ticker) を呼ぶと pushDetailHistory が走るが、
 *   ticker が stack 内既出のため「その位置まで truncate」ロジックが自動吸収する
 *   (新規 entry でないので増殖しない — SPEC §5 設計確定)。
 */
import React, { memo } from 'react';
import { Home } from 'lucide-react';
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import TickerBadge from '../../components/ui/TickerBadge.jsx';

/** 省略表示の閾値: この段数以上で中間を … に畳む */
const ELLIPSIS_THRESHOLD = 5;

const DetailBreadcrumb = memo(function DetailBreadcrumb() {
  const detailHistory = useWorkspaceStore((s) => s.detailHistory);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);

  // stack が 0〜1 件は非表示 (2 件以上で表示)
  if (!detailHistory || detailHistory.length < 2) return null;

  // 表示するセグメントを構築 (5 段以上は省略)
  // セグメント型: { type: 'home' } | { type: 'ellipsis' } | { type: 'ticker', ticker: string, isCurrent: boolean }
  const segments = buildSegments(detailHistory);

  return (
    <nav
      aria-label="閲覧履歴パンくず"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: 'var(--space-2, 8px)',
        minHeight: '28px',
        // 発光系 class 不使用。background / shadow / border 最小限
        padding: '0 var(--space-2, 8px)',
        borderBottom: '1px solid var(--border)',
        marginBottom: 'var(--space-2, 8px)',
        overflow: 'hidden',
      }}
    >
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span
              aria-hidden="true"
              style={{
                color: 'var(--text-muted)',
                fontSize: 'var(--text-caption)',
                lineHeight: 1,
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              ›
            </span>
          )}

          {seg.type === 'home' && (
            <button
              type="button"
              aria-label="スクリーナーに戻る"
              onClick={() => setActiveTicker(null)}
              style={styles.homeButton}
              className="detail-breadcrumb-home"
            >
              <Home size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          )}

          {seg.type === 'ellipsis' && (
            <span
              aria-label="中間の履歴を省略"
              style={{
                color: 'var(--text-muted)',
                fontSize: 'var(--text-caption)',
                lineHeight: 1,
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              …
            </span>
          )}

          {seg.type === 'ticker' && !seg.isCurrent && (
            <button
              type="button"
              aria-label={`${seg.ticker} の詳細に戻る`}
              onClick={() => setActiveTicker(seg.ticker)}
              style={styles.ancestorButton}
              className="detail-breadcrumb-ancestor"
            >
              <TickerBadge
                ticker={seg.ticker}
                size="xs"
                showText
                onClick={undefined}
              />
            </button>
          )}

          {seg.type === 'ticker' && seg.isCurrent && (
            <span
              aria-current="page"
              style={styles.currentTicker}
            >
              <TickerBadge
                ticker={seg.ticker}
                size="xs"
                showText
                onClick={undefined}
              />
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
});

/**
 * detailHistory から表示セグメントを構築する。
 * 5 段以上は ⌂ › … › 直前 › 現在 に省略。
 *
 * @param {string[]} history
 * @returns {Array<{type: string, ticker?: string, isCurrent?: boolean}>}
 */
function buildSegments(history) {
  const segments = [{ type: 'home' }];

  if (history.length < ELLIPSIS_THRESHOLD) {
    // 省略なし: 全 ticker を表示
    history.forEach((ticker, i) => {
      segments.push({
        type: 'ticker',
        ticker,
        isCurrent: i === history.length - 1,
      });
    });
  } else {
    // 省略あり: ⌂ › … › 直前 › 現在
    segments.push({ type: 'ellipsis' });
    // 直前 ticker (末尾から 2 番目)
    segments.push({
      type: 'ticker',
      ticker: history[history.length - 2],
      isCurrent: false,
    });
    // 現在地 (末尾)
    segments.push({
      type: 'ticker',
      ticker: history[history.length - 1],
      isCurrent: true,
    });
  }

  return segments;
}

/** インライン style オブジェクト (raw hex 禁止、全 token 経由) */
const styles = {
  homeButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 0,
    padding: 0,
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    // hover 時の feedback は CSS class で対応 (.detail-breadcrumb-ancestor と共通)
    flexShrink: 0,
    lineHeight: 1,
  },
  ancestorButton: {
    display: 'inline-flex',
    alignItems: 'center',
    background: 'transparent',
    border: 0,
    padding: 0,
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    font: 'inherit',
    textAlign: 'left',
    flexShrink: 0,
    lineHeight: 1,
  },
  currentTicker: {
    display: 'inline-flex',
    alignItems: 'center',
    // 現在地は色 (--text-primary) で差別化。weight は TickerBadge 内部 (fw600) に委ねる
    // (3 体合議 ui verdict: 14px 以下で wrapper 側に fw600 を重ねるのは冗長)。
    color: 'var(--text-primary)',
    flexShrink: 0,
    lineHeight: 1,
  },
};

export default DetailBreadcrumb;
