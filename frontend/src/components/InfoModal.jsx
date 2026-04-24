import { useEffect, useState } from 'react';

export default function InfoModal({ title, onClose, children }) {
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleScroll(e) {
    const el = e.currentTarget;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 10);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="閉じる"
          >
            ✕
          </button>
          <h2 className="pr-8 text-base font-bold text-slate-900">{title}</h2>
        </div>

        <div
          onScroll={handleScroll}
          className="overflow-y-auto px-5"
          style={{ maxHeight: '65vh' }}
        >
          {children}
          <div className="h-4" />
        </div>

        {!atBottom && (
          <div
            className="pointer-events-none absolute bottom-16 left-0 right-0 h-12"
            style={{ background: 'linear-gradient(transparent, white)' }}
          />
        )}

        <div className="px-5 pb-5 pt-3">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
