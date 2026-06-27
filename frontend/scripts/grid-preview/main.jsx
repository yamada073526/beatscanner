// スタンドアロン preview: ScreenerGridTable (mock) を実コンポーネントで描画し file:// snapshot する。
// 本番 build とは別 (base './' 相対) で file:// 直開き可能。検証専用・app には影響しない。
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import ScreenerGridTable from '../../src/features/workspace/ScreenerGridTable.jsx';

document.documentElement.setAttribute('data-theme', 'dark');
document.body.style.background = '#0f172a';

createRoot(document.getElementById('root')).render(
  React.createElement(
    'div',
    { style: { padding: '24px' } },
    React.createElement(
      'div',
      { style: { maxWidth: '880px', margin: '0 auto' } },
      React.createElement(ScreenerGridTable, { mock: true }),
    ),
  ),
);
