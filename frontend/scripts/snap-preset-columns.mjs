// snap-preset-columns.mjs — per-preset 根拠カラムを実コンポーネントで file:// 描画し裏取り (使い捨て)。
//   harness (scripts/grid-preview, base './' 相対) を事前に vite build 済の前提。
//   検証: ① 各 preset の grid table + header 列数 ② count==list ③ §38 中立色 (neutral cell が
//   gain/loss 色でない・token probe で allow-set 照合) ④ verdict chip は色付き ⑤ leader badge
//   ⑥ console error 0。visual harness 4条件: snap-*.mjs / headless / hard timeout+finally close /
//   .visual 出力・HTTP server なし (file:// のみ)。
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../.visual');
mkdirSync(outDir, { recursive: true });
const url = 'file://' + resolve(__dirname, '../.visual/grid-preview/index.html');

// preset → 期待 header 列数 (銘柄 + 根拠列)。new_high_break/sector_leader/quiet_quality=6, market_leading=7。
const EXPECT_HEADER_COLS = { new_high_break: 6, sector_leader: 6, quiet_quality: 6, market_leading: 7, earnings_mock: 9 };
const HAS_VERDICT = new Set(['new_high_break', 'market_leading']);

const kill = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 50000);
const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files', '--disable-web-security'] });
const out = { url };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 1400 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 160)));
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1000);
  // reveal stagger を全 reveal させる
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  out.sections = await page.evaluate(() => {
    const probe = (v) => { const s = document.createElement('span'); s.style.color = `var(${v})`; document.body.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; };
    const allow = new Set(['--text-primary', '--text-secondary', '--text-muted', '--color-gold-mid', '--color-gold'].map(probe));
    const gain = probe('--color-gain'); const loss = probe('--color-loss');
    const result = {};
    for (const sec of document.querySelectorAll('[data-snap-preset]')) {
      const p = sec.getAttribute('data-snap-preset');
      const header = sec.querySelector('[data-testid="screener-grid-header"]');
      const rows = [...sec.querySelectorAll('[data-testid^="screener-grid-row-"]')];
      const countB = sec.querySelector('.screener-grid-count b');
      const neutralSel = '.screener-grid-cell--pri .v, .screener-grid-cell--sec, .screener-grid-rs, .screener-grid-lead-badge';
      const neutralLeaks = [];
      for (const el of sec.querySelectorAll(neutralSel)) {
        const c = getComputedStyle(el).color;
        if (c === gain) neutralLeaks.push('GAIN:' + (el.textContent || '').trim());
        else if (c === loss) neutralLeaks.push('LOSS:' + (el.textContent || '').trim());
        else if (!allow.has(c)) neutralLeaks.push('UNKNOWN:' + (el.textContent || '').trim() + '=' + c);
      }
      const chips = [...sec.querySelectorAll('.screener-grid-chip')].map((el) => getComputedStyle(el).color);
      const chipColored = chips.filter((c) => !allow.has(c)).length;
      result[p] = {
        hasTable: !!sec.querySelector('[data-testid="screener-grid-table"]'),
        headerCols: header ? header.children.length : 0,
        rowCount: rows.length,
        countText: countB ? countB.textContent.trim() : null,
        countMatchesRows: countB ? Number(countB.textContent.trim()) === rows.length : null,
        neutralLeaks,
        chipCount: chips.length,
        chipColored,
        hasLeaderBadge: !!sec.querySelector('.screener-grid-lead-badge'),
        headerLabels: header ? [...header.children].map((c) => (c.textContent || '').trim()).join(' | ') : null,
      };
    }
    return { gain, loss, allow: [...allow], presets: result };
  });

  out.consoleErrors = errs.slice(0, 12);
  await page.screenshot({ path: resolve(outDir, 'preset-columns-all.png'), fullPage: true });

  // 判定
  const verdicts = [];
  for (const [p, exp] of Object.entries(EXPECT_HEADER_COLS)) {
    const s = out.sections.presets[p];
    if (!s) { verdicts.push(`❌ ${p}: section 不在`); continue; }
    const okTable = s.hasTable;
    const okCols = s.headerCols === exp;
    const okCount = s.countMatchesRows === true;
    const okNeutral = s.neutralLeaks.length === 0;
    const okChip = HAS_VERDICT.has(p) ? s.chipColored > 0 : true;
    const okLeader = p === 'sector_leader' ? s.hasLeaderBadge : true;
    const pass = okTable && okCols && okCount && okNeutral && okChip && okLeader;
    verdicts.push(`${pass ? '✅' : '❌'} ${p}: table=${okTable} cols=${s.headerCols}/${exp} count==list=${okCount}(${s.countText}/${s.rowCount}) neutral=${okNeutral}${s.neutralLeaks.length ? '(' + s.neutralLeaks.join(',') + ')' : ''} chipColored=${s.chipColored} leaderBadge=${s.hasLeaderBadge}`);
  }
  out.verdicts = verdicts;
  out.consoleErrorsCount = out.consoleErrors.length;
  writeFileSync(resolve(outDir, 'preset-columns-out.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ verdicts, consoleErrors: out.consoleErrors, headers: Object.fromEntries(Object.entries(out.sections.presets).map(([k, v]) => [k, v.headerLabels])) }, null, 2));
} catch (e) {
  out.fatal = String(e).slice(0, 300);
  console.error('[preset-columns] error', out.fatal);
  writeFileSync(resolve(outDir, 'preset-columns-out.json'), JSON.stringify(out, null, 2));
} finally {
  await browser.close();
  clearTimeout(kill);
}
