/**
 * PaneDetailView — Pane 3 の dispatcher (v71 抽象化、 6 体合議 converge)。
 *
 * Pane 3 が表示する target を workspaceStore.selectedTarget で discriminated union 化:
 *   - { type: 'index', id: '^GSPC' }       → IndicesDetailView (既存 chart + 期間テーブル + ニュース)
 *   - { type: 'portfolio', id: accountId } → PortfolioDetailBody (大 chart + 保有銘柄 aggregate news)
 *   - { type: 'ticker', id: 'AAPL' }       → 将来 (Cmd+K / watchlist click 経由の deep link)
 *
 * 設計原則:
 *   - URL = SSOT (useUrlSync が ?detail= で表現)
 *   - shell (sticky bar / breadcrumb / skeleton) は dispatcher 側に集約、 body は kind 別に物理分離
 *   - 旧 callsite (activeIndexSymbol) は selectedTarget と setActiveIndexSymbol setter で同期、
 *     段階移行のため当面残置。 完全削除は 1-2 sprint 後の cleanup pass で。
 *
 * memory anchor: feedback_pane3_detail_view.md / project_pane3_abstraction_consensus.md
 */
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import { IndicesDetailView } from './IndicesView.jsx';
import PortfolioDetailBody from './PortfolioDetailBody.jsx';

export default function PaneDetailView() {
  const target = useWorkspaceStore((s) => s.selectedTarget) || { type: 'index', id: null };

  switch (target.type) {
    case 'portfolio':
      return <PortfolioDetailBody scopeId={target.id || 'all'} />;
    case 'ticker':
      // 未実装 (Phase 3+ で実装予定): フォールバック index に流す
      return <IndicesDetailView />;
    case 'index':
    default:
      return <IndicesDetailView />;
  }
}
