// Playwright smoke test config.
// handover v66 §1 round 3 構造投資: testing 15→50 (100 点ロードマップ Tier 1).
//
// 設計方針:
// - **本番直送デプロイ** (CLAUDE.md「railway up のみ」) なので localhost dev server を起動しない.
//   既定 baseURL は本番、CI で staging を使う場合は env `PLAYWRIGHT_BASE_URL` で override.
// - CI gate にはせず、PR check のみ (CLAUDE.md「本番直送」精神と整合).
// - chromium のみ (free CI 時間節約、Safari/Firefox は本番 issue が起きてから追加).

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://beatscanner-production.up.railway.app';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // demoAnalyze 3 req/IP/day を共有するため順次
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // demo rate limit を共有するため
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  outputDir: '.playwright-output',
});
