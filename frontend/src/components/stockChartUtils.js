// ─────────────────────────────────────────────────────────────────────────────
// stockChartUtils.js — StockPriceChart の React 非依存 定数 + 純粋ヘルパ層。
//
// StockPriceChart.jsx から物理抽出した「chart 色定数 / 期間 preset / verdict map /
// 日付・サプライズ format / 非株式ティッカー判定 / feature flag」。JSX/hooks 非依存・
// 外部 import 不要 (完全自立)。Recharts shape/label/tooltip 等 JSX 返却ヘルパは
// chart-overlay-safety 規律のため StockPriceChart.jsx に残置。
//
// SMA_50_COLOR / SMA_200_COLOR は PriceLadder が swatch 1:1 mirror のため import する。
// 後方互換で StockPriceChart.jsx からも re-export 済 (raw hex の定義は本ファイルに集約)。
// ─────────────────────────────────────────────────────────────────────────────

// v86 chart hybrid Sprint 2: localStorage key for 折れ線/candle toggle persist
export const CHART_STYLE_KEY = 'pane3_chart_style_v1';
// v195 round2: PriceLadder が線サンプル swatch でチャートと 1:1 mirror するため export
// (§38 verdict: 線 identity 色の swatch は条件付き OK。 hex の定義はこのファイルに集約、 他所で raw hex 複製しない)
export const SMA_50_COLOR  = '#f59e0b'; // amber (短期 trend)
export const SMA_200_COLOR = '#a78bfa'; // purple (長期 trend、 ファンダ協調指標 #1)
// Cup overlay 色: v76 dogfood で price line cyan と同化 → UI/UX subagent verdict で neutral slate に変更。
// 哲学的整合: cup は「形成中 = neutral / 未確定」、 投資業界色ルール (緑=上昇/赤=下落/amber=警告/cyan=ブランド)
// のどれにも属さない観察対象 → 彩色 hue を持たない。 breakout 確定時に green ReferenceDot が前面で対比演出。
export const CUP_COLOR     = 'rgba(148, 163, 184, 0.85)'; // slate-400、 両モード neutral (area fill / pivot 線 / dot fill 用)
// v147 R2 (user dogfood NVDA「まだ少し見づらい」 + 2 体合議): slate-300→slate-400 でなく更に明色 slate-200。
//   ダーク背景で「明るいが主張しすぎない中立色」。 方向を示さない中立色は維持 (緑/赤/amber/cyan/purple は予約済)。
export const CUP_LINE_COLOR = '#e2e8f0'; // slate-200 (cup 破線/dot stroke、 視認性 round 2)
export const BREAKOUT_COLOR = '#22c55e'; // green-500 (breakout confirmed marker、 「形成中 → 確定」 ドラマ強化)
// v217 B10: chart tabs v2 (segmented control + 1M/3M/6M/1Y/5Y)。 dogfood GO で default ON 昇格。
//   default ON / ?chart_tabs_v2=0 で kill (localStorage '0' で永続 OFF)。
export function isChartTabsV2() {
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('chart_tabs_v2');
    if (q === '1') { window.localStorage.setItem('bs_chart_tabs_v2', '1'); return true; }
    if (q === '0') { window.localStorage.setItem('bs_chart_tabs_v2', '0'); return false; }
    return window.localStorage.getItem('bs_chart_tabs_v2') !== '0';
  } catch { return true; }
}

export const PERIODS = [
  { label: '1ヶ月', value: '1m' },
  { label: '3ヶ月', value: '3m' },
  { label: '1年',   value: '1y' },
  { label: '3年',   value: '3y' },
];
// v216 B10: V2 = 6M/5Y 追加 + 英略短縮 (segmented control 用)。
//   3Y は 5Y に統合 (長期トレンドは 5Y 1 本化)。 backend period_days には 3y を後方互換で残置。
export const PERIODS_V2 = [
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
  { label: '5Y', value: '5y' },
];

// Recharts は CSS var を直接受けないため固定 RGB. 両モードで視認できる中庸値.
export const VERDICT_COLOR = {
  beat:    'rgb(34, 197, 94)',     // green-500 — 両モードでバランス
  miss:    'rgb(248, 113, 113)',   // red-400 — 両モードでバランス
  inline:  'rgba(148, 163, 184, 0.85)', // slate-400 alpha
  unknown: 'rgba(148, 163, 184, 0.6)',
};

// チャート軸・グリッド・ツールチップ共通色 (両モード対応の neutral)
export const CHART_GRID   = 'rgba(148, 163, 184, 0.25)';
export const CHART_AXIS   = 'rgba(148, 163, 184, 0.7)';
export const CHART_CURSOR = 'rgba(148, 163, 184, 0.5)';
export const CHART_PRICE  = 'rgb(56, 189, 248)'; // brand cyan (sky-400)

export const VERDICT_LABEL = {
  beat:    '↑ Beat',
  miss:    '↓ Miss',
  inline:  '▬ In-line',
  unknown: '— 不明',
};

/** Return nearest price date within ±4 days; null if not found. */
export function nearestDate(target, dateSet) {
  if (!target) return null;
  const base = new Date(target + 'T00:00:00Z');
  if (isNaN(base.getTime())) return null;
  if (dateSet.has(target)) return target;
  for (let i = 1; i <= 4; i++) {
    for (const delta of [i, -i]) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + delta);
      const s = d.toISOString().slice(0, 10);
      if (dateSet.has(s)) return s;
    }
  }
  return null;
}

/** Short quarter label from reporting date string (approximation). */
export function quarterLabel(dateStr) {
  const y = dateStr.slice(0, 4);
  const m = parseInt(dateStr.slice(5, 7), 10);
  const q = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4';
  return `FY${y} ${q}`;
}

/** Marker label shown above the reference line. */
export function surpriseLabel(e) {
  const sym = e.verdict === 'beat' ? '↑' : e.verdict === 'miss' ? '↓' : '▬';
  if (e.surprise_pct === null || e.surprise_pct === undefined) return sym;
  const sign = e.surprise_pct > 0 ? '+' : '';
  return `${sym} ${sign}${e.surprise_pct}%`;
}
// v147 (handover v146 最優先・user 指摘 content バグ): 指数 / 先物 / 為替 / DXY 等の「非株式」 判定。
//   非株式は「個別株を売買・保有する前提」 の指標が全て無意味 (指数はポジションとして損切り/利確しない、
//   対 SPY 相対強度 ≈0%、 アナリスト目標株価なし)。 そのため非株式チャートでは以下を一括非表示にし、
//   「価格 + SMA50/200 + ローソク足」 のクリーン構成にする (finance リテラシー高 user の Trust Cliff 回避):
//     - RS chip
//     - 損切り -8% / 50DMA +15%・+25% 売りゾーン / +20% 利確 / アナリスト目標 (pillar2Markers)
//     - Cup-with-Handle pattern (chip / area / pivot / cup line) + 支持線目安 (box_support/last_breakout)
//   構造マーカー: 指数 (^GSPC/^VIX/^TNX) = '^' 始まり / 先物 (CL=F) = '=F' / 為替 (JPY=X) = '=X'。
//   '.' を含む class share (BRK.B 等) を誤検知しないため '.' は使わず、 DXY (DX-Y.NYB) のみ明示 set。
export const NON_EQUITY_TICKERS = new Set(['^GSPC', '^IXIC', '^DJI', '^VIX', '^TNX', 'DX-Y.NYB', 'CL=F', 'JPY=X']);
export function isNonEquityTicker(ticker) {
  if (!ticker) return false;
  const t = String(ticker).toUpperCase();
  if (NON_EQUITY_TICKERS.has(t)) return true;
  return t.startsWith('^') || t.endsWith('=F') || t.endsWith('=X');
}

