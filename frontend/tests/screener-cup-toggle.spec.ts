// cup「型」状態トグルの一気通貫 E2E (SPEC_2026-06-25 cup-state-toggle・handover Q4)。
//
// 目的: 「実装 → 本番反映 → 動作」を人手の目視に頼らず CI で機械検証する機構。
//   新高値ブレイク(new_high_break) preset の cup「型」トグルを Premium session で実操作し、
//   ① トグルが描画される (= 機能が本番に乗っている証明)
//   ② クリックで data-cup-state が all→confirmed→handle→cup→all と循環し、ラベルも一致
//   ③ 件数の正直さ (Trust Cliff §3-3/C-2): 特定 stage は baseline 以下 (AND 絞り込み = 単調非増加)、
//      「すべて」は baseline に復帰 (型で絞らない = 件数不変)
//   までをアサートする。
//
// 認証: scripts/lib/auth-helper.mjs:getAuthInjection() で実 Supabase session を取得し
//   localStorage 注入 (bypass flag 無し・production app 不変)。cup トグルは Premium 限定のため必須。
//   4 secrets (VITE_SUPABASE_URL/ANON_KEY + DOGFOOD_TEST_EMAIL/PASSWORD) 未設定なら test.skip
//   (PR from fork / secrets 無しの local で誤検知しないため)。CI gate は screener_cup_toggle_e2e.yml。
import { test, expect, type Page } from '@playwright/test';
// @ts-ignore — 型定義なしの harness lib (Playwright loader は型を strip するので runtime import 可)
import { getAuthInjection } from '../scripts/lib/auth-helper.mjs';

// 本番 workspace の screener 直リンク (dogfood と同一・screener_v2 有効)。
const SCREENER_URL = '/?layout=workspace&pillar2_pane1=1&tab=screener&screener_v2=1';

// 循環順 + 和名ラベル (CustomScreenerPanel.jsx の CUP_STATE_ORDER / CUP_STATE_LABEL_JP と 1:1)。
const STATE_LABEL: Record<string, string> = {
  all: 'すべて',
  confirmed: 'ブレイク確定',
  handle: '取っ手形成中',
  cup: 'カップ形成中',
};
const CLICK_ORDER = ['confirmed', 'handle', 'cup', 'all']; // all から 1 click 目 = confirmed

async function liveCount(page: Page): Promise<number> {
  const txt = await page.locator('[data-testid="screener-live-count"]').first().textContent();
  return Number((txt || '').replace(/[^0-9]/g, ''));
}

test.describe('screener cup 状態トグル E2E (Premium・一気通貫)', () => {
  test('新高値ブレイクで型トグルが循環し件数が整合する', async ({ page }) => {
    // Premium auth env が無ければ skip (誤検知防止)。getAuthInjection は env 欠落で null。
    const entries = await getAuthInjection();
    test.skip(!entries, 'DOGFOOD_TEST_* / VITE_SUPABASE_* secrets 未設定 → Premium 検証を skip');

    // goto より先に localStorage へ Premium session を注入。
    await page.addInitScript((es: Array<{ key: string; value: string }>) => {
      for (const { key, value } of es) window.localStorage.setItem(key, value);
    }, entries);

    await page.goto(SCREENER_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="screener-master"]', { timeout: 20_000 });
    await page.waitForTimeout(3000); // universe fetch (rs/cup/retest/breakout) 完了待ち

    // 新高値ブレイク preset を選択。
    const presetBtn = page.locator('[data-testid="screener-strategy-new_high_break"]').first();
    await expect(presetBtn, '新高値ブレイク preset chip が存在する').toHaveCount(1);
    await presetBtn.scrollIntoViewIfNeeded().catch(() => {});
    await presetBtn.click();
    await page.waitForTimeout(2500); // preset 適用 + filter

    // 詳細 (conds) が折りたたみなら開く。
    const detail = page.locator('[data-testid="screener-detail-toggle"]').first();
    if ((await detail.count()) > 0 && (await detail.getAttribute('aria-expanded')) !== 'true') {
      await detail.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    // ① Premium で cup「型」トグルが描画される (= 機能が本番に乗っている証明)。
    const toggle = page.locator('[data-testid="screener-cup-state-toggle"]').first();
    await expect(toggle, 'Premium で cup 状態トグルが表示される').toBeVisible({ timeout: 12_000 });

    // ② 初期状態 = all / すべて (件数不変の default)。
    await expect(toggle).toHaveAttribute('data-cup-state', 'all');
    await expect(toggle).toHaveText('すべて');

    const baseline = await liveCount(page);
    expect(baseline, '該当件数が数値で取得できる').toBeGreaterThanOrEqual(0);

    // ③ クリックで循環。各 stage で属性/ラベル一致 + 件数の単調性/復帰を検証。
    for (const expectedState of CLICK_ORDER) {
      await toggle.click();
      await page.waitForTimeout(1500); // displayItems 再計算
      await expect(toggle, `循環で ${expectedState} に遷移`).toHaveAttribute('data-cup-state', expectedState);
      await expect(toggle, `${expectedState} のラベル表示`).toHaveText(STATE_LABEL[expectedState]);

      const cnt = await liveCount(page);
      if (expectedState === 'all') {
        // 「すべて」= 型で絞らない → baseline に復帰 (件数不変の正直さ・§3-3)。
        expect(cnt, '「すべて」で baseline 件数に復帰する').toBe(baseline);
      } else {
        // 特定 stage = cup_state を AND 絞り込み → baseline 以下 (0 件も正常・単調非増加)。
        expect(cnt, `${expectedState} は baseline 以下 (AND 絞り込み)`).toBeLessThanOrEqual(baseline);
      }
    }
  });
});
