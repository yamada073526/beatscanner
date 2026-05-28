import { useEffect, useState } from 'react';
import { fetchIRLinks } from '../api.js';
import { Link, FileText, Mic, Globe, Building2, FileBadge2 } from 'lucide-react';
// Phase 2.5 Sprint 2: Tier L 入場 fade (y:6 subtle variant)
import SectionFadeSubtle from '../features/judgment/primitives/SectionFadeSubtle.jsx';

function LinkItem({ label, url, desc }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      // Phase 2.5 Sprint 2: raw hex → token 化 (tier-l-glow 観点と統一)
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ir-link-item"
      style={{
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
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
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {label}
        </div>
        {desc && (
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {desc}
          </div>
        )}
      </div>
      {/* Phase 2.7 Sprint 1 #2: .ir-link-arrow で hover translateX(4px) translateY(-2px) 適用 */}
      <span
        className="ir-link-arrow shrink-0 text-xs"
        style={{ color: 'var(--text-muted)' }}
        aria-hidden="true"
      >
        ↗
      </span>
    </a>
  );
}

function Section({ title, icon, children }) {
  return (
    <div>
      <div
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

// Phase 2.7 Sprint 1 #2': hideHeading prop — workspace mode では大見出し/小見出し重複を解消
// default = false で SPA classic mode 維持 (既存 isScrollV1 mode でも表示)
export default function IRLinksPanel({ ticker, hideHeading = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  // Phase 2.6 Evaluator FAIL-2 hotfix: 3 段階分岐 SSOT (feedback_data_completeness_guard.md)
  // 「取得中 / 取得失敗 / データなし正常」 を loading + fetchError + data 0 件 で区別
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setFetchError(false);
    fetchIRLinks(ticker)
      .then((res) => {
        setData(res);
        setFetchError(false);
      })
      .catch(() => {
        setData(null);
        setFetchError(true);
      })
      .finally(() => setLoading(false));
  }, [ticker]);

  if (!ticker) return null;

  const static_links = data?.static_links ?? {
    earnings: [
      {
        label: 'SEC EDGAR 8-K（決算プレスリリース）',
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}&type=8-K&dateb=&owner=include&count=5`,
        desc: 'SEC への公式ファイリング',
      },
      {
        label: 'Yahoo Finance 財務データ',
        url: `https://finance.yahoo.com/quote/${ticker}/financials/`,
        desc: '損益計算書・CF計算書',
      },
      {
        label: 'Seeking Alpha 決算ページ',
        url: `https://seekingalpha.com/symbol/${ticker}/earnings`,
        desc: 'EPS/売上サプライズ・予想比較',
      },
    ],
    conference: [
      {
        label: 'Seeking Alpha トランスクリプト',
        url: `https://seekingalpha.com/symbol/${ticker}/earnings/transcripts`,
        desc: '決算説明会の全文書き起こし',
      },
      {
        label: 'Fool.com トランスクリプト',
        url: `https://www.fool.com/earnings-call-transcripts/?symbol=${ticker}`,
        desc: 'The Motley Fool 決算コール',
      },
    ],
  };

  const pressReleases = data?.press_releases ?? [];
  const secFilings = data?.sec_filings ?? [];
  const website = data?.website;

  return (
    <SectionFadeSubtle>
    {/* tier-l-glow: Sprint 2 Phase 2.5 — hover border tint + inset shadow で Tier L 階層演出 */}
    <section
      className="panel-card tier-l-glow rounded-2xl p-6 shadow-sm"
      data-testid="ir-links-panel"
      style={{ background: 'var(--bg-card)' }}
    >
      {/* Phase 2.7 Sprint 1 #2': hideHeading=true (workspace mode) で大見出し/小見出し重複を解消
          AccordionSection の header が「IRリソース」を表示するため内部 h3 は冗長になる
          default = false で SPA classic / isScrollV1 mode 維持 */}
      {!hideHeading && (
        <h3
          className="section-heading"
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-4, 16px)' }}
        >
          <span className="section-header-icon" aria-hidden="true">
            <Link size={18} strokeWidth={1.5} />
          </span>
          IRリソース
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
            {ticker}
          </span>
        </h3>
      )}

      {loading && (
        <div
          className="flex h-16 items-center justify-center text-sm animate-pulse"
          style={{ color: 'var(--text-muted)' }}
        >
          リンクを取得中...
        </div>
      )}

      {!loading && (
        <div className="grid gap-5 md:grid-cols-2">
          {/* 左列: 決算発表 */}
          <div className="space-y-4 md:pr-6">
            {/* 最新プレスリリース (FMP動的データ) — feedback_data_completeness_guard.md 3 段階分岐 UI */}
            {pressReleases.length > 0 ? (
              <Section title="最新プレスリリース" icon={<FileText size={14} strokeWidth={1.5} />}>
                {pressReleases.map((pr, i) => (
                  <LinkItem
                    key={i}
                    label={pr.title || `プレスリリース ${pr.date}`}
                    url={pr.url}
                    desc={pr.date}
                  />
                ))}
              </Section>
            ) : (
              /* Phase 2.6 5-2: empty skeleton — 3 段階分岐: カバー外 / 一時失敗 / データなし正常 */
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs"
                style={{
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  background: 'var(--bg-subtle)',
                }}
                data-testid="ir-press-releases-empty"
              >
                <FileText size={13} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                <span>
                  {fetchError
                    ? 'IR データ取得失敗 (一時的)'
                    : data === null
                      ? 'IR リソース取得中...'
                      : '公開プレスリリース 0 件'}
                </span>
              </div>
            )}

            {/* 最新 8-K ファイリング (FMP動的データ) */}
            {secFilings.length > 0 && (
              <Section title="最新 SEC 8-K ファイリング" icon={<FileBadge2 size={14} strokeWidth={1.5} />}>
                {secFilings.map((f, i) => (
                  <LinkItem
                    key={i}
                    label={f.title || '8-K Filing'}
                    url={f.url}
                    desc={f.date}
                  />
                ))}
              </Section>
            )}

            <Section title="決算発表" icon={<FileText size={14} strokeWidth={1.5} />}>
              {static_links.earnings.map((l, i) => (
                <LinkItem key={i} label={l.label} url={l.url} desc={l.desc} />
              ))}
            </Section>
          </div>

          {/* 右列: カンファレンスコール (md+ のみ仕切り線、token 化) */}
          <div
            className="space-y-4 md:pl-6"
            style={{ borderLeft: '1px solid var(--border)' }}
          >
            <Section title="カンファレンスコール" icon={<Mic size={14} strokeWidth={1.5} />}>
              {static_links.conference.map((l, i) => (
                <LinkItem key={i} label={l.label} url={l.url} desc={l.desc} />
              ))}
            </Section>

            {website && (
              <Section title="IR公式サイト" icon={<Globe size={14} strokeWidth={1.5} />}>
                <LinkItem
                  label="企業公式サイト"
                  url={website}
                  desc={website.replace(/^https?:\/\//, '').split('/')[0]}
                />
              </Section>
            )}
          </div>
        </div>
      )}
    </section>
    </SectionFadeSubtle>
  );
}
