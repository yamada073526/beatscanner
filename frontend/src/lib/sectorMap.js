/**
 * Sector mapping for Backtest universe (S&P 500 top 200)
 *
 * Phase 2.3 Sector breakdown (handover v72、 2026-05-16):
 * GICS 11 sector に基づく簡易マッピング。 frontend 専用 (backend は trade dict に sector 含まず)。
 *
 * 設計判断:
 *   - backend FMP profile call の cost 回避 (200 銘柄 × API call = rate limit pressure)
 *   - 主要 100+ 銘柄をハードコード、 未登録は 'その他' に fallback
 *   - GICS は四半期 rebalance あり、 月次 update 不要なので hardcode で十分
 *   - 将来 FMP profile endpoint 動的取得に切替時もこの map を fallback に維持
 */

export const GICS_SECTOR_LABEL = Object.freeze({
  tech: 'テクノロジー',
  comm: 'コミュニケーション',
  consumer_disc: '一般消費財',
  consumer_staples: '生活必需品',
  health: 'ヘルスケア',
  financial: '金融',
  industrial: '資本財',
  energy: 'エネルギー',
  materials: '素材',
  realestate: '不動産',
  utility: '公益',
  other: 'その他',
});

/** ticker → GICS sector key の簡易 mapping (BACKTEST_PHASE2_UNIVERSE_TOP200 の主要 100+ 銘柄) */
const SECTOR_MAP = {
  // テクノロジー (Information Technology)
  AAPL: 'tech', MSFT: 'tech', NVDA: 'tech', AVGO: 'tech', ORCL: 'tech',
  ADBE: 'tech', CRM: 'tech', CSCO: 'tech', ACN: 'tech', TXN: 'tech',
  QCOM: 'tech', AMD: 'tech', INTC: 'tech', INTU: 'tech', IBM: 'tech',
  NOW: 'tech', AMAT: 'tech', LRCX: 'tech', ADI: 'tech', KLAC: 'tech',
  MU: 'tech', SNPS: 'tech', CDNS: 'tech', ANET: 'tech', PANW: 'tech',
  FTNT: 'tech', CTSH: 'tech', MSI: 'tech', GLW: 'tech', NXPI: 'tech',
  MPWR: 'tech', TEL: 'tech', FIS: 'tech', FI: 'tech', IT: 'tech',

  // コミュニケーション (Communication Services)
  GOOGL: 'comm', GOOG: 'comm', META: 'comm', NFLX: 'comm', DIS: 'comm',
  T: 'comm', VZ: 'comm', CMCSA: 'comm', TMUS: 'comm', WBD: 'comm',
  CHTR: 'comm', EA: 'comm',

  // 一般消費財 (Consumer Discretionary)
  AMZN: 'consumer_disc', TSLA: 'consumer_disc', HD: 'consumer_disc',
  MCD: 'consumer_disc', NKE: 'consumer_disc', LOW: 'consumer_disc',
  SBUX: 'consumer_disc', BKNG: 'consumer_disc', TJX: 'consumer_disc',
  CMG: 'consumer_disc', MAR: 'consumer_disc', F: 'consumer_disc',
  GM: 'consumer_disc', ORLY: 'consumer_disc', AZO: 'consumer_disc',
  ROST: 'consumer_disc', YUM: 'consumer_disc', LULU: 'consumer_disc',

  // 生活必需品 (Consumer Staples)
  WMT: 'consumer_staples', PG: 'consumer_staples', COST: 'consumer_staples',
  KO: 'consumer_staples', PEP: 'consumer_staples', PM: 'consumer_staples',
  MO: 'consumer_staples', MDLZ: 'consumer_staples', CL: 'consumer_staples',
  TGT: 'consumer_staples', MNST: 'consumer_staples', STZ: 'consumer_staples',
  KMB: 'consumer_staples', GIS: 'consumer_staples', HSY: 'consumer_staples',
  KHC: 'consumer_staples', WBA: 'consumer_staples',

  // ヘルスケア (Health Care)
  LLY: 'health', UNH: 'health', JNJ: 'health', ABBV: 'health', MRK: 'health',
  TMO: 'health', ABT: 'health', PFE: 'health', DHR: 'health', AMGN: 'health',
  ISRG: 'health', GILD: 'health', REGN: 'health', BMY: 'health', BSX: 'health',
  CI: 'health', VRTX: 'health', MDT: 'health', ELV: 'health', SYK: 'health',
  HUM: 'health', MCK: 'health', HCA: 'health', IDXX: 'health', BIIB: 'health',
  ALGN: 'health', BAX: 'health', ZTS: 'health', EW: 'health',

  // 金融 (Financials)
  BRK_B: 'financial', 'BRK-B': 'financial', JPM: 'financial', V: 'financial',
  MA: 'financial', BAC: 'financial', WFC: 'financial', GS: 'financial',
  MS: 'financial', BLK: 'financial', AXP: 'financial', SCHW: 'financial',
  SPGI: 'financial', C: 'financial', CB: 'financial', PGR: 'financial',
  MMC: 'financial', ICE: 'financial', CME: 'financial', PNC: 'financial',
  USB: 'financial', MCO: 'financial', AON: 'financial', AJG: 'financial',
  TRV: 'financial', AIG: 'financial', AMP: 'financial', ALL: 'financial',
  MET: 'financial', PRU: 'financial', COF: 'financial', BK: 'financial',
  TFC: 'financial', STT: 'financial', TROW: 'financial', PYPL: 'financial',

  // 資本財 (Industrials)
  GE: 'industrial', CAT: 'industrial', UNP: 'industrial', RTX: 'industrial',
  HON: 'industrial', ETN: 'industrial', DE: 'industrial', BKNG_I: 'industrial',
  ITW: 'industrial', WM: 'industrial', GD: 'industrial', EMR: 'industrial',
  NOC: 'industrial', LMT: 'industrial', NSC: 'industrial', URI: 'industrial',
  FDX: 'industrial', JCI: 'industrial', CARR: 'industrial', PCAR: 'industrial',
  CTAS: 'industrial', ROP: 'industrial', OTIS: 'industrial', RSG: 'industrial',
  VRSK: 'industrial', LHX: 'industrial', PAYX: 'industrial', GWW: 'industrial',
  AME: 'industrial', EFX: 'industrial', CMI: 'industrial', MMM: 'industrial',

  // エネルギー (Energy)
  XOM: 'energy', CVX: 'energy', EOG: 'energy', SLB: 'energy', PSX: 'energy',
  WMB: 'energy', OXY: 'energy', MPC: 'energy', VLO: 'energy', KMI: 'energy',
  OKE: 'energy', FANG: 'energy',

  // 素材 (Materials)
  LIN: 'materials', SHW: 'materials', FCX: 'materials', APD: 'materials',
  ECL: 'materials', DOW: 'materials', DD: 'materials',

  // 不動産 (Real Estate)
  PLD: 'realestate', EQIX: 'realestate', WELL: 'realestate', PSA: 'realestate',
  DLR: 'realestate', CCI: 'realestate',

  // 公益 (Utilities)
  SO: 'utility', DUK: 'utility', AEP: 'utility', EXC: 'utility', D: 'utility',
  SRE: 'utility',
};

/**
 * ticker から sector key を取得 (未登録は 'other')。
 * BRK-B のような ticker の hyphen 表記揺れにも対応。
 */
export function getSector(ticker) {
  if (!ticker) return 'other';
  const t = String(ticker).toUpperCase().trim();
  return SECTOR_MAP[t] || SECTOR_MAP[t.replace('-', '_')] || 'other';
}

export function getSectorLabel(ticker) {
  return GICS_SECTOR_LABEL[getSector(ticker)];
}
