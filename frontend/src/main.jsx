import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import PaneErrorBoundary from './components/PaneErrorBoundary.jsx';
import './index.css';

// 広告ブロッカーが analytics.js をブロックする (ERR_BLOCKED_BY_CLIENT) と
// 静的 import 失敗 → アプリ全体が真っ白になるため、dynamic import で隔離。
import('./lib/analytics.js').then((m) => m.initAnalytics?.()).catch(() => {});

// Sentry も同様に dynamic import で隔離 (SDK 100kB の初期 bundle 影響回避 + DSN 未設定時の silent skip).
// handover v68 §2 #6: init 後に workspaceStore.selectedAccountId を watch して Sentry tag に反映
import('./lib/sentry.js').then(async (m) => {
  await m.initSentry?.();
  try {
    const { useWorkspaceStore } = await import('./state/workspaceStore.js');
    // 初期 tag set (persist 経由で 既に accountId が選択済の場合に拾う)
    m.setAccountTag?.(useWorkspaceStore.getState().selectedAccountId);
    useWorkspaceStore.subscribe((state, prev) => {
      if (state.selectedAccountId !== prev?.selectedAccountId) {
        m.setAccountTag?.(state.selectedAccountId);
      }
    });
  } catch {
    // workspaceStore subscribe 失敗時は tag 更新だけスキップ (sentry init 自体は成立)
  }
}).catch(() => {});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* v146: 最終ネット。 pane 個別の boundary を抜けた render throw / chunk error でも
        全画面真っ白 (silent unmount) にせず、 branded fallback + 再読み込み誘導に落とす。 */}
    <PaneErrorBoundary label="app-root">
      <App />
    </PaneErrorBoundary>
  </React.StrictMode>,
);
