import { useEffect, useRef, useState } from 'react';
import { fetchNews, translateTexts } from '../api.js';

const LS_KEY = 'translateNews';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return '数分前';
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}日前`;
  return new Date(dateStr).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

export default function NewsPanel({ ticker }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [translated, setTranslated] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [translateNews, setTranslateNews] = useState(() => {
    const saved = localStorage.getItem(LS_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const translatingRef = useRef(false);

  function load() {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setNews([]);
    setTranslated(null);
    fetchNews(ticker, 8)
      .then(setNews)
      .catch(() => setError('ニュースの取得に失敗しました'))
      .finally(() => setLoading(false));
  }

  async function doTranslate(items) {
    if (translatingRef.current || !items.length) return;
    translatingRef.current = true;
    setTranslating(true);
    try {
      const titles = items.map((item) => item.title || '');
      const result = await translateTexts(titles);
      setTranslated(result);
    } catch {
      // silently fail — original titles remain visible
    } finally {
      translatingRef.current = false;
      setTranslating(false);
    }
  }

  function handleToggle() {
    const next = !translateNews;
    setTranslateNews(next);
    localStorage.setItem(LS_KEY, String(next));
  }

  useEffect(() => { load(); }, [ticker]);

  // Auto-translate when enabled and news is loaded but not yet translated
  useEffect(() => {
    if (translateNews && news.length > 0 && !translated) {
      doTranslate(news);
    }
  }, [translateNews, news]);

  if (!ticker) return null;

  const displayTitles = translateNews && translated ? translated : null;

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          📰 最新ニュース
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{ticker}</span>
        </h3>
        {news.length > 0 && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            cursor: 'pointer', fontSize: '13px',
            color: 'var(--text-secondary)',
            userSelect: 'none',
          }}>
            <span style={{ whiteSpace: 'nowrap' }}>
              {translating ? '翻訳中...' : '🌐 日本語表示'}
            </span>
            <div
              onClick={handleToggle}
              style={{
                width: '40px', height: '22px',
                borderRadius: '11px',
                background: translateNews ? '#3b82f6' : 'var(--border)',
                position: 'relative',
                transition: 'background 0.2s',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute',
                top: '3px',
                left: translateNews ? '21px' : '3px',
                width: '16px', height: '16px',
                borderRadius: '50%',
                background: '#ffffff',
                transition: 'left 0.2s',
              }} />
            </div>
          </label>
        )}
      </div>

      {loading && (
        <div className="flex h-24 items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
          読み込み中...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          <span>{error}</span>
          <button
            onClick={load}
            className="rounded border px-2 py-0.5 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            再試行
          </button>
        </div>
      )}

      {!loading && news.length === 0 && !error && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>ニュースが見つかりません</p>
      )}

      {!loading && news.length > 0 && (
        <ul style={{ borderTop: '1px solid var(--border)' }}>
          {news.map((item, i) => (
            <li key={i} className="py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug line-clamp-2"
                      style={{ color: 'var(--text-primary)' }}>
                      {displayTitles?.[i] || item.title}
                    </p>
                    {displayTitles?.[i] && item.title !== displayTitles[i] && (
                      <p className="mt-0.5 text-[11px] line-clamp-1 leading-relaxed"
                        style={{ color: 'var(--text-muted)' }}>
                        {item.title}
                      </p>
                    )}
                    {!displayTitles && item.summary && (
                      <p className="mt-1 text-xs line-clamp-2 leading-relaxed"
                        style={{ color: 'var(--text-secondary)' }}>
                        {item.summary}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {item.source && (
                        <span className="rounded px-1.5 py-0.5 font-medium"
                          style={{ background: 'var(--bg-muted)' }}>
                          {item.source}
                        </span>
                      )}
                      <span>{timeAgo(item.published)}</span>
                    </div>
                  </div>
                  {item.image && (
                    <img
                      src={item.image}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
