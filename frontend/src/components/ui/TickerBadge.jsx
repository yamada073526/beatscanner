import { memo } from 'react';
import CompanyLogo from '../CompanyLogo.jsx';

/**
 * TickerBadge — CompanyLogo + ticker text のセット primitive (v71 Phase 3-d round 7)
 *
 * 4 体合議 (UI/UX + Web 設計 + 金融 + Web 開発) で確定。 既存 9 箇所で
 * 「CompanyLogo + ticker span」 が ad hoc 再利用されているため DRY 化。
 *
 * 既存の散在 callsite:
 *   - App.jsx (x3) / Judgment list / Judgment detail / Pane 4 NewsItem /
 *     Top Movers ribbon / TransactionHistoryModal
 *
 * 移行は段階的: 新 callsite から TickerBadge を使い、 既存は別 PR で機械置換。
 *
 * Props:
 *   ticker:    string (必須、 自動で大文字 + trim)
 *   size:      'xs' (14) | 'sm' (20) | 'md' (28) | 'lg' (56) - default 'sm'
 *   showText:  boolean (default true、 false で logo のみ)
 *   onClick:   function (clickable badge にする時、 button タグで render)
 *   ariaLabel: string (省略時は ticker + onClick 有無で auto)
 *   className: 追加 class
 *
 * memory anchor: logo_sources.md (3 段 fallback 設計)
 */

const SIZE_PRESETS = {
  xs: 14,
  sm: 20,
  md: 28,
  lg: 56,
};

const TickerBadge = memo(function TickerBadge({
  ticker,
  size = 'sm',
  showText = true,
  onClick,
  ariaLabel,
  className = '',
}) {
  const t = String(ticker || '').toUpperCase().trim();
  if (!t) return null;
  const px = SIZE_PRESETS[size] || SIZE_PRESETS.sm;
  const Comp = onClick ? 'button' : 'span';

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`ticker-badge ${className}`.trim()}
      aria-label={ariaLabel || (onClick ? `${t} の詳細を開く` : t)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: px <= 16 ? 5 : 6,
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: onClick ? 'pointer' : 'inherit',
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
        flexShrink: 0,
      }}
    >
      <CompanyLogo ticker={t} size={px} />
      {showText && (
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{t}</span>
      )}
    </Comp>
  );
});

export default TickerBadge;
