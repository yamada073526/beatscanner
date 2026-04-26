const STORAGE_KEY = 'chart_dark_mode';

export function initDarkMode() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const isDark = saved !== null
    ? saved === 'true'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
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
