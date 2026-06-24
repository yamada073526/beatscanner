// snap-screener-v2-dogfood.mjs — 本番 ?screener_v2=1 の B-3 / Phase C を CI で自動 dogfood する。
//
// 目的 (handover v259 §「次セッション最優先 1」の自動化 = CLAUDE.md 原則4「人力の代替」):
//   人力で本番 `?screener_v2=1` を開いて目視していた 3 点を Claude Haiku vision で自動判定する。
//     ① B-3 mseg      : grade crow 内の個別緩急セグメント (緩/標/厳/最厳)
//     ② B-3 lock crow : locked facet が南京錠 + 「Premium で解錠」CTA で表示 (非表示でない)
//     ③ Phase C       : 旬のセクター preset の master-detail (縦バー / 主戦場 amber / Top3)
//   この環境は egress block で本番に到達できないため、GitHub Actions runner (egress 開放) 上で実行し、
//   verdict を job log + artifact に出す。main session は MCP で起動 → log を読んで ground-truth 検証する。
//
// 設計: 診断優先 (diagnostic-first)。click 仮定が外れても DOM presence audit + full-page capture は必ず残し、
//   run ログから実 DOM 経路を学習して反復改善する (PDCA-over-CI)。selector は data-testid 固定で hallucination 回避。
//
// 状態: 既定は anon/Free。南京錠 lock crow と mseg ちら見せ は Free 状態の現象なので Trust Cliff 検証に最適。
//   (Premium pass は DOGFOOD_TEST_* secrets が CI に入ったら別途追加可。本 script は anon で完結する。)
//
// 使い方:
//   ANTHROPIC_API_KEY=sk-... node scripts/snap-screener-v2-dogfood.mjs \
//     [--url <本番URL>] [--dry-run] [--out .visual/screener-v2-dogfood.json]
//   --dry-run は screenshot + DOM audit のみ (API 呼ばない / key 不要)。
//
// visual harness 例外 4 条件: ① snap-*.mjs 命名 ✓ ② chromium headless:true 固定 ✓
//   ③ hard timeout + finally close ✓ ④ .visual/ 出力のみ・本番URL のみ (HTTP server 起動なし) ✓
//   ※ multi-region + 複数 Haiku 呼出のため hard timeout は CI 前例 (snap-visual-regression.mjs=120s) に倣い 110s。
//      CI 専用 dogfood であり、ローカル dogfood (60s 規律) とは port/state 競合しない。

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL =
  'https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener&screener_v2=1';

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = { url: process.env.SNAP_URL || DEFAULT_URL, dryRun: false, out: '.visual/screener-v2-dogfood.json' };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--url') opts.url = argv[++i];
  else if (argv[i] === '--dry-run') opts.dryRun = true;
  else if (argv[i] === '--out') opts.out = argv[++i];
}

const apiKey = process.env.ANTHROPIC_API_KEY;
const visionEnabled = !!apiKey && !opts.dryRun;

const OUT_DIR = resolve(__dirname, '../.visual/screener-v2');
const HARD_TIMEOUT_MS = 110_000;
const hardTimer = setTimeout(() => {
  console.error('[screener-v2-dogfood] HARD TIMEOUT (110s) exceeded');
  process.exit(2);
}, HARD_TIMEOUT_MS);
hardTimer.unref?.();

// ── 各ステージの vision チェック項目 (handover v259 §1 の人力目視点を文章化) ──
// v2 (iteration 2): B-3 を mseg / lock crow に分割。mseg は 4 段ラベル (緩/標/厳/最厳) が小さく、
//   conds 全体 clip では vision が読めず誤 fail したため、単一 crow に zoom した capture で判定する。
const CHECKS = {
  phaseC: [
    'セクター一覧 (master) が縦バー付きで複数行表示され、最上位行に「主戦場」バッジが付いているか',
    '選択セクターの detail に合致銘柄が Top3 (ティッカー + 企業名 + 「5条件達成」) で表示されているか',
    '縦バーの色が 主戦場=amber(オレンジ) / 上位=緑 で、シアン(水色)が「上昇」の意味で使われていないか',
  ],
  b3_mseg: [
    'この行 (grade crow) 内に個別緩急セグメントとして「緩 / 標 / 厳 / 最厳」の4段のボタンが横並びで表示されているか',
  ],
  b3_lock_crow: [
    'ロックされた条件が「非表示」ではなく、南京錠アイコン + 「Premium で解錠」CTA の行 (crow) で表示されているか',
    '同一のロック条件が画面内で重複して表示されていないか',
  ],
};

// ── DOM presence audit: 目標 testid の有無を数える + screener-* を列挙 (診断用) ──
async function auditDom(page) {
  return await page.evaluate(() => {
    const q = (sel) => document.querySelectorAll(sel).length;
    const present = Array.from(document.querySelectorAll('[data-testid]'))
      .map((el) => el.getAttribute('data-testid'))
      .filter((t) => t && t.startsWith('screener'))
      .reduce((acc, t) => {
        // 末尾の動的 suffix (ticker / cond key) を畳んで種類だけ列挙
        const base = t.replace(/-[A-Z0-9_]+$/i, '-*');
        acc[base] = (acc[base] || 0) + 1;
        return acc;
      }, {});
    return {
      targets: {
        'screener-master': q('[data-testid="screener-master"]'),
        'screener-mode-custom': q('[data-testid="screener-mode-custom"]'),
        'screener-strategy-hot_sector': q('[data-testid="screener-strategy-hot_sector"]'),
        'screener-sector-master-detail': q('[data-testid="screener-sector-master-detail"]'),
        'screener-secrow-*': q('[data-testid^="screener-secrow-"]'),
        'screener-sector-detail': q('[data-testid="screener-sector-detail"]'),
        'screener-detail-toggle': q('[data-testid="screener-detail-toggle"]'),
        'screener-adv-toggle': q('[data-testid="screener-adv-toggle"]'),
        'screener-conds': q('[data-testid="screener-conds"]'),
        'screener-mseg-*': q('[data-testid^="screener-mseg-"]'),
        'locked-crow[data-locked]': q('[data-cond][data-locked="1"]'),
        'screener-locked-cta-*': q('[data-testid^="screener-locked-cta-"]'),
      },
      presentKinds: present,
    };
  });
}

async function captureRegion(page, selector, file) {
  mkdirSync(OUT_DIR, { recursive: true });
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return { found: false, screenshot: null };
  await el.scrollIntoViewIfNeeded({ block: 'center' }).catch(() => {});
  await page.waitForTimeout(700);
  const bbox = await el.boundingBox().catch(() => null);
  const path = `${OUT_DIR}/${file}`;
  if (bbox && bbox.width > 4 && bbox.height > 4) {
    await page.screenshot({
      path,
      clip: {
        x: Math.max(0, bbox.x - 24),
        y: Math.max(0, bbox.y - 24),
        width: Math.min(1440, bbox.width + 48),
        height: Math.min(2400, bbox.height + 48),
      },
    });
  } else {
    await page.screenshot({ path, fullPage: true });
  }
  return { found: true, screenshot: path };
}

async function visionVerdict(client, screenshotPath, checks) {
  const { readFileSync } = await import('fs');
  const imageBase64 = readFileSync(screenshotPath).toString('base64');
  const checksText = checks.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
          {
            type: 'text',
            text: `この screenshot は米国株スクリーナー画面です。以下のチェック項目それぞれを visual confirm で pass/fail/uncertain 判定し、JSON のみで出力してください:

${checksText}

回答 format (strict JSON):
{
  "verdict": "pass" | "fail" | "uncertain",
  "checks": [
    { "id": 1, "check": "...", "pass": true, "confidence": "high"|"medium"|"low", "reason": "短い説明" }
  ],
  "root_cause_hint": "fail 時のみ原因推定"
}

判定基準:
- pass: 項目が明確に満たされている
- fail: 明確に満たされていない or 期待と異なる
- uncertain: screenshot の品質/見切れで判定不能
全 check が pass なら verdict=pass、1 件でも fail なら verdict=fail。JSON 以外は出力しないこと。`,
          },
        ],
      },
    ],
  });
  const responseText = message.content[0].text.trim();
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
}

// ── main ────────────────────────────────────────────────────────────────────
(async () => {
  const client = visionEnabled ? new Anthropic({ apiKey }) : null;
  const report = { ts: new Date().toISOString(), url: opts.url, visionEnabled, stages: [], audits: {} };
  let browser;
  try {
    mkdirSync(OUT_DIR, { recursive: true });
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e?.message || e).slice(0, 160)));

    console.error(`[screener-v2-dogfood] goto ${opts.url}`);
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    // screener master mount + universe fetch (rs/cup/retest/breakout 5本) 完了待ち
    await page.waitForSelector('[data-testid="screener-master"]', { timeout: 18_000 }).catch(() => {});
    await page.waitForTimeout(6500);

    report.audits.initial = await auditDom(page);
    await page.screenshot({ path: `${OUT_DIR}/00-initial-fullpage.png`, fullPage: true });
    console.error('[screener-v2-dogfood] initial audit:', JSON.stringify(report.audits.initial.targets));

    // ── Stage A: Phase C — 旬のセクター preset (hot_sector) → master-detail ──
    const stageC = { name: 'phaseC_sector_master_detail', label: 'Phase C: 旬のセクター master-detail', checks: CHECKS.phaseC };
    try {
      const hot = page.locator('[data-testid="screener-strategy-hot_sector"]').first();
      if ((await hot.count()) > 0) {
        await hot.scrollIntoViewIfNeeded().catch(() => {});
        await hot.click();
        await page.waitForTimeout(2500); // preset 適用 + custom 自動切替 + master-detail mount
        await page.waitForSelector('[data-testid="screener-sector-master-detail"]', { timeout: 8000 }).catch(() => {});
        // master の先頭セクターを選択して detail を埋める
        const firstRow = page.locator('[data-testid^="screener-secrow-"]').first();
        if ((await firstRow.count()) > 0) {
          await firstRow.click();
          await page.waitForTimeout(1200);
        }
      } else {
        stageC.note = 'screener-strategy-hot_sector ボタンが不在 (custom bar 未表示 or universe 未ロード)';
      }
    } catch (e) {
      stageC.error = String(e?.message || e).slice(0, 200);
    }
    report.audits.afterHotSector = await auditDom(page);
    const capC = await captureRegion(page, '[data-testid="screener-sector-master-detail"]', '10-phaseC-master-detail.png');
    stageC.found = capC.found;
    stageC.screenshot = capC.screenshot;
    report.stages.push(stageC);

    // ── Stage B: B-3 — custom 詳細 → adv ON → mseg + lock crow ──
    const stageMseg = { name: 'b3_mseg', label: 'B-3: mseg 個別緩急 (緩/標/厳/最厳)', checks: CHECKS.b3_mseg };
    const stageLock = { name: 'b3_lock_crow', label: 'B-3: Premium lock crow (南京錠)', checks: CHECKS.b3_lock_crow };
    try {
      // custom モードを保証 (hot_sector で既に custom のはずだが、念のため)
      const customBtn = page.locator('[data-testid="screener-mode-custom"]').first();
      if ((await customBtn.count()) > 0) {
        await customBtn.click().catch(() => {});
        await page.waitForTimeout(1200);
      }
      const detailToggle = page.locator('[data-testid="screener-detail-toggle"]').first();
      if ((await detailToggle.count()) > 0) {
        const expanded = await detailToggle.getAttribute('aria-expanded');
        if (expanded !== 'true') await detailToggle.click();
        await page.waitForTimeout(1200);
      } else {
        stageMseg.note = 'screener-detail-toggle 不在';
      }
      const advToggle = page.locator('[data-testid="screener-adv-toggle"]').first();
      if ((await advToggle.count()) > 0) {
        const advExpanded = await advToggle.getAttribute('aria-pressed');
        if (advExpanded !== 'true') await advToggle.click().catch(() => {});
        await page.waitForTimeout(1500);
      } else {
        stageMseg.note = (stageMseg.note ? stageMseg.note + '; ' : '') + 'screener-adv-toggle 不在';
      }
    } catch (e) {
      stageMseg.error = stageLock.error = String(e?.message || e).slice(0, 200);
    }
    report.audits.afterAdv = await auditDom(page);
    // mseg: 4段ラベルが読めるよう、mseg を含む単一 crow に zoom (conds 全体だと縮小で illegible)
    const capMseg = await captureRegion(
      page,
      '[data-testid="screener-cond-row"]:has([data-testid^="screener-mseg-"])',
      '21-b3-mseg-crow.png',
    );
    stageMseg.found = capMseg.found;
    stageMseg.screenshot = capMseg.screenshot;
    report.stages.push(stageMseg);
    // lock crow: 南京錠の出る conds 領域全体
    const capLock = await captureRegion(page, '[data-testid="screener-conds"]', '20-b3-conds.png');
    stageLock.found = capLock.found;
    stageLock.screenshot = capLock.screenshot;
    report.stages.push(stageLock);

    // ── Vision verdict (key 有り & not dry-run のときのみ) ──
    if (visionEnabled) {
      for (const st of report.stages) {
        const stageChecks = st.checks;
        if (!st.found || !st.screenshot) {
          st.verdict = 'uncertain';
          st.checks = stageChecks.map((c) => ({ check: c, pass: false, reason: 'region 未 capture' }));
          continue;
        }
        try {
          const v = await visionVerdict(client, st.screenshot, stageChecks);
          st.verdict = v.verdict;
          st.checks = v.checks;
          st.root_cause_hint = v.root_cause_hint || null;
        } catch (e) {
          st.verdict = 'uncertain';
          st.visionError = String(e?.message || e).slice(0, 200);
        }
      }
    } else {
      console.error('[screener-v2-dogfood] vision skip (dry-run or ANTHROPIC_API_KEY 未設定) — capture + audit のみ');
    }

    report.pageErrors = pageErrors;
    const verdicts = report.stages.map((s) => s.verdict).filter(Boolean);
    report.overall =
      !visionEnabled ? 'capture-only'
      : verdicts.includes('fail') ? 'fail'
      : verdicts.includes('uncertain') ? 'uncertain'
      : 'pass';

    mkdirSync(dirname(resolve(process.cwd(), opts.out)), { recursive: true });
    writeFileSync(resolve(process.cwd(), opts.out), JSON.stringify(report, null, 2));
    // job log に verdict を出す (MCP get_job_logs で読む ground-truth)
    console.log(JSON.stringify(report, null, 2));

    process.exit(report.overall === 'fail' ? 1 : 0);
  } catch (e) {
    console.error('[screener-v2-dogfood] fatal:', e?.message || e);
    try {
      writeFileSync(resolve(process.cwd(), opts.out), JSON.stringify({ ...report, fatal: String(e?.message || e) }, null, 2));
    } catch {}
    process.exit(2);
  } finally {
    if (browser) await browser.close();
  }
})();
