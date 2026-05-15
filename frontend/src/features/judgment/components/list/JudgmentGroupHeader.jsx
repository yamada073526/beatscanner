import React from 'react';

/**
 * Group header (Pane 2 銘柄リストのグループ見出し).
 * round 8 (handover v69): action slot を追加。グループ右端に任意の React element
 * (例: 「+ 観察銘柄を追加」 button) を置けるようにする。
 *
 * @param {object} props
 * @param {string} props.title
 * @param {number} [props.count]
 * @param {React.ReactNode} [props.action] - 右端に置く element (count の右に並ぶ)
 */
export default function JudgmentGroupHeader({ title, count, action }) {
  return (
    <div
      role="presentation"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px 6px',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        gap: 8,
      }}
    >
      <span>{title}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {count != null && <span>{count}</span>}
        {action}
      </div>
    </div>
  );
}
