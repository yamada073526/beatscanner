import { useEffect, useState } from 'react';
import { fetchNews } from '../api.js';

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

  function load() {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setNews([]);
    fetchNews(ticker, 8)
      .then(setNews)
      .catch(() => setError('ニュースの取得に失敗しました'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [ticker]);

  if (!ticker) return null;

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-slate-900">
        📰 最新ニュース
        <span className="ml-2 text-xs font-normal text-slate-400">{ticker}</span>
      </h3>

      {loading && (
        <div className="flex h-24 items-center justify-center text-sm text-slate-400">
          読み込み中...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span>{error}</span>
          <button
            onClick={load}
            className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
          >
            再試行
          </button>
        </div>
      )}

      {!loading && news.length === 0 && !error && (
        <p className="text-sm text-slate-400">ニュースが見つかりません</p>
      )}

      {!loading && news.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {news.map((item, i) => (
            <li key={i} className="py-3 first:pt-0 last:pb-0">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 group-hover:text-blue-600 leading-snug line-clamp-2">
                      {item.title}
                    </p>
                    {item.summary && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {item.summary}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                      {item.source && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">
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