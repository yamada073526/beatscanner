import { getTagColorHex } from '../lib/tags.js';

/**
 * タグ表示用の小型 pill
 * - 色ドット 6px + タグ名
 * - selected = true で背景塗り、false で枠線のみ（Linear 方式）
 */
export default function TagPill({ tag, selected = false, count, onClick, className = '', size = 'sm' }) {
  if (!tag) return null;
  const hex = getTagColorHex(tag.color);

  const isClickable = typeof onClick === 'function';
  const Tag = isClickable ? 'button' : 'span';

  const padding = size === 'sm' ? '2px 8px' : '4px 10px';
  const fontSize = size === 'sm' ? '11px' : '12px';
  const dotSize = size === 'sm' ? 6 : 8;

  const style = selected
    ? {
        backgroundColor: `${hex}33`,
        borderColor: hex,
        color: hex,
      }
    : {
        backgroundColor: 'transparent',
        borderColor: 'var(--border-subtle, rgba(148,163,184,0.3))',
        color: 'var(--text-secondary, rgb(100,116,139))',
      };

  return (
    <Tag
      type={isClickable ? 'button' : undefined}
      onClick={onClick}
      className={`tag-pill ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding,
        fontSize,
        fontWeight: 600,
        lineHeight: 1,
        border: '1px solid',
        borderRadius: 9999,
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          backgroundColor: hex,
          flexShrink: 0,
        }}
      />
      <span style={{ whiteSpace: 'nowrap' }}>{tag.name}</span>
      {typeof count === 'number' && (
        <span style={{ opacity: 0.7, fontWeight: 500 }}>{count}</span>
      )}
    </Tag>
  );
}
