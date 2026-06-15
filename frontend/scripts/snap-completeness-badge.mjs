/**
 * snap-completeness-badge.mjs — 完全性台帳 Sprint3 の本番 visual 確認 (gate⑤)。
 * Visual Diagnostic Harness Exception 4 条件遵守: headless / 55s hard timeout / .visual/ 出力 / server 起動なし。
 *
 * 本番 (?layout=workspace) で AAPL を analyze → JudgmentDetail 最上部の
 * CompletenessRollupBadge を closed / drilldown-open の2状態で撮影する。
 * AAPL は全 source ok + SPY ok のため rollup は「決算データ・地合いを自動取得」 を期待。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'https://beatscanner-production.up.railway.app';
const OUT = resolve('./.visual');
mkdirSync(OUT, { recursive: true });

const hardTimeout = setTimeout(() => {
  console.error('[snap-completeness] hard timeout 55s');
  process.exit(2);
}, 55_000);

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await page.goto(BASE + '?layout=workspace', { waitUntil: 'networkidle', timeout: 30_000 });

  // sidebar の demo ticker chip を click → Pane 3 mount (baseline-pillar2 idiom)
  const demoChip = page.locator('button').filter({ hasText: /^(AAPL|NVDA|TSLA|MSFT)$/ }).first();
  await demoChip.waitFor({ state: 'visible', timeout: 15_000 });
  const chipText = (await demoChip.textContent())?.trim();
  await demoChip.click();
  console.log('[snap-completeness] clicked demo chip:', chipText);

  // analyze + badge fetch (bothResolved) を待つ。state 非依存で badge の存在を待ち、診断 dump する。
  await page.waitForTimeout(9_000);

  const diag = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="completeness-rollup-badge"]');
    const flash = document.querySelector('[data-testid="earnings-flash-summary"]');
    const detail = document.querySelector('.ds-judgment-detail');
    const hero = document.querySelector('[data-testid="verdict-hero"], .ds-judgment-detail h1, .ds-judgment-detail [class*="hero" i]');
    const r = (el) => { if (!el) return null; const x = el.getBoundingClientRect(); return { top: Math.round(x.top), h: Math.round(x.height) }; };
    // badge が .ds-judgment-detail の何番目の子か、直前要素は何か
    let idx = -1, prevTag = null;
    if (b && detail) {
      const kids = Array.from(detail.children);
      idx = kids.indexOf(b);
      prevTag = idx > 0 ? (kids[idx - 1].getAttribute('data-testid') || kids[idx - 1].tagName) : '(first child)';
    }
    return {
      badgeExists: !!b,
      badgeState: b?.getAttribute('data-state') ?? null,
      badgeRect: r(b),
      badgeParentIsDetail: b?.parentElement === detail,
      badgeChildIndex: idx,
      badgePrevSibling: prevTag,
      detailRect: r(detail),
      heroRect: r(hero),
      flashRendered: !!flash,
    };
  });
  console.log('[snap-completeness] diag:', JSON.stringify(diag));

  const rollupText = await page.locator('[data-testid="completeness-rollup-badge-toggle"]').textContent().catch(() => null);
  console.log('[snap-completeness] rollup text:', JSON.stringify(rollupText));

  // (1) fullPage 撮影 (badge が出ていなくても画面状況を確認)
  await page.screenshot({ path: resolve(OUT, 'completeness-full.png'), fullPage: true });

  // badge が main のときだけ focused 撮影 (main 以外で locator.screenshot が hang するのを回避)
  if (diag.badgeState === 'main') {
    const badge = page.locator('[data-testid="completeness-rollup-badge"][data-state="main"]');
    await badge.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: resolve(OUT, 'completeness-top.png'), fullPage: false });
    await badge.screenshot({ path: resolve(OUT, 'completeness-badge-closed.png') }).catch((e) =>
      console.error('[snap-completeness] closed screenshot 失敗:', e.message)
    );
    const toggle = page.locator('[data-testid="completeness-rollup-badge-toggle"]');
    await toggle.click().catch((e) => console.error('[snap-completeness] toggle click 失敗:', e.message));
    await page.waitForTimeout(800);
    const auditVisible = await page.locator('[data-testid="completeness-audit-panel"]').isVisible().catch(() => false);
    console.log('[snap-completeness] audit panel visible after click:', auditVisible);
    await badge.screenshot({ path: resolve(OUT, 'completeness-badge-open.png') }).catch((e) =>
      console.error('[snap-completeness] open screenshot 失敗:', e.message)
    );
    const auditText = await page.locator('[data-testid="completeness-audit-panel"]').textContent().catch(() => null);
    console.log('[snap-completeness] audit text:', JSON.stringify(auditText));
  } else {
    console.error('[snap-completeness] badge が main 状態でないため focused 撮影をスキップ (fullPage のみ)');
  }

  console.log('[snap-completeness] saved to', OUT);
  process.exit(0);
} catch (err) {
  console.error('[snap-completeness] error:', err.message);
  process.exit(1);
} finally {
  await browser?.close();
  clearTimeout(hardTimeout);
}
