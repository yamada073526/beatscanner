/**
 * Workspace — App.jsx から呼ばれる workspace mode の top-level エントリ.
 *
 * v62 WS-3 + WS-4:
 *   - WS-3: useUrlSync mount + WorkspaceShell に slot を流す
 *   - WS-4: Pane 2 / Pane 3 に既存 JudgmentList / JudgmentDetail を再利用
 *     (5 条件 PASS/FAIL ヒートマップは features/judgment/components/list/ 内に既存)
 *   - JudgmentProvider で wrap し、activeTicker (workspaceStore) ↔ selectedTicker
 *     (JudgmentContext) を TickerBridge で双方向同期
 *
 * Pane 1 nav は WS-5 で実装。WS-4 では暫定 dummy tab toggle を維持.
 */
import { useEffect } from 'react';
import WorkspaceShell from './WorkspaceShell.jsx';
import WorkspaceHeader from './WorkspaceHeader.jsx';
import { useUrlSync } from './useUrlSync.js';
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import { JudgmentProvider, useJudgment } from '../judgment/state/JudgmentContext.jsx';
import { JudgmentList } from '../judgment/components/list/index.js';
import { JudgmentDetail } from '../judgment/components/detail/index.js';

const TABS = [
  { key: 'home', label: 'ホーム' },
  { key: 'judgment', label: '判定' },
  { key: 'report', label: '決算' },
  { key: 'チャート', label: 'チャート' },
];

/** v62 WS-4: Pane 2 上部の表示メタ切替 (改善希望④ 3 種) */
const META_OPTIONS = [
  { key: 'condition', label: '5条件', hint: 'ファンダメンタル5条件 PASS/FAIL' },
  { key: 'change1d', label: '1日騰落率', hint: '前日比 ±%' },
  { key: 'earnings', label: '決算まで', hint: '次の決算発表まで' },
];

function Pane2MetaToggle() {
  const pane2Meta = useWorkspaceStore((s) => s.pane2Meta);
  const setPane2Meta = useWorkspaceStore((s) => s.setPane2Meta);
  return (
    <div
      role="group"
      aria-label="リスト右端の表示内容を切替"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--text-muted)',
      }}
    >
      <span style={{ marginRight: 4 }}>表示:</span>
      {META_OPTIONS.map((opt) => {
        const active = pane2Meta === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setPane2Meta(opt.key)}
            aria-pressed={active}
            title={opt.hint}
            style={{
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              borderRadius: 'var(--radius-pill, 9999px)',
              border: active
                ? '1px solid rgba(56,189,248,0.70)'
                : '1px solid var(--border)',
              background: active
                ? 'rgba(56,189,248,0.12)'
                : 'transparent',
              color: active ? 'rgb(14,165,233)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'background 0.12s, border-color 0.12s, color 0.12s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Pane 1 nav (WS-5 で実装、現状ダミー tab toggle のみ) */
function Pane1DummyNav() {
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 4,
          padding: '0 6px',
        }}
      >
        Pane 1 nav (WS-5 で本実装)
      </div>
      {TABS.map((t) => {
        const active = activeTab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            aria-pressed={active}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 10px',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              borderRadius: 'var(--radius-sm, 8px)',
              border: '1px solid transparent',
              background: active ? 'rgba(56,189,248,0.10)' : 'transparent',
              color: active ? 'rgb(14,165,233)' : 'var(--text-secondary)',
              borderLeft: active ? '2px solid rgb(56,189,248)' : '2px solid transparent',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent';
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * activeTicker (workspaceStore) ↔ selectedTicker (JudgmentContext) の双方向同期.
 * - workspace → judgment: URL or palette からの ticker 変更を Pane 3 detail に反映
 * - judgment → workspace: Pane 2 list クリックの ticker 変更を URL に反映
 */
function TickerBridge() {
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  const { selectedTicker, selectTicker } = useJudgment();

  // workspace → judgment
  useEffect(() => {
    if (activeTicker !== selectedTicker) {
      selectTicker(activeTicker || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker]);

  // judgment → workspace
  useEffect(() => {
    if (selectedTicker !== activeTicker) {
      setActiveTicker(selectedTicker || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicker]);

  return null;
}

/**
 * @param {object} props
 * @param {Array}  props.items          - Pane 2 の銘柄リスト (App.jsx で構築)
 * @param {Function} props.detailFor    - Pane 3 で銘柄詳細データを引く関数
 * @param {Function} props.onAnalyze    - 分析実行 (= App.jsx の runAnalyze)
 * @param {string} [props.plan='free']  - Pro 判定 (PremiumLock 用)
 * @param {object} [props.detailContext] - JudgmentDetail に渡す { user, isPro, onUpgrade, onSignIn }
 * @param {string} [props.currentTicker] - 現在 SPA で分析中の銘柄 (初期 sync 用)
 */
export default function Workspace({
  items = [],
  detailFor,
  onAnalyze,
  plan = 'free',
  detailContext,
  currentTicker,
}) {
  // URL ↔ Zustand 同期 (Linear 流 SSOT)
  useUrlSync();

  // 改善希望①: Tier 1 折りたたみで shell の header height も縮小し、下ペインを広げる
  const headerCollapsed = useWorkspaceStore((s) => s.headerCollapsed);
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  const headerHeight = headerCollapsed ? 32 : 56;

  // App.jsx が currentTicker を持っている場合、初回 mount で URL or store に伝搬
  useEffect(() => {
    if (currentTicker) {
      setActiveTicker(currentTicker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <JudgmentProvider>
      <TickerBridge />
      <WorkspaceShell
        header={<WorkspaceHeader />}
        headerHeight={headerHeight}
        pane1={<Pane1DummyNav />}
        pane2={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Pane2MetaToggle />
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <JudgmentList items={items} onAnalyze={onAnalyze} showFilters={true} />
            </div>
          </div>
        }
        pane3={
          <JudgmentDetail
            plan={plan}
            detailFor={detailFor}
            onAnalyze={onAnalyze}
            detailContext={detailContext}
          />
        }
      />
    </JudgmentProvider>
  );
}
