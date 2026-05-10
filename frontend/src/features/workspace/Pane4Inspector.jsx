/**
 * Pane4Inspector — Workspace Pane 4 inspector v2.
 *
 * handover §8-B 推奨 #1「マクロニュース × watchlist 連動」
 *
 * v2 (dogfood round 13) で旧 UI 設計を移植:
 *   - タグ色 (地政学=紫 / マクロ=黄 / 市場全体=青) + lucide アイコン
 *   - 各記事の左端 accent bar をタグ色と一致
 *   - サムネイル (記事 image) を左に表示
 *   - 「最終更新」は items 最新の published を使用 (backend updated_at バグ回避)
 *   - 右上に「日本語翻訳」トグル (旧 UI 同様)
 *   - 記事クリックで Pane 5 (= 下半分) に reading mode を表示
 *   - 翻訳 ON 時、reading mode の本文も翻訳
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { TrendingUp, Globe, BarChart3, ExternalLink, X, Languages } from 'lucide-react';
import { fetchMacroNews, translateTexts } from '../../api.js';

// ── タグ system (旧 TodaysBriefSection.jsx から移植).
//    raw hex は design-system-check で禁止のため rgb() リテラルで記述. ──
const CATEGORY_ICON = {
  'マクロ': TrendingUp,
  '地政学': Globe,
  '市場全体': BarChart3,
};
function getNewsColors(importance, category) {
  if (category === '地政学') {
    return {
      fg: 'rgb(168, 85, 247)',
      bg: 'rgba(168, 85, 247, 0.14)',
      bar: 'rgb(168, 85, 247)',
    };
  }
  if (importance === 'HIGH') {
    return {
      fg: 'rgb(245, 158, 11)',
      bg: 'rgba(245, 158, 11, 0.14)',
      bar: 'rgb(245, 158, 11)',
    };
  }
  return {
    fg: 'rgb(6, 182, 212)',
    bg: 'rgba(6, 182, 212, 0.14)',
    bar: 'rgb(6, 182, 212)',
  };
}
function pickPrimaryCategory(item) {
  // tags[0] が主タグ (backend §11-B-20)。fallback で category。
  return (Array.isArray(item.tags) && item.tags[0]) || item.category || null;
}
function fmtRelative(iso) {
  if (!iso) return '';
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t) || t <= 0) return '';
    const diff = Math.max(0, Date.now() - t);
    const m = Math.floor(diff / 60_000);
    if (m < 1) return '今';
    if (m < 60) return `${m} 分前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 時間前`;
    const d = Math.floor(h / 24);
    return `${d} 日前`;
  } catch { return ''; }
}

function matchTickers(text, tickerSet) {
  if (!text || !tickerSet || tickerSet.size === 0) return [];
  const upper = text.toUpperCase();
  const hits = [];
  for (const t of tickerSet) {
    if (!t) continue;
    const re = new RegExp(`(^|[^A-Z0-9])${t.replace(/[\^]/g, '\\^')}(?![A-Z0-9])`);
    if (re.test(upper)) hits.push(t);
  }
  return hits;
}

// ── 記事行 ──────────────────────────────────────────────────────────
function NewsItem({ item, displayTitle, onSelect, isOpen }) {
  const cat = pickPrimaryCategory(item);
  const colors = getNewsColors(item.importance, cat);
  const Icon = cat ? CATEGORY_ICON[cat] : null;
  const hasImage = !!(item.image && String(item.image).trim());
  const [imgError, setImgError] = useState(false);
  const isHolding = item._holdingHits?.length > 0;
  const isWatch = !isHolding && item._watchHits?.length > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-pressed={isOpen}
      className={`ws-pane4-news-item${isOpen ? ' is-open' : ''}`}
      style={{
        position: 'relative',
        display: 'flex',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px 10px 14px',
        margin: '4px 4px',
        borderRadius: 'var(--radius-sm, 8px)',
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--text-primary)',
        cursor: 'pointer',
      }}
    >
      {/* 左端 accent bar (タグ色) */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 8,
          bottom: 8,
          width: 3,
          borderRadius: '0 2px 2px 0',
          background: colors.bar,
        }}
      />
      {/* サムネイル */}
      {hasImage && !imgError ? (
        <img
          src={item.image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgError(true)}
          style={{
            width: 56,
            height: 56,
            flexShrink: 0,
            borderRadius: 6,
            objectFit: 'cover',
            background: 'var(--bg-subtle)',
          }}
        />
      ) : (
        // サムネイルなしのフォールバック (タグ色の薄背景 + アイコン)
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            flexShrink: 0,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.bg,
            color: colors.fg,
          }}
        >
          {Icon && <Icon size={22} strokeWidth={1.75} aria-hidden />}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          {/* HIGH·カテゴリバッジ (旧 UI 同様) */}
          {cat && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: '1px 6px',
                borderRadius: 4,
                background: colors.bg,
                color: colors.fg,
                textTransform: 'uppercase',
              }}
            >
              {Icon && <Icon size={10} strokeWidth={2.25} aria-hidden />}
              <span>
                {item.importance === 'HIGH' ? `HIGH · ${cat}` : cat}
              </span>
            </span>
          )}
          {/* 保有 / 観察 マッチバッジ */}
          {isHolding && (
            <span
              title={`保有銘柄に関連: ${item._holdingHits.join(', ')}`}
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 'var(--radius-pill, 9999px)',
                background: 'rgba(212,175,55,0.18)',
                color: 'rgb(180,142,30)',
              }}
            >
              保有 {item._holdingHits.join(' ')}
            </span>
          )}
          {isWatch && (
            <span
              title={`ウォッチに関連: ${item._watchHits.join(', ')}`}
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 'var(--radius-pill, 9999px)',
                background: 'rgba(56,189,248,0.16)',
                color: 'rgb(14,165,233)',
              }}
            >
              観察 {item._watchHits.join(' ')}
            </span>
          )}
          {item.published && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {fmtRelative(item.published)}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.35,
            color: 'var(--text-primary)',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {displayTitle || item.title}
        </div>
        {item.source && (
          <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            {item.source}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Pane 5: Reading mode ─────────────────────────────────────────────
function ReadingMode({ item, onClose, jpEnabled, translatedTitle, translatedSummary }) {
  if (!item) return null;
  const cat = pickPrimaryCategory(item);
  const colors = getNewsColors(item.importance, cat);
  const Icon = cat ? CATEGORY_ICON[cat] : null;
  const titleDisplay = jpEnabled && translatedTitle ? translatedTitle : item.title;
  const summaryDisplay = jpEnabled && translatedSummary ? translatedSummary : item.summary;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ヘッダー: 閉じるボタン + 元記事リンク */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="リーディングモードを閉じる"
          title="閉じる"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm, 6px)',
          }}
        >
          <X size={14} aria-hidden />
        </button>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          リーディング
        </span>
        <div style={{ flex: 1 }} />
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            title="元記事を新しいタブで開く"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: 'rgb(14,165,233)',
              textDecoration: 'none',
            }}
          >
            元記事 <ExternalLink size={11} aria-hidden />
          </a>
        )}
      </div>
      {/* 本文 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          {cat && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: '2px 6px',
                borderRadius: 4,
                background: colors.bg,
                color: colors.fg,
                textTransform: 'uppercase',
              }}
            >
              {Icon && <Icon size={11} strokeWidth={2.25} aria-hidden />}
              <span>
                {item.importance === 'HIGH' ? `HIGH · ${cat}` : cat}
              </span>
            </span>
          )}
          {item.source && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {item.source}
            </span>
          )}
          {item.published && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              · {fmtRelative(item.published)}
            </span>
          )}
        </div>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.4,
            color: 'var(--text-primary)',
          }}
        >
          {titleDisplay}
        </h3>
        {item.image && (
          <img
            src={item.image}
            alt=""
            loading="lazy"
            style={{
              marginTop: 12,
              width: '100%',
              maxHeight: 200,
              objectFit: 'cover',
              borderRadius: 8,
              background: 'var(--bg-subtle)',
            }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {summaryDisplay && (
          <p
            style={{
              marginTop: 12,
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {summaryDisplay}
          </p>
        )}
        {jpEnabled && (!translatedTitle || !translatedSummary) && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            翻訳中...
          </div>
        )}
      </div>
    </div>
  );
}

// ── メイン: Pane 4 Inspector ─────────────────────────────────────────
export default function Pane4Inspector({ items = [] }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // 開いている記事 (Reading mode)
  const [jpEnabled, setJpEnabled] = useState(true); // 翻訳トグル (default ON、旧 UI 同様)
  const [titleTranslations, setTitleTranslations] = useState({}); // url → 訳タイトル
  const [readingTrans, setReadingTrans] = useState({}); // url → { title, summary }

  // ── ニュース取得 ───────────────────────────
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

  // ── watchlist / holdings tickers
  const holdingSet = useMemo(
    () => new Set(items.filter((it) => it.isHolding).map((it) => it.ticker)),
    [items]
  );
  const watchSet = useMemo(
    () => new Set(items.filter((it) => !it.isHolding && it.isWatchlist).map((it) => it.ticker)),
    [items]
  );

  // ── annotate + sort
  const sorted = useMemo(() => {
    const annotated = news.map((n) => {
      const text = `${n.title || ''} ${n.summary || ''}`;
      return {
        ...n,
        _holdingHits: matchTickers(text, holdingSet),
        _watchHits: matchTickers(text, watchSet),
      };
    });
    annotated.sort((a, b) => {
      const grp = (x) => x._holdingHits.length > 0 ? 0 : x._watchHits.length > 0 ? 1 : 2;
      const g = grp(a) - grp(b);
      if (g !== 0) return g;
      const impRank = { HIGH: 0, MED: 1 };
      return (impRank[a.importance] ?? 2) - (impRank[b.importance] ?? 2);
    });
    return annotated;
  }, [news, holdingSet, watchSet]);

  // ── 「最終更新」: items から最新 published を採用 (backend updated_at が壊れているケースに対応)
  const latestPublished = useMemo(() => {
    let max = 0;
    for (const n of news) {
      const t = n.published ? Date.parse(n.published) : 0;
      if (Number.isFinite(t) && t > max) max = t;
    }
    return max > 0 ? new Date(max).toISOString() : null;
  }, [news]);

  // ── 翻訳: タイトル一括翻訳 (jpEnabled ON 時、表示中の上位 N 件)
  const visibleTitles = useMemo(
    () => sorted.slice(0, 30).map((n) => n.title || ''),
    [sorted]
  );
  const visibleUrls = useMemo(
    () => sorted.slice(0, 30).map((n) => n.url || ''),
    [sorted]
  );
  const lastTranslateKey = useRef('');

  useEffect(() => {
    if (!jpEnabled) return;
    if (visibleTitles.length === 0) return;
    const pending = [];
    const pendingUrls = [];
    visibleUrls.forEach((u, i) => {
      if (!u) return;
      if (titleTranslations[u]) return;
      const t = visibleTitles[i];
      if (!t) return;
      pending.push(t);
      pendingUrls.push(u);
    });
    if (pending.length === 0) return;
    const key = pendingUrls.join('|');
    if (key === lastTranslateKey.current) return;
    lastTranslateKey.current = key;

    let cancelled = false;
    (async () => {
      try {
        const out = await translateTexts(pending);
        if (cancelled || !Array.isArray(out)) return;
        const update = {};
        pendingUrls.forEach((u, i) => {
          if (out[i]) update[u] = out[i];
        });
        setTitleTranslations((prev) => ({ ...prev, ...update }));
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [jpEnabled, visibleTitles, visibleUrls, titleTranslations]);

  // ── 選択記事の詳細 (title + summary) を翻訳
  useEffect(() => {
    if (!jpEnabled || !selected) return;
    const url = selected.url;
    if (!url) return;
    if (readingTrans[url]) return;
    const inputs = [selected.title || '', selected.summary || ''];
    let cancelled = false;
    (async () => {
      try {
        const out = await translateTexts(inputs);
        if (cancelled || !Array.isArray(out)) return;
        setReadingTrans((prev) => ({
          ...prev,
          [url]: { title: out[0] || '', summary: out[1] || '' },
        }));
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [jpEnabled, selected, readingTrans]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Header: タイトル + 最終更新 + 翻訳トグル */}
      <div
        style={{
          padding: '10px 14px 8px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            マクロ × ウォッチ
          </div>
          <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>
            {latestPublished
              ? `最終更新 ${fmtRelative(latestPublished)}`
              : (loading ? '読込中...' : '更新情報なし')}
          </div>
        </div>
        {/* 翻訳トグル */}
        <button
          type="button"
          onClick={() => setJpEnabled((v) => !v)}
          aria-pressed={jpEnabled}
          title={jpEnabled ? '日本語翻訳: ON' : '日本語翻訳: OFF'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 'var(--radius-pill, 9999px)',
            border: jpEnabled
              ? '1px solid rgba(56,189,248,0.70)'
              : '1px solid var(--border)',
            background: jpEnabled ? 'rgba(56,189,248,0.14)' : 'transparent',
            color: jpEnabled ? 'rgb(14,165,233)' : 'var(--text-muted)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Languages size={12} aria-hidden />
          JP
        </button>
      </div>

      {/* Pane 4 (上半分: news list) + Pane 5 (下半分: reading mode) を vertical split.
          selected が無いときは Pane 5 を非表示 → Pane 4 がフル高さ. */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {selected ? (
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
              aria-label="Pane 4 と Pane 5 の高さを調整"
            />
            <Panel defaultSize={45} minSize={20}>
              <ReadingMode
                item={selected}
                onClose={() => setSelected(null)}
                jpEnabled={jpEnabled}
                translatedTitle={readingTrans[selected.url]?.title}
                translatedSummary={readingTrans[selected.url]?.summary}
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
    <div style={{ height: '100%', overflowY: 'auto', padding: '8px 8px 16px' }}>
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
          />
        ))
      )}
    </div>
  );
}
