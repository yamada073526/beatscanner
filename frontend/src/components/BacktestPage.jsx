/**
 * BacktestPage — シンプルな 5 つのルールで選んだ結果 (v71 Phase 1.5、 2026-05-16)。
 *
 * 5 体合議 (UI/UX + Marketer + Anthropic + Web 設計 + 金融) で確定:
 *   - Hero: 大きな % + 「100 万円 → 123 万円」 secondary (JPY 単独、 固定 150 円換算)
 *     → 「裾野広いユーザー (米国株未経験) でも買えるものイメージが湧く」
 *   - 為替の扱い: 固定レート換算 (Brinson 帰属分析: forex を return attribution から除外)
 *     → Trust Cliff 回避 (USD/JPY 変動で数値が崩れない)
 *   - Skeleton shimmer animation + useCountUp で 「動いている感」
 *   - Title 「実績証明」 → 「5 つのルールで選んだ結果」 (柔らかい言い回し)
 *   - vs SPY 勝率は depth に move、 hero KPI は 「勝率 / +α」 の 2 つに集中
 *   - PASS 銘柄に TickerBadge (企業ロゴ)
 *   - Primary CTA「自分の保有銘柄をチェック →」 (hero 下)
 *   - SPIVA 業界比較 + n=14 preliminary 表記
 *   - prefers-reduced-motion / aria-live 対応
 *
 * 内部資料 (memory anchor / CLAUDE.md): docs/references/jijima_protocol.md
 * UI 文言は「シンプルな 5 つのルール」 を使用 (CLAUDE.md 表示テキストポリシー)。
 */
import { useState } from 'react';
import { useBacktest } from '../hooks/useBacktest.js';
import { useCountUp } from '../hooks/useCountUp.js';
import TickerBadge from './ui/TickerBadge.jsx';

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

// 為替: 固定レート 150 円換算 (Brinson 帰属分析の業界標準で forex 影響除外)。
// 過去 5 年で USD/JPY は 110-161 円で大変動、 固定で見せることで「5 条件の効果」 を純粋に伝える。
const USDJPY_FIXED = 150;
const HERO_BASE_JPY = 1_000_000;  // 「100 万円」 hero baseline

function fmtSignedPct(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}
function fmtPct(n, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}
function fmtJpy(yen) {
  if (yen == null || !Number.isFinite(yen)) return '—';
  if (yen >= 100_000_000) return `${(yen / 100_000_000).toFixed(yen >= 1_000_000_000 ? 0 : 1)} 億円`;
  return `${Math.round(yen / 10_000).toLocaleString('ja-JP')} 万円`;
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

function exitToAnalyze() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('layout');
    window.location.href = url.toString();
  } catch {
    window.location.href = '/';
  }
}

// Skeleton placeholder — loading 中の「動いている感」 を担う shimmer animation
function SkeletonBar({ width = '120px', height = '1em' }) {
  return (
    <span
      className="bs-skeleton-bar"
      style={{ width, height, display: 'inline-block' }}
      aria-hidden="true"
    />
  );
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

  // Count-up animations (target が null なら 0 から始まる)
  const animAvgReturn = useCountUp(avgReturn, { duration: 800, digits: 2 });
  const animAvgSpy = useCountUp(avgSpy, { duration: 600, digits: 2 });
  const animAlpha = useCountUp(alphaTrade, { duration: 800, digits: 2 });
  const animWinRate = useCountUp(winRate, { duration: 600, digits: 1 });
  const animWinVsSpy = useCountUp(winVsSpy, { duration: 600, digits: 1 });

  // 「100 万円 → 〇〇万円」 仮定法 (固定 150 円換算 = JPY return = USD return で一貫)
  const futureJpy = avgReturn != null ? HERO_BASE_JPY * (1 + avgReturn / 100) : null;
  const animFutureJpy = useCountUp(futureJpy, { duration: 800, digits: 0 });

  // Preliminary バッジ表示判定 (n < 30 は統計的に preliminary)
  const isPreliminary = completedTrades != null && completedTrades < 30;

  // Top 5 trades (α 順)
  const topTrades = !loading && trades.length > 0
    ? [...trades].sort((a, b) => (b.alpha_pct ?? -1e9) - (a.alpha_pct ?? -1e9)).slice(0, 5)
    : [];

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
        <h1 className="backtest-page-title">5 つのルールで選んだ結果</h1>
        <span className="backtest-page-subtitle">
          シンプルな 5 つのルールで選んだ銘柄が、 過去どれだけ勝てたかの検証
        </span>
      </header>

      <main className="backtest-page-main">
        {/* Hero: 結論を 1 枚絵で */}
        <section
          className="backtest-hero"
          aria-busy={loading || undefined}
          aria-live="polite"
        >
          <div className="backtest-hero-eyebrow">
            過去 <strong>5 年</strong>、 ルール合格銘柄を <strong>1 年保有</strong> した場合の 1 銘柄あたり平均
          </div>
          <div
            className={`backtest-hero-number ${
              avgReturn == null ? '' : avgReturn >= 0 ? 'is-gain' : 'is-loss'
            }`}
            aria-label={avgReturn != null ? fmtSignedPct(avgReturn) : '計算中'}
          >
            {loading || avgReturn == null ? (
              <SkeletonBar width="6ch" height="1em" />
            ) : (
              fmtSignedPct(animAvgReturn ?? avgReturn)
            )}
          </div>

          {/* Secondary: 100 万円 → 123 万円 (米国株未経験者でも「買えるもの」 がイメージ可) */}
          <div className="backtest-hero-jpy">
            {loading || futureJpy == null ? (
              <SkeletonBar width="180px" height="1em" />
            ) : (
              <>
                <span className="backtest-hero-jpy-from">100 万円</span>
                <span className="backtest-hero-jpy-arrow" aria-hidden="true">→</span>
                <span className={`backtest-hero-jpy-to ${futureJpy >= HERO_BASE_JPY ? 'is-gain' : 'is-loss'}`}>
                  {fmtJpy(animFutureJpy ?? futureJpy)}
                </span>
              </>
            )}
          </div>

          {/* Tertiary: SPY 比較 + α */}
          <div className="backtest-hero-meta">
            {error ? (
              <span style={{ color: 'var(--color-loss)' }}>取得に失敗しました</span>
            ) : loading || avgSpy == null ? (
              <SkeletonBar width="280px" height="1em" />
            ) : (
              <>
                同期間の S&amp;P 500 (米国株全体の代表指数): <strong>{fmtSignedPct(animAvgSpy ?? avgSpy)}</strong>
                {alphaTrade != null && (
                  <span className={`backtest-hero-alpha ${alphaTrade >= 0 ? 'is-gain' : 'is-loss'}`}>
                    {' '}/ 市場を <strong>{fmtSignedPct(animAlpha ?? alphaTrade)}</strong> ポイント上回る
                  </span>
                )}
              </>
            )}
          </div>

          {/* Primary CTA: 自分の保有銘柄をチェック (Marketer 推奨、 現状最大の欠落) */}
          <div className="backtest-hero-cta">
            <button
              type="button"
              className="backtest-cta-primary"
              onClick={exitToAnalyze}
            >
              自分の保有銘柄をチェック →
            </button>
            <span className="backtest-hero-cta-meta">登録不要 / 3 銘柄まで無料</span>
          </div>
        </section>

        {/* KPI strip: 勝率 + sample size (シンプル 3 chip、 vs SPY 勝率は depth に move) */}
        <section className="backtest-kpis" aria-label="主要指標">
          <div className="backtest-kpi">
            <span className="backtest-kpi-label">勝率</span>
            <span className="backtest-kpi-value">
              {loading ? <SkeletonBar width="3em" /> : fmtPct(animWinRate ?? winRate)}
            </span>
            <span className="backtest-kpi-sub">
              {!loading && completedTrades != null
                ? `${Math.round((winRate / 100) * completedTrades)} 勝 ${completedTrades - Math.round((winRate / 100) * completedTrades)} 敗 / 全 ${completedTrades} 件`
                : <SkeletonBar width="8em" />}
            </span>
          </div>
          <div className="backtest-kpi">
            <span className="backtest-kpi-label">検証イベント</span>
            <span className="backtest-kpi-value">
              {loading ? <SkeletonBar width="2em" /> : (eventCount ?? '—')} 件
              {!loading && isPreliminary && (
                <span className="backtest-kpi-badge" title="統計的に有意となる 30 件 (n≥30) 未満、 検証範囲拡大予定">
                  preliminary
                </span>
              )}
            </span>
            <span className="backtest-kpi-sub">
              {!loading && uniqueTickers != null
                ? `${uniqueTickers} 銘柄で発生`
                : <SkeletonBar width="6em" />}
            </span>
          </div>
          <div className="backtest-kpi">
            <span className="backtest-kpi-label">検証範囲</span>
            <span className="backtest-kpi-value backtest-kpi-value-sm">
              {loading
                ? <SkeletonBar width="9em" />
                : fromDate && toDate ? `${fromDate.slice(0, 7)} 〜 ${toDate.slice(0, 7)}` : '—'}
            </span>
            <span className="backtest-kpi-sub">S&amp;P 500 上位 50 銘柄を検証</span>
          </div>
        </section>

        {/* Top trades: 企業ロゴ + ticker + リターン (TickerBadge 流用、 文字 → 絵で SNS シェア可) */}
        {!loading && topTrades.length > 0 && (
          <section className="backtest-trades">
            <h2 className="backtest-trades-title">大きく勝った銘柄 (α 上位 5 件)</h2>
            <div className="backtest-trades-list">
              {topTrades.map((t, i) => (
                <div key={i} className="backtest-trade-row">
                  <TickerBadge ticker={t.ticker} size="sm" />
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

        {/* Controls: fold below に移動 (5 体合議で「結論を hero で言い切り、 details は scroll」 流) */}
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

        {/* Methodology + 業界比較 (SPIVA) */}
        <section className="backtest-methodology">
          <h2 className="backtest-methodology-title">検証方法と業界比較</h2>
          <ol className="backtest-methodology-list">
            <li>S&amp;P 500 上位 50 銘柄について、 過去四半期決算 (10-Q) の財務データを取得</li>
            <li>各四半期で 5 つのルールを評価 (①営業 CF マージン ≥15% / ②EPS 3 期連続増加 / ③CFPS 3 期連続増加 / ④売上 3 期連続増加 / ⑤CFPS &gt; EPS)</li>
            <li>5/5 合格の銘柄を 10-Q 提出翌日終値で買い、 設定した保有期間後の終値で売却</li>
            <li>同期間の SPY パフォーマンスと比較してアウトパフォーム幅 (α) を算出</li>
            <li>円換算は USD/JPY {USDJPY_FIXED} 円の固定レート (為替変動は除外、 純粋な銘柄選定効果のみを可視化)</li>
          </ol>

          <h3 className="backtest-methodology-subtitle">業界比較 (SPIVA / Morningstar)</h3>
          <p className="backtest-methodology-para">
            S&amp;P Dow Jones の SPIVA レポートによれば、 <strong>過去 10 年で S&amp;P 500 を上回った米国大型株 active fund は 12.6% のみ</strong>。 本検証の vs SPY 勝率 {!loading && winVsSpy != null ? fmtPct(winVsSpy) : '—'} は、 「3 銘柄に 1 銘柄が市場平均を上回る (打率より長打率を重視)」 という結果になっています。
            勝率 {!loading && winRate != null ? fmtPct(winRate) : '—'} に対して、 平均 α {!loading && alphaTrade != null ? fmtSignedPct(alphaTrade) : '—'} ポイントが positive である点が「**負け銘柄の損失を勝ち銘柄の超過リターンで補う期待値プラス戦略**」 の根拠です。
          </p>
        </section>

        {/* Disclaimer */}
        <section className="backtest-disclaimer">
          <p>
            <strong>過去の実績は将来のリターンを保証しません</strong>。 本機能は教育目的の参考情報であり、 投資勧誘ではありません。
            個別銘柄の volatility は大きく、 適切な分散投資をご検討ください。
          </p>
          <ul className="backtest-disclaimer-points">
            <li><strong>サンプル数 {!loading && completedTrades != null ? `${completedTrades} 件` : '—'} は preliminary</strong> — 統計的に有意となる n≥30 未達、 検証範囲拡大予定</li>
            <li><strong>Survivorship bias</strong>: S&amp;P 500 現存銘柄のみで検証、 +5〜10 ポイント過大評価の可能性</li>
            <li><strong>為替リスク</strong>: 円換算は USD/JPY 150 円固定、 実際の円建てリターンは為替変動で乖離します</li>
            <li><strong>取引コスト・税金未控除</strong>: 米国株配当 10% 源泉 + 日本 20.315% (二重課税控除あり)</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
