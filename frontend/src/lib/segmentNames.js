// segment 名 和文化 dictionary (主要 Tech / 金融 企業の segment 名を日本語表示)
// user dogfood「日本人ユーザー向けに和文で表示してほしい」 への対策。
// 既知名のみ翻訳、 未登録は英語のままで graceful (機械翻訳禁止 = brand 一貫性、 §38 risk 回避)。
//
// ProfileCard (会社概要) と DiagramCard (AI図解「セグメント別売上」) の両方で共有。
// translateSegmentName は大文字小文字・空白差を吸収する (FMP の "and"/"And" 揺れ等に強い)。
export const SEGMENT_NAME_JP = {
  // NVDA
  'Data Center': 'データセンター',
  'Gaming': 'ゲーミング',
  'Professional Visualization': 'プロフェッショナル映像',
  'Automotive': '自動運転',
  'OEM And Other': 'OEM・その他',
  // MSFT
  'Intelligent Cloud': 'クラウド (Azure)',
  'Productivity and Business Processes': '業務生産性 (Office 365 等)',
  'Productivity And Business Processes': '業務生産性 (Office 365 等)',
  'More Personal Computing': 'PC・デバイス',
  'Server Products And Cloud Services': 'サーバ・クラウド',
  'Microsoft Three Six Five Commercial Products And Cloud Services': 'M365 法人',
  'Microsoft Office Products And Cloud Services': 'Office 製品',
  'Microsoft Three Six Five Consumer Products And Cloud Services': 'M365 個人',
  'Office Consumer Products And Cloud Services': 'Office 個人',
  'Windows': 'Windows OS',
  'Linked In Corporation': 'LinkedIn',
  'LinkedIn Corporation': 'LinkedIn',
  'Search And News Advertising': '広告 (検索・ニュース)',
  'Search Advertising': '検索広告',
  'Gaming Xbox Hardware And Software And Services': 'Xbox ハード・ソフト',
  'Gaming Xbox Content And Services': 'Xbox コンテンツ・サービス',
  'Enterprise Services': 'エンタープライズサービス',
  'Devices': 'デバイス',
  'Surface': 'Surface',
  'Dynamics': 'Dynamics (法人向け業務 SaaS)',
  'Dynamics Products And Cloud Services': 'Dynamics 製品・クラウド',
  'Server Products': 'サーバ製品',
  'Office Products': 'Office 製品',
  'Other Products And Services': 'その他製品・サービス',
  // AMZN
  'AWS': 'AWS クラウド',
  'Online Stores': 'オンラインストア',
  'Online stores': 'オンラインストア',
  'Physical Stores': '実店舗',
  'Physical stores': '実店舗',
  'Third Party Seller Services': 'マーケットプレイス',
  'Third-party Seller Services': 'マーケットプレイス',
  'Third-party seller services': 'マーケットプレイス',
  'Subscription Services': 'Prime サブスク',
  'Subscription services': 'Prime サブスク',
  'Advertising Services': '広告事業',
  'Advertising services': '広告事業',
  'Other Services': 'その他サービス',
  // AAPL
  'iPhone': 'iPhone',
  'Mac': 'Mac',
  'iPad': 'iPad',
  'Wearables Home And Accessories': 'ウェアラブル・周辺機器',
  'Wearables, Home and Accessories': 'ウェアラブル・周辺機器',
  'Services': 'サービス事業',
  // GOOGL
  'Google Services': 'Google サービス',
  'Google Cloud': 'Google Cloud',
  'Other Bets': 'その他事業',
  'YouTube Advertising': 'YouTube 広告',
  'YouTube Advertising Revenue': 'YouTube 広告',
  'YouTube Ads Revenue': 'YouTube 広告',
  'Google Network': 'Google ネットワーク',
  'Google Network Revenue': 'Google ネットワーク',
  'Google Network Members Properties': 'Google パートナー広告',
  'Google Search And Other': 'Google 検索 等',
  'Google Search & Other': 'Google 検索 等',
  'Google Advertising': 'Google 広告',
  'Google Advertising Revenue': 'Google 広告',
  'Subscriptions Platforms And Devices': 'サブスク・プラットフォーム・端末',
  'Subscriptions Platforms And Devices Revenue': 'サブスク・プラットフォーム・端末',
  'Subscriptions, Platforms, and Devices': 'サブスク・プラットフォーム・端末',
  'Subscriptions, Platforms, And Devices Revenue': 'サブスク・プラットフォーム・端末',
  'Hardware': 'ハードウェア',
  'Google Other': 'Google その他',
  'Google Other Revenue': 'Google その他',
  // META
  'Family Of Apps': 'アプリ群 (Facebook/IG/WhatsApp)',
  'Family of Apps': 'アプリ群 (Facebook/IG/WhatsApp)',
  'Reality Labs': 'Reality Labs (VR/AR)',
  // TSLA
  'Automotive Sales': '自動車販売',
  'Automotive Leasing': '自動車リース',
  'Energy Generation And Storage': 'エネルギー事業',
  'Energy Generation and Storage': 'エネルギー事業',
  'Services And Other': 'サービス・その他',
  'Services and Other': 'サービス・その他',
  // 汎用 (Other / Misc 系を統一表記)
  'Other': 'その他',
  'Other Segment': 'その他セグメント',
  'Other Segments': 'その他セグメント',
  'Other Revenue': 'その他収益',
  'Total Revenue': '総収益',
  // BAC / JPM 等 金融
  'Consumer Banking': '個人向け銀行',
  'Global Wealth And Investment Management': '富裕層・資産運用',
  'Global Banking': '法人銀行',
  'Global Markets': 'マーケット (トレーディング)',
  'Investment Banking': '投資銀行',
  'Asset And Wealth Management': '資産運用',
  'Commercial Banking': '商業銀行',
  'Consumer And Community Banking': 'リテール銀行',
  'Corporate And Investment Bank': '法人・投資銀行',
};

// 大文字小文字・空白を正規化した lookup (FMP の "and"/"And"・余分な空白の揺れを吸収)
const _NORM = {};
for (const [k, v] of Object.entries(SEGMENT_NAME_JP)) {
  _NORM[k.toLowerCase().replace(/\s+/g, ' ').trim()] = v;
}

/**
 * segment 名を日本語に翻訳。 完全一致 → 正規化 (大小/空白無視) 一致 の順。
 * 未登録は英語のまま返す (graceful、 機械翻訳しない)。
 */
export function translateSegmentName(name) {
  if (typeof name !== 'string') return name;
  if (SEGMENT_NAME_JP[name]) return SEGMENT_NAME_JP[name];
  const norm = name.toLowerCase().replace(/\s+/g, ' ').trim();
  return _NORM[norm] || name;
}

/**
 * 表示用 segment 名 (v166+ 構造的和文化)。 優先順:
 *   1. curated 辞書 (translateSegmentName が hit) — big-tech 等の整合訳を最優先
 *   2. backend name_jp (Haiku 翻訳 + sanitize、 segment 名単位 cache) — 辞書 miss の long-tail
 *   3. 英語原文 — 全て解決できないとき graceful
 * seg は {name, name_jp?} object か string を受ける。
 */
export function displaySegmentName(seg) {
  const name = typeof seg === 'string' ? seg : seg?.name;
  if (typeof name !== 'string') return name ?? '';
  const dictJp = translateSegmentName(name);
  if (dictJp !== name) return dictJp;
  const jp = typeof seg === 'object' ? seg?.name_jp : null;
  if (typeof jp === 'string' && jp && jp !== name) return jp;
  return name;
}
