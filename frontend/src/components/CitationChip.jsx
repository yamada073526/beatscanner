/**
 * CitationChip — handover v82 Phase 4 (出典 chip primitive)
 *
 * @no-llm — このコンポーネントは Anthropic SDK / Claude API を一切呼ばない。
 *
 * multi-review 6 体合議 (2026-05-17) verdict:
 * - chip_primitive_canonical.md: 新 tone 追加禁止 → muted 1 種固定
 * - source_type で icon 分岐 (official/derived) — 色は muted のまま
 * - hover popover は Phase 4.5 (今回は label 表示のみ)
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
 */
export default function CitationChip({
  sourceUrl,
  sourceType,
  label,
  slot = 'footer',
  index,
}) {
  const type = sourceType || classifySourceType(sourceUrl);
  const icon = SOURCE_ICONS[type] || SOURCE_ICONS.unknown;
  const displayLabel = label || SOURCE_LABELS[type];

  // inline slot は superscript chip (数値の右肩に番号付き)
  if (slot === 'inline') {
    return (
      <Chip
        variant="display"
        tone="muted"
        size="xs"
        className="citation-chip-inline"
        title={sourceUrl || displayLabel}
      >
        {typeof index === 'number' ? `${icon}${index + 1}` : icon}
      </Chip>
    );
  }

  // footer slot は通常 chip (icon + label)
  return (
    <Chip
      variant="display"
      tone="muted"
      size="xs"
      className="citation-chip-footer"
      title={sourceUrl || displayLabel}
    >
      <span aria-hidden="true" style={{ marginRight: 3 }}>{icon}</span>
      {displayLabel}
    </Chip>
  );
}
