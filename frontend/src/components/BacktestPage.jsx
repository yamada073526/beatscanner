/**
 * BacktestPage — ファンダメンタル 5 条件 実績証明 hero page (v71 Phase 1 Day 5)。
 *
 * 4 体合議 (UI/UX + Marketer 推奨) で確定:
 *   - Hero シンプル版 (Big number + KPI 4 chip + hold period + disclaimer)
 *   - default 365 日 hold (1 銘柄平均 +23.1% / α +4.65pp)
 *   - 専用 `?layout=backtest` URL でアクセス
 *   - 「過去の実績は将来を保証しません」 disclaimer 必須 (金商法整合)
 *
 * 内部資料 (memory anchor / CLAUDE.md): docs/references/jijima_protocol.md
 * UI 文言は「ファンダメンタル 5 条件」「独自プロトコル」を使用 (CLAUDE.md 表示テキストポリシー)。
 */
import { useState } from 'react';
import { useBacktest } from '../hooks/useBacktest.js';

const HOLD_OPTIONS = [
  { key: 90,  label: '3 ヶ月' },
  { key: 180, label: '6 ヶ月' },
  { key: 365, label: '1 年' },
];

const PERIOD_OPTIONS = [
  { key: '1y', label: '過去 1 年' },
  { key: '3y', label: '過去 3 年' },
  { key: '5y', label: '過去 5 年' },
];

function fmtSignedPct(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}
function fmtPct(n, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

function exitToHome() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('layout');
    window.location.href = url.toString();
  } catch {
    window.location.href = '/';
  }
}

export default function BacktestPage() {
  const [period, setPeriod] = useState('5y');
  const [holdDays, setHoldDays] = useState(365);
  const { data, loading, error } = useBacktest(period, holdDays);

  const kpis = data?.kpis || {};
  const sampleSize = data?.sample_size || {};
  const trades = data?.trades || [];

  const avgReturn = kpis.avg_return_pct;
  const avgSpy = kpis.avg_spy_return_pct;
  const alphaTrade = kpis.avg_alpha_pct;
  const winRate = kpis.win_rate_pct;
  const winVsSpy = kpis.win_vs_spy_rate_pct;
  const eventCount = sampleSize.total_events;
  const completedTrades = sampleSize.completed_trades;
  const uniqueTickers = sampleSize.unique_tickers;

  const fromDate = data?.from_date;
  const toDate = data?.to_date;

  return (
    <div className="backtest-page">
      <header className="backtest-page-header">
        <button
          type="button"
          className="backtest-page-back"
          onClick={exitToHome}
          aria-label="BeatScanner に戻る"
        >
          ← BeatScanner に戻る
        </button>
        <h1 className="backtest-page-title">実績証明</h1>
        <span className="backtest-page-subtitle">ファンダメンタル 5 条件 バックテスト</span>
      </header>

      <main className="backtest-page-main">
        {/* Hero: 1 銘柄あたりの平均リターン */}
        <section className="backtest-hero">
          <div className="backtest-hero-eyebrow">5 条件 PASS 銘柄を保有した場合、 1 銘柄あたり平均</div>
          <div className={`backtest-hero-number ${avgReturn != null && avgReturn >= 0 ? 'is-gain' : 'is-loss'}`}>
            {loading ? '計算中…' : (avgReturn != null ? fmtSignedPct(avgReturn) : '—')}
          </div>
          <div className="backtest-hero-meta">
            {!loading && avgSpy != null && (
              <>
                同期間の S&amp;P 500 (SPY): <strong>{fmtSignedPct(avgSpy)}</strong>
                {alphaTrade != null && (
                  <span className={`backtest-hero-alpha ${alphaTrade >= 0 ? 'is-gain' : 'is-loss'}`}>
                    {' '}/ アウトパフォーム <strong>{fmtSignedPct(alphaTrade)}</strong> ポイント
                  </span>
                )}
              </>
            )}
            {error && <span style={{ color: 'var(--color-loss)' }}>取得エラー</span>}
          </div>
        </section>

        {/* Controls: 保有期間 + 検証期間 */}
        <section className="backtest-controls">
          <div className="backtest-control-group">
            <span className="backtest-control-label">保有期間</span>
            <div className="backtest-control-chips" role="radiogroup" aria-label="保有期間">
              {HOLD_OPTIONS.map((opt) => {
                const active = holdDays === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`backtest-chip ${active ? 'is-active' : ''}`}
                    onClick={() => setHoldDays(opt.key)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="backtest-control-group">
            <span className="backtest-control-label">検証期間</span>
            <div className="backtest-control-chips" role="radiogroup" aria-label="検証期間">
              {PERIOD_OPTIONS.map((opt) => {
                const active = period === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`backtest-chip ${active ? 'is-active' : ''}`}
                    onClick={() => setPeriod(opt.key)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* KPI Strip */}
        <section className="backtest-kpis" aria-label="主要指標">
          <div className="backtest-kpi">
            <span className="backtest-kpi-label">勝率</span>
            <span className="backtest-kpi-value">{loading ? '—' : fmtPct(winRate)}</span>
            <span className="backtest-kpi-sub">
              {!loading && completedTrades != null
                ? `${Math.round((winRate / 100) * completedTrades)} 勝 ${completedTrades - Math.round((winRate / 100) * completedTrades)} 敗 / 全 ${completedTrades} 件`
                : '—'}
            </span>
          </div>
          <div className="backtest-kpi">
            <span className="backtest-kpi-label">vs SPY 勝率</span>
            <span className="backtest-kpi-value">{loading ? '—' : fmtPct(winVsSpy)}</span>
            <span className="backtest-kpi-sub">市場平均を上回った割合</span>
          </div>
          <div className="backtest-kpi">
            <span className="backtest-kpi-label">検証イベント</span>
            <span className="backtest-kpi-value">{loading ? '—' : (eventCount ?? '—')} 件</span>
            <span className="backtest-kpi-sub">
              {!loading && uniqueTickers != null ? `${uniqueTickers} 銘柄で発生` : '—'}
            </span>
          </div>
          <div className="backtest-kpi">
            <span className="backtest-kpi-label">検証範囲</span>
            <span className="backtest-kpi-value backtest-kpi-value-sm">
              {loading ? '—' : (fromDate && toDate ? `${fromDate.slice(0, 7)} 〜 ${toDate.slice(0, 7)}` : '—')}
            </span>
            <span className="backtest-kpi-sub">S&amp;P 500 上位 50 銘柄</span>
          </div>
        </section>

        {/* Trades preview (Hero シンプル版なので 5 件のみ表示) */}
        {!loading && trades.length > 0 && (
          <section className="backtest-trades">
            <h2 className="backtest-trades-title">代表的な PASS 銘柄 (α 上位 5 件)</h2>
            <div className="backtest-trades-list">
              {[...trades]
                .sort((a, b) => (b.alpha_pct ?? -1e9) - (a.alpha_pct ?? -1e9))
                .slice(0, 5)
                .map((t, i) => (
                  <div key={i} className="backtest-trade-row">
                    <span className="backtest-trade-ticker">{t.ticker}</span>
                    <span className="backtest-trade-period">{t.buy_date} → {t.sell_date}</span>
                    <span className={`backtest-trade-return ${t.return_pct >= 0 ? 'is-gain' : 'is-loss'}`}>
                      {fmtSignedPct(t.return_pct)}
                    </span>
                    <span className="backtest-trade-spy">SPY {fmtSignedPct(t.spy_return_pct)}</span>
                    <span className={`backtest-trade-alpha ${t.alpha_pct >= 0 ? 'is-gain' : 'is-loss'}`}>
                      α {fmtSignedPct(t.alpha_pct)}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Methodology */}
        <section className="backtest-methodology">
          <h2 className="backtest-methodology-title">検証方法</h2>
          <ol className="backtest-methodology-list">
            <li>S&amp;P 500 上位 50 銘柄について、 過去四半期決算 (10-Q) の財務データを取得</li>
            <li>各四半期で 5 条件評価 (①営業 CF マージン ≥15% / ②EPS 3 期連続増加 / ③CFPS 3 期連続増加 / ④売上 3 期連続増加 / ⑤CFPS &gt; EPS)</li>
            <li>5/5 PASS の銘柄を 10-Q 提出翌日終値で買い、 設定した保有期間後の終値で売却</li>
            <li>同期間の SPY パフォーマンスと比較してアウトパフォーム幅 (α) を算出</li>
          </ol>
        </section>

        {/* Disclaimer */}
        <section className="backtest-disclaimer">
          <p>
            <strong>過去の実績は将来のリターンを保証しません</strong>。 本機能は教育目的の参考情報であり、 投資勧誘ではありません。
            個別銘柄の volatility は大きく、 適切な分散投資をご検討ください。
            検証 sample は S&amp;P 500 上位 50 銘柄に限定しており、 survivorship bias (現存銘柄のみ) を含みます。
          </p>
        </section>
      </main>
    </div>
  );
}
