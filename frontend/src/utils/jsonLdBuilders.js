/**
 * §11-C-1: schema.org 準拠の JSON-LD オブジェクトを生成する純関数群。
 *
 * 設計判断:
 * - 純関数で副作用なし → テスト容易、Phase 2 (Backend Jinja2 移行) で再利用可能
 * - 6 体エージェントレビュー反映:
 *   - 金融: actual/forecast/previous は additionalProperty で
 *   - UI/UX: ブランド表記 'BeatScanner' で統一、絵文字を含めない
 *   - マーケ: NewsArticle は重複コンテンツリスクで未実装
 *   - 2026 BP: WebSite + Organization + Event の半日最小セット
 */

const SITE_URL = 'https://beatscanner-production.up.railway.app';
const SITE_NAME = 'beatscanner';
const ORG_NAME = 'BeatScanner';

/** sitelinks search box 対応 */
export function buildWebSiteSchema() {
  return {
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: ORG_NAME,
    url: SITE_URL,
    description: '米国株決算分析 Web アプリ。ファンダメンタル 5 条件プロトコルに基づき、ティッカーを入力するだけで決算 Beat/Miss を 2 秒で判定。',
    inLanguage: 'ja',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** publisher 参照用 */
export function buildOrganizationSchema() {
  return {
    '@type': 'Organization',
    name: ORG_NAME,
    alternateName: SITE_NAME,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/og-image.svg`,
      width: 1200,
      height: 630,
    },
    description: '米国株決算分析ツール「beatscanner」を提供。',
  };
}

/**
 * 経済指標 1 件を schema.org/Event にマッピング。
 *
 * @param {object} event - { event_name, date, time, actual, forecast, previous, impact, currency }
 * @returns {object} schema.org/Event 準拠オブジェクト
 *
 * 注意:
 * - startDate は ET タイムゾーン明示 (-04:00 / -05:00 DST)
 * - actual=null 時は forecast/previous のみ additionalProperty に
 * - eventStatus: 発表済 → EventCompleted, 未発表 → EventScheduled
 * - location: VirtualLocation 必須 (UI/UX エージェント指摘、省略すると Validator warning)
 */
export function buildEventSchema(event) {
  if (!event || !event.date) return null;
  // 実 API は event.event (イベント名), event.estimate (予想値) を使う。
  // 互換性のため event_name / forecast も受け付ける。
  const name = event.event_name || event.event;
  if (!name) return null;
  const forecast = event.forecast ?? event.estimate;

  // event.date は ISO datetime (例: "2026-05-13T08:30:00Z" or "2026-05-13") の可能性あり。
  // ET タイムゾーン明示版に正規化。
  let startDate;
  if (event.date.includes('T')) {
    // 既に ISO datetime (UTC or 他タイムゾーン)。そのまま採用。
    startDate = event.date;
  } else {
    // 日付のみの場合、デフォルト 08:30 ET を補完。
    const time = event.time || '08:30';
    const month = parseInt(event.date.slice(5, 7), 10);
    const tzOffset = (month >= 3 && month <= 11) ? '-04:00' : '-05:00';
    startDate = `${event.date}T${time}:00${tzOffset}`;
  }

  const isCompleted = event.actual !== null && event.actual !== undefined && event.actual !== '';

  const additionalProperty = [];
  if (event.actual) {
    additionalProperty.push({ '@type': 'PropertyValue', name: 'Actual', value: String(event.actual) });
  }
  if (forecast) {
    additionalProperty.push({ '@type': 'PropertyValue', name: 'Forecast', value: String(forecast) });
  }
  if (event.previous) {
    additionalProperty.push({ '@type': 'PropertyValue', name: 'Previous', value: String(event.previous) });
  }
  if (event.impact) {
    additionalProperty.push({ '@type': 'PropertyValue', name: 'Impact', value: String(event.impact).toUpperCase() });
  }

  return {
    '@type': 'Event',
    name,
    description: `${name} (米国経済指標)。発表予定: ${event.date.slice(0, 10)}.`,
    startDate,
    eventStatus: isCompleted
      ? 'https://schema.org/EventCompleted'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: {
      '@type': 'VirtualLocation',
      url: SITE_URL,
    },
    organizer: {
      '@type': 'GovernmentOrganization',
      name: 'US Government Statistics Agencies',
      url: 'https://www.bls.gov',
    },
    additionalProperty,
    dateModified: new Date().toISOString(),
  };
}

/**
 * 複数の経済指標を ItemList にまとめる (1 ページ複数 Event の SEO 表現)。
 * Google は ItemList で複数 Event をリッチスニペットの「カルーセル」として表示する場合あり。
 *
 * @param {Array} events - 経済指標の配列
 * @returns {object | null} ItemList schema (events が空なら null)
 */
export function buildEventListSchema(events) {
  if (!Array.isArray(events) || events.length === 0) return null;

  const itemListElement = events
    .map((ev, idx) => {
      const eventSchema = buildEventSchema(ev);
      if (!eventSchema) return null;
      return {
        '@type': 'ListItem',
        position: idx + 1,
        item: eventSchema,
      };
    })
    .filter(Boolean);

  if (itemListElement.length === 0) return null;

  return {
    '@type': 'ItemList',
    name: '今週の米国経済指標カレンダー',
    description: 'CPI / FOMC / NFP / PCE 等の重要経済指標の発表予定と結果一覧',
    numberOfItems: itemListElement.length,
    itemListElement,
  };
}
