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
import ReactMarkdown from 'react-markdown';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { TrendingUp, Globe, BarChart3, Bookmark, ExternalLink, X, Languages } from 'lucide-react';
import { fetchMacroNews, fetchNews, translateTexts, translateTextsStream } from '../../api.js';
import CompanyLogo from '../../components/CompanyLogo.jsx';

// ── §round17/21 Markdown 見出し補強 (UI/UX レビュー反映) ──────────
//   backend SSE が一部見出しを `## ...` ではなく `**...**` (bold) または
//   句読点なしの短いプレーン段落として生成する。両ケースを ReactMarkdown の
//   p renderer で h3 に昇格させる.
//
//   判定基準:
//     strong 単一子: ≤40 文字 + 句点 (。.!?) なし → 見出し
//     plain text: ≤32 文字 + 句読点 (、,。.!?・) なし → 見出し
const HEADING_STRONG_RE = /[。.!?…!?]/;            // strong は読点 OK
const HEADING_PLAIN_RE = /[。.!?…!?、,，・]/;       // plain は読点も NG (誤検出抑制)
function _extractText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(_extractText).join('');
  if (typeof node === 'object' && node?.props?.children != null) {
    return _extractText(node.props.children);
  }
  return '';
}
/** §round22 (UI/UX C 反映): 記事末尾の trailer 行 (元記事誘導) を除去.
 *  旧 useArticleModal の REMOVE_PATTERNS と同思想、Pane 5 流入文字列に適用. */
const TRAILER_PATTERNS = [
  /^---\s*元記事で続きを読む\s*$/i,
  /^---+\s*$/,
  /^={3,}\s*$/,
  /^元記事(で|を)(続き|全文).*/,
  /^続きは?元記事/,
  /^全文を読む/,
  /^Read (more|the full).*/i,
  /^Click here to.*/i,
];
function stripArticleTrailer(text) {
  if (!text) return text;
  const lines = text.split('\n');
  // 末尾から空行をスキップしつつ trailer ライン群を捨てる
  let end = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) { end = i; continue; }
    if (TRAILER_PATTERNS.some((re) => re.test(t))) { end = i; continue; }
    break;
  }
  return lines.slice(0, end).join('\n').trimEnd();
}

function isHeadingLike(children) {
  const arr = Array.isArray(children) ? children : [children];
  const meaningful = arr.filter((c) => {
    if (c == null) return false;
    if (typeof c === 'string') return c.trim().length > 0;
    return true;
  });
  if (meaningful.length !== 1) return null;
  const only = meaningful[0];
  // Case 1: <strong> 単一子 (bold 見出し)
  if (typeof only === 'object' && only?.type === 'strong') {
    const text = _extractText(only).trim();
    if (!text) return null;
    if (text.length > 40) return null;
    if (HEADING_STRONG_RE.test(text)) return null;
    return text;
  }
  // Case 2: plain text 単一 (formatting 無し)
  if (typeof only === 'string') {
    const text = only.trim();
    if (text.length < 4) return null;
    if (text.length > 32) return null;
    if (HEADING_PLAIN_RE.test(text)) return null;
    return text;
  }
  return null;
}
const MD_COMPONENTS = {
  p: ({ children, node, ...rest }) => {
    const heading = isHeadingLike(children);
    if (heading) {
      return <h3 {...rest}>{heading}</h3>;
    }
    return <p {...rest}>{children}</p>;
  },
};

// ── タグ system (旧 TodaysBriefSection と統一) ──────────────────
const CATEGORY_ICON = {
  'マクロ': TrendingUp,
  '地政学': Globe,
  '市場全体': BarChart3,
};
function getNewsColors(importance, category) {
  if (category === '地政学') {
    return { fg: 'rgb(168, 85, 247)', bg: 'rgba(168, 85, 247, 0.14)', bar: 'rgb(168, 85, 247)' };
  }
  if (importance === 'HIGH') {
    return { fg: 'rgb(245, 158, 11)', bg: 'rgba(245, 158, 11, 0.14)', bar: 'rgb(245, 158, 11)' };
  }
  return { fg: 'rgb(6, 182, 212)', bg: 'rgba(6, 182, 212, 0.14)', bar: 'rgb(6, 182, 212)' };
}
function pickPrimaryCategory(item) {
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

/** §round20 (金融 CRITICAL): 鮮度段階表示
 *   <5分   = LIVE (緑 dot, 金融的「リアルタイム」)
 *   <30分  = X 分前 (cyan)
 *   <3時間 = X 時間前 (neutral)
 *   >3時間 = STALE 警告 (amber)
 */
function freshnessStatus(iso) {
  if (!iso) return { label: '', tone: 'muted' };
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t) || t <= 0) return { label: '', tone: 'muted' };
    const diff = Math.max(0, Date.now() - t);
    const m = Math.floor(diff / 60_000);
    if (m < 5) return { label: 'LIVE', tone: 'live' };
    if (m < 30) return { label: `${m} 分前`, tone: 'fresh' };
    if (m < 180) {
      const h = Math.floor(m / 60);
      return { label: h >= 1 ? `${h} 時間前` : `${m} 分前`, tone: 'normal' };
    }
    const h = Math.floor(m / 60);
    if (h < 24) return { label: `${h} 時間前`, tone: 'stale' };
    const d = Math.floor(h / 24);
    return { label: `${d} 日前`, tone: 'stale' };
  } catch { return { label: '', tone: 'muted' }; }
}

/** §round15 (金融 CRITICAL): ticker false positive 抑制
 *  - 3 文字以上 ticker: word-boundary scan
 *  - 1-2 文字 ticker: companyName エイリアスでのみマッチ (短銘柄誤爆回避)
 *  - text は upper-case 化済前提
 */
function matchTickersWithAlias(text, items, predicate) {
  if (!text) return [];
  const upper = text.toUpperCase();
  const hits = [];
  for (const it of items) {
    if (!predicate(it)) continue;
    const ticker = it.ticker;
    const name = (it.companyName || '').toUpperCase();
    if (!ticker) continue;
    let matched = false;
    if (ticker.length >= 3) {
      const re = new RegExp(`(^|[^A-Z0-9])${ticker.replace(/[\^]/g, '\\^')}(?![A-Z0-9])`);
      if (re.test(upper)) matched = true;
    }
    if (!matched && name && name.length >= 4 && upper.includes(name)) {
      matched = true;
    }
    if (matched) hits.push(ticker);
  }
  return hits;
}

/** §round17 attention 量子化: cluster_size を 0..1 連続量に変換し、
 *  縦バー高さ (24/48/72/100%) として render する. */
function attentionLevel(clusterSize) {
  const cs = Number(clusterSize) || 1;
  if (cs >= 6) return 1.0;
  if (cs >= 4) return 0.75;
  if (cs >= 2) return 0.5;
  return 0.25;
}

// ── 記事行 ──────────────────────────────────────────────────────────
function NewsItem({ item, displayTitle, onSelect, isOpen, index }) {
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
      className={`ws-pane4-news-item${isOpen ? ' is-open' : ''}${isHolding ? ' is-holding' : ''}${isWatch ? ' is-watch' : ''}`}
      style={{
        '--row-delay': `${Math.min(index, 8) * 40}ms`,
        position: 'relative',
        display: 'flex',
        gap: 10,
        width: 'calc(100% - 8px)',
        textAlign: 'left',
        padding: '10px 12px 10px 14px',
        margin: '4px 4px',
        borderRadius: 'var(--radius-md, 10px)',
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--text-primary)',
        cursor: 'pointer',
      }}
    >
      {/* §round17: 左端 accent bar は attention level で高さ可変
          中心 50% を level (25/50/75/100%) で拡縮、色はタグ色 + opacity 連動. */}
      {(() => {
        const lvl = attentionLevel(item.cluster_size);
        const inset = `${(1 - lvl) * 50}%`;
        return (
          <span
            aria-hidden
            className="ws-pane4-accent-bar"
            title={`注目度: ${item.cluster_size || 1} 媒体`}
            style={{
              position: 'absolute',
              left: 0,
              top: inset,
              bottom: inset,
              width: 3,
              borderRadius: '0 2px 2px 0',
              background: colors.bar,
              opacity: 0.55 + 0.45 * lvl,
            }}
          />
        );
      })()}
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
          {/* §round17 (設計レビュー): 「登録銘柄」テキストバッジは撤去 (ticker typography で affinity を表現).
              他 (マクロ/地政学/市場全体) はカテゴリバッジ維持. */}
          {cat && cat !== '登録銘柄' && (
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
              <span>{item.importance === 'HIGH' ? `HIGH · ${cat}` : cat}</span>
            </span>
          )}
          {/* §round20 affinity: 企業ロゴ + monospace ticker + companyName で「自分の銘柄」を 0.5 秒識別.
              4 体レビュー収束 (UI/UX hybrid + 設計 token + マーケ logo+ticker+変動 dot + 金融 3 階層識別). */}
          {(isHolding || isWatch) && (() => {
            const hits = isHolding ? item._holdingHits : item._watchHits;
            const main = hits[0];
            const companyName = item._kind === 'ticker' ? item.companyName : undefined;
            return (
              <span
                title={`${isHolding ? '保有' : 'ウォッチ'}銘柄: ${hits.join(', ')}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <CompanyLogo ticker={main} size={16} />
                <span
                  className="ws-pane4-ticker"
                  style={{
                    color: isHolding ? 'rgb(212,175,55)' : 'rgb(56,189,248)',
                  }}
                >
                  {main}
                </span>
                {hits.length > 1 && (
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    +{hits.length - 1}
                  </span>
                )}
              </span>
            );
          })()}
          {/* §round20: 鮮度段階表示 (LIVE / X 分前 / STALE) */}
          {(() => {
            const f = freshnessStatus(item.published);
            if (!f.label) return null;
            const isLive = f.tone === 'live';
            const isStale = f.tone === 'stale';
            const color =
              isLive ? 'rgb(34,197,94)'
              : f.tone === 'fresh' ? 'rgb(56,189,248)'
              : isStale ? 'rgb(245,158,11)'
              : 'var(--text-muted)';
            return (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 10,
                  fontWeight: isLive || isStale ? 700 : 500,
                  color,
                  letterSpacing: isLive ? '0.04em' : 0,
                }}
              >
                {isLive && (
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'rgb(34,197,94)',
                      animation: 'ws-pane4-live-pulse 1.4s ease-in-out infinite',
                    }}
                  />
                )}
                {f.label}
              </span>
            );
          })()}
        </div>
        <div
          className="ws-pane4-news-title"
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
          <span className="ws-pane4-source-pill" style={{ marginTop: 6 }}>
            {item.source}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Pane 5: Reading mode (SSE 構造化記事 + ストリーミング翻訳) ─────
function ReadingMode({ item, onClose, jpEnabled }) {
  // 英文 markdown
  const [enContent, setEnContent] = useState('');
  const [enLoading, setEnLoading] = useState(false);
  const [enError, setEnError] = useState(null);
  const articleAbortRef = useRef(null);

  // 日本語翻訳 (記事 chunk 単位)
  const [jaContent, setJaContent] = useState('');
  const [jaLoading, setJaLoading] = useState(false);
  const translateAbortRef = useRef(null);

  // 翻訳済タイトル
  const [translatedTitle, setTranslatedTitle] = useState('');

  // ── 記事 SSE 取得 ──────────────────────────────
  useEffect(() => {
    if (!item?.url) return;
    setEnContent('');
    setJaContent('');
    setTranslatedTitle('');
    setEnError(null);
    setEnLoading(true);

    // 既存 fetch を abort
    articleAbortRef.current?.abort();
    const ctrl = new AbortController();
    articleAbortRef.current = ctrl;

    (async () => {
      try {
        const res = await fetch('/api/news/article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url, max_lines: 30 }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);
            if (payload === '[DONE]') {
              // §round22: trailer 行 (「---元記事で続きを読む」「Read more →」等) を除去
              setEnContent((prev) => stripArticleTrailer(prev));
              setEnLoading(false);
              return;
            }
            try {
              const obj = JSON.parse(payload);
              if (obj.error) {
                setEnError(obj.error);
                setEnLoading(false);
                return;
              }
              if (obj.chunk) {
                setEnContent((prev) => prev + obj.chunk);
                setEnLoading(false);
              }
            } catch { /* ignore */ }
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          setEnError(e.message || '記事取得失敗');
          setEnLoading(false);
        }
      }
    })();

    return () => { ctrl.abort(); };
  }, [item?.url]);

  // ── タイトル翻訳 (jpEnabled ON のみ) ─────────────
  useEffect(() => {
    if (!jpEnabled || !item?.title) return;
    let cancelled = false;
    (async () => {
      try {
        const out = await translateTexts([item.title]);
        if (!cancelled && Array.isArray(out) && out[0]) {
          setTranslatedTitle(out[0]);
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [jpEnabled, item?.title]);

  // ── 本文翻訳 (SSE ストリーミング、enContent 完了後) ──
  useEffect(() => {
    if (!jpEnabled || !enContent || enLoading) return;
    // 既存 翻訳を abort
    translateAbortRef.current?.abort();
    const ctrl = new AbortController();
    translateAbortRef.current = ctrl;

    setJaContent('');
    setJaLoading(true);

    // 段落単位で分割し SSE 翻訳
    const paragraphs = enContent.split(/\n\n+/).filter((p) => p.trim());
    const buffer = new Array(paragraphs.length).fill('');
    (async () => {
      try {
        await translateTextsStream(
          paragraphs,
          (idx, translation) => {
            buffer[idx] = translation || paragraphs[idx];
            setJaContent(buffer.join('\n\n'));
          },
          ctrl.signal
        );
      } catch (e) {
        if (e.name !== 'AbortError') {
          // 失敗時は英文をそのまま表示
          setJaContent(enContent);
        }
      } finally {
        setJaLoading(false);
      }
    })();

    return () => { ctrl.abort(); };
  }, [jpEnabled, enContent, enLoading]);

  if (!item) return null;
  const cat = pickPrimaryCategory(item);
  const colors = getNewsColors(item.importance, cat);
  const Icon = cat ? CATEGORY_ICON[cat] : null;
  const displayTitle = jpEnabled && translatedTitle ? translatedTitle : item.title;
  const displayContent = jpEnabled ? jaContent : enContent;
  const isStreamingTranslation = jpEnabled && (enLoading || jaLoading);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* §round20: Reading Room も Pane 4 header と同じスリム帯 */}
      <div
        className="ws-pane4-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'transparent',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          title="閉じる"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm, 6px)',
          }}
        >
          <X size={13} aria-hidden />
        </button>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
          The Reading Room
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
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
              <span>{item.importance === 'HIGH' ? `HIGH · ${cat}` : cat}</span>
            </span>
          )}
          {item.source && (
            <span className="ws-pane4-source-pill">{item.source}</span>
          )}
          {item.published && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {fmtRelative(item.published)}
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
          {displayTitle}
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
        {enError && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            ⚠️ 記事の取得に失敗しました: {enError}
          </div>
        )}
        {!enError && (
          <div className="ws-pane4-article-body" style={{ marginTop: 12 }}>
            {displayContent ? (
              <ReactMarkdown components={MD_COMPONENTS}>{displayContent}</ReactMarkdown>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                記事を読込中...
              </div>
            )}
            {isStreamingTranslation && (
              <span key="ws-pane4-cursor" className="ws-pane4-cursor" aria-hidden>▌</span>
            )}
          </div>
        )}
        {/* §round16: 「翻訳を準備中」テキスト撤去 (▌ カーソルで進捗表示済) */}
      </div>
    </div>
  );
}

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
  const [selected, setSelected] = useState(null);
  const [jpEnabled, setJpEnabled] = useState(true);
  const [titleTranslations, setTitleTranslations] = useState({});
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
        const results = await Promise.allSettled(
          arr.map((t) => fetchNews(t, 5).then((news) => ({ ticker: t, news })))
        );
        if (cancelled) return;
        const flat = [];
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          const { ticker, news } = r.value;
          if (!Array.isArray(news)) continue;
          for (const n of news) {
            // 個別 endpoint の shape を macro と揃える
            flat.push({
              ...n,
              _kind: 'ticker',
              _sourceTicker: ticker,
              tags: ['登録銘柄'],
              category: '登録銘柄',
              importance: 'MED',
            });
          }
        }
        setTickerNews(flat);
      } catch { /* noop */ }
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [myTickersKey]);

  // ── annotate + filter + sort ──────────────────────
  const annotated = useMemo(() => {
    // マクロ: title + summary を holdingItems / watchItems と alias マッチ
    const macroAnnotated = news.map((n) => {
      const text = `${n.title || ''} ${n.summary || ''}`;
      return {
        ...n,
        _kind: 'macro',
        _holdingHits: matchTickersWithAlias(text, holdingItems, () => true),
        _watchHits: matchTickersWithAlias(text, watchItems, () => true),
      };
    });
    // 個別銘柄ニュース: source ticker が holding か watchlist かで分類
    const holdingTickerSet = new Set(holdingItems.map((it) => it.ticker));
    const watchTickerSet = new Set(watchItems.map((it) => it.ticker));
    const tickerAnnotated = tickerNews.map((n) => {
      const isHolding = holdingTickerSet.has(n._sourceTicker);
      const isWatch = !isHolding && watchTickerSet.has(n._sourceTicker);
      return {
        ...n,
        _holdingHits: isHolding ? [n._sourceTicker] : [],
        _watchHits: isWatch ? [n._sourceTicker] : [],
      };
    });
    // 重複除外 (URL 一致)
    const seen = new Set();
    const merged = [];
    for (const n of [...macroAnnotated, ...tickerAnnotated]) {
      const key = n.url || `${n.title}-${n.published}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(n);
    }
    return merged;
  }, [news, tickerNews, holdingItems, watchItems]);

  // ── score 計算 (5 体レビュー金融 + UI 反映) ──────
  const scored = useMemo(() => {
    return annotated.map((n) => {
      // base 重み: 保有マッチ 3.0 / ウォッチ 1.5 / マクロ一般 0.8 / 個別ニュース ticker は対応保有/観察
      let weight = 0.8;
      if (n._kind === 'ticker' && n._holdingHits.length > 0) weight = 3.0;
      else if (n._kind === 'ticker' && n._watchHits.length > 0) weight = 1.5;
      else if (n._holdingHits.length > 0) weight = 2.0;
      else if (n._watchHits.length > 0) weight = 1.2;
      // importance HIGH → ×1.5
      if (n.importance === 'HIGH') weight *= 1.5;
      // cluster_size: 個別はないので max(1, cs || 1)
      const cs = Number(n.cluster_size) || 1;
      const csBoost = n._kind === 'macro' ? Math.min(cs, 8) : Math.max(cs, 2);
      const attention = weight * csBoost;
      const ts = n.published ? Date.parse(n.published) : 0;
      return { ...n, _score: attention, _ts: Number.isFinite(ts) ? ts : 0 };
    });
  }, [annotated]);

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
        if (!Array.isArray(out)) return;
        const update = {};
        pending.forEach((v, i) => { if (out[i]) update[v.url] = out[i]; });
        setTitleTranslations((prev) => ({ ...prev, ...update }));
      } catch { /* noop */ }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
              }}
            >
              The Macro Lens
            </span>
            {latestPublished && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                · {fmtRelative(latestPublished)}
              </span>
            )}
            {!latestPublished && loading && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· 読込中</span>
            )}
          </div>
          {/* §round16: 話題 / 新着 segmented + JP segmented を 1 行同居 */}
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
        </div>
        {/* §round16: フィルタ chip (5 個 + 件数 badge) */}
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
      </div>

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
              aria-label="高さを調整"
            />
            <Panel defaultSize={45} minSize={20}>
              <ReadingMode
                item={selected}
                onClose={() => setSelected(null)}
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
