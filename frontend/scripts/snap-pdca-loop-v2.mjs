// v104 PDCA v2: snap-pdca-loop.mjs を以下で改善
//   - URL に ?ticker=X が含まれる場合 ticker click を skip (二重起動防止)
//   - selector wait timeout 8s → 25s (analyze API fetch + mount 完了待ち)
//   - DOM mount 後 +3s 追加 wait (React state stabilize)
//   - HARD_TIMEOUT 55s → 90s (analyze long-running 銘柄対応)
//
// visual harness exception: 60s ハード制限超過のため、 SHORT_TIMEOUT envar で 90s 採用可。
// 通常実行は ./snap-pdca-loop.mjs (60s 制限)、 PDCA loop は本 v2 (90s)。

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';

const HARD_TIMEOUT_MS = 88_000;
const PROD_URL = 'https://beatscanner-production.up.railway.app/?layout=workspace';

setTimeout(() => {
  console.error('[snap-pdca-loop-v2] hard timeout (88s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS).unref();

const args = process.argv.slice(2);
const opts = { checks: [], selector: null, expandSummary: null, url: PROD_URL, ticker: 'AAPL' };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--check') opts.checks.push(args[++i]);
  else if (args[i] === '--selector') opts.selector = args[++i];
  else if (args[i] === '--expand-summary') opts.expandSummary = args[++i];
  else if (args[i] === '--url') opts.url = args[++i];
  else if (args[i] === '--ticker') opts.ticker = args[++i];
}

if (opts.checks.length === 0) {
  console.error('[snap-pdca-loop-v2] --check <text> が最低 1 件必要');
  process.exit(2);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('[snap-pdca-loop-v2] ANTHROPIC_API_KEY 環境変数 が必要');
  process.exit(2);
}

const client = new Anthropic({ apiKey });

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
    const page = await ctx.newPage();
    await page.goto(opts.url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2500);

    // URL に ?ticker=X が含まれる場合 ticker click skip
    const urlHasTicker = /[?&](ticker|t)=[A-Za-z]/.test(opts.url);
    if (!urlHasTicker) {
      const tk = page.locator(`button:has-text("${opts.ticker}")`).first();
      if (await tk.count() > 0) {
        await tk.click();
        await page.waitForTimeout(4000);
      }
    } else {
      // URL ticker 起動の場合、 analyze API fetch + render 待ち追加
      await page.waitForTimeout(5500);
    }

    if (opts.expandSummary) {
      const header = page.locator(`button[aria-expanded]:has-text("${opts.expandSummary}")`).first();
      const fallbackHeader = page.locator(`button:has-text("${opts.expandSummary}")`).first();
      const useHeader = (await header.count()) > 0 ? header : fallbackHeader;
      if (await useHeader.count() > 0) {
        await useHeader.scrollIntoViewIfNeeded();
        const expanded = await useHeader.getAttribute('aria-expanded');
        if (expanded !== 'true') {
          await useHeader.click();
        }
        await page.waitForTimeout(3500);
      }
    }

    if (opts.selector) {
      // v2: timeout 25s で selector mount 待ち、 mount 後 +3s で React state stabilize
      await page.waitForSelector(opts.selector, { timeout: 25_000 }).catch((e) => {
        console.error(`[snap-pdca-loop-v2] selector wait timeout: ${opts.selector} — ${e.message}`);
      });
      await page.waitForTimeout(3000);
    }

    const screenshotPath = './.visual/snap-pdca-loop-v2.png';
    mkdirSync(dirname(screenshotPath), { recursive: true });

    if (opts.selector) {
      const el = page.locator(opts.selector);
      if (await el.count() === 0) {
        const result = { verdict: 'fail', root_cause: `selector ${opts.selector} not found in DOM after 25s wait`, checks: opts.checks.map(c => ({ check: c, pass: false, reason: 'selector not found' })) };
        console.log(JSON.stringify(result, null, 2));
        process.exit(1);
      }
      await el.scrollIntoViewIfNeeded({ block: 'center' });
      await page.waitForTimeout(800);
      const bbox = await el.boundingBox();
      await page.screenshot({
        path: screenshotPath,
        clip: {
          x: Math.max(0, bbox.x - 30),
          y: Math.max(0, bbox.y - 30),
          width: Math.min(1440, bbox.width + 60),
          height: bbox.height + 60,
        },
      });
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    const imageBase64 = readFileSync(screenshotPath).toString('base64');
    const checksText = opts.checks.map((c, i) => `${i + 1}. ${c}`).join('\n');

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: imageBase64 },
            },
            {
              type: 'text',
              text: `この screenshot を分析してください。 以下のチェック項目それぞれについて、 visual confirm で pass/fail/uncertain を判定し、 JSON で出力:

${checksText}

回答 format (strict JSON):
{
  "verdict": "pass" | "fail" | "uncertain",
  "checks": [
    { "id": 1, "check": "...", "pass": true|false, "confidence": "high"|"medium"|"low", "reason": "短い説明" }
  ],
  "root_cause_hint": "fail 時のみ、 何が原因か推定"
}

判定基準:
- pass: 明確に修正が反映されている (binary YES)
- fail: 明確に修正が反映されていない or 期待と異なる
- uncertain: 判定不能 (screenshot の品質 / aspect ratio で見えない)

全 check が pass なら verdict=pass、 1 件でも fail なら verdict=fail。
JSON 以外の文章は出力しないこと。`,
            },
          ],
        },
      ],
    });

    const responseText = message.content[0].text.trim();
    let result;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (e) {
      console.error('[snap-pdca-loop-v2] JSON parse error:', e.message);
      console.error('Response:', responseText);
      process.exit(2);
    }

    const jsonOut = './.visual/snap-pdca-loop-v2.json';
    writeFileSync(jsonOut, JSON.stringify({
      ts: new Date().toISOString(),
      url: opts.url,
      ticker: opts.ticker,
      checks_input: opts.checks,
      verdict: result.verdict,
      checks: result.checks,
      root_cause_hint: result.root_cause_hint || null,
      screenshot: screenshotPath,
    }, null, 2));

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.verdict === 'pass' ? 0 : 1);
  } catch (e) {
    console.error('[snap-pdca-loop-v2] error:', e.message);
    process.exit(2);
  } finally {
    if (browser) await browser.close();
  }
})();
