/**
 * PaneDetailView — Pane 3 の dispatcher (v71 抽象化、 6 体合議 converge)。
 *
 * Pane 3 が表示する target を workspaceStore.selectedTarget で discriminated union 化:
 *   - { type: 'index', id: '^GSPC' }       → IndicesDetailView (既存 chart + 期間テーブル + ニュース)
 *   - { type: 'portfolio', id: accountId } → PortfolioDetailBody (大 chart + 保有銘柄 aggregate news)
 *   - { type: 'ticker', id: 'AAPL' }       → TickerDetailBody (handover v82 Phase 1 で fallback 解消)
 *
 * 設計原則:
 *   - URL = SSOT (useUrlSync が ?detail= で表現)
 *   - shell (sticky bar / breadcrumb / skeleton) は dispatcher 側に集約、 body は kind 別に物理分離
 *   - 旧 callsite (activeIndexSymbol) は selectedTarget と setActiveIndexSymbol setter で同期、
 *     段階移行のため当面残置。 完全削除は 1-2 sprint 後の cleanup pass で。
 *
 * memory anchor: feedback_pane3_detail_view.md / project_pane3_abstraction_consensus.md /
 *                project_pane3_visual_explainer_redesign.md (handover v82 Phase 1)
 */
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import { IndicesDetailView } from './IndicesView.jsx';
import PortfolioDetailBody from './PortfolioDetailBody.jsx';
import TickerDetailBody from './TickerDetailBody.jsx';

/**
 * @param {object} [props]
 * @param {(ticker: string) => object|null} [props.detailFor] - ticker 詳細データ引き当て (TickerDetailBody → JudgmentDetail)
 * @param {(ticker: string) => void} [props.onAnalyze]        - 分析実行 trigger
 * @param {string} [props.plan='free']
 * @param {object} [props.detailContext={}] - { user, isPro, onUpgrade, onSignIn }
 */
export default function PaneDetailView({
  detailFor,
  onAnalyze,
  plan = 'free',
  detailContext = {},
} = {}) {
  const target = useWorkspaceStore((s) => s.selectedTarget) || { type: 'index', id: null };

  switch (target.type) {
    case 'portfolio':
      return <PortfolioDetailBody scopeId={target.id || 'all'} />;
    case 'ticker':
      return (
        <TickerDetailBody
          detailFor={detailFor}
          onAnalyze={onAnalyze}
          plan={plan}
          detailContext={detailContext}
        />
      );
    case 'index':
    default:
      return <IndicesDetailView />;
  }
}
