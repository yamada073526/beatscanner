// ─────────────────────────────────────────────────────────────────────────────
// indicesViewUtils.js — IndicesView の React 非依存 定数 + 純粋ヘルパ層。
//
// IndicesView.jsx から物理抽出した「指標 Tier 定義 / 期間マッピング / category token /
// 数値・通貨・日付 format ヘルパ」。JSX/hooks 非依存・外部 import 不要 (完全自立)。
// Portfolio / 指標 row / 経済カレンダー の表示計算に使う純粋層。
// ─────────────────────────────────────────────────────────────────────────────

// §dogfood-round11: IndicesRow / Header 共通の期間 → 営業日数マッピング
export const PERIOD_DAYS = { '1d': 2, '1w': 5, '1m': 21, '6m': 126, '1y': 252 };

// MarketStripCompact と同じ Tier 1 8 指標 (順序固定)
// v65 §4-B-1: 日本語の内容解説 (desc) を併記。row 2 行表示の secondary line に使用。
export const TIER1 = [
  { sym: '^GSPC', label: 'S&P 500', desc: '米大型株 500 銘柄の代表指数' },
  { sym: '^IXIC', label: 'NASDAQ', desc: 'ハイテク中心のナスダック総合' },
  { sym: '^DJI', label: 'DOW', desc: 'ダウ平均（米大型 30 銘柄）' },
  { sym: '^VIX', label: 'VIX', desc: 'S&P 500 オプション恐怖指数' },
  { sym: 'DX-Y.NYB', label: 'DXY', desc: 'ドル全体の強弱（主要 6 通貨）' },
  { sym: '^TNX', label: '10Y', desc: '米 10 年国債利回り' },
  { sym: 'CL=F', label: 'WTI', desc: 'WTI 原油先物（エネルギー基準）' },
  { sym: 'JPY=X', label: 'USD/JPY', desc: 'ドル円為替レート' },
];
export const TIER1_SYMS = new Set(TIER1.map((t) => t.sym));
// v146 D: 指数/先物/為替シンボル (^GSPC 等) はニュース API が空を返す → fetch 用に news-able な
//   proxy ETF へ振り替える (表示は指数ラベルのまま)。 TIER2 は実 ETF なので mapping 不要。
export const INDEX_NEWS_PROXY = {
  '^GSPC': 'SPY',     // S&P 500 → SPY
  '^IXIC': 'QQQ',     // NASDAQ → QQQ
  '^DJI': 'DIA',      // DOW → DIA
  '^VIX': 'SPY',      // VIX (S&P ボラ) → 市場全体ニュースで代替
  'DX-Y.NYB': 'UUP',  // ドル指数 → ドル ETF
  '^TNX': 'TLT',      // 米 10Y 利回り → 米国債 ETF
  'CL=F': 'USO',      // WTI 原油 → 原油 ETF
  'JPY=X': 'FXY',     // USD/JPY → 円 ETF
};
// §dogfood-世界市場: Tier 1 以外の 22 指標 (= 旧「世界市場」) も同 endpoint から取得し
// この tab で Tier 1 + 世界市場 の 2 group 表示.
// §dogfood-round12: Tier 2 順序は frontend で明示制御 (backend 順は QQQ→SPY だが、
// S&P 500 が NASDAQ より上の Tier 1 順序と整合させ SPY を先頭に).
// 未定義 symbol は配列末尾へ。
// v65 §4-B-1 Phase 1: 6 → 12 拡張 (米セクター 4 + 半導体 + 新興国)。
// v65 §4-B-1 Phase 2: 12 → 18 拡張 (yield curve / break-even / credit 3 層 / DM-EM / 金鉱 / spot BTC)。
export const TIER2_ORDER = [
  'SPY', 'QQQ', 'IWM',          // 米コア (大型 / ハイテク / 小型)
  'XLK', 'XLF', 'XLE', 'XLV',   // 米セクター 4
  'SOXX',                        // 半導体テーマ
  'EEM', 'EFA',                  // 海外 (新興国 + 先進国除く米)
  'GLD', 'GDX',                  // 金 (現物 + 鉱株)
  'TLT', 'IEF', 'TIP',          // 米国債 (長期 + 中期 + インフレ連動)
  'HYG', 'LQD',                  // クレジット (HY + IG)
  'IBIT',                        // 仮想通貨 (現物 BTC ETF)
];

// v147 (P2-A、 user 承認): 指数/ETF を資産クラスで色 dot 分類 (Pane 2)。 色は CSS token (--cat-*、 予約色不使用)。
export const INDEX_CATEGORY_TOKEN = {
  // 株式 (指数/セクター/海外) = slate
  '^GSPC': '--cat-equity', '^IXIC': '--cat-equity', '^DJI': '--cat-equity',
  'SPY': '--cat-equity', 'QQQ': '--cat-equity', 'IWM': '--cat-equity',
  'XLK': '--cat-equity', 'XLF': '--cat-equity', 'XLE': '--cat-equity', 'XLV': '--cat-equity',
  'SOXX': '--cat-equity', 'EEM': '--cat-equity', 'EFA': '--cat-equity',
  // 金利/債券/クレジット = indigo
  '^TNX': '--cat-rate', 'TLT': '--cat-rate', 'IEF': '--cat-rate', 'TIP': '--cat-rate',
  'HYG': '--cat-rate', 'LQD': '--cat-rate',
  // 為替 = teal
  'DX-Y.NYB': '--cat-fx', 'JPY=X': '--cat-fx',
  // 商品/金 = terracotta
  'CL=F': '--cat-commodity', 'GLD': '--cat-commodity', 'GDX': '--cat-commodity',
  // ボラ = mauve / 暗号資産 = steel
  '^VIX': '--cat-volatility',
  'IBIT': '--cat-crypto',
};
export function categoryColorVar(sym) {
  const token = INDEX_CATEGORY_TOKEN[sym];
  return token ? `var(${token})` : null;
}

// Phase A v69 §2: 期間連動 portfolio performance 用 period selector.
// SPARKLINE_PERIOD_OPTIONS と内容は同形だが、用途を分離するため別定数として持つ。
// (チャート用 sparklinePeriod と portfolio P/L 用 portfolioPeriod は workspaceStore で独立)
export const PORTFOLIO_PERIOD_OPTIONS = [
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
];

// 期間別変化率テーブル用 (RowSparkline と同じ営業日数)
export const PERIOD_TABLE = [
  { key: '1w', label: '1W', days: 5 },
  { key: '1m', label: '1M', days: 21 },
  { key: '3m', label: '3M', days: 63 },
  { key: '6m', label: '6M', days: 126 },
  { key: '1y', label: '1Y', days: 252 },
];

export function formatPrice(item) {
  if (!item || item.price == null) return '—';
  if (item.type === 'rate') return `${Number(item.price).toFixed(2)}%`;
  if (item.type === 'fx') return Number(item.price).toFixed(2);
  return Number(item.price).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatUSDCompact(n) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatSignedUSDCompact(n) {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${formatUSDCompact(Math.abs(n))}`;
}

export function formatSignedPct(n) {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function getTrendColor(n) {
  if (!Number.isFinite(n) || n === 0) return 'var(--text-muted)';
  return n > 0 ? 'var(--color-gain)' : 'var(--color-loss)';
}

// round 10 (handover v69 dogfood): Portfolio 数値の通貨表示切替 helper.
// currency='USD' で `$760K` / 'JPY' で `¥111M` のように compact 表示。
// rate は USD/JPY (USD 1 = rate JPY)、null 時は USD fallback。
export function formatCompactCurrency(value, currency = 'USD', rate = null) {
  if (!Number.isFinite(value)) return '—';
  if (currency === 'JPY' && Number.isFinite(rate) && rate > 0) {
    const jpy = value * rate;
    const abs = Math.abs(jpy);
    if (abs >= 1e8) return `¥${(jpy / 1e8).toFixed(2)}億`;
    if (abs >= 1e4) return `¥${(jpy / 1e4).toFixed(1)}万`;
    return `¥${jpy.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`;
  }
  // USD (default fallback)
  return formatUSDCompact(value);
}

export function formatSignedCompactCurrency(value, currency = 'USD', rate = null) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatCompactCurrency(Math.abs(value), currency, rate)}`;
}

export const COUNTRY_FLAG = { US: '🇺🇸', JP: '🇯🇵', EU: '🇪🇺' };

export function formatEventDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const M = d.getMonth() + 1;
  const D = d.getDate();
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${M}/${D}(${dow}) ${hh}:${mm}`;
}
