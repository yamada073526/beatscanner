import React from 'react';

/**
 * Pane 2 (List) | Pane 3 (Detail) の分割レイアウト.
 *
 * Phase 2 で Pane 1 (Linear 240px ナビ) を加えて 3 ペイン化する予定。
 * 現状は 2 ペインのみ。モバイルは Detail を全幅オーバーレイ表示するため、
 * ResizeObserver は Step 5 / Step 6 完成後に追加。
 *
 * width のデフォルトは Stripe Sigma / Linear Insights 流: list 360px / detail flex.
 */
export default function PaneSplitter({ list, detail, listWidth = 360 }) {
  return (
    <div
      className="ds-pane-splitter"
      style={{
        display: 'grid',
        gridTemplateColumns: `${listWidth}px 1fr`,
        gap: 'var(--space-4, 16px)',
        minHeight: 'calc(100vh - 200px)',
      }}
    >
      <div className="ds-pane-splitter__list" style={{ minWidth: 0 }}>
        {list}
      </div>
      <div className="ds-pane-splitter__detail" style={{ minWidth: 0 }}>
        {detail}
      </div>
    </div>
  );
}
