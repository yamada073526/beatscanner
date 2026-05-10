/**
 * Pane4Inspector — Workspace Pane 4 inspector の本実装 v1.
 *
 * handover §8-B 推奨 #1「マクロニュース × watchlist 連動」(差別化最強機能)。
 *
 * v1 スコープ:
 *   - /api/macro-news からマクロ/地政学/市場全体ニュース取得 (5 分 polling)
 *   - 各記事の title + summary を scan し、user の holdings/watchlist ticker
 *     symbol が含まれていれば該当 article をハイライト
 *   - 保有銘柄に関連 = gold ring (.is-holding) / ウォッチ = cyan ring (.is-watch)
 *   - 重要度 HIGH (forced + macro 主要 IB target / geopolitical) は赤バッジ
 *   - クリック→外部リンクを新タブで開く
 *
 * v1.5+ (将来):
 *   - セクター単位のマッチング (現状 ticker symbol 単体スキャンのみ)
 *   - AI 要約 / 翻訳統合
 *   - ETF symbol (SPY/QQQ 等) を経由したセクターマッピング
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchMacroNews } from '../../api.js';

function fmtRelative(iso) {
  if (!iso) return '';
  try {
    const t = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - t);
    const m = Math.floor(diff / 60_000);
    if (m < 1) return '今';
    if (m < 60) return `${m} 分前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 時間前`;
    const d = Math.floor(h / 24);
    return `${d} 日前`;
  } catch {
    return '';
  }
}

function matchTickers(text, tickerSet) {
  if (!text || !tickerSet || tickerSet.size === 0) return [];
  // 単純 word-boundary スキャン (FALSE POSITIVE 抑制のため大文字限定)
  const upper = text.toUpperCase();
  const hits = [];
  for (const t of tickerSet) {
    if (!t) continue;
    const re = new RegExp(`(^|[^A-Z0-9])${t.replace(/[\^]/g, '\\^')}(?![A-Z0-9])`);
    if (re.test(upper)) hits.push(t);
  }
  return hits;
}

export default function Pane4Inspector({ items = [] }) {
  const [news, setNews] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await fetchMacroNews();
        if (cancelled) return;
        if (d?.items) setNews(d.items);
        if (d?.updated_at) setUpdatedAt(d.updated_at);
      } catch { /* noop */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // watchlist + holdings の ticker set を分けて保持
  const holdingSet = useMemo(
    () => new Set(items.filter((it) => it.isHolding).map((it) => it.ticker)),
    [items]
  );
  const watchSet = useMemo(
    () => new Set(items.filter((it) => !it.isHolding && it.isWatchlist).map((it) => it.ticker)),
    [items]
  );

  // ニュースを (関連度高い順) × (重要度) でソート
  const sorted = useMemo(() => {
    const annotated = news.map((n) => {
      const text = `${n.title || ''} ${n.summary || ''}`;
      const holdingHits = matchTickers(text, holdingSet);
      const watchHits = matchTickers(text, watchSet);
      return {
        ...n,
        _holdingHits: holdingHits,
        _watchHits: watchHits,
        _hasMatch: holdingHits.length > 0 || watchHits.length > 0,
      };
    });
    // 保有マッチ > ウォッチマッチ > 一般 の順、各群内では importance HIGH > MED
    annotated.sort((a, b) => {
      const grp = (x) =>
        x._holdingHits.length > 0 ? 0 : x._watchHits.length > 0 ? 1 : 2;
      const g = grp(a) - grp(b);
      if (g !== 0) return g;
      const impRank = { HIGH: 0, MED: 1 };
      return (impRank[a.importance] ?? 2) - (impRank[b.importance] ?? 2);
    });
    return annotated;
  }, [news, holdingSet, watchSet]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      <div
        style={{
          padding: '10px 14px 8px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
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
        <div
          style={{
            marginTop: 2,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          {updatedAt ? `最終更新 ${fmtRelative(updatedAt)}` : '読込中...'}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
        {loading && sorted.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            ニュースを読込中...
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            該当ニュースなし
          </div>
        ) : (
          sorted.slice(0, 30).map((n, i) => {
            const isHolding = n._holdingHits.length > 0;
            const isWatch = !isHolding && n._watchHits.length > 0;
            const isHigh = n.importance === 'HIGH';
            const ringColor = isHolding
              ? 'rgba(212,175,55,0.55)'
              : isWatch
                ? 'rgba(56,189,248,0.55)'
                : 'var(--border)';
            const ringWidth = isHolding || isWatch ? 1.5 : 1;
            return (
              <a
                key={n.url || `${n.title}-${i}`}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ws-pane4-news-item"
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  padding: '8px 10px',
                  margin: '4px 4px',
                  borderRadius: 'var(--radius-sm, 8px)',
                  border: `${ringWidth}px solid ${ringColor}`,
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                  {isHigh && (
                    <span
                      aria-label="重要"
                      title="重要"
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-pill, 9999px)',
                        background: 'rgba(239,68,68,0.14)',
                        color: 'var(--color-loss)',
                        flexShrink: 0,
                      }}
                    >
                      重要
                    </span>
                  )}
                  {isHolding && (
                    <span
                      title={`保有銘柄に関連: ${n._holdingHits.join(', ')}`}
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-pill, 9999px)',
                        background: 'rgba(212,175,55,0.16)',
                        color: 'rgb(180,142,30)',
                        flexShrink: 0,
                      }}
                    >
                      保有 {n._holdingHits.join(' ')}
                    </span>
                  )}
                  {isWatch && (
                    <span
                      title={`ウォッチに関連: ${n._watchHits.join(', ')}`}
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-pill, 9999px)',
                        background: 'rgba(56,189,248,0.14)',
                        color: 'rgb(14,165,233)',
                        flexShrink: 0,
                      }}
                    >
                      観察 {n._watchHits.join(' ')}
                    </span>
                  )}
                  {n.tags?.[0] && !isHolding && !isWatch && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-pill, 9999px)',
                        background: 'var(--bg-subtle, rgba(0,0,0,0.04))',
                        color: 'var(--text-muted)',
                        flexShrink: 0,
                      }}
                    >
                      {n.tags[0]}
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
                  {n.title}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                  }}
                >
                  {n.source && <span>{n.source}</span>}
                  {n.published && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{fmtRelative(n.published)}</span>
                    </>
                  )}
                </div>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
