// MSFT デモ用 静的ビジュアル分析データ（トップページ初訪問者向け）
// サーバー負荷ゼロ — フロントにハードコード。Phase は complete 固定。
// 数値は FY2023〜FY2025 の実績ベース（一部はファンダメンタル判定の例として整形）

export const DEMO_TICKER = 'MSFT';

export const DEMO_VIZ_DATA = {
  ticker: 'MSFT',
  companyName: 'Microsoft Corporation',
  period: 'FY2025',
  headline: 'AI 一強の盤石収益',
  summary:
    'FY2025 売上 $282B（YoY +15%）。Azure / Copilot を起点に営業利益率は 45% 超へ拡大。EPS も二桁成長を継続し、ファンダメンタル主要4条件をクリア。',
  overallPass: true,
  passCount: 5,
  totalCount: 6,
  conditions: [
    { name: '売上 YoY +10%以上', pass: true,  detail: '+15% (Azure クラウド需要)' },
    { name: 'EPS YoY +10%以上', pass: true,  detail: '+16%' },
    { name: 'EPS Beat',          pass: true,  detail: 'コンセンサス +3.2%' },
    { name: '売上 Beat',          pass: true,  detail: 'コンセンサス +2.1%' },
    { name: 'ガイダンス上方修正', pass: true,  detail: '次Q売上ガイダンス +12%' },
    { name: 'PER 妥当性',         pass: false, detail: 'PER 35x（IT平均比 +25%）' },
  ],

  businessFlowSteps: [
    { label: 'Azure',     detail: 'クラウド基盤' },
    { label: 'Copilot',   detail: 'AI アシスタント' },
    { label: 'Office365', detail: '法人 SaaS' },
    { label: 'EBIT 拡大', detail: '営業利益 +18%' },
  ],

  trends: [
    {
      metric: '売上高', unit: '$B',
      data: [
        { period: 'FY2023', value: 211.9, beat: true,  beatMargin: 1.8 },
        { period: 'FY2024', value: 245.1, beat: true,  beatMargin: 2.4 },
        { period: 'FY2025', value: 282.0, beat: true,  beatMargin: 2.1 },
      ],
    },
    {
      metric: 'EPS', unit: '$', epsType: 'Non-GAAP',
      data: [
        { period: 'FY2023', value: 9.68,  beat: true, beatMargin: 2.9 },
        { period: 'FY2024', value: 11.80, beat: true, beatMargin: 3.4 },
        { period: 'FY2025', value: 13.64, beat: true, beatMargin: 3.2 },
      ],
    },
    {
      metric: '営業CF', unit: '$B',
      data: [
        { period: 'FY2023', value: 87.6  },
        { period: 'FY2024', value: 118.5 },
        { period: 'FY2025', value: 130.0 },
      ],
    },
    {
      metric: '営業利益', unit: '$B',
      data: [
        { period: 'FY2023', value: 88.5  },
        { period: 'FY2024', value: 109.4 },
        { period: 'FY2025', value: 128.5 },
      ],
    },
  ],

  operatingMargins: [
    { period: 'FY2023', value: 41.8 },
    { period: 'FY2024', value: 44.6 },
    { period: 'FY2025', value: 45.6 },
  ],

  valuation: {
    per: 35.0,    perJudge:      'やや割高',
    pbr: 12.0,    pbrJudge:      '高',
    psr: 13.0,    psrJudge:      '高',
    evEbitda: 26, evEbitdaJudge: 'やや高',
    peg: 2.5,     pegJudge:      '中立',
    dataSource: 'FMP TTM',
  },

  segmentSummary: {
    date: 'Q4 FY2025',
    segments: [
      { name: 'Intelligent Cloud',                value_b: 30.1, yoy_pct: 21 },
      { name: 'Productivity and Business Processes', value_b: 28.3, yoy_pct: 12 },
      { name: 'More Personal Computing',          value_b: 14.0, yoy_pct: 5  },
    ],
  },

  strengths: [
    'Azure 売上 YoY +21%、AI 関連で 14pt 寄与（クラウド3強で唯一の二桁加速）',
    'Copilot 法人課金が ARR ベースで急拡大、ARPU 改善が利益率を押し上げ',
    '営業利益率 45.6% — Apple/Google を上回り、IT メガキャップ最高水準',
  ],
  risks: [
    'AI インフラ投資（CapEx）が年間 $80B 規模に拡大、FCF 成長を圧迫',
    'PER 35x は IT 平均（28x）を 25% 上回り、悪材料時の調整リスク',
    '中国市場のデカップリング進行、地政学リスクが Office365 売上に波及の可能性',
  ],
  bullCase: [
    'Azure AI で OpenAI 連携の独占的優位、エンタープライズ AI 市場の主導権を確保',
    '営業 CF $130B で 自社株買い + 配当が継続、株主還元利回り 2.5%超',
  ],
  bearCase: [
    'AI 投資の ROIC 低下が顕在化すれば、現在のバリュエーションは正当化困難',
    'Google Workspace / Notion AI 等のシェア奪取が始まれば Office365 単価圧力',
  ],
  investorQuestion:
    'AI CapEx $80B が今後 3 年でどの程度の収益に転換するか — Azure AI ARR の伸びと営業 CF への寄与で見極めたい。',

  _phase: 'complete',
  _isDemo: true,
};

// ── 1Y バージョン（KPI カード表示用に最新年だけ） ──
export const DEMO_VIZ_DATA_1Y = {
  ...DEMO_VIZ_DATA,
  trends: DEMO_VIZ_DATA.trends.map(t => ({
    ...t,
    data: t.data.slice(-1),  // FY2025 のみ
  })),
  operatingMargins: DEMO_VIZ_DATA.operatingMargins.slice(-1),
};

// ── 3Y バージョン（既存データそのまま） ──
export const DEMO_VIZ_DATA_3Y = DEMO_VIZ_DATA;

// ── 5Y バージョン（FY2021〜FY2025） ──
export const DEMO_VIZ_DATA_5Y = {
  ...DEMO_VIZ_DATA,
  trends: [
    {
      metric: '売上高', unit: '$B',
      data: [
        { period: 'FY2021', value: 168.1, beat: true,  beatMargin: 1.2 },
        { period: 'FY2022', value: 198.3, beat: true,  beatMargin: 1.5 },
        { period: 'FY2023', value: 211.9, beat: true,  beatMargin: 1.8 },
        { period: 'FY2024', value: 245.1, beat: true,  beatMargin: 2.4 },
        { period: 'FY2025', value: 282.0, beat: true,  beatMargin: 2.1 },
      ],
    },
    {
      metric: 'EPS', unit: '$', epsType: 'Non-GAAP',
      data: [
        { period: 'FY2021', value: 8.05,  beat: true, beatMargin: 2.0 },
        { period: 'FY2022', value: 9.65,  beat: true, beatMargin: 2.5 },
        { period: 'FY2023', value: 9.68,  beat: true, beatMargin: 2.9 },
        { period: 'FY2024', value: 11.80, beat: true, beatMargin: 3.4 },
        { period: 'FY2025', value: 13.64, beat: true, beatMargin: 3.2 },
      ],
    },
    {
      metric: '営業CF', unit: '$B',
      data: [
        { period: 'FY2021', value: 76.7  },
        { period: 'FY2022', value: 89.0  },
        { period: 'FY2023', value: 87.6  },
        { period: 'FY2024', value: 118.5 },
        { period: 'FY2025', value: 130.0 },
      ],
    },
    {
      metric: '営業利益', unit: '$B',
      data: [
        { period: 'FY2021', value: 69.9  },
        { period: 'FY2022', value: 83.4  },
        { period: 'FY2023', value: 88.5  },
        { period: 'FY2024', value: 109.4 },
        { period: 'FY2025', value: 128.5 },
      ],
    },
  ],
  operatingMargins: [
    { period: 'FY2021', value: 41.6 },
    { period: 'FY2022', value: 42.1 },
    { period: 'FY2023', value: 41.8 },
    { period: 'FY2024', value: 44.6 },
    { period: 'FY2025', value: 45.6 },
  ],
};
