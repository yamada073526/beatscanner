/**
 * WorkspaceScreenerModal — Cup-Handle / 5 条件 scanner を workspace 内で開く modal.
 *
 * v120 Sprint 3 (multi-review 6 体合議 verdict 反映):
 *   - P6 で Pane 4 削除 → workspace mode から CustomScreenerPanel への access が断絶していた問題を fix
 *   - WorkspaceHeader「スクリーナー」 button click から起動 (Pro user 限定、 非 Pro は ProTeaser)
 *   - portal + position:fixed inset:0 で body 直下に render (z-index var(--z-modal))
 *   - Esc / backdrop / × で close
 *   - body scroll lock (open 中)
 *   - a11y: role="dialog" + aria-modal + initial focus on close button + focus restore on close
 *   - CustomScreenerPanel は App.jsx で既に lazy 済 → chunk reuse (重複 lazy 回避、 Frontend Hint 2)
 *   - useArrivalSpotlight 必須 (Marketer A-5 magic moment)
 *
 * 銘柄選択 (onSelect): close() を先に呼んでから setActiveTicker(sym)
 *   (QA D4 + Amendment: modal unmount 後に ticker 変化で Pane 3 mount が見えやすい)
 */
import { useEffect, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import { useArrivalSpotlight } from '../../hooks/useArrivalSpotlight.js';

// App.jsx で既に lazy 化済の同モジュール、 chunk reuse される (Vite モジュールキャッシュ)
const CustomScreenerPanel = lazy(() => import('../../components/CustomScreenerPanel.jsx'));

export default function WorkspaceScreenerModal({ isOpen, onClose }) {
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  const setPane3JudgmentOverride = useWorkspaceStore((s) => s.setPane3JudgmentOverride);
  const closeBtnRef = useRef(null);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);

  // open 時に Aman 級 magic moment (Sprint 3 必須化、 Marketer A-5)
  useArrivalSpotlight([isOpen]);

  // initial focus + focus restore + scroll lock
  useEffect(() => {
    if (!isOpen) return;
    // 起動元 element を記録 (close 後に focus 復元)
    triggerRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    // body scroll lock
    if (typeof document !== 'undefined') {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      // initial focus to close button (a11y)
      setTimeout(() => closeBtnRef.current?.focus(), 0);
      return () => {
        document.body.style.overflow = prev;
        // 起動元へ focus 復元
        try { triggerRef.current?.focus?.(); } catch { /* noop */ }
      };
    }
  }, [isOpen]);

  // Esc key + focus trap (Frontend verdict mandatory fix 1)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // Shift+Tab: 先頭で last へ wrap、 Tab: 末尾で first へ wrap
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleSelect = (sym) => {
    // QA D4 Amendment: close を先に呼んでから ticker 設定 (modal unmount → Pane 3 mount 順)
    onClose();
    // 指数 tab だと Pane 3 が IndicesView になっているので judgment override も併用
    setActiveTicker(sym);
    setPane3JudgmentOverride(true);
  };

  return createPortal(
    <div
      role="presentation"
      onClick={(e) => {
        // backdrop click で close (modal 中身の click は stopPropagation で防ぐ)
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal, 1000)',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: 'workspaceScreenerFadeIn var(--motion-base, 200ms) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1))',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-screener-title"
        data-testid="workspace-screener-modal"
        className="ds-workspace-screener-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-subtle, rgba(0,0,0,0.02))',
            flexShrink: 0,
          }}
        >
          <h2
            id="workspace-screener-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.005em',
            }}
          >
            銘柄スクリーナー
            <span
              style={{
                marginLeft: 10,
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-muted)',
                letterSpacing: 0,
              }}
            >
              Cup-Handle × ファンダ 5 条件
            </span>
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            data-testid="workspace-screener-close"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm, 8px)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(56,189,248,0.10)';
              e.currentTarget.style.borderColor = 'rgba(56,189,248,0.30)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* Body — overflow auto */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 18,
          }}
        >
          <Suspense
            fallback={
              <div
                style={{
                  padding: '32px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                読み込み中...
              </div>
            }
          >
            <CustomScreenerPanel
              data-testid="workspace-screener-panel"
              onSelect={handleSelect}
            />
          </Suspense>
        </div>
      </div>

    </div>,
    document.body
  );
}
