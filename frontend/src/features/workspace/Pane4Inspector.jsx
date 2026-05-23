/**
 * Pane4Inspector — Workspace Pane 4 inspector (v102 Sprint B-D orchestrator)
 *
 * v102 Sprint B-D で 4 hook + 2 component に分解 (449 → ~250 行):
 *   - useNewsFeeds: マクロ + 個別銘柄 news fetch + polling + latestPublished
 *   - useSignalPipeline: buildSignals + filter + sort + visibleTitles
 *   - useTranslation: title translate + AbortController + race guard (v101 B-abort)
 *   - usePrefetchTopNews: 上位 3 件 fire-and-forget
 *   - MacroLensPanel: NewsList body (旧 internal NewsList)
 *   - ReadingRoomPanel: ReadingMode 全面 Overlay wrap (v101 B-E)
 *
 * Pane4Inspector は header (sticky tabs + chips + sort + jp toggle) と body 切替の
 * orchestrator として state hoist (filter / sortMode / store) + JSX 構成のみを担う。
 *
 * 旧 5 体並列レビュー結論は各 hook/component の JSDoc 内に分散保存:
 *   - 金融 CRITICAL ticker alias → pane4/signal.js
 *   - 開発 CRITICAL SSE race condition → useTranslation.js (B-abort) + ReadingMode.jsx
 *   - UX セクション名 / JP segmented / hover lift → 本 file 内 JSX
 *   - 出典 pill 化 + SSE ストリーミング → ReadingMode.jsx
 */
import { useState } from 'react';
import { TrendingUp, Globe, BarChart3, Bookmark, Languages } from 'lucide-react';
import { fmtRelative } from './pane4/format.js';
import MacroLensPanel from './pane4/MacroLensPanel.jsx';
import ReadingRoomPanel from './pane4/ReadingRoomPanel.jsx';
import ScannerSlot from './pane4/ScannerSlot.jsx';
import { useNewsFeeds } from './pane4/useNewsFeeds.js';
import { useSignalPipeline } from './pane4/useSignalPipeline.js';
import { useTranslation } from './pane4/useTranslation.js';
import { usePrefetchTopNews } from './pane4/usePrefetchTopNews.js';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

// ── フィルタ chip / sort toggle ───────────────────────────────────
const FILTER_CHIPS = [
  { key: 'all',     label: '全部',    Icon: null },
  { key: 'mine',    label: '登録銘柄', Icon: Bookmark },
  { key: 'マクロ',     label: 'マクロ',   Icon: TrendingUp },
  { key: '地政学',    label: '地政学',  Icon: Globe },
  { key: '市場全体',  label: '市場全体', Icon: BarChart3 },
];

// ── メイン: Pane 4 Inspector (orchestrator) ─────────────────────────
export default function Pane4Inspector({ items = [] }) {
  // §v66 §2: Reading Room は store で hoist 済 (Pane 3 NewsPanel からも開けるよう統合).
  const selected = useWorkspaceStore((s) => s.activeReadingItem);
  const setSelected = useWorkspaceStore((s) => s.setActiveReadingItem);
  const closeReadingRoom = useWorkspaceStore((s) => s.closeReadingRoom);
  // handover v81 Top 4 (6 体合議): Pane 4 内の section 切替 (Macro Lens ⇔ Scanner)。
  const pane4Section = useWorkspaceStore((s) => s.pane4Section);
  const setPane4Section = useWorkspaceStore((s) => s.setPane4Section);
  // §round16: タグフィルタ + 話題/新着 toggle
  const [filter, setFilter] = useState('all'); // 'all' | 'mine' | 'マクロ' | '地政学' | '市場全体'
  const [sortMode, setSortMode] = useState('attention'); // 'attention' | 'recent'

  // ── 4 hook pipeline (v102 Sprint B-D) ─────────────────────────────
  const { news, tickerNews, loading, latestPublished, holdingItems, watchItems } = useNewsFeeds(items);
  const { sorted, visibleTitles } = useSignalPipeline({
    news, tickerNews, holdingItems, watchItems, filter, sortMode,
  });
  const { jpEnabled, setJpEnabled, titleTranslations, translateUnavailable } = useTranslation(visibleTitles);
  usePrefetchTopNews(sorted);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* §round20: Aman 級スリム帯。タイトル + 更新時刻を 1 行統合、
          左 2px cyan accent line + hairline bottom border、背景透明、全体 32px 高さ. */}
      <div
        className="ws-pane4-header"
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        {/* v100 QA #3-B (handover v99 §0-A): iPad 横で Pane 4 width 圧縮時、 旧 flexWrap 無しで
            character break (「13 時間前」 が 1 文字 1 行に縦並び) が user dogfood で発覚。
            outer + inner flex 両方に flexWrap: 'wrap' を追加し、 各 inline label には whiteSpace: nowrap
            で文字単位 wrap を絶対防止。 [[feedback-clipping-root-cause-chain]] と同 pattern。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {/* handover v81 Top 4: Pane 4 section 切替 segmented tab */}
            <div role="group" aria-label="Pane 4 section" className="ws-pane4-jp-segmented">
              <button
                type="button"
                onClick={() => setPane4Section('macro')}
                aria-pressed={pane4Section === 'macro'}
                className={pane4Section === 'macro' ? 'is-active' : ''}
                title="The Macro Lens (マクロニュース)"
              >
                ニュース
              </button>
              <button
                type="button"
                onClick={() => setPane4Section('scanner')}
                aria-pressed={pane4Section === 'scanner'}
                className={pane4Section === 'scanner' ? 'is-active' : ''}
                title="スクリーナー (ファンダ 5 条件 + Cup-Handle) — Pro 限定機能"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span>スキャナー</span>
                {/* v101 Sprint B-pro-badge: 期待値設計 — Pro 機能であることを segmented tab で先行通知。
                    ProTeaser §66-82 と同 cyan-outline pattern、 inline サイズに圧縮 (9px / 2px padding). */}
                <span
                  aria-label="Pro 限定"
                  data-testid="pane4-scanner-pro-badge"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '1px 6px',
                    border: '1px solid rgba(56, 189, 248, 0.55)',
                    borderRadius: 999,
                    color: 'rgb(56, 189, 248)',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    lineHeight: 1.2,
                    background: 'rgba(56, 189, 248, 0.06)',
                  }}
                >
                  Pro
                </span>
              </button>
            </div>
            {pane4Section === 'macro' && latestPublished && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                · {fmtRelative(latestPublished)}
              </span>
            )}
            {pane4Section === 'macro' && !latestPublished && loading && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>· 読込中</span>
            )}
          </div>
          {/* §round16: 話題 / 新着 segmented + JP segmented を 1 行同居 (Macro Lens のみ) */}
          {pane4Section === 'macro' && (
            <>
              <div role="group" aria-label="並び替え" className="ws-pane4-jp-segmented">
                <button
                  type="button"
                  onClick={() => setSortMode('attention')}
                  aria-pressed={sortMode === 'attention'}
                  className={sortMode === 'attention' ? 'is-active' : ''}
                  title="話題順 (アテンション)"
                >
                  話題
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode('recent')}
                  aria-pressed={sortMode === 'recent'}
                  className={sortMode === 'recent' ? 'is-active' : ''}
                  title="新着順"
                >
                  新着
                </button>
              </div>
              {translateUnavailable && jpEnabled && (
                <span
                  title="翻訳サービスが一時的に利用できません。英文を表示しています。"
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    padding: '2px 8px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    whiteSpace: 'nowrap',
                  }}
                >
                  翻訳一時停止中
                </span>
              )}
              <div role="group" aria-label="表示言語" className="ws-pane4-jp-segmented">
                <button
                  type="button"
                  onClick={() => setJpEnabled(false)}
                  aria-pressed={!jpEnabled}
                  className={!jpEnabled ? 'is-active' : ''}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setJpEnabled(true)}
                  aria-pressed={jpEnabled}
                  className={jpEnabled ? 'is-active' : ''}
                  title="日本語に翻訳"
                >
                  <Languages size={11} aria-hidden style={{ marginRight: 2 }} />
                  日
                </button>
              </div>
            </>
          )}
        </div>
        {/* §round16: フィルタ chip (5 個 + 件数 badge、 Macro Lens のみ) */}
        {pane4Section === 'macro' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTER_CHIPS.map((c) => {
            const isActive = filter === c.key;
            const Icon = c.Icon;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                aria-pressed={isActive}
                className={`ds-chip${isActive ? ' is-active' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 10px',
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 500,
                  borderRadius: 'var(--radius-pill, 9999px)',
                  border: isActive
                    ? '1px solid rgba(56,189,248,0.70)'
                    : '1px solid var(--border)',
                  background: isActive ? 'rgba(56,189,248,0.12)' : 'transparent',
                  color: isActive ? 'rgb(14,165,233)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {Icon && <Icon size={11} strokeWidth={2} aria-hidden />}
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {pane4Section === 'scanner' ? (
          <ScannerSlot />
        ) : selected ? (
          /* v101 Sprint B-E: Reading Mode 全面 Overlay (100%)
             旧 PanelGroup (55/45 縦割) を破棄。 ReadingMode close で NewsList に戻る Linear / Gmail 流。
             Notion Reader 風 typography (max-width 680px + line-height 1.78) は ReadingMode 内で適用. */
          <ReadingRoomPanel
            item={selected}
            onClose={closeReadingRoom}
            jpEnabled={jpEnabled}
          />
        ) : (
          <MacroLensPanel
            sorted={sorted}
            loading={loading}
            jpEnabled={jpEnabled}
            titleTranslations={titleTranslations}
            onSelect={setSelected}
            selected={null}
          />
        )}
      </div>
    </div>
  );
}
