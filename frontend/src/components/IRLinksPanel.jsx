import { useEffect, useState } from 'react';
import { fetchIRLinks } from '../api.js';

function LinkItem({ label, url, desc }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800">{label}</div>
        {desc && <div className="text-xs text-slate-400">{desc}</div>}
      </div>
      <span className="shrink-0 text-xs text-slate-300">↗</span>
    </a>
  );
}

function Section({ title, icon, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export default function IRLinksPanel({ ticker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    fetchIRLinks(ticker)
      .then(setData)
      .catch(() => setData(null))
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
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-slate-900">
        📎 IRリソース
        <span className="ml-2 text-xs font-normal text-slate-400">{ticker}</span>
      </h3>

      {loading && (
        <div className="flex h-16 items-center justify-center text-sm text-slate-400 animate-pulse">
          リンクを取得中...
        </div>
      )}

      {!loading && (
        <div className="grid gap-5 md:grid-cols-2">
          {/* 左列: 決算発表 */}
          <div className="space-y-4">
            {/* 最新プレスリリース (FMP動的データ) */}
            {pressReleases.length > 0 && (
              <Section title="最新プレスリリース" icon="📋">
                {pressReleases.map((pr, i) => (
                  <LinkItem
                    key={i}
                    label={pr.title || `プレスリリース ${pr.date}`}
                    url={pr.url}
                    desc={pr.date}
                  />
                ))}
              </Section>
            )}

            {/* 最新 8-K ファイリング (FMP動的データ) */}
            {secFilings.length > 0 && (
              <Section title="最新 SEC 8-K ファイリング" icon="🏛️">
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

            <Section title="決算発表" icon="📄">
              {static_links.earnings.map((l, i) => (
                <LinkItem key={i} label={l.label} url={l.url} desc={l.desc} />
              ))}
            </Section>
          </div>

          {/* 右列: カンファレンスコール */}
          <div className="space-y-4">
            <Section title="カンファレンスコール" icon="🎙️">
              {static_links.conference.map((l, i) => (
                <LinkItem key={i} label={l.label} url={l.url} desc={l.desc} />
              ))}
            </Section>

            {website && (
              <Section title="IR公式サイト" icon="🌐">
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
  );
}
