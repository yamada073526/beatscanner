import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// 広告ブロッカーが analytics.js をブロックする (ERR_BLOCKED_BY_CLIENT) と
// 静的 import 失敗 → アプリ全体が真っ白になるため、dynamic import で隔離。
import('./lib/analytics.js').then((m) => m.initAnalytics?.()).catch(() => {});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
