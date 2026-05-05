// 主要銘柄の ticker → TradingView 会社名 slug マッピング
// TradingView の高品質 SVG ロゴ URL: https://s3-symbol-logo.tradingview.com/{slug}--big.svg
// このマップに無い銘柄は CompanyLogo 側で FMP image-stock に fallback、
// それも失敗時は頭文字グラデ円に fallback。

export const TICKER_TV_SLUGS = {
  // ── メガキャップ ───────────────────────────────
  AAPL: 'apple',
  MSFT: 'microsoft',
  GOOGL: 'google',
  GOOG: 'google',
  AMZN: 'amazon',
  META: 'meta-platforms',
  NVDA: 'nvidia',
  TSLA: 'tesla',
  AVGO: 'broadcom',

  // ── 半導体 ─────────────────────────────────────
  AMD: 'amd',
  INTC: 'intel',
  TSM: 'tsmc',
  ASML: 'asml',
  QCOM: 'qualcomm',
  TXN: 'texas-instruments',
  MU: 'micron-technology',
  AMAT: 'applied-materials',
  LRCX: 'lam-research',
  KLAC: 'kla-corp',
  ARM: 'arm-holdings',
  ON: 'onsemi',
  MRVL: 'marvell-technology',
  ADI: 'analog-devices',
  MCHP: 'microchip-technology',
  NXPI: 'nxp-semiconductors',

  // ── 金融 ───────────────────────────────────────
  JPM: 'jpmorgan-chase',
  BAC: 'bank-of-america',
  WFC: 'wells-fargo',
  C: 'citigroup',
  GS: 'goldman-sachs',
  MS: 'morgan-stanley',
  BLK: 'blackrock',
  AXP: 'american-express',
  V: 'visa',
  MA: 'mastercard',
  PYPL: 'paypal',
  SCHW: 'charles-schwab',
  COF: 'capital-one',

  // ── ヘルスケア ─────────────────────────────────
  UNH: 'unitedhealth',
  JNJ: 'johnson-johnson',
  LLY: 'eli-lilly',
  PFE: 'pfizer',
  MRK: 'merck',
  ABBV: 'abbvie',
  TMO: 'thermo-fisher-scientific',
  ABT: 'abbott',
  DHR: 'danaher',
  BMY: 'bristol-myers-squibb',
  AMGN: 'amgen',
  GILD: 'gilead-sciences',
  CVS: 'cvs-health',
  ELV: 'elevance-health',
  ISRG: 'intuitive-surgical',
  REGN: 'regeneron',
  VRTX: 'vertex-pharmaceuticals',
  MDT: 'medtronic',
  SYK: 'stryker',
  BSX: 'boston-scientific',
  ZTS: 'zoetis',

  // ── 消費財・小売 ───────────────────────────────
  WMT: 'walmart',
  COST: 'costco',
  HD: 'home-depot',
  LOW: 'lowes',
  TGT: 'target',
  PG: 'procter-gamble',
  KO: 'coca-cola',
  PEP: 'pepsico',
  MCD: 'mcdonalds',
  SBUX: 'starbucks',
  NKE: 'nike',
  DIS: 'walt-disney',
  CMCSA: 'comcast',
  NFLX: 'netflix',
  EBAY: 'ebay',
  ETSY: 'etsy',
  ABNB: 'airbnb',
  BKNG: 'booking-holdings',
  MAR: 'marriott',
  HLT: 'hilton',
  CMG: 'chipotle',
  YUM: 'yum-brands',
  DPZ: 'dominos-pizza',
  LULU: 'lululemon',
  BABA: 'alibaba',
  PDD: 'pinduoduo',

  // ── テック・ソフトウェア ───────────────────────
  ORCL: 'oracle',
  CRM: 'salesforce',
  ADBE: 'adobe',
  NOW: 'servicenow',
  IBM: 'ibm',
  CSCO: 'cisco',
  INTU: 'intuit',
  PANW: 'palo-alto-networks',
  SNOW: 'snowflake',
  PLTR: 'palantir',
  CRWD: 'crowdstrike',
  NET: 'cloudflare',
  DDOG: 'datadog',
  ZS: 'zscaler',
  MDB: 'mongodb',
  TEAM: 'atlassian',
  WDAY: 'workday',
  HUBS: 'hubspot',
  DOCU: 'docusign',
  ZM: 'zoom',
  OKTA: 'okta',
  TWLO: 'twilio',
  SHOP: 'shopify',
  SQ: 'block',
  COIN: 'coinbase',
  RBLX: 'roblox',
  U: 'unity-software',
  DASH: 'doordash',
  UBER: 'uber',
  LYFT: 'lyft',
  PINS: 'pinterest',
  SNAP: 'snap',
  SPOT: 'spotify',
  ROKU: 'roku',

  // ── 通信・メディア ─────────────────────────────
  T: 'at-t',
  VZ: 'verizon',
  TMUS: 't-mobile-us',
  CHTR: 'charter-communications',
  WBD: 'warner-bros-discovery',
  PARA: 'paramount-global',

  // ── エネルギー ─────────────────────────────────
  XOM: 'exxon-mobil',
  CVX: 'chevron',
  COP: 'conocophillips',
  SLB: 'schlumberger',
  EOG: 'eog-resources',
  PSX: 'phillips-66',
  MPC: 'marathon-petroleum',
  OXY: 'occidental-petroleum',
  HAL: 'halliburton',

  // ── 産業・運輸 ─────────────────────────────────
  CAT: 'caterpillar',
  DE: 'deere',
  BA: 'boeing',
  HON: 'honeywell',
  GE: 'ge-aerospace',
  RTX: 'rtx',
  LMT: 'lockheed-martin',
  UPS: 'united-parcel-service',
  FDX: 'fedex',
  UNP: 'union-pacific',
  CSX: 'csx',
  NSC: 'norfolk-southern',
  DAL: 'delta-air-lines',
  UAL: 'united-airlines',
  AAL: 'american-airlines',
  LUV: 'southwest-airlines',

  // ── 素材・REIT ─────────────────────────────────
  LIN: 'linde',
  APD: 'air-products-chemicals',
  AMT: 'american-tower',
  PLD: 'prologis',
  EQIX: 'equinix',
  CCI: 'crown-castle',

  // ── 中国・ADR ──────────────────────────────────
  JD: 'jd-com',
  BIDU: 'baidu',
  NIO: 'nio',
  XPEV: 'xpeng',
  LI: 'li-auto',

  // ── 日本 ADR ───────────────────────────────────
  TM: 'toyota',
  SONY: 'sony-group',
  HMC: 'honda',

  // ── 主要 ETF ───────────────────────────────────
  SPY: 'spdr-sp-500-etf-trust',
  VOO: 'vanguard-sp-500-etf',
  VTI: 'vanguard-total-stock-market-etf',
  QQQ: 'invesco-qqq-trust',
  DIA: 'spdr-dow-jones-industrial-average-etf',
  IWM: 'ishares-russell-2000-etf',
  ARKK: 'ark-innovation-etf',

  // ── その他注目 ──────────────────────────────────
  MELI: 'mercadolibre',
  TTD: 'trade-desk',
  CDNS: 'cadence-design-systems',
  SNPS: 'synopsys',
  FTNT: 'fortinet',
  ANET: 'arista-networks',
  AVGO_alt: 'broadcom',
};

// ティッカー（"BRK.B" 等のドット入り）正規化キー
function normalize(ticker) {
  if (!ticker) return '';
  return ticker.toUpperCase().replace(/[.\-]/g, '_');
}

export function getTickerTvSlug(ticker) {
  return TICKER_TV_SLUGS[normalize(ticker)] || null;
}
