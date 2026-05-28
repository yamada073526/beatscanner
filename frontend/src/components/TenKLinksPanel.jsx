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
import { FileText } from 'lucide-react';  // v115 round 3: ExternalLink → ↗ arrow (IR Links 統一)
import { fetchTenK } from '../api.js';

function fmtDateJa(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y) return iso;
  return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

// v115 multi-review A-4: report_date (会計年度末日 例 "2024-09-28") を
// 「FY2024 (2024年9月期)」 形式に整形。 文書の意味が 2 秒で伝わる institutional label
function fmtFiscalYearLabel(reportDateIso) {
  if (!reportDateIso) return null;
  const [y, m] = reportDateIso.split('-');
  if (!y || !m) return null;
  const monthNum = parseInt(m, 10);
  return `FY${y} (${y}年${monthNum}月期)`;
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

  // v125 R3 hotfix lesson: data-testid="tenk-links-panel" を全 render path に統一付与
  if (loading && items === null) {
    return <p data-testid="tenk-links-panel" style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>10-K 取得中…</p>;
  }
  if (error || !items || items.length === 0) {
    return (
      <p data-testid="tenk-links-panel" style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
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
      {/* v115 round 3: IR Links と同 hover/spacing 統一 (.ir-link-item class 流用) */}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it, i) => {
          // v115 multi-review A-4: 会計年度ラベル (FY2024 形式) を主表示、 提出日は補助
          const fyLabel = fmtFiscalYearLabel(it.report_date);
          const titleLine = fyLabel ? `${fyLabel} 10-K` : `${fmtDateJa(it.date)} 提出 — 10-K`;
          const subLine = fyLabel ? `提出日: ${fmtDateJa(it.date)}` : null;
          return (
            <li key={`${it.url}-${i}`}>
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ir-link-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                style={{
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-accent) 60%, var(--border))';
                  e.currentTarget.style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <FileText size={14} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {titleLine}
                  </div>
                  {subLine && (
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {subLine}
                    </div>
                  )}
                </div>
                <span className="ir-link-arrow shrink-0 text-xs" style={{ color: 'var(--text-muted)' }} aria-hidden="true">
                  ↗
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
