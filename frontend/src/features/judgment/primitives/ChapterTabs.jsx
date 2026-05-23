/**
 * ChapterTabs — 章内 tab 切替 primitive (v104 Phase G Phase 4)
 *
 * 用途: 章 2 (基本財務) で GuidanceCard / EarningsHistoryChart / QuarterlyHistoryTable を
 *   1 tab interface に統合する。 Bloomberg / Refinitiv 流の「同カテゴリ複数 viewport」 idiom。
 *
 * 設計判断:
 *   - segmented tab CSS (`ws-pane4-jp-segmented`) と同 idiom で Pane 3 内一貫性
 *   - feature flag (`localStorage.pane3_v3 === '1'` or URL `?pane3_v3=1`) で gated
 *   - keyboard nav (arrow keys)、 ARIA role="tablist" + tab pattern 準拠
 *   - active tab content のみ render (lazy mount で perf 最適化)
 *
 * Props:
 *   tabs       { key, label, badge? }[]   - tab 定義
 *   activeKey  string                     - 現在の active tab key
 *   onChange   (key: string) => void      - tab 切替 callback
 *   children   { [key]: ReactNode }       - tab key と panel content の mapping
 */
import { useRef } from 'react';

export default function ChapterTabs({ tabs, activeKey, onChange, children, ariaLabel = '章内タブ' }) {
  const listRef = useRef(null);

  const handleKeyDown = (e) => {
    const idx = tabs.findIndex((t) => t.key === activeKey);
    if (idx < 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(tabs[(idx + 1) % tabs.length].key);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(tabs[(idx - 1 + tabs.length) % tabs.length].key);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(tabs[0].key);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(tabs[tabs.length - 1].key);
    }
  };

  return (
    <div data-testid="chapter-tabs">
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className="ws-pane4-jp-segmented"
        style={{ marginBottom: 12 }}
      >
        {tabs.map((t) => {
          const isActive = t.key === activeKey;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`chapter-tab-panel-${t.key}`}
              id={`chapter-tab-${t.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(t.key)}
              className={isActive ? 'is-active' : ''}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span>{t.label}</span>
              {t.badge && (
                <span
                  aria-label={t.badge}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '1px 6px',
                    border: '1px solid rgba(56, 189, 248, 0.55)',
                    borderRadius: 999,
                    color: 'rgb(56, 189, 248)',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    lineHeight: 1.2,
                    background: 'rgba(56, 189, 248, 0.06)',
                  }}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`chapter-tab-panel-${activeKey}`}
        aria-labelledby={`chapter-tab-${activeKey}`}
      >
        {children[activeKey]}
      </div>
    </div>
  );
}
