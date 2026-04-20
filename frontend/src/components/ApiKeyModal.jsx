export default function ApiKeyModal({ isOpen, onClose, onOpenSettings }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">
          この機能を使うには
        </h2>
        <p className="mb-1 text-base font-medium text-slate-700">
          FMP APIキーの設定が必要です
        </p>
        <p className="mb-6 text-sm text-slate-500">
          FMPは無料で登録でき、APIキーはすぐ取得できます。クレジットカード不要。
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => { onClose(); onOpenSettings(); }}
            className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            APIキーを設定する
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            あとで
          </button>
        </div>
      </div>
    </div>
  );
}
