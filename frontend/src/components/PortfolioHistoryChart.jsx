import { useEffect, useMemo, useRef, useState } from 'react';
import { usePortfolioHistory, computeTWR, indexBenchmark } from '../hooks/usePortfolioHistory.js';
import { useSpyHistory } from '../hooks/useSpyHistory.js';
import { useEarningsCalendar } from '../hooks/useEarningsCalendar.js';
import { fetchPortfolioHistory } from '../api.js';

const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '1y', label: '1Y' },
];

function fmtSignedPct(n) {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

// v71 Phase 3-d: 凡例の ticker chip 用 (例: "5/22"). YYYY-MM-DD 想定。
function fmtMD(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}`;
}

/**
 * ロット履歴ベースのポートフォリオ評価額時系列チャート (X-2-5-C)
 *
 * - 既存 lightweight-charts を流用 (追加バンドルなし)
 * - period 切替: 1M / 3M / 1Y
 * - 始端 → 終端の差分を「期間収益」として表示 (KPI 補強)
 * - レビュー指摘 (UI/UX #3): 期間収益符号で line / area の色を切替
 *   (gain → 緑、loss → 赤、neutral → シアン)。設計原則 ① 2 秒で「儲け／損」が分かる。
 *
 * 設計思想: ⑤ 図解で認知コスト削減 + ② 毎日開きたくなる
 */

// ── chart 系の配色パレット (CSS 変数と同色だが lightweight-charts が
//    hex 文字列を要求するため JS にも保持。CLAUDE.md「投資業界の色ルール」厳守) ──
const CHART_PALETTE = {
  gain:    { light: { line: '#16a34a', top: 'rgba(22,163,74,0.30)',  bottom: 'rgba(22,163,74,0.02)'  },
             dark:  { line: '#34ef81', top: 'rgba(52,239,129,0.40)', bottom: 'rgba(52,239,129,0.02)' } },
  loss:    { light: { line: '#dc2626', top: 'rgba(220,38,38,0.30)',  bottom: 'rgba(220,38,38,0.02)'  },
             dark:  { line: '#f87171', top: 'rgba(248,113,113,0.40)', bottom: 'rgba(248,113,113,0.02)' } },
  // neutral は従来のシアン (ブランド色) を維持
  neutral: { light: { line: '#0ea5e9', top: 'rgba(14,165,233,0.30)', bottom: 'rgba(14,165,233,0.02)' },
             dark:  { line: '#38bdf8', top: 'rgba(56,189,248,0.40)', bottom: 'rgba(56,189,248,0.02)' } },
};

// v71 Phase 3-c: events lane marker 用 rgba (lightweight-charts は色文字列を要求するため allowed exception)
// gain / loss / warning / brand cyan のいずれとも衝突しない中立色 (CLAUDE.md「投資業界の色ルール」厳守)
// dogfood 2026-05-15: dark theme で indigo 500 は背景と同化して読めなかった
// → theme-aware (light = dark 系トーン / dark = light 系トーン) で contrast 確保。
const EVENT_MARKER_PALETTE = {
  earnings: { light: 'rgba(180, 83, 9, 1.0)',    dark: 'rgba(253, 224, 71, 1.0)'  },  // amber-700 / yellow-300
  exDiv:    { light: 'rgba(67, 56, 202, 1.0)',   dark: 'rgba(199, 210, 254, 1.0)' },  // indigo-700 / indigo-200
};

function pickPalette(status, isDark) {
  const p = CHART_PALETTE[status] || CHART_PALETTE.neutral;
  return isDark ? p.dark : p.light;
}

function pickEventColor(kind, isDark) {
  const c = EVENT_MARKER_PALETTE[kind];
  return isDark ? c.dark : c.light;
}

// §11-B-7-B Phase A: portfolio period に対応する SPY history の period mapping
// usePortfolioHistory の period (1m/3m/1y) と price-history endpoint の period (1mo/3mo/1y) は別命名
const PERIOD_TO_SPY = {
  '1m': '1mo',
  '3m': '3mo',
  '1y': '1y',
};

export default function PortfolioHistoryChart({ lots = [], exDivByTicker = null }) {
  const [period, setPeriod] = useState('3m');
  const [showSpy, setShowSpy] = useState(true);  // §11-B-7-B: SPY overlay default ON
  const { series, warnings, loading } = usePortfolioHistory(lots, period);
  const { points: spyPoints } = useSpyHistory(PERIOD_TO_SPY[period] || '3mo');

  // v71 Phase 3-a (6 体合議 / 金融エキスパート events lane 必須): 保有銘柄の
  // 今後の決算日を chart 上に縦線 marker で表示。 Bloomberg PORT 流の events ribbon
  // 簡易版。 Phase 3-c で ex-div も追加 (belowBar / indigo / square で差別化)。
  const { earningsBySymbol } = useEarningsCalendar();
  const earningsMarkers = useMemo(() => {
    if (!earningsBySymbol || !Array.isArray(series) || series.length === 0) return [];
    // chart の表示期間最終日 + future earnings (max 90 日先) を marker 化
    const lastDate = series[series.length - 1]?.date;
    if (!lastDate) return [];
    const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
    const ahead = new Date(lastDate);
    ahead.setDate(ahead.getDate() + 90);
    const aheadIso = ahead.toISOString().slice(0, 10);
    const uniqTickers = [...new Set(lots.map((l) => (l.ticker || '').toUpperCase()).filter(Boolean))];
    const out = [];
    for (const t of uniqTickers) {
      const e = earningsBySymbol.get(t);
      if (!e?.date) continue;
      if (e.date <= lastDate) continue;     // 過去 (= series 末以前) は除外
      if (e.date > aheadIso) continue;       // 90 日超は除外
      // v71 Phase 3-d (6 体合議 / UI 全員一致): chart canvas に emoji + text を焼くと
      // OS font 依存で品格欠如 + 右端で見切れる。 dot only に切替、 意味は凡例側で担う。
      // ticker は lightweight-charts が無視する extra field、 凡例 render で利用。
      out.push({
        time: e.date,
        position: 'aboveBar',
        color: pickEventColor('earnings', isDark),
        shape: 'circle',
        text: '',
        ticker: t,
      });
    }
    // chart は時系列順 marker を期待する
    out.sort((a, b) => (a.time < b.time ? -1 : 1));
    return out;
  }, [earningsBySymbol, series, lots]);

  // v71 Phase 3-c (events lane 本格化): 保有銘柄の過去 ex-div (配当落ち日) を
  // chart 上の belowBar marker で表示。 「配当落ちで価格が下がった」因果関係を可視化。
  // position / shape / color で earnings marker と多重冗長に差別化 (色覚多様性対応)。
  const exDivMarkers = useMemo(() => {
    if (!exDivByTicker || !Array.isArray(series) || series.length === 0) return [];
    const firstDate = series[0]?.date;
    const lastDate = series[series.length - 1]?.date;
    if (!firstDate || !lastDate) return [];
    const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
    const uniqTickers = [...new Set(lots.map((l) => (l.ticker || '').toUpperCase()).filter(Boolean))];
    const out = [];
    for (const t of uniqTickers) {
      const divs = exDivByTicker.get(t);
      if (!Array.isArray(divs)) continue;
      for (const d of divs) {
        if (!d?.date) continue;
        if (d.date < firstDate || d.date > lastDate) continue;  // 表示窓内のみ
        // v71 Phase 3-d: canvas text 廃止 (上記 earnings と同 rationale)。
        // ticker / amount は lightweight-charts が無視する extra field、 凡例 render で利用。
        const amt = Number(d.amount);
        out.push({
          time: d.date,
          position: 'belowBar',
          color: pickEventColor('exDiv', isDark),
          shape: 'square',
          text: '',
          ticker: t,
          amount: Number.isFinite(amt) ? amt : null,
        });
      }
    }
    out.sort((a, b) => (a.time < b.time ? -1 : 1));
    return out;
  }, [exDivByTicker, series, lots]);

  // earnings + ex-div を 1 回の setMarkers 呼び出しで渡すため時系列順 merge
  const allMarkers = useMemo(() => {
    if (earningsMarkers.length === 0 && exDivMarkers.length === 0) return [];
    return [...earningsMarkers, ...exDivMarkers].sort((a, b) => (a.time < b.time ? -1 : 1));
  }, [earningsMarkers, exDivMarkers]);

  // v71 Phase 2.1 (6 体合議 / latency 改善):
  // 期間 chip 切替の体感速度改善のため、 mount 時 + lots 変更時に他期間も
  // fire-and-forget で prefetch して backend cache を温めておく。
  // _PORTFOLIO_HISTORY_TTL = 1h なので 2 回目以降の chip 切替は ~50ms で返る。
  const lotsKey = useMemo(() => {
    if (!Array.isArray(lots) || lots.length === 0) return '';
    return lots
      .map((l) => `${(l.ticker || '').toUpperCase()}|${l.shares}|${l.price || ''}|${l.trade_date || ''}`)
      .filter(Boolean).sort().join(',');
  }, [lots]);
  useEffect(() => {
    if (!lotsKey) return;
    const others = ['1m', '3m', '1y'].filter((p) => p !== period);
    const payload = lots.map((l) => ({
      ticker: (l.ticker || '').toUpperCase(),
      shares: Number(l.shares),
      price: l.price != null ? Number(l.price) : null,
      trade_date: l.trade_date,
      cost_basis_method: l.cost_basis_method || 'user_input',
      lot_id: l.id || null,
    }));
    // 非同期 fire-and-forget。 失敗しても無視 (= 通常 fetch は usePortfolioHistory が担う)。
    others.forEach((p) => {
      fetchPortfolioHistory(payload, p).catch(() => {});
    });
    // period は意図的に deps から除外: 切替時に prefetch 連鎖を起こさず、
    // lots 変更時のみ全期間を warm up する。
  }, [lotsKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const spySeriesRef = useRef(null);
  // v71 Phase 3-d (Web 開発エキスパート推奨): marker primitive を ref で保持し、
  // marker 変更時は chart 全焼却せず markersRef.current.setMarkers() で incremental
  // update する (再構築 cost 90% 減)。 chart cleanup 時に null 化。
  const markersRef = useRef(null);
  // allMarkers の最新値を ref で持つことで main useEffect から deps を外しても
  // 初回 chart 構築時に正しい markers を渡せる (closure stale 回避)。
  const allMarkersRef = useRef([]);
  useEffect(() => { allMarkersRef.current = allMarkers; }, [allMarkers]);
  const [chartReady, setChartReady] = useState(false);

  // §11-B-7-B Fix-A: TWR (Time-Weighted Return) 系列を計算 (入金影響除外、純投資成果のみ)
  const twrSeries = useMemo(() => computeTWR(series), [series]);

  // ── 期間収益: TWR 末尾の累積 % を期間収益として表示 (始端 → 終端の純投資成果) ──
  const periodReturn = (() => {
    if (!Array.isArray(twrSeries) || twrSeries.length < 2) return null;
    const lastTwr = twrSeries[twrSeries.length - 1];
    const pctDelta = Number(lastTwr?.twrPct);
    if (!Number.isFinite(pctDelta)) return null;
    return { pctDelta };
  })();

  // §11-B-7-B Fix-A: SPY 比較 alpha
  // portfolioPct = TWR 累積 % (旧: 単純 (last - first) / first → 入金で歪む)
  // spyPct       = SPY anchor → 末尾の単純価格変化率
  // alphaPct     = portfolioPct - spyPct
  const spyAlpha = useMemo(() => {
    const empty = { portfolioPct: null, spyPct: null, alphaPct: null };
    if (!Array.isArray(twrSeries) || twrSeries.length < 2) return empty;
    if (!Array.isArray(spyPoints) || spyPoints.length < 2) {
      return { ...empty, portfolioPct: twrSeries[twrSeries.length - 1].twrPct };
    }
    const portfolioPct = twrSeries[twrSeries.length - 1].twrPct;
    const anchorDate = twrSeries[0].date;
    const spyIndexed = indexBenchmark(spyPoints, anchorDate);
    if (spyIndexed.length < 2) return { ...empty, portfolioPct };
    const spyPct = spyIndexed[spyIndexed.length - 1].indexValue - 100;
    return { portfolioPct, spyPct, alphaPct: portfolioPct - spyPct };
  }, [twrSeries, spyPoints]);

  const status = periodReturn
    ? (periodReturn.pctDelta > 0.05 ? 'gain' : (periodReturn.pctDelta < -0.05 ? 'loss' : 'neutral'))
    : 'neutral';

  // ── chart 初期化 (期間 / シリーズ / status 変更で再構築) ──
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    (async () => {
      const lc = await import('lightweight-charts');
      if (destroyed || !containerRef.current) return;

      // 既存 chart 破棄
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch { /* noop */ }
        chartRef.current = null;
      }

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const w = containerRef.current.clientWidth || 600;
      const palette = pickPalette(status, isDark);

      const chart = lc.createChart(containerRef.current, {
        width: w,
        height: 200,
        layout: {
          background: { type: lc.ColorType.Solid, color: 'transparent' },
          textColor: isDark ? '#94a3b8' : '#64748b',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'transparent' },
          horzLines: { color: isDark ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.16)' },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.10, bottom: 0.06 },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
          // v71 Phase 3-d (Web 設計 + UI/UX 合議): marker (特に最新 ex-div) が
          // 右端の price scale label 直下に張り付いて clipping する問題対策。
          // 4 bar 分 (3M で ~4 日) の右余白を確保。 fixRightEdge と併用可能。
          rightOffset: 4,
        },
        crosshair: { mode: 1 },
        handleScroll: false,
        handleScale: false,
      });
      chartRef.current = chart;

      // §11-B-7-B Phase A v2: SPY 表示時は Indexed (= 100) 方式、非表示時は $ 絶対値方式
      // 4 体エージェントレビュー全員一致採用 (案 B):
      // - 両系列を「期間開始日 = 100」で indexed plot → % 成長で比較
      // - dual-axis の誤読リスク回避、Robinhood 流のリテール訴求
      // - $0 期間は両系列 plot しない (案 B+C ハイブリッド、Web 開発推奨)
      const useIndexedMode = showSpy && Array.isArray(spyPoints) && spyPoints.length >= 2;

      // y 軸 fmt: indexed 時は「+X%」、絶対値時は「$X」
      const priceFormat = useIndexedMode
        ? {
            type: 'custom',
            formatter: (v) => {
              const pct = v - 100;
              return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
            },
            minMove: 0.01,
          }
        : undefined;

      const areaSeries = chart.addSeries(lc.AreaSeries, {
        topColor:    palette.top,
        bottomColor: palette.bottom,
        lineColor:   palette.line,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        ...(priceFormat ? { priceFormat } : {}),
      });
      seriesRef.current = areaSeries;

      if (Array.isArray(series) && series.length > 0) {
        if (useIndexedMode) {
          // §11-B-7-B Fix-A: TWR (Time-Weighted Return) で indexed plot
          // portfolio: 各 sub-period のリターンを cashflow 除外で連鎖乗算 → 純投資成果
          // SPY: anchor 日以降を単純 indexed (cashflow なし)
          if (Array.isArray(twrSeries) && twrSeries.length >= 2) {
            const portfolioIndexed = twrSeries.map((p) => ({
              time: p.date,
              value: p.twrIndex,
            }));
            areaSeries.setData(portfolioIndexed);

            const anchorDate = twrSeries[0].date;
            const spyIndexed = indexBenchmark(spyPoints, anchorDate)
              .map((p) => ({ time: p.date, value: p.indexValue }));

            if (spyIndexed.length >= 2) {
              const spySeries = chart.addSeries(lc.LineSeries, {
                color: isDark ? '#94a3b8' : '#64748b',
                lineWidth: 2,
                lineStyle: 2,  // dashed
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: false,
                priceFormat,
              });
              spySeries.setData(spyIndexed);
              spySeriesRef.current = spySeries;
            }
          } else {
            // TWR 構築不能 (保有なし等) → 絶対値モードに fallback
            const rawData = series
              .filter((p) => p && p.date && Number.isFinite(Number(p.value)))
              .map((p) => ({ time: p.date, value: Number(p.value) }));
            areaSeries.setData(rawData);
          }
        } else {
          // SPY 非表示モード: 絶対値プロット ($) — 評価額の絶対推移を見たい場合
          const rawData = series
            .filter((p) => p && p.date && Number.isFinite(Number(p.value)))
            .map((p) => ({ time: p.date, value: Number(p.value) }));
          areaSeries.setData(rawData);
        }

        // v71 Phase 3-a/3-c/3-d: events lane marker を chart 上に重ねる。
        // lightweight-charts v5 で series.setMarkers() は削除され、 createSeriesMarkers()
        // primitive に migration された。 v71 Phase 3-d で primitive を ref で保持し、
        // 後続の marker 変更は別 useEffect で setMarkers() のみ呼ぶ (chart 再構築回避)。
        // earnings (aboveBar amber circle) + ex-div (belowBar indigo square) を時系列順 merge 済、
        // canvas 上には dot のみ (text 廃止)、 意味伝達は凡例側 (Bloomberg PORT 流 2 段構え)。
        const initialMarkers = allMarkersRef.current;
        if (initialMarkers.length > 0 && typeof lc.createSeriesMarkers === 'function') {
          try {
            markersRef.current = lc.createSeriesMarkers(areaSeries, initialMarkers);
          } catch { /* noop: API 互換問題 */ }
        }

        chart.timeScale().fitContent();
      }

      setChartReady(true);
    })();

    return () => {
      destroyed = true;
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch { /* noop */ }
        chartRef.current = null;
      }
      seriesRef.current = null;
      spySeriesRef.current = null;
      markersRef.current = null;  // chart 焼却で primitive も無効化
    };
  }, [series, twrSeries, status, spyPoints, showSpy]);  // allMarkers は ref 経由で渡すため deps から除外

  // v71 Phase 3-d (Web 開発エキスパート): marker 変更だけで chart 全焼却するのは
  // 数百 ms オーダーの無駄。 primitive の setMarkers() で incremental update。
  // chart が未構築 (markersRef.current 無) ならスキップ (次回 chart 構築時に initialMarkers
  // 経由で反映される)。
  useEffect(() => {
    if (!markersRef.current || typeof markersRef.current.setMarkers !== 'function') return;
    try { markersRef.current.setMarkers(allMarkers); } catch { /* noop */ }
  }, [allMarkers]);

  // ── リサイズ追従 ──
  useEffect(() => {
    const onResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <section className="pd-history surface-card">
      <div className="pd-history-head">
        <div className="pd-history-titlebox">
          <h4 className="pd-history-title">推移</h4>
          {periodReturn && (
            <span
              className={`pd-history-delta pd-history-delta-${status}`}
              title={
                'chart の色は累積リターンの符号で決まります (vs SPY 比較とは独立):\n' +
                '🟢 緑 = プラス (>+0.05%)\n' +
                '🔴 赤 = マイナス (<-0.05%)\n' +
                '🔵 シアン = ほぼ動かず (±0.05% 以内)\n\n' +
                '累積リターン = (現在評価額 − 累積投下資本) / 累積投下資本\n' +
                'Robinhood / 楽天 / SBI 流。 リスト部の含み損益と一致します。'
              }
            >
              {/* v71 Phase 2.2 (dogfood 質問): 色の意味が「指数に勝った/負けた」と
                  誤読されるため、 累積リターン chip 直下に micro-legend を追加。
                  vs SPY バッジは別 chip で独立判定 (α 緑/赤) と user に説明。 */}
              {fmtSignedPct(periodReturn.pctDelta)}
              <span className="pd-history-delta-pct"> 累積リターン</span>
              <span className="pd-history-delta-legend" aria-hidden="true">
                {status === 'gain' && ' · プラス'}
                {status === 'loss' && ' · マイナス'}
                {status === 'neutral' && ' · ほぼ動かず'}
              </span>
            </span>
          )}
          {/* §11-D Fix: drift 警告 chip。 v71 Phase 2.1 (6 体合議 / 金融 + UI/UX): 文言を
              「乖離」 → 「市場価格と差があります」に変更。 user 行動可能化 (分割 / 配当再投資 /
              手入力ミスのいずれか + 税務申告で約定報告書確認推奨)。 Empower の Cost basis
              date mismatch chip と同思想で、 amber warning → neutral info のトーン。 */}
          {Array.isArray(warnings) && warnings.length > 0 && (
            <span
              className="pd-history-warning-chip"
              title={[
                `取得単価が購入日の市場終値と差があります (${warnings.length} 件)`,
                '原因の可能性: 株式分割 / 配当再投資 / 手入力時の typo',
                '税務申告では約定報告書をご確認ください。',
                '',
                ...warnings.slice(0, 5).map((w) =>
                  `${w.ticker}: 取得単価 $${w.user_price} vs ${w.trade_date} 終値 $${w.market_close} (${w.drift_pct}% 差)`
                ),
              ].join('\n')}
            >
              ⓘ 取得単価が市場価格と差あり ({warnings.length} 件)
            </span>
          )}
          {/* §11-B-7-B Phase A: SPY 比較 alpha バッジ。 v71 Phase 2.1 (6 体合議 / 金融):
              「vs SPY -X%」だけだと alpha (= portfolio − SPY) の意味が retail に伝わらない
              ため、 期間 + Alpha 用語を併記 (Bloomberg PORT 流)。 */}
          {showSpy && Number.isFinite(spyAlpha.alphaPct) && (
            <span
              className={`bs-spy-badge ${
                spyAlpha.alphaPct > 0.5 ? 'win'
                : spyAlpha.alphaPct < -0.5 ? 'lose'
                : 'neutral'
              }`}
              title={`Alpha = あなたのリターン − 同期間 S&P500 ETF のリターン\nあなた: ${fmtSignedPct(spyAlpha.portfolioPct)} / SPY: ${fmtSignedPct(spyAlpha.spyPct)}\nプラスなら市場平均より優位、 マイナスなら劣位`}
            >
              <span className="bs-spy-badge-arrow">
                {spyAlpha.alphaPct > 0.5 ? '↑' : spyAlpha.alphaPct < -0.5 ? '↓' : '—'}
              </span>
              vs SPY ({period.toUpperCase()}) {fmtSignedPct(spyAlpha.alphaPct)}
              <span className="bs-spy-badge-suffix"> α</span>
            </span>
          )}
        </div>
        <div className="pd-history-period-tabs" role="tablist" aria-label="表示期間">
          {PERIODS.map((p) => {
            const active = period === p.key;
            // v71 Phase 2.1: 切替直後の体感 latency 改善のため、 active tab に
            // loading dot を出す (現在 chip は即時 highlight、 chart 描画は遅延)。
            const showLoading = active && loading;
            return (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-busy={showLoading || undefined}
                className={`pd-history-period-tab ${active ? 'is-active' : ''} ${showLoading ? 'is-loading' : ''}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
                {showLoading && <span className="pd-history-period-tab-dot" aria-hidden="true">·</span>}
              </button>
            );
          })}
          {/* §11-B-7-B: SPY overlay toggle */}
          <button
            type="button"
            className={`pd-history-period-tab ${showSpy ? 'is-active' : ''}`}
            onClick={() => setShowSpy(!showSpy)}
            aria-pressed={showSpy}
            title={showSpy ? 'SPY 比較を非表示' : 'SPY 比較を表示'}
          >
            SPY
          </button>
        </div>
      </div>
      <div className="pd-history-body">
        {loading && (!chartReady || series.length === 0) && (
          <div className="pd-history-skeleton" aria-label="読込中">
            <div className="pd-history-skeleton-bar" />
          </div>
        )}
        {!loading && series.length === 0 && (
          <div className="pd-history-empty">
            選択した期間に表示できるデータがありません
          </div>
        )}
        <div ref={containerRef} className="pd-history-chart" aria-hidden={series.length === 0} />
      </div>
      {/* v71 Phase 3-c dogfood 2026-05-15 fix: marker の意味を凡例で明示。
          icon-only では「📅 何の日？」「💰 何の日？」が UX 失敗。
          marker が存在する時のみ表示 (空の chart で legend が孤立しないように)。 */}
      {(earningsMarkers.length > 0 || exDivMarkers.length > 0) && (
        <div className="pd-history-events-legend" aria-label="チャート上の marker 凡例">
          {/* v71 Phase 3-d round 2 (dogfood fix): 凡例 swatch を chart canvas の marker
              と完全一致させる (同色・同形)。 加えて各 marker の銘柄+日付+金額を
              inline で併記し「どの dot が何の銘柄か」を解消 (Bloomberg PORT 流)。 */}
          {earningsMarkers.length > 0 && (
            <div className="pd-history-events-legend-row">
              <span className="pd-history-events-legend-swatch is-earnings" aria-hidden="true" />
              <span className="pd-history-events-legend-label">
                決算日<span className="pd-history-events-legend-sub"> (今後 90 日)</span>
              </span>
              <span className="pd-history-events-legend-tickers">
                {earningsMarkers.map((m, i) => (
                  <span key={`e-${m.ticker}-${m.time}`} className="pd-history-events-legend-chip">
                    {i > 0 && <span aria-hidden="true" className="pd-history-events-legend-sep">·</span>}
                    <span className="pd-history-events-legend-tk">{m.ticker}</span>
                    <span className="pd-history-events-legend-dt">{fmtMD(m.time)}</span>
                  </span>
                ))}
              </span>
            </div>
          )}
          {exDivMarkers.length > 0 && (
            <div className="pd-history-events-legend-row">
              <span className="pd-history-events-legend-swatch is-exdiv" aria-hidden="true" />
              <span className="pd-history-events-legend-label">
                配当落ち日<span className="pd-history-events-legend-sub"> (過去 30 日)</span>
              </span>
              <span className="pd-history-events-legend-tickers">
                {exDivMarkers.map((m, i) => (
                  <span key={`d-${m.ticker}-${m.time}`} className="pd-history-events-legend-chip">
                    {i > 0 && <span aria-hidden="true" className="pd-history-events-legend-sep">·</span>}
                    <span className="pd-history-events-legend-tk">{m.ticker}</span>
                    <span className="pd-history-events-legend-dt">{fmtMD(m.time)}</span>
                    {Number.isFinite(m.amount) && (
                      <span className="pd-history-events-legend-amt">${m.amount.toFixed(2)}</span>
                    )}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
