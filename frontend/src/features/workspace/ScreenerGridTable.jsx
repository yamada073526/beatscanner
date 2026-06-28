/**
 * ScreenerGridTable.jsx — screener_v2 結果テーブル「決算の通信簿」(Sprint 3)
 *
 * SPEC §14 (mockup v12 が視覚正本)。結果テーブル専用の chrome:
 *   詳細/簡素トグル + 凡例/免責バンド(role=note) + sticky 見出し + 行 (ScreenerGridRow) + skeleton/empty。
 *
 * §14-D 実装方式:
 *   - grid-template-columns は CSS 変数 --screener-cols を **このコンテナに一度だけ** 定義し、
 *     見出し/行/skeleton が全て継承 (二重定義の整列破綻を物理排除)。data-mode で full/simple を出し分け。
 *   - sticky 見出しは overflow を持たないコンテナに置き、実スクロール祖先 .screener-master__content に吸着。
 *     → このコンポーネントは自前で overflow を作らない (overflow を付けると sticky が祖先でなく自身に吸着して不発)。
 *   - 狭幅(~360px)は @container で COLS_SIMPLE 強制 fallback (index.css 側、container-type は親に付与)。
 *   - 既存 .screener-row (HeroSection/legacy) には触れない (variant スコープ)。
 *
 * §14-C 来期2列 = 会社ガイダンス vs コンセンサス比 (ハイブリッド):
 *   guidance_*_surprise_pct(残タスク4) を優先、無ければ next_q_*_yoy_pct(現 LIVE) で fallback。
 *
 * testid: screener-grid-table / -toggle / -legend / -header / -empty / -skeleton
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import ScreenerGridRow, { TRI_VERDICT_JP } from './ScreenerGridRow.jsx';

const MODE_KEY = 'screener_grid_mode';
// §14-D: 狭幅(~360px Pane2)は横スクロールでなく簡素 fallback (原則1)。
// @container は full の 9 セルを JS で簡素 5 セルへ切替できないため、container 幅を JS 検出して
// effectiveMode を簡素へ強制 (container-type は precedent として CSS 側に付与)。
const SCREENER_NARROW_BREAKPOINT = 420;

// §14-D: 列幅 SSOT。pip / 識別 / 評価列 / RS。
const COLS_FULL = '28px minmax(0,1fr) 76px 76px 50px 46px 70px 70px 34px';
const COLS_SIMPLE = '28px minmax(0,1fr) 132px 84px 40px';
// 狭幅(~360-420px Pane2)専用: 固定列を詰め、識別列(minmax 0)が潰れない幅に。
const COLS_NARROW = '24px minmax(0,1fr) 78px 48px 28px';

function readInitialMode() {
  if (typeof window === 'undefined') return 'full';
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === 'simple' ? 'simple' : 'full';
  } catch { return 'full'; }
}

// real backend item → 正規化 earnings (§14-C ハイブリッド)
// Layer A SPEC §6: guidance_source('8k'=Layer A / null=Layer B) を earnings へ結線。
// export = unit test (ScreenerGridTable.normalize.test.js・node env pure 検査) 用。
export function normalizeItem(it) {
  return {
    ticker: it.ticker,
    name: it.name ?? null,
    lastReportDate: it.last_report_date ?? null,
    rsValue: it.rs_percentile ?? null,
    earnings: {
      revYoY: it.rev_yoy_pct ?? null,
      revBeat: it.rev_beat ?? null,
      epsYoY: it.eps_yoy_pct ?? null,
      epsBeat: it.eps_beat ?? null,
      gm: it.gross_margin_pct ?? null,
      fcf: it.fcf_margin_pct ?? null,
      // §14-C: guidance(Layer A)優先 → next_q(Layer B・LIVE) fallback。
      nqRev: it.guidance_rev_surprise_pct ?? it.next_q_rev_yoy_pct ?? null,
      nqEps: it.guidance_eps_surprise_pct ?? it.next_q_eps_yoy_pct ?? null,
      tri: it.tri_verdict ?? null,
      // §6: '8k'=会社ガイダンス vs PIT コンセンサス比(Layer A) / null=来期コンセンサスYoY(Layer B)。
      guidanceSource: it.guidance_source ?? null,
    },
  };
}

// ─── per-preset 根拠カラム (4 preset: new_high_break / sector_leader / quiet_quality /
//     market_leading)。earnings 系 (earnings_pass / hot_sector / mock) は従来 normalizeItem 経路を維持。
//     real backend item → preset 列が参照するメトリクスへ正規化。export = unit test 用。
export function normalizeMetrics(it) {
  return {
    rsVsSpy: it.rs_vs_spy_pct ?? null,            // 対SPY超過 (pt・§38 中立)
    ocfMargin: it.ocf_margin_pct ?? null,         // CF 創出力 (%)
    roe: it.roe ?? null,                          // ROE (% 格納)
    epsYoY: it.eps_yoy_pct ?? null,               // EPS 前年比 (%)
    nearHigh: it.near_high_pct_scaled ?? null,    // 52週高値圏 (直近終値/52週高値×100・Pro-locked)
    volumeSurge: it.volume_surge_pct ?? null,     // 出来高急増/静か (%)
    instQoq: it.inst_holders_qoq_pct ?? null,     // 機関保有 QoQ (%)
    isSectorLeader: it.is_sector_rs_leader ?? null, // セクター内 RS 上位3位以内 (bool)
    latestBeat: it.latest_beat ?? null,           // 直近決算ビート (bool・過去確定=chip 色可)
  };
}

// ── gold 標榜 (別格) 判定 (SPEC_2026-06-29 A1)。各 preset で「戦略条件を強く満たす別格」を
//    上位サブセットだけ gold 行 (.is-win) で強調する。全て過去/現在事実ベース (§38 非抵触・
//    将来予測でも買い推奨でもない・既存 is-win=三拍子 が precedent)。data 欠落時は標榜しない (honest)。
//    閾値は本番 universe 2553件で較正済 (SPEC 表)。export = unit test 用。
const _fin = (v) => typeof v === 'number' && Number.isFinite(v);
export function presetWin(it, preset) {
  if (!it) return false;
  switch (preset) {
    case 'new_high_break':
      // 実ブレイク確定(52週高値更新) かつ 出来高急増(+50%超)。is_new_52w_high は Premium 専用 list の
      //   data (free fetch では masked=null) → Premium には present。
      return it.is_new_52w_high === true && _fin(it.volume_surge_pct) && it.volume_surge_pct >= 50;
    case 'sector_leader':
      // セクター内 RS 首位 かつ 高質 (ROE>=17 または CF創出力>=25)。
      return it.is_sector_rs_leader === true
        && ((_fin(it.roe) && it.roe >= 17) || (_fin(it.ocf_margin_pct) && it.ocf_margin_pct >= 25));
    case 'quiet_quality':
      // RS 上位(>=80) かつ 出来高が静か(<=0) かつ 機関未殺到(<=0)。3 値とも present 必須 (欠落は標榜せず)。
      return _fin(it.rs_percentile) && it.rs_percentile >= 80
        && _fin(it.volume_surge_pct) && it.volume_surge_pct <= 0
        && _fin(it.inst_holders_qoq_pct) && it.inst_holders_qoq_pct <= 0;
    case 'market_leading':
      // 対SPY 大幅超過(>=20pt) かつ 直近決算ビート(過去確定)。
      return _fin(it.rs_vs_spy_pct) && it.rs_vs_spy_pct >= 20 && !!it.latest_beat;
    default:
      return false; // earnings_pass/hot_sector は columnDriven でない (tri='ok' は ScreenerGridRow 側)
  }
}

// 列 spec: { id, header, headerSub(2行目), kind, metricKey, unit, tier('pri'強調/'sec'副次),
//   core(narrow/簡素で残す), width, label(aria/tooltip) }。
//   kind: 'level'(符号なし%) / 'delta'(符号付き) / 'rs'(rsValue) / 'verdict'(beat/miss chip) / 'leader'(badge)。
// §38: verdict のみ過去確定実績で色付き。level/delta/rs/leader はすべて中立色 (色 polarity なし)。
export const PRESET_COLUMNS = {
  // 新高値ブレイク: 高値圏接近 + 出来高急増 (ブレイク初動の核) + 成長/裏付け + RS。
  new_high_break: [
    { id: 'nearHigh', header: '52週',  headerSub: '高値圏', kind: 'level',   metricKey: 'nearHigh',    unit: '%', tier: 'pri', core: true,  width: '58px', label: '52週高値圏' },
    { id: 'vol',      header: '出来高', headerSub: '急増',  kind: 'delta',   metricKey: 'volumeSurge', unit: '%', tier: 'pri', core: true,  width: '62px', label: '出来高急増' },
    { id: 'eps',      header: 'EPS',   headerSub: 'YoY',   kind: 'delta',   metricKey: 'epsYoY',      unit: '%', tier: 'sec', core: false, width: '56px', label: 'EPS YoY' },
    { id: 'beat',     header: '直近',  headerSub: 'ビート', kind: 'verdict', metricKey: 'latestBeat',             tier: 'pri', core: false, width: '54px', label: '直近決算ビート' },
    { id: 'rs',       header: 'RS',                         kind: 'rs',                                          tier: 'pri', core: true,  width: '40px', label: 'RS' },
  ],
  // セクター別リーダー: セクター内順位(リーダー) + CF/ROE(質) + 機関保有増(需給) + RS。
  sector_leader: [
    { id: 'leader',   header: 'セクター', headerSub: '内順位', kind: 'leader', metricKey: 'isSectorLeader',          tier: 'pri', core: true,  width: '72px', label: 'セクター内順位' },
    { id: 'ocf',      header: 'CF',     headerSub: '創出力', kind: 'level',  metricKey: 'ocfMargin', unit: '%',     tier: 'pri', core: true,  width: '58px', label: 'CF創出力' },
    { id: 'roe',      header: 'ROE',                         kind: 'level',  metricKey: 'roe',       unit: '%',     tier: 'sec', core: false, width: '52px', label: 'ROE' },
    { id: 'inst',     header: '機関',   headerSub: '保有増', kind: 'delta',  metricKey: 'instQoq',   unit: '%',     tier: 'sec', core: false, width: '58px', label: '機関保有増' },
    { id: 'rs',       header: 'RS',                          kind: 'rs',                                            tier: 'pri', core: true,  width: '40px', label: 'RS' },
  ],
  // 静かな強さ (逆張り): RS + 出来高「静か」+ 機関「殺到なし」(中立フレーム) + CF/ROE。
  quiet_quality: [
    { id: 'rs',       header: 'RS',                          kind: 'rs',                                            tier: 'pri', core: true,  width: '40px', label: 'RS' },
    { id: 'vol',      header: '出来高', headerSub: '(静か)', kind: 'delta',  metricKey: 'volumeSurge', unit: '%',   tier: 'pri', core: true,  width: '62px', label: '出来高(静か)' },
    { id: 'inst',     header: '機関',   headerSub: '殺到なし', kind: 'delta', metricKey: 'instQoq',   unit: '%',   tier: 'pri', core: true,  width: '70px', label: '機関(殺到なし)' },
    { id: 'ocf',      header: 'CF',     headerSub: '創出力', kind: 'level',  metricKey: 'ocfMargin', unit: '%',     tier: 'sec', core: false, width: '58px', label: 'CF創出力' },
    { id: 'roe',      header: 'ROE',                         kind: 'level',  metricKey: 'roe',       unit: '%',     tier: 'sec', core: false, width: '52px', label: 'ROE' },
  ],
  // 市場をリードし始めた銘柄: 対SPY超過 + RS中位帯 + CF/ROE(質) + EPS/直近ビート(裏付け)。
  market_leading: [
    { id: 'vsspy',    header: '対SPY',  headerSub: '超過',  kind: 'delta',   metricKey: 'rsVsSpy',   unit: 'pt',   tier: 'pri', core: true,  width: '62px', label: '対SPY超過' },
    { id: 'rs',       header: 'RS',     headerSub: '中位',  kind: 'rs',                                            tier: 'pri', core: true,  width: '46px', label: 'RS(中位帯)' },
    { id: 'ocf',      header: 'CF',     headerSub: '創出力', kind: 'level',  metricKey: 'ocfMargin', unit: '%',     tier: 'sec', core: false, width: '58px', label: 'CF創出力' },
    { id: 'roe',      header: 'ROE',                         kind: 'level',  metricKey: 'roe',       unit: '%',     tier: 'sec', core: false, width: '52px', label: 'ROE' },
    { id: 'eps',      header: 'EPS',    headerSub: 'YoY',   kind: 'delta',   metricKey: 'epsYoY',    unit: '%',     tier: 'sec', core: false, width: '56px', label: 'EPS YoY' },
    { id: 'beat',     header: '直近',   headerSub: 'ビート', kind: 'verdict', metricKey: 'latestBeat',             tier: 'pri', core: false, width: '54px', label: '直近決算ビート' },
  ],
};

// Sprint3 mock (mockup v12 と同型・?screener_mock=1 で発火)。実 payload と同じ shape。
// Layer A dogfood (Sprint4): 実データ Layer A は当面 0 件 (PIT 未成立・de-risk 確定) のため、
// mock に guidanceSource:'8k'(Layer A=dot付き) と null(Layer B=無印) を意図的に混在させ、
// ?screener_mock=1 でマーカー描画/§38 中立/ADR「—」を dogfood 可能にする。
const MOCK_ROWS = [
  { ticker: 'TRGP', name: 'Targa Resources', lastReportDate: '2026-05-07', rsValue: 83, earnings: { revYoY: 18, revBeat: 'beat', epsYoY: 24, epsBeat: 'beat', gm: 18, fcf: 12, nqRev: 3, nqEps: 2, tri: 'ok', guidanceSource: '8k' } },
  { ticker: 'AGX', name: 'Argan, Inc.', lastReportDate: '2026-06-04', rsValue: 95, earnings: { revYoY: 32, revBeat: 'beat', epsYoY: 47, epsBeat: 'beat', gm: 19, fcf: 22, nqRev: 5, nqEps: 4, tri: 'ok', guidanceSource: '8k' } },
  { ticker: 'VRT', name: 'Vertiv Holdings', lastReportDate: '2026-04-22', rsValue: 91, earnings: { revYoY: 21, revBeat: 'beat', epsYoY: 49, epsBeat: 'beat', gm: 35, fcf: 9, nqRev: -2, nqEps: 1, tri: 'part', guidanceSource: null } },
  { ticker: 'FTI', name: 'TechnipFMC plc', lastReportDate: '2026-04-30', rsValue: 82, earnings: { revYoY: 9, revBeat: 'inline', epsYoY: 16, epsBeat: 'beat', gm: 16, fcf: 7, nqRev: null, nqEps: null, tri: 'part', guidanceSource: null } },
  { ticker: 'TSM', name: 'Taiwan Semi (ADR)', lastReportDate: '2026-04-17', rsValue: 88, earnings: { revYoY: 35, revBeat: 'beat', epsYoY: 53, epsBeat: 'beat', gm: 53, fcf: 25, nqRev: 4, nqEps: null, tri: 'part', guidanceSource: '8k' } },
  { ticker: 'BABA', name: 'Alibaba (ADR)', lastReportDate: '2026-05-15', rsValue: 78, earnings: { revYoY: 12, revBeat: 'beat', epsYoY: null, epsBeat: null, gm: 38, fcf: 18, nqRev: 1, nqEps: null, tri: 'part', guidanceSource: null } },
];

function HeaderRow({ mode }) {
  if (mode === 'simple') {
    return (
      <div className="screener-grid-head" data-testid="screener-grid-header" role="row">
        <span aria-hidden="true" />
        <span>銘柄</span>
        <span className="h-lead">決算の総合</span>
        <span className="h-num">売上 YoY</span>
        <span className="h-num">RS</span>
      </div>
    );
  }
  return (
    <div className="screener-grid-head" data-testid="screener-grid-header" role="row">
      <span aria-hidden="true" />
      <span>銘柄</span>
      <span className="h-num">売上 YoY</span>
      <span className="h-num">EPS YoY</span>
      <span className="h-num h-qualstart">粗利率</span>
      <span className="h-num">FCF率</span>
      <span className="h-fut h-fstart">来期売上<br />ガイダンス比</span>
      <span className="h-fut">来期EPS<br />ガイダンス比</span>
      <span className="h-num">RS</span>
    </div>
  );
}

// per-preset 列の見出し (pip 列なし・銘柄 + 根拠列)。
function PresetHeaderRow({ columns }) {
  return (
    <div className="screener-grid-head" data-testid="screener-grid-header" role="row">
      <span>銘柄</span>
      {columns.map((c) => (
        <span key={c.id} className="h-num">
          {c.header}{c.headerSub && <><br />{c.headerSub}</>}
        </span>
      ))}
    </div>
  );
}

// per-preset 凡例 + §38 免責。verdict 列 (直近ビート) がある preset のみ ↑↓ 凡例を出す。
function PresetLegend({ columns }) {
  const hasVerdict = columns.some((c) => c.kind === 'verdict');
  return (
    <div className="screener-grid-legend" role="note" aria-label="表示記号と免責事項" data-testid="screener-grid-legend">
      {hasVerdict && (
        <>
          <span className="lg"><span className="gl up">↑</span> 予想超</span>
          <span className="lg"><span className="gl dn">↓</span> 予想未達</span>
        </>
      )}
      <span className="disc">
        {hasVerdict && <><b>↑↓</b> は直近決算の過去実績(対アナリスト予想)。</>}
        その他の数値は相対力(RS)・出来高・利益率・前年比などの観測事実の転記であり、当社の予測・推奨ではありません。
        <b>これらは買い推奨ではありません。</b>
      </span>
    </div>
  );
}

export default function ScreenerGridTable({
  items = [],
  mock = false,
  preset = null,
  count = null,
  selectedTickers,
  onSelect,
  onCheckbox,
  loading = false,
}) {
  const [mode, setMode] = useState(readInitialMode);
  const [isNarrow, setIsNarrow] = useState(false);
  const rootRef = useRef(null);

  // container 幅を観測し、狭幅で簡素を強制 (toggle の user pref は保持)。
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      if (w > 0) setIsNarrow(w < SCREENER_NARROW_BREAKPOINT);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const changeMode = useCallback((m) => {
    setMode(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ }
  }, []);

  const effectiveMode = isNarrow ? 'simple' : mode;   // 狭幅は簡素強制
  // 4 preset は column-driven (pip 列なし・preset 別根拠列)。earnings 系/mock は従来 9 列固定。
  const columnDriven = !mock && !!PRESET_COLUMNS[preset];
  const visibleCols = columnDriven
    ? (effectiveMode === 'simple' ? PRESET_COLUMNS[preset].filter((c) => c.core) : PRESET_COLUMNS[preset])
    : null;
  const cols = columnDriven
    ? `minmax(0,1fr) ${visibleCols.map((c) => c.width).join(' ')}`
    : (isNarrow ? COLS_NARROW : (effectiveMode === 'simple' ? COLS_SIMPLE : COLS_FULL));
  // 決算日併記は決算ゲート preset (新高値ブレイク/市場リード) のみ (sector/quiet はクリーンに保つ)。
  const showLeadDate = preset === 'new_high_break' || preset === 'market_leading';
  const rows = mock
    ? MOCK_ROWS
    : items.map((it) => (columnDriven
      ? {
        ticker: it.ticker,
        name: it.name ?? null,
        lastReportDate: showLeadDate ? (it.last_report_date ?? null) : null,
        rsValue: it.rs_percentile ?? null,
        metrics: normalizeMetrics(it),
        win: presetWin(it, preset), // gold 標榜 (SPEC A1・別格サブセット)
      }
      : normalizeItem(it)));
  const shown = mock ? rows.length : (count != null ? count : rows.length);

  return (
    <div
      ref={rootRef}
      className="screener-grid-table"
      data-testid="screener-grid-table"
      data-mode={effectiveMode}
      data-narrow={isNarrow ? 'true' : undefined}
      style={{ '--screener-cols': cols }}
    >
      {/* 詳細/簡素トグル (狭幅時は簡素固定のため hint に切替) */}
      <div className="screener-grid-bar">
        <span className="screener-grid-barlbl">表示</span>
        {isNarrow ? (
          <span className="screener-grid-narrowhint" data-testid="screener-grid-narrow-hint">狭幅のため簡素表示</span>
        ) : (
          <span className="screener-grid-seg" data-testid="screener-grid-toggle" role="group" aria-label="表示モード">
            <button
              type="button"
              className={mode === 'full' ? 'is-on' : ''}
              aria-pressed={mode === 'full'}
              data-testid="screener-grid-mode-full"
              onClick={() => changeMode('full')}
            >詳細</button>
            <button
              type="button"
              className={mode === 'simple' ? 'is-on' : ''}
              aria-pressed={mode === 'simple'}
              data-testid="screener-grid-mode-simple"
              onClick={() => changeMode('simple')}
            >簡素</button>
          </span>
        )}
        <span className="screener-grid-count">該当 <b>{shown}</b> 銘柄</span>
      </div>

      {/* §38/§5 凡例 + 免責 (role=note・常時可視・12px)。4 preset は PresetLegend (preset 別記号)。 */}
      {columnDriven ? <PresetLegend columns={visibleCols} /> : (
      <div className="screener-grid-legend" role="note" aria-label="表示記号と免責事項" data-testid="screener-grid-legend">
        <span className="lg"><span className="gl up">↑</span> 予想超</span>
        <span className="lg"><span className="gl dn">↓</span> 予想未達</span>
        <span className="lg"><span className="gl il">−</span> 予想どおり</span>
        <span className="disc">
          <b>↑↓−</b> はいずれも直近決算の過去実績(vs アナリスト予想)。来期2列は
          <span className="screener-grid-fdot" aria-hidden="true" /><b>付き＝会社ガイダンスとアナリスト予想の比</b>、
          <b>無印＝来期コンセンサスYoY(ガイダンス未取得)</b>。いずれも会社開示・市場予想の転記であり、当社の予測・推奨ではありません。
          <b>これらは買い推奨ではありません。</b>
        </span>
      </div>
      )}

      {/* sticky 見出し (overflow を作らない・祖先 .screener-master__content に吸着)。4 preset は PresetHeaderRow。 */}
      {columnDriven ? <PresetHeaderRow columns={visibleCols} /> : <HeaderRow mode={effectiveMode} />}

      {/* 本体 */}
      {loading ? (
        <div data-testid="screener-grid-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="screener-grid-row screener-grid-row--skeleton" key={i} aria-hidden="true" style={{ animationDelay: `${i * 45}ms` }}>
              <span className="screener-grid-pip is-none">–</span>
              <span className="screener-grid-lead">
                <span className="screener-grid-logo screener-grid-skel-dot" />
                <span className="screener-grid-idbody">
                  <span className="screener-grid-skel-line screener-grid-skel-line--tkr" />
                  <span className="screener-grid-skel-line screener-grid-skel-line--meta" />
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="screener-grid-empty" data-testid="screener-grid-empty">該当銘柄なし</div>
      ) : (
        <div data-testid="screener-grid-body">
          {rows.map((r, i) => (
            <ScreenerGridRow
              key={r.ticker}
              ticker={r.ticker}
              name={r.name}
              lastReportDate={r.lastReportDate}
              rsValue={r.rsValue}
              earnings={r.earnings}
              columns={columnDriven ? visibleCols : null}
              metrics={r.metrics ?? null}
              win={r.win ?? false}
              mode={effectiveMode}
              animIndex={i}
              isCheckboxChecked={selectedTickers?.has?.(r.ticker) ?? false}
              showCheckbox={!mock}
              onSelect={onSelect}
              onCheckbox={onCheckbox}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 注: TRI_VERDICT_JP は ScreenerGridRow からも参照可 (re-export)。
export { TRI_VERDICT_JP };
