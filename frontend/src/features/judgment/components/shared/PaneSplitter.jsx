import React from 'react';

/**
 * 判定タブ用の 3 ペイン (or 2 ペイン) splitter.
 *
 * Pane 1 (nav, optional) | Pane 2 (list) | Pane 3 (detail)
 *
 * - nav が無い場合は 2 ペイン (list + detail)
 * - nav が指定されると `auto 360px 1fr` の 3 列レイアウト (nav 自身が collapse 状態を持つので width は auto)
 * - モバイル (≤ 768px) では nav と list を縦積み or detail オーバーレイ化を将来追加
 */
export default function PaneSplitter({ nav, list, detail, listWidth = 360 }) {
  const cols = nav ? `auto ${listWidth}px 1fr` : `${listWidth}px 1fr`;
  return (
    <div
      className="ds-pane-splitter"
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        gap: 'var(--space-4, 16px)',
        minHeight: 'calc(100vh - 200px)',
      }}
    >
      {nav && (
        <div className="ds-pane-splitter__nav" style={{ minWidth: 0 }}>
          {nav}
        </div>
      )}
      <div className="ds-pane-splitter__list" style={{ minWidth: 0 }}>
        {list}
      </div>
      <div className="ds-pane-splitter__detail" style={{ minWidth: 0 }}>
        {detail}
      </div>
    </div>
  );
}
