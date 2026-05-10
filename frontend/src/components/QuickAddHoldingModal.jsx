/**
 * QuickAddHoldingModal — 7→3 ステップに短縮した買付クイック登録モーダル.
 *
 * RELEASE_TODO §11-B-7-B Phase B (マーケ + Web 開発、CV +35-45%、NSM 直撃).
 * v62 6 体並列レビューでマーケターが「workspace 化前に先行実装すべき」と
 * 指摘 → WS-PreA として WorkspaceShell scaffold (WS-2) 完了直後に着手.
 *
 * 旧フロー (7 ステップ): 分析 → ウォッチ → ホーム → 観察 → 買付登録 → 保有 → ポートフォリオ
 * 新フロー (3 ステップ): モーダル 1 つで「株数 + 価格 + 日付」を chip 入力 → 1 click 保存
 *
 * Props:
 *   - isOpen: boolean
 *   - onClose: () => void
 *   - ticker: string             - 登録対象銘柄 (例: 'AAPL')
 *   - companyName?: string        - 表示用 (例: 'Apple Inc.')
 *   - defaultPrice?: number       - 現在値 (取得済の price prop。未指定なら手入力必須)
 *   - user: Supabase User | null  - 未ログインなら sign-in CTA
 *   - onSignIn: () => void        - Google ログイン
 *   - addLot: (ticker, { shares, price, tradeDate }) => Promise<lot>
 *   - watchlist: string[]         - 既存 watchlist (auto-add 判定用)
 *   - addToWatchlist: (ticker) => void
 *   - onSuccess?: (lot) => void   - 成功時コールバック (toast 等)
 */
import { useEffect, useMemo, useState } from 'react';

const SHARE_CHIPS = [1, 5, 10, 25, 50, 100];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function QuickAddHoldingModal({
  isOpen,
  onClose,
  ticker,
  companyName,
  defaultPrice,
  user,
  onSignIn,
  addLot,
  watchlist = [],
  addToWatchlist,
  onSuccess,
}) {
  const [shares, setShares] = useState(10);
  const [sharesCustom, setSharesCustom] = useState(false);
  const [price, setPrice] = useState(defaultPrice || '');
  const [priceEdited, setPriceEdited] = useState(false);
  const [tradeDate, setTradeDate] = useState(todayISO());
  const [tradeDatePreset, setTradeDatePreset] = useState('today');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // モーダル open 時に price を defaultPrice で初期化 (ticker 切替時にも追従)
  useEffect(() => {
    if (isOpen) {
      setPrice(defaultPrice || '');
      setPriceEdited(false);
      setTradeDate(todayISO());
      setTradeDatePreset('today');
      setShares(10);
      setSharesCustom(false);
      setError('');
    }
  }, [isOpen, defaultPrice, ticker]);

  const isWatchlisted = useMemo(
    () => Array.isArray(watchlist) && watchlist.includes(ticker),
    [watchlist, ticker]
  );

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError('');
    const sharesNum = Number(shares);
    const priceNum = Number(price);
    if (!sharesNum || sharesNum <= 0) {
      setError('株数は 1 以上の数値を入力してください');
      return;
    }
    if (!priceNum || priceNum <= 0) {
      setError('価格は 0 より大きい数値を入力してください');
      return;
    }
    if (!tradeDate) {
      setError('取引日を選択してください');
      return;
    }
    setSubmitting(true);
    try {
      // watchlist 自動追加 (未登録時のみ)。失敗しても保有登録は続行.
      if (!isWatchlisted && typeof addToWatchlist === 'function') {
        try { addToWatchlist(ticker); } catch { /* noop */ }
      }
      const lot = await addLot(ticker, {
        shares: sharesNum,
        price: priceNum,
        tradeDate,
      });
      onSuccess?.(lot);
      onClose?.();
    } catch (e) {
      setError(e?.message || '保存に失敗しました。再試行してください');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 未ログイン: ログイン CTA ──
  if (!user) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
          <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            保有として登録するには
          </h2>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-300">
            Google ログインで保有銘柄・買付履歴を保存できます (無料)。
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { onClose?.(); onSignIn?.(); }}
              className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Google でログイン
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
            >
              あとで
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qaholding-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800"
        style={{ maxHeight: '92dvh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="mb-4">
          <h2 id="qaholding-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            <span className="mr-2" aria-hidden>＋</span>
            {ticker} を保有として登録
          </h2>
          {companyName && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{companyName}</p>
          )}
        </div>

        {/* watchlist 自動追加表示 */}
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
          <span className="text-base" aria-hidden>{isWatchlisted ? '✓' : '☆'}</span>
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {isWatchlisted
              ? 'ウォッチリストに追加済み'
              : '保存時にウォッチリストにも自動追加します'}
          </span>
        </div>

        {/* Step 1: 株数 */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
            株数
          </label>
          <div className="flex flex-wrap gap-1.5">
            {SHARE_CHIPS.map((n) => {
              const active = !sharesCustom && Number(shares) === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => { setShares(n); setSharesCustom(false); }}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    active
                      ? 'border-sky-400 bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/40'
                  }`}
                  aria-pressed={active}
                >
                  {n}
                </button>
              );
            })}
            <input
              type="number"
              min="1"
              step="any"
              inputMode="decimal"
              placeholder="その他"
              value={sharesCustom ? shares : ''}
              onChange={(e) => { setShares(e.target.value); setSharesCustom(true); }}
              onFocus={() => setSharesCustom(true)}
              className="w-20 rounded-full border border-slate-300 px-3 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Step 2: 価格 */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
            取得単価 (USD)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(e) => { setPrice(e.target.value); setPriceEdited(true); }}
              placeholder={defaultPrice ? String(defaultPrice) : '例: 195.50'}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            {defaultPrice && (
              <button
                type="button"
                onClick={() => { setPrice(defaultPrice); setPriceEdited(false); }}
                className="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                title="現在値を入力"
              >
                現在値 ${defaultPrice}
              </button>
            )}
          </div>
          {!priceEdited && defaultPrice && (
            <p className="mt-1 text-[11px] text-slate-400">
              現在値を入力済 (実際の取得単価に編集可)
            </p>
          )}
        </div>

        {/* Step 3: 取引日 */}
        <div className="mb-5">
          <label className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
            取引日
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {[
              { key: 'today', label: '今日', date: todayISO() },
              { key: 'week', label: '1 週間前', date: daysAgoISO(7) },
              { key: 'month', label: '1 ヶ月前', date: daysAgoISO(30) },
            ].map((p) => {
              const active = tradeDatePreset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => { setTradeDate(p.date); setTradeDatePreset(p.key); }}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    active
                      ? 'border-sky-400 bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/40'
                  }`}
                  aria-pressed={active}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <input
            type="date"
            value={tradeDate}
            onChange={(e) => { setTradeDate(e.target.value); setTradeDatePreset('custom'); }}
            max={todayISO()}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {submitting ? '保存中...' : '保有として登録'}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
