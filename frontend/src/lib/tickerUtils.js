/**
 * tickerUtils — ticker 判定ユーティリティ (C-3 競合ナビ breadcrumb で新設)
 *
 * 元実装は StockPriceChart.jsx:370 に inline 定義していたが、
 * workspaceStore.pushDetailHistory のガード + DetailBreadcrumb で共用するため切り出し。
 * 将来的に isNonEquityTicker を参照する箇所が増える場合は本ファイルに追加する。
 */

/** 非株式 ticker の exact-match set (StockPriceChart.jsx と同期) */
const NON_EQUITY_TICKERS = new Set([
  '^GSPC', '^IXIC', '^DJI', '^VIX', '^TNX', 'DX-Y.NYB', 'CL=F', 'JPY=X',
]);

/**
 * 指数 (^) / 先物 (=F) / 為替 (=X) / DXY 等の非株式 ticker かどうかを判定する。
 * '.' を含む class share (BRK.B 等) を誤検知しないため '.' は判定に使わない。
 *
 * @param {string | null | undefined} ticker
 * @returns {boolean}
 */
export function isNonEquityTicker(ticker) {
  if (!ticker) return false;
  const t = String(ticker).toUpperCase().trim();
  if (!t) return false;
  if (NON_EQUITY_TICKERS.has(t)) return true;
  return t.startsWith('^') || t.endsWith('=F') || t.endsWith('=X');
}
