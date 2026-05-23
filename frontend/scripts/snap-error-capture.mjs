// v106 緊急: production 真っ白事故診断用 console error capture script
// visual harness exception 4 条件遵守
import { chromium } from 'playwright';

const HARD_TIMEOUT_MS = 25_000;
setTimeout(() => { console.error('hard timeout'); process.exit(2); }, HARD_TIMEOUT_MS).unref();

const url = process.argv[2] || 'https://beatscanner-production.up.railway.app/?layout=workspace&ticker=AAPL';

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    const consoleMessages = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleMessages.push({ type: msg.type(), text: msg.text().slice(0, 500) });
      }
    });
    page.on('pageerror', (err) => {
      errors.push({ name: err.name, message: err.message.slice(0, 500), stack: err.stack?.slice(0, 800) });
    });
    page.on('requestfailed', (req) => {
      errors.push({ type: 'requestfailed', url: req.url(), failure: req.failure()?.errorText });
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(5000);
    const rootHtml = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root ? { childCount: root.children.length, innerHTMLLen: root.innerHTML.length, firstChildTag: root.firstElementChild?.tagName, sample: root.innerHTML.slice(0, 200) } : null;
    });
    console.log(JSON.stringify({ url, rootHtml, errors, consoleMessages }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('error:', e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
