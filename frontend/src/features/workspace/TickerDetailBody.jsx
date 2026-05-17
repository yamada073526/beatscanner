/**
 * TickerDetailBody — Pane 3 で type='ticker' target が選択されたときに描画する body.
 *
 * handover v82 §0-D 真因 surfaced: 旧 [PaneDetailView.jsx:28] で `case 'ticker'` は
 * IndicesDetailView に fallback されており、 ticker deep link (`?detail=t:AAPL`) や
 * 将来の Cmd+K / Pane 2 watchlist click が「指数 chart に逃げる」 状態だった。
 *
 * 実装方針:
 *   旧 SPA で wire されていた 6 component (ResultBadge / SummaryBrief / ConditionCard /
 *   GuidanceCard / HistoryChart / DetailReport) は workspace 版で既に JudgmentDetail
 *   に統合済 (Hero / KpiStrip / FiveConditionsCard / GuidanceCard / HistoryChart /
 *   DetailReport)。 ResultBadge は旧 SPA 専用 (memory feedback_new_ui_only.md と整合、
 *   touch しない)。 本 component は JudgmentDetail の薄い wrapper として、
 *   selectedTarget.id (ticker URL deep link) を activeTicker と sync するだけ。
 *
 *   - selectedTarget.id → activeTicker (workspaceStore)
 *   - activeTicker → JudgmentContext.selectedTicker (TickerBridge が双方向同期)
 *   - JudgmentDetail.selectedTicker → detail render (既存)
 *
 * memory anchor:
 *   - feedback_pane3_detail_view.md (discriminated union pattern)
 *   - feedback_new_ui_only.md (機能追加は新 UI で集中、 旧 SPA component に触らない)
 *   - project_pane3_visual_explainer_redesign.md (Phase 1 土台 + port 漏れ回収)
 */
import { useEffect } from 'react';
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import JudgmentDetail from '../judgment/components/detail/JudgmentDetail.jsx';

/**
 * @param {object} props
 * @param {(ticker: string) => object|null} [props.detailFor] - Workspace.jsx から forward
 * @param {(ticker: string) => void} [props.onAnalyze]        - Workspace.jsx から forward
 * @param {string} [props.plan='free']
 * @param {object} [props.detailContext={}] - { user, isPro, onUpgrade, onSignIn }
 */
export default function TickerDetailBody({
  detailFor,
  onAnalyze,
  plan = 'free',
  detailContext = {},
}) {
  const target = useWorkspaceStore((s) => s.selectedTarget);
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);

  const tickerFromTarget = target?.type === 'ticker' ? (target.id || null) : null;

  // selectedTarget.id (URL deep link / 将来 Cmd+K / Pane 2 click) → activeTicker。
  // TickerBridge (Workspace.jsx:627) が JudgmentContext.selectedTicker と双方向同期するので、
  // JudgmentDetail はこれを通じて自動 re-render する。
  useEffect(() => {
    if (tickerFromTarget && tickerFromTarget !== activeTicker) {
      setActiveTicker(tickerFromTarget);
    }
  }, [tickerFromTarget, activeTicker, setActiveTicker]);

  return (
    <JudgmentDetail
      plan={plan}
      detailFor={detailFor}
      onAnalyze={onAnalyze}
      detailContext={detailContext}
      useWorkspaceReader
    />
  );
}
