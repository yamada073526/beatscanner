/**
 * PortfolioDetailBody — Pane 3 portfolio target の body (v71 抽象化 Phase 2、 6 体合議 converge)。
 *
 * 構成 (6 体合議の chart 55% / news 35% / 余白 10% 縦配分):
 *   1. Header: breadcrumb chip + judg PASS/FAIL カウント (差別化軸、 マーケター必須条件)
 *   2. 大 chart (PortfolioHistoryChart 既存資産を再利用、 TWR + SPY overlay)
 *   3. 保有銘柄ニュース (top 5 weight 順 × 3 件/銘柄、 ticker badge 付)
 *
 * 後送り (Phase 3+):
 *   - events lane (決算/ex-div/8-K) を news と物理的に別 row 分離
 *   - 直近 Δ ≥ 3% boost (weight 順 baseline + 当日変動上位 1-2 件)
 *   - FX P/L 分離 (JPY mode 限定差別化)
 *   - per-ticker Modified Dietz (Phase 2 disclaimer + Phase 3 strict 化)
 *
 * memory anchor: feedback_pane3_detail_view.md / project_pane3_abstraction_consensus.md
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useTransactions } from '../../hooks/useTransactions.js';
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import { usePortfolioJudgment } from '../../hooks/usePortfolioJudgment.js';
import { useAccountName } from '../../hooks/useAccountName.js';
import { usePortfolioPrices } from '../../hooks/usePortfolioPrices.js';
import { usePortfolioEvents } from '../../hooks/usePortfolioEvents.js';
import { fetchNewsBulk } from '../../api.js';
import Chip from '../../components/ui/Chip.jsx';
import TickerBadge from '../../components/ui/TickerBadge.jsx';
import { Newspaper } from 'lucide-react';

// 既存 chart は lazy chunk 化済 (lightweight-charts heavy)。 Pane 3 visible 時のみ load。
const PortfolioHistoryChart = lazy(() => import('../../components/PortfolioHistoryChart.jsx'));

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

// transactions (buy) → lots 形式。 PortfolioHistoryChart が期待する shape に合わせる。
function txToLots(transactions, selectedAccountId) {
  if (!Array.isArray(transactions)) return [];
  const filtered = selectedAccountId
    ? transactions.filter((t) => t.account_id === selectedAccountId)
    : transactions;
  return filtered
    .filter((t) => String(t.type || '').toLowerCase() === 'buy')
    .map((t) => ({
      id: t.id,
      ticker: String(t.ticker || '').toUpperCase(),
      shares: Number(t.shares),
      price: Number(t.price) || null,
      trade_date: t.trade_date,
      cost_basis_method: 'user_input',
    }))
    .filter((l) => l.ticker && Number.isFinite(l.shares) && l.shares > 0 && l.trade_date);
}

// 銘柄ごとの evaluation (現在価額 weight) を算出。 weight 順 top N の決定に使う。
function rankByWeight(lots) {
  const byTicker = new Map();
  for (const l of lots) {
    const cur = byTicker.get(l.ticker) || { shares: 0, cost: 0 };
    cur.shares += l.shares;
    cur.cost += (l.price || 0) * l.shares;
    byTicker.set(l.ticker, cur);
  }
  return [...byTicker.entries()]
    .map(([ticker, v]) => ({ ticker, weight: v.cost }))
    .sort((a, b) => b.weight - a.weight);
}

export default function PortfolioDetailBody({ scopeId = 'all' }) {
  const { user } = useAuth();
  const selectedAccountId = useWorkspaceStore((s) => s.selectedAccountId);
  // scopeId が account_id 系なら selectedAccountId に従う、 'all' なら null (= 全口座)
  const effectiveAccountId = scopeId === 'all' ? null : (scopeId || selectedAccountId);
  // v71 Phase 2.1 (6 体合議): 「選択中の口座」固定文言 → 実口座名を表示。
  // hook が rename / 削除に自動追従するため Pane 2/3 で同期更新される。
  const accountName = useAccountName(effectiveAccountId);

  const { transactions } = useTransactions({ supabase, user });
  const lots = useMemo(() => txToLots(transactions, effectiveAccountId),
    [transactions, effectiveAccountId]);

  // weight top 8 銘柄 (= 判定 badge 表示対象、 ニュース集約対象)
  // v71 Phase 3-b (6 体合議 / 開発エキスパート converge): 5 → 8 に拡大して
  // 「保有上位 + 直近変動上位」のハイブリッド集約に近づける (Bloomberg PORT 流)。
  const topTickers = useMemo(() => rankByWeight(lots).slice(0, 8).map((x) => x.ticker),
    [lots]);

  // 判定 badge — 差別化軸 (マーケター必須条件): 保有 ticker の 5 条件 PASS/FAIL を chart 上に summary 表示
  const { verdicts } = usePortfolioJudgment(topTickers);

  // v71 Phase 3-b (6 体合議 / UI/UX events lane MVP): 直近 |Δ%| ≥ 3% の保有銘柄を
  // chip ribbon で chart 直下に出す。 news 重要度スコアの簡易版 (Δ news boost 相当)。
  const { prices: portfolioPrices } = usePortfolioPrices(topTickers);
  const movers = useMemo(() => {
    const out = [];
    for (const t of topTickers) {
      const p = portfolioPrices?.[t];
      const pct = Number(p?.change_pct);
      if (!Number.isFinite(pct) || Math.abs(pct) < 3) continue;
      out.push({ ticker: t, pct });
    }
    out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return out.slice(0, 3);  // 上位 3 件で UI 圧迫を回避
  }, [topTickers, portfolioPrices]);

  // v71 Phase 3-c (events lane 本格化): ex-div + 8-K filings を bulk fetch。
  // chart には ex-div を marker として渡し、 8-K は chart 下の chip ribbon で表示。
  const { exDivByTicker, filingsByTicker } = usePortfolioEvents(topTickers, { lookbackDays: 30 });

  // 8-K chip ribbon: 全 ticker 横断で flatten、 過去 14 日以内、 date 降順、 top 5
  const recentFilings = useMemo(() => {
    if (!filingsByTicker || filingsByTicker.size === 0) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const flat = [];
    for (const [ticker, filings] of filingsByTicker.entries()) {
      for (const f of (filings || [])) {
        if (!f?.date || !f?.url) continue;
        if (f.date < cutoffIso) continue;
        flat.push({ ticker, date: f.date, title: f.title || '8-K', url: f.url });
      }
    }
    flat.sort((a, b) => (a.date < b.date ? 1 : -1));
    return flat.slice(0, 5);
  }, [filingsByTicker]);

  // 保有銘柄ニュース bulk: top 5 ticker × 3 件
  const [newsItems, setNewsItems] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  // v105 emoji audit: thumbnail fallback を React state 管理 (lucide Newspaper 描画用)
  const [failedThumbs, setFailedThumbs] = useState(() => new Set());
  const markThumbFailed = (i) => {
    setFailedThumbs(prev => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  };
  const tickerKey = topTickers.join(',');
  useEffect(() => {
    if (!tickerKey) {
      setNewsItems([]);
      return;
    }
    let cancelled = false;
    setNewsLoading(true);
    (async () => {
      const data = await fetchNewsBulk(topTickers, 3);
      if (cancelled) return;
      // {items: [{ticker, status, articles: [...]}]} を flatten + 時系列降順
      const flat = [];
      for (const row of (data?.items || [])) {
        for (const a of (row.articles || [])) {
          flat.push({ ...a, ticker: row.ticker });
        }
      }
      flat.sort((a, b) => {
        const ta = new Date(a.publishedDate || a.publishedAt || 0).getTime();
        const tb = new Date(b.publishedDate || b.publishedAt || 0).getTime();
        return tb - ta;
      });
      setNewsItems(flat.slice(0, 12));
      setNewsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tickerKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 判定 PASS / FAIL カウント (top 5 ベース)
  const passFailCount = useMemo(() => {
    let pass = 0, fail = 0, unknown = 0;
    for (const t of topTickers) {
      const v = verdicts?.[t];
      if (!v) unknown += 1;
      else if (v.overallPass) pass += 1;
      else fail += 1;
    }
    return { pass, fail, unknown };
  }, [verdicts, topTickers]);

  if (!user) {
    return (
      <div className="pane3-portfolio-empty">
        ログイン後に保有銘柄の詳細を表示します。
      </div>
    );
  }

  if (lots.length === 0) {
    return (
      <div className="pane3-portfolio-empty">
        取引を登録すると、 保有銘柄の大チャート + 最新ニュースが表示されます。
      </div>
    );
  }

  return (
    <div className="pane3-portfolio-detail">
      {/* Header: breadcrumb + 判定 badge (差別化軸) */}
      <div className="pane3-portfolio-head">
        <div>
          <div className="pane3-portfolio-eyebrow">ポートフォリオ詳細</div>
          <div className="pane3-portfolio-title">
            {effectiveAccountId ? (accountName || '口座読込中…') : '全口座 合算'}
          </div>
        </div>
        <div className="pane3-portfolio-judgsummary">
          {passFailCount.pass > 0 && (
            <Chip size="sm" variant="display" tone="gain" title={`保有上位銘柄のうち 5条件クリア: ${passFailCount.pass}銘柄`}>
              ✓ 条件クリア&nbsp;
              <span style={{ color: 'var(--color-gain)', fontWeight: 700 }}>{passFailCount.pass}</span>
            </Chip>
          )}
          {passFailCount.fail > 0 && (
            <Chip size="sm" variant="display" tone="loss" title={`保有上位銘柄のうち 条件未達: ${passFailCount.fail}銘柄`}>
              ✗ 条件未達&nbsp;
              <span style={{ color: 'var(--color-loss)', fontWeight: 700 }}>{passFailCount.fail}</span>
            </Chip>
          )}
          {passFailCount.unknown > 0 && (
            <Chip size="sm" variant="display" tone="muted" title="判定取得中 / 未対応銘柄">
              ?&nbsp;
              <span style={{ fontWeight: 600 }}>{passFailCount.unknown}</span>
            </Chip>
          )}
        </div>
      </div>

      {/* v71 Phase 3-b: 直近変動 ≥ 3% の保有銘柄を chip ribbon で表示 (events lane MVP)。
          Bloomberg PORT `Top Movers` の簡易版。 Phase 3-c で本格的 events lane (決算 +
          ex-div + 8-K) に統合予定。 */}
      {movers.length > 0 && (
        <div className="pane3-portfolio-movers" role="group" aria-label="直近の大きな値動き">
          <span className="pane3-portfolio-movers-caption">直近の大きな値動き</span>
          {movers.map((m) => (
            <Chip
              key={m.ticker}
              size="xs"
              variant="display"
              tone={m.pct >= 0 ? 'gain' : 'loss'}
              title={`${m.ticker} は直近で ${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(2)}% 変動`}
            >
              <span aria-hidden="true">{m.pct >= 0 ? '▲' : '▼'}</span>
              &nbsp;{m.ticker}&nbsp;
              <span style={{ color: m.pct >= 0 ? 'var(--color-gain)' : 'var(--color-loss)', fontWeight: 600 }}>
                {m.pct >= 0 ? '+' : ''}{m.pct.toFixed(2)}%
              </span>
            </Chip>
          ))}
        </div>
      )}

      {/* 大 chart (PortfolioHistoryChart 既存資産を Suspense + lazy で消費)
          v71 Phase 3-c: exDivByTicker prop で chart 上に 💰 marker を重ねる */}
      <Suspense fallback={<div className="pane3-portfolio-chart-fallback" aria-label="読み込み中" />}>
        <PortfolioHistoryChart lots={lots} exDivByTicker={exDivByTicker} />
      </Suspense>

      {/* v71 Phase 3-c: 最近のSEC 8-K 開示 chip ribbon (events lane 本格化)。
          chart 直後・ニュース直前に配置し、 click で SEC EDGAR の filing 全文へ。
          ex-div は chart marker 側で表示し、 8-K は URL link 動線を優先して chip 化。 */}
      {recentFilings.length > 0 && (
        <div className="pane3-portfolio-filings" role="group" aria-label="最近のSEC 8-K 開示">
          <span className="pane3-portfolio-filings-caption">最近のSEC開示 (8-K)</span>
          {recentFilings.map((f) => (
            <a
              key={`${f.ticker}-${f.url}`}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="pane3-portfolio-filings-link"
              title={`${f.ticker} 8-K filing (${f.date}) — SEC EDGAR で全文を開く`}
            >
              <Chip
                size="xs"
                variant="display"
                tone="muted"
                ariaLabel={`${f.ticker} の 8-K 開示、 ${timeAgo(f.date)}`}
              >
                <span aria-hidden="true">📄</span>
                &nbsp;{f.ticker}&nbsp;·&nbsp;
                <span style={{ color: 'var(--text-muted)' }}>{timeAgo(f.date)}</span>
                <span aria-hidden="true">&nbsp;↗</span>
              </Chip>
            </a>
          ))}
        </div>
      )}

      {/* 保有銘柄ニュース集約 */}
      <section className="pane3-portfolio-news">
        <div className="pane3-portfolio-news-head">
          <span className="pane3-portfolio-news-title">保有銘柄ニュース</span>
          <span className="pane3-portfolio-news-meta">
            {newsLoading ? '取得中…' : `${newsItems.length} 件 (上位 ${topTickers.length} 銘柄)`}
          </span>
        </div>
        {newsItems.length === 0 && !newsLoading && (
          <div className="pane3-portfolio-news-empty">最新ニュースを取得できませんでした</div>
        )}
        {/* v71 Phase 3-d round 8 (dogfood 2026-05-16 / Light 版):
            指数ニュース (NewsPanel list view) と同じ visual treatment に統一:
            - 発光する cyan accent bar (左端) + hover で lift / glow / scale
            - サムネイル画像 (backend `image` field を流用、 fallback で Newspaper lucide icon)
            - TickerBadge を meta line に配置 (Bloomberg PORT 流)
            Full 版 (JP/EN トグル + List/Grid 切替 + Pane 5 連動) は backlog で
            subagent review 経てから着手。 memory anchor: project_personalization_backlog.md */}
        <div className="news-list-container">
          {newsItems.map((item, i) => (
            <a
              key={`${item.ticker}-${item.url || i}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="news-list-card"
            >
              {item.image && !failedThumbs.has(i) ? (
                <img
                  src={item.image}
                  alt=""
                  className="news-list-thumb"
                  loading="lazy"
                  decoding="async"
                  onError={() => markThumbFailed(i)}
                />
              ) : (
                <div className="news-list-thumb-fallback" aria-hidden>
                  <Newspaper size={20} strokeWidth={1.75} />
                </div>
              )}
              <div className="news-list-body">
                <p className="news-list-title">{item.title}</p>
                <div className="news-list-meta">
                  <TickerBadge ticker={item.ticker} size="xs" />
                  {item.source && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="news-list-source">{item.source}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{timeAgo(item.published || item.publishedDate || item.publishedAt)}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
