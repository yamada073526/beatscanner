// スタンドアロン preview: ScreenerGridTable を実コンポーネントで描画し file:// snapshot する。
// per-preset 根拠カラム検証用に earnings(mock) + 4 column-driven preset を並べて描く。
// 本番 build とは別 (base './' 相対) で file:// 直開き可能。検証専用・app には影響しない。
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import ScreenerGridTable from '../../src/features/workspace/ScreenerGridTable.jsx';

document.documentElement.setAttribute('data-theme', 'dark');
document.body.style.background = '#0f172a';

// 全 metric field を持つ mock item (preset 横断で再利用)。符号/null/bool の多様性を持たせ
//   §38 中立色・空セル「—」・leader badge の双方を検証可能にする。
const MK = (o) => ({
  ocf_margin_pct: 22, roe: 31, eps_yoy_pct: 28, rs_vs_spy_pct: 12,
  near_high_pct_scaled: 96, volume_surge_pct: 48, inst_holders_qoq_pct: 6,
  is_sector_rs_leader: true, latest_beat: true, last_report_date: '2026-05-07', ...o,
});
const ITEMS = [
  MK({ ticker: 'NVDA', name: 'NVIDIA', rs_percentile: 92 }),
  MK({ ticker: 'AVGO', name: 'Broadcom', rs_percentile: 88, latest_beat: false, inst_holders_qoq_pct: -4, near_high_pct_scaled: 91, rs_vs_spy_pct: -3 }),
  MK({ ticker: 'TSM', name: 'Taiwan Semi', rs_percentile: 64, is_sector_rs_leader: false, roe: null }),
];

const PRESETS = ['new_high_break', 'sector_leader', 'quiet_quality', 'market_leading'];

const sections = PRESETS.map((p) =>
  React.createElement(
    'section',
    { key: p, 'data-snap-preset': p, style: { marginBottom: '40px' } },
    React.createElement('div', { style: { color: '#94a3b8', fontSize: '13px', marginBottom: '8px' } }, p),
    React.createElement(ScreenerGridTable, { preset: p, items: ITEMS, count: ITEMS.length }),
  ),
);

// earnings 回帰 (従来 MOCK_ROWS path)。
sections.push(
  React.createElement(
    'section',
    { key: 'earnings', 'data-snap-preset': 'earnings_mock', style: { marginBottom: '40px' } },
    React.createElement('div', { style: { color: '#94a3b8', fontSize: '13px', marginBottom: '8px' } }, 'earnings_pass (mock 回帰)'),
    React.createElement(ScreenerGridTable, { mock: true }),
  ),
);

createRoot(document.getElementById('root')).render(
  React.createElement(
    'div',
    { style: { padding: '24px' } },
    React.createElement('div', { style: { maxWidth: '900px', margin: '0 auto' } }, sections),
  ),
);
