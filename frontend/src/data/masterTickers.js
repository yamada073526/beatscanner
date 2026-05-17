// MASTER_TICKERS frontend mirror (backend/app/tickers_master.py の port、 handover v77 user feedback)。
//
// 用途: Cmd+K palette のオートコンプリート suggestion 用。 user が「NV」 と入力したら
// 「NVDA - NVIDIA Corp」 等の候補を出して 1 タップ analyze。
//
// SSOT: backend/app/tickers_master.py。 銘柄を追加するときは両方更新。
// 将来 `/api/tickers/master` endpoint 経由に置換可能 (現状は bundle size < 3 KB なので hardcode で十分)。

export const MASTER_TICKERS = [
  // Mega cap
  { ticker: 'AAPL', name: 'Apple Inc.' },
  { ticker: 'MSFT', name: 'Microsoft Corp.' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.' },
  { ticker: 'GOOGL', name: 'Alphabet Inc. Class A' },
  { ticker: 'META', name: 'Meta Platforms Inc.' },
  { ticker: 'TSLA', name: 'Tesla Inc.' },
  { ticker: 'BRK-B', name: 'Berkshire Hathaway Class B' },
  { ticker: 'JPM', name: 'JPMorgan Chase & Co.' },
  { ticker: 'JNJ', name: 'Johnson & Johnson' },
  // NASDAQ100 主要
  { ticker: 'AVGO', name: 'Broadcom Inc.' },
  { ticker: 'ORCL', name: 'Oracle Corp.' },
  { ticker: 'ADBE', name: 'Adobe Inc.' },
  { ticker: 'COST', name: 'Costco Wholesale Corp.' },
  { ticker: 'AMD',  name: 'Advanced Micro Devices' },
  { ticker: 'QCOM', name: 'Qualcomm Inc.' },
  { ticker: 'INTC', name: 'Intel Corp.' },
  { ticker: 'NFLX', name: 'Netflix Inc.' },
  { ticker: 'PYPL', name: 'PayPal Holdings Inc.' },
  { ticker: 'SBUX', name: 'Starbucks Corp.' },
  // 宇宙・防衛
  { ticker: 'RKLB', name: 'Rocket Lab USA' },
  { ticker: 'LUNR', name: 'Intuitive Machines' },
  { ticker: 'ASTS', name: 'AST SpaceMobile' },
  { ticker: 'RDW',  name: 'Redwire Corp.' },
  { ticker: 'MNTS', name: 'Momentus Inc.' },
  { ticker: 'LMT',  name: 'Lockheed Martin' },
  { ticker: 'RTX',  name: 'RTX Corp.' },
  { ticker: 'NOC',  name: 'Northrop Grumman' },
  { ticker: 'BA',   name: 'Boeing Co.' },
  { ticker: 'GD',   name: 'General Dynamics' },
  // AI・半導体
  { ticker: 'ARM',  name: 'Arm Holdings' },
  { ticker: 'SMCI', name: 'Super Micro Computer' },
  { ticker: 'MRVL', name: 'Marvell Technology' },
  { ticker: 'ALAB', name: 'Astera Labs' },
  { ticker: 'TSM',  name: 'TSMC' },
  { ticker: 'ASML', name: 'ASML Holding' },
  { ticker: 'KLAC', name: 'KLA Corp.' },
  { ticker: 'LRCX', name: 'Lam Research' },
  { ticker: 'AMAT', name: 'Applied Materials' },
  { ticker: 'MU',   name: 'Micron Technology' },
  // エネルギー
  { ticker: 'XOM',  name: 'Exxon Mobil' },
  { ticker: 'CVX',  name: 'Chevron Corp.' },
  { ticker: 'COP',  name: 'ConocoPhillips' },
  { ticker: 'PBR',  name: 'Petrobras' },
  { ticker: 'OXY',  name: 'Occidental Petroleum' },
  { ticker: 'SLB',  name: 'SLB (Schlumberger)' },
  { ticker: 'HAL',  name: 'Halliburton Co.' },
  { ticker: 'DVN',  name: 'Devon Energy' },
  { ticker: 'KOS',  name: 'Kosmos Energy' },
  { ticker: 'VG',   name: 'Venture Global' },
  // バイオ・ヘルス
  { ticker: 'LLY',  name: 'Eli Lilly & Co.' },
  { ticker: 'NVO',  name: 'Novo Nordisk' },
  { ticker: 'ABBV', name: 'AbbVie Inc.' },
  { ticker: 'MRK',  name: 'Merck & Co.' },
  { ticker: 'PFE',  name: 'Pfizer Inc.' },
  { ticker: 'AMGN', name: 'Amgen Inc.' },
  { ticker: 'GILD', name: 'Gilead Sciences' },
  { ticker: 'BIIB', name: 'Biogen Inc.' },
  { ticker: 'REGN', name: 'Regeneron Pharmaceuticals' },
  { ticker: 'VRTX', name: 'Vertex Pharmaceuticals' },
  // 金融
  { ticker: 'GS',   name: 'Goldman Sachs' },
  { ticker: 'MS',   name: 'Morgan Stanley' },
  { ticker: 'BAC',  name: 'Bank of America' },
  { ticker: 'WFC',  name: 'Wells Fargo' },
  { ticker: 'C',    name: 'Citigroup' },
  { ticker: 'V',    name: 'Visa Inc.' },
  { ticker: 'MA',   name: 'Mastercard Inc.' },
  { ticker: 'AXP',  name: 'American Express' },
  { ticker: 'BX',   name: 'Blackstone Inc.' },
  { ticker: 'KKR',  name: 'KKR & Co.' },
  // 中小型・ミーム・注目
  { ticker: 'PLTR', name: 'Palantir Technologies' },
  { ticker: 'HOOD', name: 'Robinhood Markets' },
  { ticker: 'SOFI', name: 'SoFi Technologies' },
  { ticker: 'UPST', name: 'Upstart Holdings' },
  { ticker: 'RIVN', name: 'Rivian Automotive' },
  { ticker: 'LCID', name: 'Lucid Group' },
  { ticker: 'MSTR', name: 'MicroStrategy' },
  { ticker: 'COIN', name: 'Coinbase Global' },
  { ticker: 'GME',  name: 'GameStop Corp.' },
];

const _MAP = new Map(MASTER_TICKERS.map((t) => [t.ticker, t.name]));

export function getMasterTickerName(ticker) {
  return _MAP.get((ticker || '').toUpperCase()) || null;
}

/**
 * prefix / contains match で master ticker 候補を返す (Cmd+K オートコンプリート用)。
 *
 * @param {string} query 入力文字列 (空なら []、 1+ 文字でフィルタ)
 * @param {number} limit 最大件数 (default 6)
 * @returns {{ticker, name}[]} prefix match を優先、 contains match で fallback
 */
export function searchMasterTickers(query, limit = 6) {
  const q = (query || '').trim().toUpperCase();
  if (!q) return [];
  const prefix = [];
  const contains = [];
  for (const t of MASTER_TICKERS) {
    if (t.ticker.startsWith(q) || t.name.toUpperCase().startsWith(q)) {
      prefix.push(t);
    } else if (t.ticker.includes(q) || t.name.toUpperCase().includes(q)) {
      contains.push(t);
    }
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...contains].slice(0, limit);
}
