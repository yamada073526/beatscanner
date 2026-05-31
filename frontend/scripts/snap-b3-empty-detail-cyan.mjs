// B3 (handover v141): LP 未ログイン「空 detail pane」 の cyan 枠が
//   feedback_no_baseline_cyan 違反 (panel-card baseline 焼き込み) か、
//   選択先アフォーダンス (意図的 placeholder) かを視覚 + computed style で判定する。
//
// CLAUDE.md Visual Diagnostic Harness Exception 4 条件:
//   1. frontend/scripts/snap-*.mjs 命名 ✓
//   2. chromium.launch({ headless: true }) 固定 ✓
//   3. 55 秒 hard timeout + finally browser.close() ✓
//   4. .visual/ に PNG / JSON 出力のみ、 本番 URL のみ (HTTP server 起動なし) ✓
//
// 起動: node frontend/scripts/snap-b3-empty-detail-cyan.mjs
// 出力: frontend/.visual/b3_*.png + b3_cyan_audit.json

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD_URL = 'https://beatscanner-production.up.railway.app';
const OUT_DIR = resolve(__dirname, '../.visual');

const CASES = [
  { name: 'root', url: `${PROD_URL}/` },
  { name: 'workspace', url: `${PROD_URL}/?layout=workspace` },
];

const HARD_TIMEOUT_MS = 55_000;
setTimeout(() => {
  console.error('[snap-b3] hard timeout exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS).unref();

let browser;
const audit = [];

try {
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });

  for (const c of CASES) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const pageerrors = [];
    page.on('pageerror', (err) => pageerrors.push(err.message));

    try {
      await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(3_500); // hydration + Pane 3 initial render

      // full-page screenshot
      const shotPath = resolve(OUT_DIR, `b3_${c.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });

      // cyan を border/box-shadow に持つ要素を列挙 (rgb(34,211,238)=#22d3ee 旧 / rgb(56,189,248)=#38bdf8 sky / --color-accent)
      const cyanEls = await page.evaluate(() => {
        const isCyan = (s) =>
          /rgba?\(\s*(34,\s*211,\s*238|56,\s*189,\s*248|34,\s*197|125,\s*211)/.test(s) ||
          /(34,\s*211,\s*238|56,\s*189,\s*248)/.test(s);
        const out = [];
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const cs = getComputedStyle(el);
          const border = cs.borderColor + ' ' + cs.borderTopColor;
          const shadow = cs.boxShadow;
          const outline = cs.outlineColor;
          const hit =
            (isCyan(border) && cs.borderTopWidth !== '0px') ||
            (shadow && shadow !== 'none' && isCyan(shadow)) ||
            (isCyan(outline) && cs.outlineStyle !== 'none');
          if (!hit) continue;
          const rect = el.getBoundingClientRect();
          // 大きめ (= pane / card 級) の要素だけ拾う (chip/icon の cyan は除外、 area >= 8000px²)
          if (rect.width * rect.height < 8000) continue;
          out.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && el.className.toString
              ? el.className.toString()
              : '' + el.className
            ).slice(0, 160),
            isPanelCard: el.classList.contains('panel-card') ||
              el.classList.contains('bs-panel') ||
              el.classList.contains('surface-card'),
            textSnippet: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            rect: {
              x: Math.round(rect.x), y: Math.round(rect.y),
              w: Math.round(rect.width), h: Math.round(rect.height),
            },
            borderColor: cs.borderColor,
            borderWidth: cs.borderTopWidth,
            borderStyle: cs.borderTopStyle,
            boxShadow: shadow.slice(0, 160),
            outline: `${cs.outlineStyle} ${cs.outlineColor}`,
          });
        }
        return out;
      });

      // root innerHTML 長 (真っ白事故 guard) + どの top-level が render されたか
      const meta = await page.evaluate(() => ({
        rootLen: document.getElementById('root')?.innerHTML?.length || 0,
        hasLP: !!document.querySelector('[class*="landing" i], [class*="hero" i]'),
        hasWorkspace: !!document.querySelector('[class*="workspace" i], [class*="pane" i]'),
        bodyText: (document.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      }));

      audit.push({ case: c.name, url: c.url, screenshot: shotPath, meta, pageerrors: pageerrors.slice(0, 3), cyanEls });
      console.log(`[${c.name}] shot=${shotPath} cyanBigEls=${cyanEls.length} rootLen=${meta.rootLen}`);
      for (const e of cyanEls) {
        console.log(`  - <${e.tag} class="${e.cls}"> panelCard=${e.isPanelCard} rect=${e.rect.w}x${e.rect.h}@(${e.rect.x},${e.rect.y}) border="${e.borderWidth} ${e.borderStyle} ${e.borderColor}" shadow="${e.boxShadow}" text="${e.textSnippet}"`);
      }
    } catch (err) {
      audit.push({ case: c.name, url: c.url, error: err.message });
      console.error(`[${c.name}] ERROR ${err.message}`);
    } finally {
      await context.close();
    }
  }

  const outJson = resolve(OUT_DIR, 'b3_cyan_audit.json');
  writeFileSync(outJson, JSON.stringify({ timestamp: 'B3-audit', cases: audit }, null, 2));
  console.log(`\nOutput JSON: ${outJson}`);
  process.exit(0);
} finally {
  if (browser) await browser.close();
}
