/**
 * TenKLinksPanel — SEC EDGAR 10-K (年次報告書) リンク一覧 (v104 release MVP)
 *
 * 用途: リファレンス章 (章 5) に 10-K (年次報告書) を IRLinksPanel と並べて表示。
 *   SEC EDGAR submissions.json 直 fetch (FMP non-dependent)、 free user にも開放。
 *
 * 設計:
 *   - backend `/api/filings/10k/{ticker}?limit=5` で年次報告書 5 件取得
 *   - 各 link は new tab で開く (SEC EDGAR URL)
 *   - empty / loading / error は inline placeholder text
 *   - 日付は ISO (YYYY-MM-DD) → 「2024年11月1日」 表記
 */
import { useEffect, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { fetchTenK } from '../api.js';

function fmtDateJa(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y) return iso;
  return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

export default function TenKLinksPanel({ ticker, hideHeading = false }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchTenK(ticker, 5);
        if (cancelled) return;
        if (!res || !Array.isArray(res.items)) {
          setError('10-K が取得できませんでした');
          setItems([]);
        } else {
          setItems(res.items);
        }
      } catch {
        if (!cancelled) {
          setError('10-K の取得に失敗しました');
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ticker]);

  if (loading && items === null) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>10-K 取得中…</p>;
  }
  if (error || !items || items.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        {error || '10-K (年次報告書) は SEC EDGAR で見つかりませんでした'}
      </p>
    );
  }

  return (
    <div data-testid="tenk-links-panel">
      {!hideHeading && (
        <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          10-K (年次報告書)
        </h3>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it, i) => (
          <li key={`${it.url}-${i}`}>
            <a
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--text-primary)',
                textDecoration: 'none',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm, 8px)',
                border: '1px solid var(--border)',
                background: 'transparent',
                transition: 'background 0.16s ease, border-color 0.16s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(56, 189, 248, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.45)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <FileText size={14} strokeWidth={1.75} aria-hidden style={{ color: 'rgb(56, 189, 248)' }} />
              <span style={{ flex: 1 }}>{fmtDateJa(it.date)} 提出 — 10-K</span>
              <ExternalLink size={12} strokeWidth={1.75} aria-hidden style={{ color: 'var(--text-muted)' }} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
