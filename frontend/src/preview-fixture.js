/**
 * preview-fixture.js — AI 図解 (DiagramCard) 視覚検証ハーネス用の固定モックデータ。
 *
 * ## 目的
 * AI 図解は本番では Premium gate + 要ログインで headless 描画できない。
 * そこで DiagramCard を単体でレンダーする preview ビルド (vite.preview.config.mjs) に
 * このモック data prop を渡し、 改修のたびに snap-diagram.mjs で screenshot を撮って
 * デザインを目視検証する (デプロイ + dogfood 不要)。
 *
 * ## データの性質
 * - これは「開発ハーネス専用」のモックであり、 本番 user には一切表示されない。
 *   数値は MSFT を模した realistic な近似値 (デザイン検証のための見栄え用)。
 * - DiagramCard 内の sanitizeDiagramData (blocklist) を通過するよう、
 *   narrative は §38 / 景表法 safe な定性記述に留める (断定的将来予測 / 最上級を含めない)。
 * - data prop の形状は visualize endpoint レスポンスと 1:1 (DiagramCard が参照する全 field 網羅)。
 *
 * ## 全 section 網羅
 * Round 2 デザイン (IA 変更 A / sub-caption B / 締めカード C / chip pill D) を
 * 全 section で目視検証できるよう、 表示トリガーを満たす field を全て埋めてある:
 *   headline / summary / 5条件 / valuation / dividend / businessFlowSteps /
 *   segmentSummary / capitalReturn / guidanceExtracted(transcript) / trends +
 *   operatingMargins / gaapAdjustment / fcfTrend + capexTrend / strengths + risks /
 *   investorQuestions + bullCase + bearCase / material_facts(出典footer)
 *
 * memory anchor: handover v152 Step 1 (視覚ハーネス) / [[feedback_pane_error_boundary]] (MotionProvider 必須)
 */

export const DIAGRAM_FIXTURE = {
  // ── Section 1: ヘッダー / 判定 ──────────────────────────────────────────
  companyName: 'Microsoft Corporation',
  period: 'FY2024 Q3',
  overallPass: true,
  verdict: 'pass',
  passCount: 4,
  totalCount: 5,
  headline: 'クラウドが牽引する増収増益、5条件中4つを満たす',
  summary:
    'Azure を中心とした Intelligent Cloud が二桁成長を続け、5四半期連続でアナリスト予想を上回った。営業利益率も改善が続き、財務は堅牢。一方で株価バリュエーションは過去レンジの上限付近にあり、割安度の条件のみ満たさなかった。',

  conditions: [
    { pass: true, name: '増収率 (Good Growth)', detail: '売上は前年同期比 +17%。Azure が +31% と全社を牽引。' },
    { pass: true, name: '利益の持続力 (Durability)', detail: '営業利益率 44.6%、5期連続で改善。サブスク比率の高さが安定性を担保。' },
    { pass: true, name: '財務健全性 (Financials)', detail: 'ネットキャッシュ潤沢、FCF マージン 30% 超。負債依存度は低い。' },
    { pass: true, name: '予想超過の実績 (Beat History)', detail: '直近 5 四半期すべてで EPS がアナリスト予想を上回った。' },
    { pass: false, name: '割安度 (Valuation)', detail: 'PER 35 倍、PEG 2.1。過去 5 年レンジの上限付近で割高圏。' },
  ],

  // ── Section: バリュエーション ───────────────────────────────────────────
  valuation: {
    dataSource: 'FMP TTM',
    per: 35.2,
    perJudge: '割高',
    pbr: 12.4,
    pbrJudge: '割高',
    psr: 13.1,
    psrJudge: '割高',
    evEbitda: 25.6,
    evEbitdaJudge: '中立',
    peg: 2.1,
    pegJudge: '割高',
  },
  dividend: {
    yield: 0.72,
    buyback: true,
  },

  // ── Section: ビジネスモデル ─────────────────────────────────────────────
  businessFlowSteps: [
    { label: 'クラウド基盤', detail: 'Azure / データセンター投資' },
    { label: 'ソフトウェア', detail: 'Microsoft 365 / Dynamics' },
    { label: '法人・個人へ提供', detail: 'サブスク + ライセンス' },
    { label: '継続課金収益', detail: '高マージンの反復売上' },
  ],

  // ── Section: セグメント別売上 ───────────────────────────────────────────
  segmentSummary: {
    date: '2024 Q3',
    segments: [
      { name: 'Intelligent Cloud', value_b: 28.5, yoy_pct: 20.4 },
      { name: 'Productivity and Business Processes', value_b: 28.3, yoy_pct: 11.8 },
      { name: 'More Personal Computing', value_b: 15.6, yoy_pct: 16.9 },
    ],
  },

  // ── Section: 資本政策 ───────────────────────────────────────────────────
  capitalReturnDataAvailable: true,
  capitalReturn: {
    dividend: {
      latestAmount: 0.75,
      latestDate: '2024-05-16',
      trend: 'increase',
    },
    buyback: {
      latestQAmountB: 4.2,
      latestQDate: '2024-03-31',
      trailingTTMAmountB: 17.6,
    },
  },

  // ── Section: 次Qガイダンス (transcript narrative-only, MSFT canary style) ──
  guidanceExtractedAvailable: true,
  guidanceExtracted: {
    source_type: 'transcript',
    source_label: 'FY24 Q3 Earnings Call',
    narrative_only: true,
    narrative_jp:
      '経営陣は決算説明会で、Azure の需要拡大に対応するためデータセンター投資（capex）を当面は高い水準で継続する方針を示した。営業費用の伸びは売上の伸びを下回る範囲で管理する考えを説明しており、利益率は前年同期との比較で底堅く推移するとの見方を述べている。',
    source_quote:
      'We expect capital expenditures to increase materially on a sequential basis driven by cloud and AI infrastructure investments. We remain committed to driving operating leverage as revenue growth outpaces the growth in operating expenses.',
    source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=MSFT',
    extraction_confidence: 'high',
    q_revenue: null,
    q_margin: null,
    fy_revenue: null,
    fy_margin: null,
  },
  consensusSource: 'アナリスト予想: FMP コンセンサス',

  // ── Section: 決算後株価反応 (v154 FMP③、 compute_reaction の過去8Q event study) ──
  earningsReaction: {
    avgBeatReturnPct: 2.1,
    avgMissReturnPct: -6.4,
    avgInlineReturnPct: -0.3,
    beatCount: 5,
    missCount: 2,
  },

  // ── Section: アナリスト予想 (v154 FMP②、 build_analyst_view の §38-safe 数値) ──
  analystConsensus: {
    currentPrice: 430,
    targetRange: { median: 480, high: 560, low: 400, mean: 482, count: 32 },
    ratingConsensus: 'bullish',
    ratingDistribution: { buy: 24, hold: 7, sell: 1, total: 32 },
    recentChanges: { upgrades: 5, downgrades: 1, window_days: 90 },
    sources: { price_target: 'ok', grades: 'ok', analyst_estimates: 'ok' },
  },

  // ── Section: 成長トレンド (売上高 + EPS + CFPS) ─────────────────────────
  epsSourceNote: 'Non-GAAP',
  trends: [
    {
      metric: '売上高',
      unit: '$B',
      data: [
        { period: 'FY2020', value: 143.0, beat: null, beatMargin: null },
        { period: 'FY2021', value: 168.1, beat: null, beatMargin: null },
        { period: 'FY2022', value: 198.3, beat: true, beatMargin: 1.4 },
        { period: 'FY2023', value: 211.9, beat: true, beatMargin: 0.9 },
        { period: 'FY2024', value: 245.1, beat: true, beatMargin: 2.1 },
      ],
    },
    {
      metric: 'EPS',
      unit: '$',
      epsType: 'Non-GAAP',
      data: [
        { period: 'FY2020', value: 5.76, beat: null, beatMargin: null },
        { period: 'FY2021', value: 8.05, beat: null, beatMargin: null },
        { period: 'FY2022', value: 9.65, beat: true, beatMargin: 2.3 },
        { period: 'FY2023', value: 9.81, beat: true, beatMargin: 3.0 },
        { period: 'FY2024', value: 11.80, beat: true, beatMargin: 4.2 },
      ],
    },
    {
      metric: 'CFPS',
      unit: '$',
      data: [
        { period: 'FY2020', value: 8.20, beat: null, beatMargin: null },
        { period: 'FY2021', value: 10.45, beat: null, beatMargin: null },
        { period: 'FY2022', value: 11.20, beat: null, beatMargin: null },
        { period: 'FY2023', value: 11.95, beat: null, beatMargin: null },
        { period: 'FY2024', value: 14.10, beat: null, beatMargin: null },
      ],
    },
  ],
  operatingMargins: [
    { value: 37.0 },
    { value: 41.6 },
    { value: 42.0 },
    { value: 41.8 },
    { value: 44.6 },
  ],
  gaapAdjustment: {
    nonGaapEps: 11.80,
    sbcAdjustment: 1.05,
    otherAdjustment: 0.30,
    gaapEps: 11.45,
  },

  // ── Section: FCF / CapEx ────────────────────────────────────────────────
  fcfDataAvailable: true,
  fcfYield: 2.4,
  fcfTrend: [
    { period: 'FY2020', value: 45.2 },
    { period: 'FY2021', value: 56.1 },
    { period: 'FY2022', value: 65.1 },
    { period: 'FY2023', value: 59.5 },
    { period: 'FY2024', value: 74.1 },
  ],
  capexTrend: [
    { period: 'FY2020', value: 15.4 },
    { period: 'FY2021', value: 20.6 },
    { period: 'FY2022', value: 23.9 },
    { period: 'FY2023', value: 28.1 },
    { period: 'FY2024', value: 44.5 },
  ],

  // ── Section: 強み・リスク ───────────────────────────────────────────────
  strengths: [
    'Azure のシェア拡大とAI関連需要が高成長を支えている',
    'Microsoft 365 のサブスクリプション比率が高く、売上の反復性が強い',
    '潤沢なネットキャッシュと高い FCF マージンで投資余力が大きい',
  ],
  risks: [
    'データセンター投資の急増で短期的にフリーキャッシュフローが圧迫される可能性',
    '株価バリュエーションが過去レンジ上限にあり、調整余地が残る',
    '大規模買収・AI を巡る規制当局の監視が強まっている',
  ],

  // ── Section: 投資家への問い / ブル・ベア ──────────────────────────────────
  investorQuestions: [
    { angle: '収益性', question: 'AI インフラ投資の増加局面でも営業レバレッジを維持できるか？' },
    { angle: '資本効率', question: '高水準の capex は数年後にどの程度の売上・利益として回収されるのか？' },
  ],
  bullCase: [
    'Azure と Copilot の普及が法人サブスクの単価上昇につながる余地',
    'クラウド・AI の構造的な需要拡大が中期の増収を下支え',
  ],
  bearCase: [
    'capex 先行により FCF 成長が一時的に鈍化する局面が続く可能性',
    'バリュエーションが高く、成長鈍化が観測されれば株価の変動が大きくなりやすい',
  ],

  // ── 出典 footer (DiagramCitation) ──────────────────────────────────────
  degraded_mode: false,
  material_facts: [
    {
      fact: 'FY2024 Q3 売上は前年同期比 +17%、Azure は +31%',
      source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=MSFT',
      confidence: 'high',
    },
    {
      fact: '営業利益率 44.6%、5期連続で改善',
      source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=MSFT',
      confidence: 'high',
    },
    {
      fact: '次四半期の capex を高水準で継続する方針 (決算説明会)',
      source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=MSFT',
      confidence: 'high',
    },
  ],
};

export default DIAGRAM_FIXTURE;
