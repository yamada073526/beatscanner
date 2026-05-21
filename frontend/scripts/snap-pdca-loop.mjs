// Phase 2.9 Sprint 4: Auto-PDCA visual verification system
// user dogfood 「修正 → 目視確認 → 不発なら再修正」 PDCA を Claude Haiku vision で自動化
//
// 使い方:
//   ANTHROPIC_API_KEY=sk-... node scripts/snap-pdca-loop.mjs \
//     --check "アナリスト視点の角が丸角になっているか" \
//     --check "GuidanceCard の発光が EarningsHistory と同等強度か" \
//     --selector "[data-testid='analyst-panel-wrapper']" \
//     --expand-summary "アナリスト視点"
//
// 出力:
//   - exit 0: all checks passed (修正反映 OK)
//   - exit 1: 1+ check failed (root cause JSON を stdout に出力)
//   - exit 2: hard timeout
//
// visual harness exception 4 条件遵守 (CLAUDE.md):
//   1. snap-*.mjs 命名 ✓
//   2. chromium headless: true ✓
//   3. 60s hard timeout ✓
//   4. .visual/ 出力のみ ✓ (HTTP server 起動なし)
//
// vision API cost: PDCA 3 loop × 9 screenshots ≈ $0.005-0.01/cycle (Haiku image input)

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { dirname, basename } from 'path';

const HARD_TIMEOUT_MS = 55_000;
const PROD_URL = 'https://beatscanner-production.up.railway.app/?layout=workspace';

setTimeout(() => {
  console.error('[snap-pdca-loop] hard timeout (55s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS).unref();

// CLI args parse
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
  console.error('[snap-pdca-loop] --check <text> が最低 1 件必要');
  process.exit(2);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('[snap-pdca-loop] ANTHROPIC_API_KEY 環境変数 が必要');
  process.exit(2);
}

const client = new Anthropic({ apiKey });

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
    const page = await ctx.newPage();
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(3000);

    // ticker 選択
    const tk = page.locator(`button:has-text("${opts.ticker}")`).first();
    if (await tk.count() > 0) {
      await tk.click();
      await page.waitForTimeout(4000);
    }

    // accordion expand (optional)
    if (opts.expandSummary) {
      // header の button selector: AccordionSection header (aria-expanded 持ち) を優先
      const header = page.locator(`button[aria-expanded]:has-text("${opts.expandSummary}")`).first();
      const fallbackHeader = page.locator(`button:has-text("${opts.expandSummary}")`).first();
      const useHeader = (await header.count()) > 0 ? header : fallbackHeader;
      if (await useHeader.count() > 0) {
        await useHeader.scrollIntoViewIfNeeded();
        // 既に展開済みなら click 不要 (aria-expanded="true")
        const expanded = await useHeader.getAttribute('aria-expanded');
        if (expanded !== 'true') {
          await useHeader.click();
        }
        // accordion spring (220 stiffness / 32 damping) + content mount + useEffect 完了を待つ
        await page.waitForTimeout(3500);
      }
    }

    // selector 指定の場合、 element が DOM に mount されるのを能動的に待つ
    if (opts.selector) {
      await page.waitForSelector(opts.selector, { timeout: 8000 }).catch(() => {
        // タイムアウトでも続行 (selector not found のエラー処理は後段)
      });
    }

    // screenshot 取得
    const screenshotPath = './.visual/snap-pdca-loop.png';
    mkdirSync(dirname(screenshotPath), { recursive: true });

    if (opts.selector) {
      // selector 指定で focused screenshot (前後 30px margin)
      const el = page.locator(opts.selector);
      if (await el.count() === 0) {
        const result = { verdict: 'fail', root_cause: `selector ${opts.selector} not found in DOM`, checks: opts.checks.map(c => ({ check: c, pass: false, reason: 'selector not found' })) };
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

    // Claude Haiku vision で binary checklist 判定
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
      // JSON code block で囲まれている場合の対応
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (e) {
      console.error('[snap-pdca-loop] JSON parse error:', e.message);
      console.error('Response:', responseText);
      process.exit(2);
    }

    // 結果 dump
    const jsonOut = './.visual/snap-pdca-loop.json';
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
    console.error('[snap-pdca-loop] error:', e.message);
    process.exit(2);
  } finally {
    if (browser) await browser.close();
  }
})();
