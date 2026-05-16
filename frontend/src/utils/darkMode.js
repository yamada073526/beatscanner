const STORAGE_KEY = 'chart_dark_mode';

// ダークモード default 化 (2026-05-16、 handover v72、 subagent 6 体合議 A 案 Luxury 5/5)。
// 理由: BeatScanner のブランド世界観 (Aman/Ritz-Carlton 級ダークラグジュアリー) と
// /backtest が既に Aman 級 dark 完成済の一貫性、 数字発色が dark で機能的に正しい
// (Bloomberg/TradingView/Webull の正統性)、 じっちゃまターゲット (40-60 代米国株玄人)
// が業界慣習に合致。 既存 user (localStorage に値あり) は保存値で動作継続 (regression 0)、
// 新規 user (localStorage 空) のみ dark default、 OS prefers-color-scheme は無視。
// Phase 2 (sticky 検索 / 発光系 regression) と Phase 3 (light toggle 残置) は別セッション。
export function initDarkMode() {
  const saved = localStorage.getItem(STORAGE_KEY);
  // saved !== null 時は既存 user の保存値を尊重、 null (新規 user) は dark default
  const isDark = saved !== null ? saved === 'true' : true;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

export function toggleDarkMode() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_KEY, String(next === 'dark'));
  const btn = document.getElementById('dark-toggle-btn');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
  window.dispatchEvent(new CustomEvent('themechange'));
}

export function isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}
