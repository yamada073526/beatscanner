/**
 * CitationChip — handover v82 Phase 4 (出典 chip primitive) + Phase 4.5 (hover popover)
 *
 * @no-llm — このコンポーネントは Anthropic SDK / Claude API を一切呼ばない。
 *
 * multi-review 6 体合議 (2026-05-17) verdict:
 * - chip_primitive_canonical.md: 新 tone 追加禁止 → muted 1 種固定
 * - source_type で icon 分岐 (official/derived) — 色は muted のまま
 * - Phase 4.5: hover popover で URL 表示 (Radix なし、 既存 GuidanceCard Tooltip pattern 流用)
 *
 * source_type:
 *   - 'sec_filing'  → 🏛 (SEC EDGAR 公式 filing、 最も信頼性高)
 *   - 'fmp'         → △ (FMP 計算値、 集約)
 *   - 'ir_deck'     → 📊 (企業 IR deck、 公式)
 *   - 'unknown'     → · (出典欠落、 placeholder)
 *
 * memory:
 *   - chip_primitive_canonical.md (Chip primitive SSOT、 inline style 禁止)
 *   - feedback_citation_required.md (出典明示の義務)
 *   - feedback_brand_aspiration.md (Aman/Ritz-Carlton 級世界観、 cyan accent 流用禁止)
 */
import { useState, useEffect, useRef } from 'react';
import Chip from './ui/Chip.jsx';

const SOURCE_ICONS = {
  sec_filing: '🏛',
  fmp: '△',
  ir_deck: '📊',
  unknown: '·',
};

const SOURCE_LABELS = {
  sec_filing: 'SEC',
  fmp: 'FMP',
  ir_deck: 'IR',
  unknown: '出典欠落',
};

function classifySourceType(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== 'string') return 'unknown';
  const url = sourceUrl.toLowerCase();
  if (url.includes('sec.gov') || url.includes('edgar')) return 'sec_filing';
  if (url.includes('financialmodelingprep.com') || url.includes('fmp')) return 'fmp';
  if (url.includes('investor') || url.includes('ir.') || url.includes('-presentation')) return 'ir_deck';
  return 'fmp'; // 推定 default (fallback)
}

/**
 * @param {object} props
 * @param {string} [props.sourceUrl] - 出典 URL (SEC EDGAR / FMP / IR deck)
 * @param {'sec_filing'|'fmp'|'ir_deck'|'unknown'} [props.sourceType] - 明示指定 (sourceUrl から auto-classify される)
 * @param {string} [props.label] - chip 文言 override (省略時は SOURCE_LABELS から)
 * @param {'inline'|'footer'} [props.slot='footer'] - inline は数値直後の superscript、 footer は一覧
 * @param {number} [props.index] - footer 配列での順序 (number badge 用、 inline のみ)
 * @param {boolean} [props.disablePopover=false] - hover popover を無効化 (将来 toggle 用)
 */
export default function CitationChip({
  sourceUrl,
  sourceType,
  label,
  slot = 'footer',
  index,
  disablePopover = false,
}) {
  const type = sourceType || classifySourceType(sourceUrl);
  const icon = SOURCE_ICONS[type] || SOURCE_ICONS.unknown;
  const displayLabel = label || SOURCE_LABELS[type];

  const chipBody = slot === 'inline'
    ? (typeof index === 'number' ? `${icon}${index + 1}` : icon)
    : (
        <>
          <span aria-hidden="true" style={{ marginRight: 3 }}>{icon}</span>
          {displayLabel}
        </>
      );

  const className = slot === 'inline' ? 'citation-chip-inline' : 'citation-chip-footer';

  // popover を表示できない条件 (sourceUrl なし or 明示的無効化) は通常 Chip + title fallback
  if (!sourceUrl || disablePopover) {
    return (
      <Chip
        variant="display"
        tone="muted"
        size="xs"
        className={className}
        title={sourceUrl || displayLabel}
      >
        {chipBody}
      </Chip>
    );
  }

  // hover popover を attach (Radix 不使用、 既存 GuidanceCard Tooltip pattern 流用)
  return (
    <CitationPopover sourceUrl={sourceUrl} sourceType={type} label={displayLabel}>
      <Chip
        variant="display"
        tone="muted"
        size="xs"
        className={className}
        title={sourceUrl}
      >
        {chipBody}
      </Chip>
    </CitationPopover>
  );
}

/**
 * CitationPopover — hover / focus / tap で URL を表示する custom popover.
 * Radix UI / @floating-ui/react に依存せず、 既存 BeatScanner Tooltip pattern を踏襲。
 * モバイル (touch) では tap で開閉、 外側 click で閉じる。
 */
function CitationPopover({ children, sourceUrl, sourceType, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  // sourceUrl の host 部分を抽出 (popover 内表示用、 全 URL より読みやすい)
  let displayHost = sourceUrl;
  try {
    const u = new URL(sourceUrl);
    displayHost = u.host + (u.pathname && u.pathname !== '/' ? u.pathname.slice(0, 24) : '');
    if (u.pathname && u.pathname.length > 24) displayHost += '…';
  } catch {
    // URL parse 失敗時は raw のまま
  }

  return (
    <span
      ref={ref}
      className="citation-chip-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
    >
      {children}
      {open && (
        <span role="tooltip" className="citation-popover">
          <span className="citation-popover-label">{label}</span>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="citation-popover-url"
            onClick={(e) => e.stopPropagation()}
          >
            {displayHost}
            <span aria-hidden="true"> ↗</span>
          </a>
        </span>
      )}
    </span>
  );
}
