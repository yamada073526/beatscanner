/**
 * Pane1MacroSection — Pane 1 nav の最下部 MACRO 詳細 collapsible セクション.
 *
 * v62 WS-5 Step 2:
 *   - Tier 1 (header の 8 指標) を除く市場指標を表示
 *   - 改善希望②: DnD 並び替え (@dnd-kit/sortable)
 *   - 折りたたみ: workspaceStore.macroExpanded で persist
 *   - 並び順: workspaceStore.macroOrder (空なら API 順)
 *
 * データ:
 *   - fetchMarketIndices() を独自 polling (60s)
 *   - WS-Phase2 で Tier 2 を 22 指標に拡張する際に backend 連携
 *
 * 注意: 現状 14 - 8 = 6 指標 (QQQ/SPY/IWM/GLD/TLT/HYG)。
 *   handover §15-1 推奨の 22 指標完全版は backend `_INDICES_SOURCE` 拡張が必要.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, GripVertical, Info } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { fetchMarketIndices } from '../../api.js';
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import RowSparkline from '../judgment/components/list/RowSparkline.jsx';
import { FTD_INDICES, ftdLabel, ftdToneColor, useFtdMap } from './ftd.js';

// v120 Task 3 / v175 共有 refactor: FTD (William O'Neil Follow-Through Day) のロジックは
// features/workspace/ftd.js に切り出し済 (ScreenerPane 市場局面バナーと共有)。
// FTD_INDICES / ftdLabel / ftdToneColor / useFtdMap はそこから import する。

/** v120 hotfix (3 体合議 verdict UI/UX 案 B): rail mode 用 FTD 3 点 dot indicator.
 *  幅 36px の rail に収まる、 色のみで FTD 状態を 0.3 秒で判別。 tooltip で詳細。 */
export function FtdRailDots() {
  const { ftdMap, loading } = useFtdMap();
  if (loading) {
    return (
      <div
        aria-label="FTD 計算中"
        style={{ display: 'flex', gap: 3, padding: '4px 0', justifyContent: 'center' }}
      >
        {FTD_INDICES.map((idx) => (
          <span
            key={idx}
            aria-hidden
            style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border)', opacity: 0.4 }}
          />
        ))}
      </div>
    );
  }
  // v120 hotfix v3: tooltip も 4 段階 label の説明を含む詳細版に
  const tooltip = FTD_INDICES.map((idx) => {
    const lbl = ftdLabel(ftdMap[idx]);
    return `${ftdMap[idx]?.label_ja || idx}: ${lbl.text} (${lbl.tip})`;
  }).join('\n');
  return (
    <div
      title={`FTD = Follow-Through Day (William O'Neil 理論、 上昇局面入り確認指標)\n\n${tooltip}\n\n緑=上昇トレンド入り / 黄=シグナル待ち / 灰=安定`}
      aria-label={`FTD 状態 - ${tooltip}`}
      data-testid="ftd-rail-dots"
      style={{ display: 'flex', gap: 3, padding: '4px 0', justifyContent: 'center' }}
    >
      {FTD_INDICES.map((idx) => {
        const { tone } = ftdLabel(ftdMap[idx]);
        return (
          <span
            key={idx}
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: ftdToneColor(tone),
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

// v143b (multi-review 3 体): 「市場トレンド」 概念 (Follow-Through Day) の初心者向け説明。
//   じっちゃま解説の要旨を簡潔化。 状態 (上昇トレンド入り/シグナル待ち/安定) も併記。
const FTD_CONCEPT =
  '市場トレンド (Follow-Through Day): 下落相場が底打ちし、新たな上昇トレンド入りを確認する買いシグナルです。'
  + ' 上昇試行の起点 (急反発した日) から 4〜7 営業日以内に「大きな出来高を伴う大幅上昇」 が出ると確定し、'
  + ' 一時的な反発 (ダマシ) を排除できます。\n\n'
  + '・上昇トレンド入り = 確定 (弱気から強気へ転換の目安)\n'
  + '・シグナル待ち = 上昇試行中だが未確定\n'
  + '・安定 = 大きな調整局面なし (上昇試行イベント無し)';

/** v143b: 「市場トレンド」 見出し横の ⓘ。 hover/focus で FTD 概念 tooltip (portal、 feedback_tooltip_portal_pattern)。 */
function FtdInfoTip() {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect?.();
    if (r) setTip({ x: r.left, y: r.bottom });
  };
  const hide = () => setTip(null);
  return (
    <>
      <span
        ref={ref}
        className="ftd-info-tip"
        role="button"
        tabIndex={0}
        aria-label="市場トレンド (Follow-Through Day) の説明を表示"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help', color: 'var(--text-muted)' }}
      >
        <Info size={11} aria-hidden />
      </span>
      {tip && createPortal(
        <div className="ftd-info-tip__pop" style={{ left: tip.x, top: tip.y }} role="tooltip">
          {FTD_CONCEPT}
        </div>,
        document.body,
      )}
    </>
  );
}

/** FTD 行: 3 indices を inline 横並びで表示 (Pane 1 幅 280px 程度を想定).
 *  v120 Task 3 hotfix: Pane1MacroSection は v63 で Pane 1 から撤去済 dead code のため、
 *  本 component を named export して Workspace.jsx の Pane1Nav 内に mount し直す。
 *  v120 hotfix v2: fetch logic を useFtdMap hook に共通化 (FtdRailDots と共有、 fetch 重複防止). */
export function FtdChipRow() {
  const { ftdMap, loading } = useFtdMap();

  if (loading) {
    return (
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          padding: '4px 8px 6px 4px',
          opacity: 0.6,
        }}
      >
        市場トレンド 計算中...
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        // v143b: 左 padding を 4→10px (nav タブ / 今週の決算 と indent 揃え、 user dogfood「子項目に見える」)。
        padding: '4px 10px 6px 10px',
        fontSize: 10,
        color: 'var(--text-muted)',
      }}
      data-testid="ftd-chip-row"
    >
      {/* v143 (multi-review 3 体): 「FTD」 略語 → 「市場トレンド」。 専門用語の説明は ⓘ tooltip で提供。
          v143b: font を「今週の決算」 と揃える (11px/fw500/0.06em、 user dogfood「市場トレンドが小さい」)。 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        市場トレンド
        <FtdInfoTip />
      </div>
      {FTD_INDICES.map((idx) => {
        const ftd = ftdMap[idx];
        const { text, tone, tip } = ftdLabel(ftd);
        const toneColor =
          tone === 'gain' ? 'var(--color-gain)' :
          tone === 'warning' ? 'var(--color-warning)' :
          'var(--text-muted)';
        return (
          <div
            key={idx}
            title={tip}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>{ftd?.label_ja || idx}</span>
            <span style={{ color: toneColor, fontWeight: tone === 'gain' ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>
              {text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// header MarketStripCompact と同じ Tier 1 8 指標 (重複表示を避けるため除外)
const TIER1_SET = new Set(['^GSPC', '^IXIC', '^DJI', '^VIX', 'DX-Y.NYB', '^TNX', 'CL=F', 'JPY=X']);

function formatPrice(item) {
  if (item.type === 'rate') return `${Number(item.price).toFixed(2)}%`;
  if (item.type === 'fx') return Number(item.price).toFixed(2);
  return Number(item.price).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MacroRow({ item, sparklinePeriod }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.symbol,
  });
  const pct = item.change_pct;
  const trendColor =
    pct == null
      ? 'var(--text-muted)'
      : pct > 0
        ? 'var(--color-gain)'
        : pct < 0
          ? 'var(--color-loss)'
          : 'var(--text-muted)';

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'grid',
        // handle / label / mini-sparkline / price / change%
        gridTemplateColumns: '14px 1fr auto auto auto',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px 4px 4px',
        fontSize: 11,
        background: isDragging ? 'rgba(56,189,248,0.10)' : 'transparent',
        borderRadius: 'var(--radius-sm, 8px)',
        cursor: isDragging ? 'grabbing' : 'default',
        opacity: isDragging ? 0.85 : 1,
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`${item.label} を並び替えハンドル`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <GripVertical size={11} aria-hidden />
      </button>
      <span
        style={{
          fontWeight: 500,
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.label}
      </span>
      {/* v62 WS-Phase2: mini sparkline (32×12、1Y デフォルト)
          Pane 2 / Header と同じ sparklinePeriod state を共有 */}
      <RowSparkline ticker={item.symbol} period={sparklinePeriod} width={32} height={12} />
      <span
        style={{
          fontWeight: 600,
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatPrice(item)}
      </span>
      <span
        style={{
          fontWeight: 500,
          color: trendColor,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 38,
          textAlign: 'right',
        }}
      >
        {pct == null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`}
      </span>
    </div>
  );
}

export default function Pane1MacroSection() {
  const macroExpanded = useWorkspaceStore((s) => s.macroExpanded);
  const toggleMacro = useWorkspaceStore((s) => s.toggleMacro);
  const macroOrder = useWorkspaceStore((s) => s.macroOrder);
  const setMacroOrder = useWorkspaceStore((s) => s.setMacroOrder);
  const sparklinePeriod = useWorkspaceStore((s) => s.sparklinePeriod);

  const [data, setData] = useState([]);

  // 独自 polling (60s). 将来 Workspace で一元化推奨 (WS-7)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await fetchMarketIndices();
        if (!cancelled && Array.isArray(d)) setData(d);
      } catch { /* noop */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Tier 2 (= MACRO 詳細) のみ抽出
  const tier2 = useMemo(
    () => data.filter((it) => !TIER1_SET.has(it.symbol)),
    [data]
  );

  // ユーザー DnD 並び順を反映
  const ordered = useMemo(() => {
    if (!macroOrder || macroOrder.length === 0) return tier2;
    const map = new Map(tier2.map((it) => [it.symbol, it]));
    const sorted = [];
    for (const sym of macroOrder) {
      const it = map.get(sym);
      if (it) {
        sorted.push(it);
        map.delete(sym);
      }
    }
    // macroOrder に無い新規 symbol は末尾に追加
    for (const it of map.values()) sorted.push(it);
    return sorted;
  }, [tier2, macroOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((it) => it.symbol === active.id);
    const newIndex = ordered.findIndex((it) => it.symbol === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ordered, oldIndex, newIndex).map((it) => it.symbol);
    setMacroOrder(next);
  };

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <button
        type="button"
        onClick={toggleMacro}
        aria-expanded={macroExpanded}
        aria-controls="ws-pane1-macro-list"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 6px',
          width: '100%',
          background: 'transparent',
          border: 'none',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {macroExpanded ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
        <span>世界市場</span>
        <span style={{ marginLeft: 'auto', fontWeight: 400 }}>{ordered.length}</span>
      </button>
      {macroExpanded && (
        <div
          id="ws-pane1-macro-list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            paddingTop: 4,
          }}
        >
          {/* v120 Task 3: FTD (Follow-Through Day) Phase 1 — 主要 3 index で上昇局面入り確認 */}
          <FtdChipRow />
          {ordered.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)' }}>
              読込中...
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={ordered.map((it) => it.symbol)}
                strategy={verticalListSortingStrategy}
              >
                {ordered.map((item) => (
                  <MacroRow key={item.symbol} item={item} sparklinePeriod={sparklinePeriod} />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  );
}
