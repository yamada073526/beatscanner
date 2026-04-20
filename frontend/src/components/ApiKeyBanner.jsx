import { useState } from 'react';

// hasKey is driven by App.jsx state (updated immediately on save).
// Do NOT call hasFmpKey() here — that would require a re-render trigger from parent.
export default function ApiKeyBanner({ onOpenSettings, hasKey }) {
  const [dismissed, setDismissed] = useState(false);

  if (hasKey || dismissed) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <span className="text-sm text-amber-800">
        ⚡ FMP APIキーを設定するとすべての銘柄が無制限に使えます
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onOpenSettings}
          className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
        >
          今すぐ設定する →
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-400 hover:text-amber-600"
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
