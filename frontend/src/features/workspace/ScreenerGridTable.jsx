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

export default function ScreenerGridTable({
  items = [],
  mock = false,
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
  const cols = isNarrow ? COLS_NARROW : (effectiveMode === 'simple' ? COLS_SIMPLE : COLS_FULL);
  const rows = mock ? MOCK_ROWS : items.map(normalizeItem);
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

      {/* §38/§5 凡例 + 免責 (role=note・常時可視・12px) */}
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

      {/* sticky 見出し (overflow を作らない・祖先 .screener-master__content に吸着) */}
      <HeaderRow mode={effectiveMode} />

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
