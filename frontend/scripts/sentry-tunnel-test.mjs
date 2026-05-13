// Sentry tunnel が本番で動作するか検証
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const tunnelReqs = [], sentryDirectReqs = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/sentry-tunnel')) tunnelReqs.push({ url: u.slice(0, 100), method: req.method() });
    else if (u.includes('sentry.io')) sentryDirectReqs.push(u.slice(0, 100));
  });
  page.on('response', async (res) => {
    if (res.url().includes('/api/sentry-tunnel')) {
      console.log(`[tunnel response] ${res.status()} ${res.url().slice(0, 80)}`);
    }
  });
  await page.goto('https://beatscanner-production.up.railway.app/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    setTimeout(() => { throw new Error('TUNNEL VERIFY ' + new Date().toISOString()); }, 0);
  });
  await page.waitForTimeout(5000);
  console.log(`\nTunnel POSTs: ${tunnelReqs.length}`);
  tunnelReqs.forEach(r => console.log(' ', r.method, r.url));
  console.log(`Direct sentry.io requests: ${sentryDirectReqs.length}`);
} finally {
  await browser.close();
}
