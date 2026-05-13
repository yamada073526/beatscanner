/**
 * Smoke test: LP → workspace mode → demo ticker click → Pane 3/4 news 表示 → click feedback verify.
 *
 * 設計方針 (handover v66 §1 round 3):
 * - 本番 URL を直接叩く (CLAUDE.md「本番直送」と整合).
 * - snap-active.mjs の matrix 検証ロジックを再利用、Δy ≥ 2px or Δscale ≥ 0.02 を assert.
 * - demoAnalyze 3 req/IP/day 制限のため fullyParallel: false + workers: 1 で順次実行.
 *
 * これが何を catch するか:
 * - LP が真っ白になる regression (white screen of death)
 * - demo ticker click が遷移しない (Trust Cliff)
 * - news fetch が永久に loading で止まる
 * - Pane 4 click feedback の matrix 退行 (animation forwards fill 罠の再発)
 */

import { test, expect } from '@playwright/test';

test.describe('BeatScanner smoke', () => {
  test('LP renders and hero is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    // 「BeatScanner」のロゴ alt text を確認
    await expect(page.locator('img[alt="BeatScanner"]')).toBeVisible();
  });

  test('workspace mode mounts with demo ticker chips', async ({ page }) => {
    await page.goto('/?layout=workspace');
    // workspace shell の sentinel class
    await expect(page.locator('.ds-workspace-shell')).toBeVisible({ timeout: 15_000 });
    // Pane 2 onboarding に AAPL/NVDA/TSLA/MSFT chip が出る
    const demoChip = page.locator('button').filter({ hasText: /^(AAPL|NVDA|TSLA|MSFT)$/ }).first();
    await expect(demoChip).toBeVisible({ timeout: 15_000 });
  });

  test('Pane 4 click feedback: Δy ≥ 2px or Δscale ≥ 0.02 (animation forwards fill 罠 regression guard)', async ({ page }) => {
    await page.goto('/?layout=workspace');
    await page.locator('.ds-workspace-shell').waitFor({ state: 'visible', timeout: 15_000 });

    // demo ticker click → Pane 3/4 mount
    await page.locator('button').filter({ hasText: /^(AAPL|NVDA|TSLA|MSFT)$/ }).first().click();
    await page.waitForTimeout(3000);

    // Pane 4 inspector toggle (header)
    const pane4Toggle = page.locator('button[aria-label="インスペクタを開く"]');
    if (await pane4Toggle.count() > 0) {
      await pane4Toggle.click();
      await page.waitForTimeout(2000);
    }

    const target = page.locator('.ws-pane4-news-item').first();
    await expect(target).toBeVisible({ timeout: 30_000 });
    await target.scrollIntoViewIfNeeded();

    // 進行中 animation を強制完了 (slide-in が transform 独占する罠を可視化)
    await page.evaluate(() => {
      document.querySelectorAll('.ws-pane4-news-item').forEach((el) =>
        el.getAnimations().forEach((a) => a.finish()),
      );
    });
    await page.waitForTimeout(50);

    const readTransform = () => target.evaluate((el) => getComputedStyle(el).transform);
    await target.hover();
    await page.waitForTimeout(260);
    const hover = await readTransform();
    await page.mouse.down();
    await page.waitForTimeout(140);
    const press = await readTransform();
    await page.mouse.up();

    const parseMatrix = (s: string) => {
      const m = s.match(/matrix\(([^)]+)\)/);
      if (!m) return { tx: 0, ty: 0, sx: 1 };
      const [a, , , , , ty] = m[1].split(',').map((v) => parseFloat(v.trim()));
      return { sx: a, ty };
    };
    const h = parseMatrix(hover);
    const p = parseMatrix(press);
    const dy = Math.abs(p.ty - h.ty);
    const ds = Math.abs(p.sx - h.sx);
    const perceivable = dy >= 2 || ds >= 0.02;

    expect(
      perceivable,
      `Pane 4 click feedback not perceivable. hover=${hover}, press=${press}, Δy=${dy.toFixed(2)}, Δscale=${ds.toFixed(4)}. ` +
        `Possible cause: animation forwards fill が transform を独占 (feedback_press_feedback_delta.md 教訓).`,
    ).toBe(true);
  });
});
