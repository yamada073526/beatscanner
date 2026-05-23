/**
 * Pane4Inspector — Workspace Pane 4 inspector v3 (dogfood round 15).
 *
 * 5 体並列レビュー結論を反映:
 *   - 金融 CRITICAL: 2 文字以下の ticker は company name alias 必須 (false positive 回避)
 *   - 開発 CRITICAL: SSE / 翻訳の race condition を AbortController + seqId でガード
 *   - UX: セクション名 The Macro Lens / The Reading Room、JP segmented、hover lift+shadow、slide-in
 *   - 出典 pill 化 (rounded-full)
 *   - 本文 SSE ストリーミング (旧 useArticleModal パターン)、ストリーミング翻訳 (/api/translate/stream)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { TrendingUp, Globe, BarChart3, Bookmark, Languages } from 'lucide-react';
import { fetchMacroNews, fetchNewsBulk, translateTexts } from '../../api.js';
import { buildSignals } from './pane4/signal.js';
import { fmtRelative } from './pane4/format.js';
import NewsItem from './pane4/NewsItem.jsx';
import ReadingMode from './pane4/ReadingMode.jsx';
import ScannerSlot from './pane4/ScannerSlot.jsx';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

// ── pane4/markdown.jsx + pane4/format.js に分離済 (v65 §C-3) ────────────


// ── フィルタ chip / sort toggle ───────────────────────────────────
const FILTER_CHIPS = [
  { key: 'all',     label: '全部',    Icon: null },
  { key: 'mine',    label: '登録銘柄', Icon: Bookmark },
  { key: 'マクロ',     label: 'マクロ',   Icon: TrendingUp },
  { key: '地政学',    label: '地政学',  Icon: Globe },
  { key: '市場全体',  label: '市場全体', Icon: BarChart3 },
];

// ── メイン: Pane 4 Inspector ─────────────────────────────────────────
export default function Pane4Inspector({ items = [] }) {
  const [news, setNews] = useState([]);
  const [tickerNews, setTickerNews] = useState([]); // 個別銘柄ニュース
  const [loading, setLoading] = useState(true);
  // §v66 §2: Reading Room は store で hoist 済 (Pane 3 NewsPanel からも開けるよう統合).
  const selected = useWorkspaceStore((s) => s.activeReadingItem);
  const setSelected = useWorkspaceStore((s) => s.setActiveReadingItem);
  const closeReadingRoom = useWorkspaceStore((s) => s.closeReadingRoom);
  // handover v81 Top 4 (6 体合議): Pane 4 内の section 切替 (Macro Lens ⇔ Scanner)。
  const pane4Section = useWorkspaceStore((s) => s.pane4Section);
  const setPane4Section = useWorkspaceStore((s) => s.setPane4Section);
  const [jpEnabled, setJpEnabled] = useState(true);
  const [titleTranslations, setTitleTranslations] = useState({});
  const [translateUnavailable, setTranslateUnavailable] = useState(false);
  // §round16: タグフィルタ + 話題/新着 toggle
  const [filter, setFilter] = useState('all'); // 'all' | 'mine' | 'マクロ' | '地政学' | '市場全体'
  const [sortMode, setSortMode] = useState('attention'); // 'attention' | 'recent'
  const translateSeqRef = useRef(0);

  // ── マクロニュース取得 ───────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await fetchMacroNews();
        if (cancelled) return;
        if (Array.isArray(d?.items)) setNews(d.items);
      } catch { /* noop */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const holdingItems = useMemo(() => items.filter((it) => it.isHolding), [items]);
  const watchItems = useMemo(
    () => items.filter((it) => !it.isHolding && it.isWatchlist),
    [items]
  );

  // ── §round16 個別銘柄ニュース集約 (Promise.allSettled、5 分 polling) ──
  const myTickers = useMemo(
    () => [...holdingItems, ...watchItems].map((it) => it.ticker).filter(Boolean).slice(0, 30),
    [holdingItems, watchItems]
  );
  const myTickersKey = myTickers.join(',');

  useEffect(() => {
    if (!myTickersKey) { setTickerNews([]); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const arr = myTickersKey.split(',');
        // v65 §C-2: N+1 fetch を bulk endpoint に置換 (memory pane4_roadmap_round16 #2)
        const res = await fetchNewsBulk(arr, 5);
        if (cancelled) return;
        const flat = [];
        for (const r of res?.items || []) {
          if (r.status !== 'ok' || !Array.isArray(r.articles)) continue;
          for (const n of r.articles) {
            flat.push({ ...n, _sourceTicker: r.ticker });
          }
        }
        setTickerNews(flat);
      } catch { /* noop */ }
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [myTickersKey]);

  // ── annotate + score + dedup を Signal pipeline に委譲 (v65 §C-1) ──
  // 旧 annotated / scored は signal.js の buildSignals に統合。
  // 返り値は Signal[] だが payload spread + legacy field 併存により NewsItem 互換.
  const scored = useMemo(
    () => buildSignals(news, tickerNews, holdingItems, watchItems),
    [news, tickerNews, holdingItems, watchItems]
  );

  // ── filter ────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = scored;
    if (filter === 'mine') {
      list = list.filter((n) => n._holdingHits.length > 0 || n._watchHits.length > 0);
    } else if (filter !== 'all') {
      list = list.filter((n) => {
        if (filter === '登録銘柄') return n._kind === 'ticker';
        if (Array.isArray(n.tags) && n.tags.includes(filter)) return true;
        return n.category === filter;
      });
    }
    return list;
  }, [scored, filter]);

  // ── sort ──────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortMode === 'recent') {
      arr.sort((a, b) => b._ts - a._ts);
    } else {
      // attention: score desc
      arr.sort((a, b) => b._score - a._score);
    }
    // §round16 上限 cap: 個別ニュース由来は最大 8 件 (UI/UX 「重心が日替わり不安定」リスク回避)
    if (filter === 'all' && sortMode === 'attention') {
      const tickerCount = { count: 0 };
      const capped = [];
      for (const n of arr) {
        if (n._kind === 'ticker') {
          if (tickerCount.count >= 8) continue;
          tickerCount.count += 1;
        }
        capped.push(n);
      }
      return capped;
    }
    return arr;
  }, [filtered, sortMode, filter]);

  const latestPublished = useMemo(() => {
    let max = 0;
    for (const n of news) {
      const t = n.published ? Date.parse(n.published) : 0;
      if (Number.isFinite(t) && t > max) max = t;
    }
    return max > 0 ? new Date(max).toISOString() : null;
  }, [news]);

  // §v66 §3 (マーケター + 設計エキスパート推奨): 上位 3 件を fire-and-forget で
  // prefetch し Pane 5 クリック時 TTFT 0s (cache hit). コストは 3x だがクリック率
  // 60-70% が上位 3 件に集中する想定で ROI 良し.
  const prefetchedRef = useRef(new Set());
  useEffect(() => {
    const top3 = sorted.slice(0, 3).filter((n) => n.url);
    for (const item of top3) {
      if (prefetchedRef.current.has(item.url)) continue;
      prefetchedRef.current.add(item.url);
      fetch('/api/news/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url, max_lines: 25 }),
      }).catch(() => { /* fire-and-forget */ });
    }
  }, [sorted]);

  // ── タイトル翻訳: AbortController + seqId で race guard ──
  const visibleTitles = useMemo(
    () => sorted.slice(0, 30).map((n) => ({ url: n.url, title: n.title || '' })),
    [sorted]
  );
  useEffect(() => {
    if (!jpEnabled) return;
    const pending = visibleTitles.filter((v) => v.url && v.title && !titleTranslations[v.url]);
    if (pending.length === 0) return;
    const seq = ++translateSeqRef.current;
    const ctrl = new AbortController();
    (async () => {
      try {
        const out = await translateTexts(pending.map((v) => v.title));
        if (seq !== translateSeqRef.current) return; // race guard
        if (!Array.isArray(out)) {
          setTranslateUnavailable(true);
          return;
        }
        const update = {};
        let any = false;
        pending.forEach((v, i) => { if (out[i]) { update[v.url] = out[i]; any = true; } });
        if (any) {
          setTitleTranslations((prev) => ({ ...prev, ...update }));
          setTranslateUnavailable(false);
        } else {
          setTranslateUnavailable(true);
        }
      } catch {
        setTranslateUnavailable(true);
      }
    })();
    return () => { ctrl.abort(); };
  }, [jpEnabled, visibleTitles, titleTranslations]);

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
                title="スクリーナー (ファンダ 5 条件 + Cup-Handle)"
              >
                スキャナー
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
          <PanelGroup direction="vertical" autoSaveId="bs:ws:pane4-vertical">
            <Panel defaultSize={55} minSize={25}>
              <NewsList
                sorted={sorted}
                loading={loading}
                jpEnabled={jpEnabled}
                titleTranslations={titleTranslations}
                onSelect={setSelected}
                selected={selected}
              />
            </Panel>
            <PanelResizeHandle
              style={{ height: 1, background: 'var(--border)', cursor: 'row-resize' }}
              aria-label="高さを調整"
            />
            <Panel defaultSize={45} minSize={20}>
              <ReadingMode
                item={selected}
                onClose={closeReadingRoom}
                jpEnabled={jpEnabled}
              />
            </Panel>
          </PanelGroup>
        ) : (
          <NewsList
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

function NewsList({ sorted, loading, jpEnabled, titleTranslations, onSelect, selected }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '8px 0 16px' }}>
      {loading && sorted.length === 0 ? (
        <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          ニュースを読込中...
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          該当ニュースなし
        </div>
      ) : (
        sorted.slice(0, 30).map((n, i) => (
          <NewsItem
            key={n.url || `${n.title}-${i}`}
            item={n}
            displayTitle={jpEnabled ? titleTranslations[n.url] : null}
            onSelect={onSelect}
            isOpen={selected?.url === n.url}
            index={i}
          />
        ))
      )}
    </div>
  );
}
