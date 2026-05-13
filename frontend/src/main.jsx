import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// 広告ブロッカーが analytics.js をブロックする (ERR_BLOCKED_BY_CLIENT) と
// 静的 import 失敗 → アプリ全体が真っ白になるため、dynamic import で隔離。
import('./lib/analytics.js').then((m) => m.initAnalytics?.()).catch(() => {});

// Sentry も同様に dynamic import で隔離 (SDK 100kB の初期 bundle 影響回避 + DSN 未設定時の silent skip).
import('./lib/sentry.js').then((m) => m.initSentry?.()).catch(() => {});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
