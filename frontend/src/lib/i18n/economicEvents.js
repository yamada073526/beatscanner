// 経済指標の和訳辞書 + カテゴリ分類 (2026-05-07 5 体レビュー P0-4+5)
//
// backend (`_EVENT_NAME_JP_MAP`) は一部和訳済で「Initial Jobless Claims (新規失業保険申請)」
// 形式で返ってくるが、Fed Speakers / S&P Global PMI / ECB 講演などは未網羅。
// フロント側で補完し、「日本語 主 (大) + 英語 sub (小・muted)」表示にする。
// (UI/UX エージェント Q1 推奨、楽天マーケットスピード II 流)

// カテゴリ分類 → アイコン + ラベル (Web 開発 + UI/UX + 金融アナリスト Q1 統合)
export const CATEGORY = {
  INFLATION:    { key: 'inflation',    icon: '📊', label: '物価' },
  EMPLOYMENT:   { key: 'employment',   icon: '💼', label: '雇用' },
  CENTRAL_BANK: { key: 'central_bank', icon: '🏦', label: '中銀' },
  MANUFACTURING:{ key: 'manufacturing',icon: '🏭', label: '製造業' },
  CONSUMER:     { key: 'consumer',     icon: '🛒', label: '消費' },
  HOUSING:      { key: 'housing',      icon: '🏠', label: '住宅' },
  GDP:          { key: 'gdp',          icon: '📈', label: 'GDP/景気' },
  OTHER:        { key: 'other',        icon: '📋', label: 'その他' },
};

// 主要指標の英→和訳マッピング (frontend 補完用、longest match 適用)
const EN_TO_JA = [
  // 物価
  ['Core CPI', 'コアCPI'],
  ['Core PCE', 'コアPCE'],
  ['Core PPI', 'コアPPI'],
  ['Consumer Price Index', '消費者物価指数 (CPI)'],
  ['Producer Price Index', '生産者物価指数 (PPI)'],
  ['Personal Consumption Expenditures', '個人消費支出 (PCE)'],
  ['PCE Price Index', '個人消費支出デフレーター (PCE)'],
  ['PCE', '個人消費支出 (PCE)'],
  ['Inflation Rate', 'インフレ率'],
  ['Inflation', 'インフレ率'],
  // 雇用
  ['Nonfarm Payrolls', '雇用統計 (NFP)'],
  ['Non-Farm Payrolls', '雇用統計 (NFP)'],
  ['NFP', '雇用統計 (NFP)'],
  ['ADP Employment', 'ADP 雇用'],
  ['ADP Nonfarm Employment Change', 'ADP 雇用'],
  ['Unemployment Rate', '失業率'],
  ['Initial Jobless Claims', '新規失業保険申請'],
  ['Continuing Jobless Claims', '失業保険継続受給'],
  ['JOLTs Job Openings', '求人件数 (JOLTS)'],
  ['JOLTS', '求人件数 (JOLTS)'],
  ['Average Hourly Earnings', '平均時給'],
  ['Labor Force Participation', '労働参加率'],
  // 中銀 / Fed
  ['FOMC Press Conference', 'FOMC 記者会見'],
  ['FOMC Statement', 'FOMC 声明'],
  ['FOMC Minutes', 'FOMC 議事要旨'],
  ['FOMC Rate Decision', 'FOMC 政策金利'],
  ['Fed Interest Rate Decision', 'FOMC 政策金利'],
  ['FOMC Economic Projections', 'FOMC 経済見通し'],
  // Fed 講演 (FMP 標準形式: "Fed [姓] Speech" or "[姓] Speech")
  ['Fed Chair Powell Speech', 'パウエル FRB 議長 講演'],
  ['Powell Speech', 'パウエル FRB 議長 講演'],
  ['Williams Speech', 'ウィリアムズ NY 連銀総裁 講演'],
  ['Waller Speech', 'ウォラー FRB 理事 講演'],
  ['Bowman Speech', 'バウマン FRB 理事 講演'],
  ['Jefferson Speech', 'ジェファーソン FRB 副議長 講演'],
  ['Goolsbee Speech', 'グールズビー シカゴ連銀総裁 講演'],
  ['Barkin Speech', 'バーキン リッチモンド連銀総裁 講演'],
  ['Bostic Speech', 'ボスティック アトランタ連銀総裁 講演'],
  ['Daly Speech', 'デイリー サンフランシスコ連銀総裁 講演'],
  ['Mester Speech', 'メスター クリーブランド連銀総裁 講演'],
  ['Logan Speech', 'ローガン ダラス連銀総裁 講演'],
  ['Kashkari Speech', 'カシュカリ ミネアポリス連銀総裁 講演'],
  ['Schmid Speech', 'シュミット カンザスシティ連銀総裁 講演'],
  ['Musalem Speech', 'ムサレム セントルイス連銀総裁 講演'],
  // ECB
  ['ECB Lagarde Speech', 'ラガルド ECB 総裁 講演'],
  ['ECB Lane Speech', 'レーン ECB 専務理事 講演'],
  ['ECB Buch Speech', 'ブッフ ECB 理事 講演'],
  ['ECB Cipollone Speech', 'チポローネ ECB 専務理事 講演'],
  ['ECB Schnabel Speech', 'シュナーベル ECB 理事 講演'],
  ['ECB Elderson Speech', 'エルダーソン ECB 理事 講演'],
  ['ECB Interest Rate Decision', 'ECB 政策金利'],
  ['ECB Press Conference', 'ECB 記者会見'],
  // BoE / BoJ
  ['BoE Interest Rate Decision', 'BoE 政策金利'],
  ['BOJ Interest Rate Decision', '日銀 政策金利'],
  ['BOJ Outlook Report', '日銀 展望レポート'],
  ['BOJ Press Conference', '日銀 記者会見'],
  // 製造業 / PMI
  ['ISM Manufacturing PMI', 'ISM 製造業景況感'],
  ['ISM Services PMI', 'ISM サービス業景況感'],
  ['ISM Non-Manufacturing PMI', 'ISM 非製造業景況感'],
  ['S&P Global Manufacturing PMI', 'S&Pグローバル 製造業 PMI'],
  ['S&P Global Services PMI', 'S&Pグローバル サービス業 PMI'],
  ['S&P Global Composite PMI', 'S&Pグローバル 総合 PMI'],
  ['Chicago PMI', 'シカゴ PMI'],
  ['Empire State Manufacturing', 'エンパイア・ステート製造業景況指数'],
  ['Philadelphia Fed Manufacturing', 'フィラデルフィア連銀製造業景況指数'],
  ['Industrial Production', '鉱工業生産'],
  ['Durable Goods Orders', '耐久財受注'],
  ['Capacity Utilization', '設備稼働率'],
  ['Factory Orders', '製造業新規受注'],
  // 消費
  ['Retail Sales', '小売売上高'],
  ['Core Retail Sales', 'コア小売売上高'],
  ['Consumer Confidence', '消費者信頼感指数'],
  ['Michigan Consumer Sentiment', 'ミシガン大消費者心理'],
  ['Michigan Consumer Expectations', 'ミシガン大消費者期待'],
  ['Personal Income', '個人所得'],
  ['Personal Spending', '個人支出'],
  // 住宅
  ['Existing Home Sales', '中古住宅販売件数'],
  ['New Home Sales', '新築住宅販売件数'],
  ['Pending Home Sales', '中古住宅仮契約'],
  ['Building Permits', '建築許可件数'],
  ['Housing Starts', '住宅着工件数'],
  ['Case-Shiller Home Price Index', 'ケース・シラー住宅価格'],
  ['MBA 30-Year Mortgage Rate', 'MBA 30 年住宅ローン金利'],
  ['MBA Mortgage Applications', 'MBA 住宅ローン申請'],
  ['MBA Purchase Index', 'MBA 住宅購入指数'],
  ['MBA Mortgage Market Index', 'MBA 住宅ローン市場指数'],
  // GDP / 景気
  ['GDP Growth Rate', 'GDP 成長率'],
  ['GDP Price Index', 'GDP 価格指数'],
  ['GDP', '国内総生産 (GDP)'],
  ['Trade Balance', '貿易収支'],
  ['Current Account', '経常収支'],
  ['Beige Book', 'ベージュブック'],
  ['Leading Indicators', '景気先行指数'],
  ['Conference Board Leading Index', 'コンファレンスボード景気先行指数'],
];

// 英語名 → カテゴリ判定 (regex 優先)
function detectCategory(en) {
  if (/CPI|PPI|PCE|Inflation|Price Index|消費者物価|生産者物価/i.test(en)) return CATEGORY.INFLATION;
  if (/Unemployment|Nonfarm|Non-Farm|NFP|Jobless|JOLTs|JOLTS|Payrolls|Employment Change|Hourly Earnings|Labor Force|雇用|失業/i.test(en)) return CATEGORY.EMPLOYMENT;
  if (/FOMC|Fed Chair|Powell|Williams|Waller|Bowman|Jefferson|Goolsbee|Barkin|Bostic|Daly|Mester|Logan|Kashkari|Schmid|Musalem|ECB|BoE|BOJ|Lagarde|Lane|Buch|Cipollone|Schnabel|Elderson|Rate Decision|Beige Book| Speech|Press Conference|議事要旨|政策金利|講演/i.test(en)) return CATEGORY.CENTRAL_BANK;
  if (/PMI|ISM|Manufacturing|Industrial Production|Durable Goods|Capacity Utilization|Factory Orders|Empire State|Philadelphia Fed|景況|鉱工業|耐久財/i.test(en)) return CATEGORY.MANUFACTURING;
  if (/Retail Sales|Consumer (Confidence|Sentiment|Expectations)|Michigan|Personal (Income|Spending)|小売|消費者|個人所得/i.test(en)) return CATEGORY.CONSUMER;
  if (/Housing|Home Sales|Home Price|Building Permits|Housing Starts|Mortgage|MBA |Case-Shiller|住宅|建築/i.test(en)) return CATEGORY.HOUSING;
  if (/GDP|Trade Balance|Current Account|Leading Indicators?|Conference Board|国内総生産|貿易収支|経常収支|景気先行/i.test(en)) return CATEGORY.GDP;
  return CATEGORY.OTHER;
}

// 英語名から和訳 lookup (longest match)
function lookupJa(en) {
  if (!en) return null;
  // 長い key 優先で部分一致
  const sorted = [...EN_TO_JA].sort((a, b) => b[0].length - a[0].length);
  for (const [k, v] of sorted) {
    if (en.includes(k)) return v;
  }
  return null;
}

// メイン関数: backend が返した event 文字列を {ja, en, category} に分解
//
// パターン 1: backend 既和訳 → 「英語 (和訳)」または「英語 (Mar) (和訳)」形式 → 末尾 () の中身が日本語ならそれを和訳と認定
// パターン 2: backend 未和訳 → 英語のみ → frontend dict で補完
// パターン 3: 補完できなければ ja=null (英語のみ表示)
export function translateEvent(rawTitle) {
  if (!rawTitle) return { ja: null, en: '', category: CATEGORY.OTHER };
  const trimmed = String(rawTitle).trim();
  let en = trimmed;
  let ja = null;
  // 末尾の括弧 (...) または (...) を捕捉
  const m = trimmed.match(/^(.+?)\s*[(（]([^()（）]+(?:[(（][^)）]*[)）][^()（）]*)*)[)）]\s*$/);
  if (m) {
    const inner = m[2].trim();
    // 中身が日本語 (ひら/カタ/CJK 漢字) を含むか
    if (/[぀-ヿ㐀-鿿]/.test(inner)) {
      en = m[1].trim();
      ja = inner;
    }
  }
  // ja がまだなければ frontend dict で補完
  if (!ja) ja = lookupJa(en);
  return {
    ja,
    en,
    category: detectCategory(en),
  };
}
