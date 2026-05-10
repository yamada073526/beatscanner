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
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
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
