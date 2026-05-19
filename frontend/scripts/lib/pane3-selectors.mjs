/**
 * pane3-selectors.mjs — Pane 3 sections の Playwright selector 定義
 *
 * SPEC: docs/specs/SPEC_2026-05-19_vision-dogfood-agent.md §5 Sprint 1
 * 目的: snap-visual-regression.mjs が Pane 3 の各 section を capture する際に
 *       利用する selector と画面遷移 setup を一元管理する。
 *
 * 修正ポリシー:
 *   - selector 変更は React component のリファクタと連動して更新する。
 *   - AccordionSection / EarningsHistoryChart 内部実装には触らない。
 *   - TriageBanner の hasFatal 条件 / silent fail logic は変更しない。
 *   - CompanyLogo / EarningsRing の内部 SVG には触らない。
 *
 * SPEC §6 触らない領域:
 *   本ファイルは selector を「使う側」であり、 React component 内部を変更しない。
 */

// ---------------------------------------------------------------------------
// 1. capture 対象 5 section の定義
// ---------------------------------------------------------------------------

/**
 * SECTION_DEFS: 5 section × selector + description
 *
 * SPEC §5 Sprint 1 確定案:
 *   - Hero: verdict badge + ロゴ + EarningsRing + 「次の決算まで」
 *   - FiveConditions: FiveConditionsCard
 *   - TriageBanner: 上部、 silent fail 廃止後の保有 2 行 grid 含む
 *   - SectionDivider: h2 級 + accent bar (Polish Sprint 5 着地済)
 *   - EarningsHistoryChart: AccordionSection 開状態の screenshot
 *
 * selector の fallback 順 (section が見つからない場合の対応):
 *   1. primary selector
 *   2. fallback selector
 *   fallback も無ければ fullpage screenshot + JSON dump + exit 1
 */
export const SECTION_DEFS = [
  {
    name: 'Hero',
    primary: '.pane3-hero-section',
    fallback: '[data-testid="pane3-hero"]',
    // Hero section が見つからない場合の広めのセレクタ
    broadFallback: '.judgment-detail-header, .verdict-header, [class*="hero"]',
    requiresAccordionOpen: false,
    description: 'verdict badge + CompanyLogo + EarningsRing + 次の決算まで',
  },
  {
    name: 'FiveConditions',
    primary: '.five-conditions-card',
    fallback: '[data-testid="five-conditions"]',
    broadFallback: '[class*="five-condition"], [class*="conditions"]',
    requiresAccordionOpen: false,
    description: 'FiveConditionsCard — じっちゃまプロトコル 5 条件',
  },
  {
    name: 'TriageBanner',
    primary: '.triage-banner',
    fallback: '[data-testid="triage-banner"]',
    broadFallback: '[class*="triage"], [class*="banner"]',
    requiresAccordionOpen: false,
    description: 'TriageBanner — silent fail 廃止後の保有 2 行 grid',
  },
  {
    name: 'SectionDivider',
    primary: '.section-divider',
    fallback: '[data-testid="section-divider"]',
    broadFallback: '[class*="section-divider"], [class*="divider"]',
    requiresAccordionOpen: false,
    description: 'SectionDivider — h2 + accent bar (Polish Sprint 5 着地済)',
  },
  {
    name: 'EarningsHistoryChart',
    primary: '.earnings-history-chart',
    fallback: '[data-testid="earnings-history-chart"]',
    broadFallback: '[class*="earnings-history"], [class*="history-chart"]',
    // EarningsHistoryChart は AccordionSection 内に格納されている場合がある
    requiresAccordionOpen: true,
    accordionSelector: 'button[aria-expanded="false"]',
    description: 'EarningsHistoryChart — AccordionSection 開状態で capture',
  },
];

// ---------------------------------------------------------------------------
// 2. viewport 設定 (PC + mobile = 2 viewport × 5 section = 10 PNG)
// ---------------------------------------------------------------------------

/**
 * VIEWPORTS: PC と mobile の 2 viewport 設定
 * snap-active.mjs と同じ PC 設定 (1440×900 / deviceScaleFactor 2)
 */
export const VIEWPORTS = [
  {
    name: 'pc',
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
  },
  {
    name: 'mobile',
    // iPhone 15 相当 (SPEC §5 Sprint 1 確定)
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
  },
];

// ---------------------------------------------------------------------------
// 3. 画面遷移 setup flow
// ---------------------------------------------------------------------------

/**
 * setupWorkspacePane3: workspace mode で Pane 3 (JudgmentDetail) を表示する。
 * snap-active.mjs の PROFILES.workspace.setup と同パターン。
 *
 * 手順:
 *   1. /?layout=workspace に goto (caller 側で実施)
 *   2. demo ticker chip (AAPL/NVDA/TSLA/MSFT) を click
 *   3. 3.5s wait (demoAnalyze + prefetch warm)
 *   4. 800ms 静止 + animation finish (glow_elevation_postmortem.md 推奨)
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @returns {Promise<void>}
 */
export async function setupWorkspacePane3(page) {
  // demo ticker chip を click して Pane 3 を mount
  const demoChip = page.locator('button').filter({ hasText: /^(AAPL|NVDA|TSLA|MSFT)$/ }).first();
  await demoChip.waitFor({ state: 'visible', timeout: 15_000 });
  await demoChip.click();

  // demoAnalyze + bulk fetch を待つ (cold start ~3-5s)
  await page.waitForTimeout(3500);

  // navigation 後 800ms 静止 (glow_elevation_postmortem.md の推奨)
  // + .is-arriving state の screenshot ブレを防ぐ
  await page.waitForTimeout(800);

  // 進行中 animation を強制完了
  // feedback_press_feedback_delta.md の「running animation forwards fill 罠」対策
  // snap-active.mjs L138-141 と同パターン
  // 無限 animation (EarningsRing 呼吸 / pulse 等) は finish 不能なため try/catch でスキップ
  await page.evaluate(() => {
    document.querySelectorAll('[class]').forEach((el) =>
      el.getAnimations().forEach((a) => {
        try {
          a.finish();
        } catch {
          // InvalidStateError: 無限 animation は finish 不能 — 無視
        }
      }),
    );
  });

  await page.waitForTimeout(50);
}

/**
 * openAccordionIfNeeded: section が requiresAccordionOpen の場合に
 * AccordionSection を開く。内部実装には触らず click のみで展開する。
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @param {Object} sectionDef - SECTION_DEFS の 1 entry
 * @returns {Promise<void>}
 */
export async function openAccordionIfNeeded(page, sectionDef) {
  if (!sectionDef.requiresAccordionOpen) return;

  // aria-expanded="false" の button を全て click して accordion を開く
  // AccordionSection 内部実装には触らない (SPEC §6 禁止)
  const closedButtons = page.locator('button[aria-expanded="false"]');
  const count = await closedButtons.count();
  for (let i = 0; i < count; i++) {
    try {
      const btn = closedButtons.nth(i);
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    } catch {
      // accordion が見つからなくても続行
    }
  }
}

/**
 * findSectionElement: section を primary → fallback → broadFallback の順で探す。
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @param {Object} sectionDef - SECTION_DEFS の 1 entry
 * @returns {Promise<import('playwright').Locator|null>}
 */
export async function findSectionElement(page, sectionDef) {
  for (const selector of [
    sectionDef.primary,
    sectionDef.fallback,
    sectionDef.broadFallback,
  ]) {
    if (!selector) continue;
    try {
      const loc = page.locator(selector).first();
      if (await loc.count() > 0 && await loc.isVisible()) {
        return loc;
      }
    } catch {
      // selector parse error は無視して次へ
    }
  }
  return null;
}
