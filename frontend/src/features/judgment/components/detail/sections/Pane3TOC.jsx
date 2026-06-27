/**
 * Pane3TOC — v6 IA 再構成: On This Page 目次
 *
 * mockup 準拠: chip 列（決算 / 品質・継続性 / テクニカル・買い場 / 図解 / その他）
 * クリックで該当章へ smooth scroll。
 *
 * 設計ルール:
 *   - native href="#id" は内側スクロールで無効 → smoothScrollToElement を使用（§5-4）
 *   - アンカー先が fold 時は fold を auto-open してから scroll（dispatchEvent）
 *   - isNonEquity 時は決算 / テクニカル / RS 章を目次から除外
 *   - 静的（章 id の固定リスト）
 *
 * testid: 全 render path（main のみ、空はなし）に data-testid 付与。
 */
import { smoothScrollToElement } from '../../../../../lib/smoothScroll.js';

const TESTID = 'pane3-toc';

// 目次エントリー定義（mockup §3 §4 §5 §6 §7 の章構成に対応）
// isEquityOnly: true の場合、非 equity 時は目次から除外
const TOC_ENTRIES = [
  { id: 'v6-earnings-section',   label: '決算',           isEquityOnly: true  },
  { id: 'v6-quality-section',    label: '品質・継続性',   isEquityOnly: false },
  { id: 'v6-technical-section',  label: 'テクニカル・買い場', isEquityOnly: true },
  { id: 'v6-figure-section',     label: '図解',           isEquityOnly: false },
  { id: 'v6-more-section',       label: 'その他',          isEquityOnly: false },
];

const containerStyle = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  alignItems: 'center',
  fontSize: 12,
};

const labelStyle = {
  color: 'var(--text-muted)',
  marginRight: 4,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const chipBaseStyle = {
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '4px 12px',
  background: 'var(--bg-subtle, #1e2a3a)',
  cursor: 'pointer',
  fontSize: 12,
  transition: 'border-color 0.15s, color 0.15s',
  textDecoration: 'none',
  display: 'inline-block',
  fontFamily: 'inherit',
};

/**
 * fold を auto-open してから scroll（SPEC §5-5 の fold auto-open 仕様）
 * data-testid="v6-*-section" の要素が詳細の fold wrapper 内に入っている場合、
 * その fold を open してから scroll する。
 * @param {Element} target
 */
function openFoldAndScroll(target) {
  if (!target) return;
  // AccordionSection / details 要素を親から探す
  const fold = target.closest('details');
  if (fold && !fold.open) {
    fold.open = true;
  }
  // カスタム data-fold-open イベントで fold open を通知（既存 AccordionSection 対応）
  const foldWrapper = target.closest('[data-fold-container]');
  if (foldWrapper) {
    foldWrapper.dispatchEvent(new CustomEvent('fold-open-request', { bubbles: true }));
  }
  // scroll（タイミングを1フレーム後にずらして fold 展開後の高さを待つ）
  requestAnimationFrame(() => {
    smoothScrollToElement(target, { offset: 80 });
  });
}

/**
 * @param {object} props
 * @param {boolean} [props.isNonEquity] - 非 equity 時は決算 / テクニカル を除外
 * @param {HTMLElement|null} [props.detailRoot] - scroll の起点 (.ds-judgment-detail)
 */
export default function Pane3TOC({ isNonEquity = false, detailRoot = null }) {
  const entries = TOC_ENTRIES.filter(e => !isNonEquity || !e.isEquityOnly);

  const handleClick = (e, id) => {
    e.preventDefault();
    const root = detailRoot || document;
    const target = root.querySelector(`[data-testid="${id}"]`)
      || root.querySelector(`#${id}`);
    if (target) {
      openFoldAndScroll(target);
    }
  };

  return (
    <nav
      data-testid={TESTID}
      aria-label="ページ内目次"
      style={containerStyle}
    >
      <span style={labelStyle}>On this page</span>
      {entries.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={(e) => handleClick(e, id)}
          style={chipBaseStyle}
          data-testid={`${TESTID}-${id}`}
          aria-label={`${label}セクションへ移動`}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-strong, rgba(255,255,255,0.14))';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
