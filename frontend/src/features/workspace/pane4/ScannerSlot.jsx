/**
 * ScannerSlot — Workspace Pane 4 内の Scanner section (handover v81 Top 4、 6 体合議 5/6 賛成).
 *
 * 設計:
 *   - 既存 components/CustomScreenerPanel.jsx を lazy import + 薄いラッパで再利用 (旧 SPA も同じ実装を参照)
 *   - onSelect で workspaceStore.setActiveTicker + setActiveTab('judgment') を発火 → Pane 3 detail に遷移
 *   - Pane 2 watchlist 自動追加なし (6 体合議: ユーザー意図と乖離するため micro+ ボタンも本 Phase では未実装)
 *
 * Trust Cliff 対策 (handover v81 §0-E と同パターン):
 *   - 「ファンダ ∩ Cup」 chip の tooltip は CustomScreenerPanel 側で更新済 (Pro 片方 scan 明示)
 */
import { Suspense, lazy, useCallback } from 'react';
import { useWorkspaceStore } from '../../../state/workspaceStore.js';

const CustomScreenerPanel = lazy(() => import('../../../components/CustomScreenerPanel.jsx'));

export default function ScannerSlot() {
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setSelectedTarget = useWorkspaceStore((s) => s.setSelectedTarget);
  const setPane3JudgmentOverride = useWorkspaceStore((s) => s.setPane3JudgmentOverride);

  const handleSelect = useCallback((ticker) => {
    if (!ticker) return;
    const sym = String(ticker).trim().toUpperCase();
    setActiveTicker(sym);
    setSelectedTarget({ type: 'ticker', id: sym });
    setPane3JudgmentOverride(true);
    setActiveTab('judgment');
  }, [setActiveTicker, setActiveTab, setSelectedTarget, setPane3JudgmentOverride]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '8px 12px' }}>
      <Suspense
        fallback={
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            スキャナーを読込中...
          </div>
        }
      >
        <CustomScreenerPanel onSelect={handleSelect} />
      </Suspense>
    </div>
  );
}
