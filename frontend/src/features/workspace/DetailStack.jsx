/**
 * DetailStack — C-3 競合ナビ keep-mounted コンテナ (v195、 user dogfood 2026-06-09)
 *
 * 課題:「競合へ遷移→パンくずで元銘柄に戻ると毎回ロード (チャート/会社概要/ガイダンス等が再 fetch)」。
 *   真因: 単一 <JudgmentDetail> が selectedTicker (context) 変化で re-render し、 各 panel の fetch effect が
 *   loading state にリセットされるため。 判定 result は detailFor (resultCacheRef) を props で同期受け取りする
 *   ので瞬時だが、 panel は自前 async fetch なので cache が温まっていても「一旦 loading→解決」を踏む。
 *
 * 解決 (B 案、 user 選択): ブラウザの「戻る」相当。 detailHistory (パンくず stack) の各 ticker ごとに
 *   <JudgmentDetail tickerOverride={t}> を mount し続け、 active な 1 つだけ visibility:visible で表示する。
 *   戻ると元 instance が既に DOM にあるため、 panel は再 fetch せず scroll/accordion 含め完全に瞬時復元。
 *
 * 設計:
 *   - 各 instance は position:absolute; inset:0; overflowY:auto で重ね、 自前の scroll container を持つ。
 *     visibility:hidden は display:none と違い layout を維持するため scrollTop が DOM に保持される
 *     (= 戻った時にスクロール位置もそのまま)。 これにより useDetailScrollRestore / accordion 永続は
 *     keep-mounted では冗長になるが、 触らず温存 (belt-and-suspenders、 F5 後の初回 mount では依然有効)。
 *   - DetailStack root は height:100% で PaneContainer (overflowY:auto) を埋めるため、 PaneContainer 自体は
 *     スクロールせず各 instance が内部スクロールを供給する。 PaneContainer の padding:12px は inset:0 で
 *     全方向の余白として保たれる。
 *   - detailHistory は computeNextDetailHistory で「既出 ticker に戻ると truncate」= forward 履歴破棄
 *     (browser back 相当)。 戻った先より後ろの instance は unmount される (= 前進し直すと再 fetch、 正しい挙動)。
 *     最大 10 件 cap 済 (workspaceStore) のため mount 数も最大 10 (通常 2-3)。
 *
 * blast radius を絞るため normal (home) detail path のみに適用。 screener/indices path は単一 JudgmentDetail のまま。
 */
import { memo } from 'react';
import JudgmentDetail from '../judgment/components/detail/JudgmentDetail.jsx';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

const EMPTY_KEY = '__empty__';

const DetailStack = memo(function DetailStack({ plan, detailFor, onAnalyze, detailContext, useWorkspaceReader }) {
  const detailHistory = useWorkspaceStore((s) => s.detailHistory);
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);

  // keep-mounted する ticker 群を構築。 detailHistory を基本とし、 activeTicker が含まれない/未選択でも
  // 必ず 1 instance は描画する (activeTicker=null は空 state を出す instance)。
  const history = Array.isArray(detailHistory) ? detailHistory : [];
  let stack = history.includes(activeTicker) ? history : [...history, activeTicker];
  // 重複除去 (computeNextDetailHistory が保証するが防御的に)。
  stack = stack.filter((t, i) => stack.indexOf(t) === i);
  if (stack.length === 0) stack = [activeTicker ?? null];

  return (
    <div style={{ position: 'relative', height: '100%', minHeight: 0 }}>
      {stack.map((t) => {
        const isActive = t === activeTicker;
        return (
          <div
            key={t == null ? EMPTY_KEY : t}
            data-detail-instance={t == null ? '' : t}
            aria-hidden={isActive ? undefined : true}
            style={{
              position: 'absolute',
              inset: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              // visibility:hidden は layout を残すため scrollTop が保持される (display:none は reset される)。
              visibility: isActive ? 'visible' : 'hidden',
              pointerEvents: isActive ? 'auto' : 'none',
            }}
          >
            <JudgmentDetail
              plan={plan}
              detailFor={detailFor}
              onAnalyze={onAnalyze}
              detailContext={detailContext}
              useWorkspaceReader={useWorkspaceReader}
              tickerOverride={t ?? null}
            />
          </div>
        );
      })}
    </div>
  );
});

export default DetailStack;
