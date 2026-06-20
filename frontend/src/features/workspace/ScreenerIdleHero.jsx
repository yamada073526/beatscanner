/**
 * ScreenerIdleHero — screener master-detail の Pane3 idle (銘柄未選択時) に表示する
 * 「今日の筆頭」Preview Hero。
 *
 * SPEC 2026-06-20: スクリーナー構造再設計 案B B1 (案A交差条件化 + 透明表示 + 集約)
 *
 * 設計原則:
 *   - 交差条件 (案A 確定 / handover v237 §8 SSOT = memory reference_jijima_investment_criteria):
 *       rs_percentile >= 75 ∩ funda_pass === true
 *       ∩ (cup_state ∈ {breakout_confirmed, breakout_pending} OR breakout_state === 'bo_confirmed')
 *     0件時は cup_state === 'formation' まで緩和するフォールバック。rs 降順 top3。
 *   - 自前 fetch: fetchScannerUniverse (api.js、auth 自動付与 + dedup 60s) で母集団を取得し
 *     フロントで交差計算。_heroCache / ScreenerPane への依存なし (custom モードでも動作)。
 *   - 透明表示 (user 主訴=ブラックボックス解消): eyebrow/説明で交差条件を明示 + ⓘ で各条件の意味。
 *   - tier gate: cup_state/breakout_state は Premium 限定 (free/pro は null)。dogfood は Premium user。
 *     一般 user の degrade は B6 で対応 (現状 default OFF なので一般 user は到達しない)。
 *   - 発光ゼロ: .panel-card/.bs-panel/.surface-card 不使用。border + tinted-bg + token のみ。
 *   - §38/§5: 軸明示、状態ラベルは静的 dict・色 neutral (買い断定なし)、断定/最上級禁止、免責1行。
 *   - testid を loading/error/empty/main 全 render path に付与。
 *   - inline 関数 component 禁止 (module-level hoist)。shadow ゼロ。raw hex 禁止。
 */
import { useState, useEffect } from 'react';
import { Hourglass, Crown, AlertCircle, Info } from 'lucide-react';
import CompanyLogo from '../../components/CompanyLogo.jsx';
import { fetchScannerUniverse } from '../../api.js';

// stagger 定数 (ScreenerPane.jsx と同値で統一感)
const ROW_REVEAL_LEAD = 240; // ms
const ROW_REVEAL_STEP = 64;  // ms

function rowRevealDelay(idx) {
  return ROW_REVEAL_LEAD + idx * ROW_REVEAL_STEP;
}

// 交差シグナルの静的ラベル dict (§38: LLM 不使用・色 neutral・断定なし)。
// 優先順位: breakout_confirmed > breakout_pending > bo_confirmed > formation。
function deriveSignalLabel(it) {
  if (it.cup_state === 'breakout_confirmed') return 'ブレイク確定';
  if (it.cup_state === 'breakout_pending') return 'ブレイク待ち';
  if (it.breakout_state === 'bo_confirmed') return '新高値ブレイク';
  if (it.cup_state === 'formation') return 'カップ形成中';
  return null;
}

// 厳格交差: rs >= 75 ∩ funda_pass ∩ (cup confirmed/pending OR breakout bo_confirmed)
function matchesStrict(it) {
  return (
    typeof it.rs_percentile === 'number' && it.rs_percentile >= 75 &&
    it.funda_pass === true &&
    (it.cup_state === 'breakout_confirmed' ||
      it.cup_state === 'breakout_pending' ||
      it.breakout_state === 'bo_confirmed')
  );
}

// 緩和交差 (0件フォールバック): 上記 + cup_state === 'formation' も許可
function matchesRelaxed(it) {
  return (
    typeof it.rs_percentile === 'number' && it.rs_percentile >= 75 &&
    it.funda_pass === true &&
    (it.cup_state === 'breakout_confirmed' ||
      it.cup_state === 'breakout_pending' ||
      it.cup_state === 'formation' ||
      it.breakout_state === 'bo_confirmed')
  );
}

// ⓘ ツールチップ文 (各条件の意味、§38: 内部プロトコル名は出さない = 「独自プロトコル」表記)
const CRITERIA_TOOLTIP =
  'RS: 市場全体に対する6ヶ月の相対力が上位75パーセンタイル以上。' +
  ' / 決算3条件: 売上・EPS の前年比成長など独自プロトコルの定量条件をクリア。' +
  ' / Cup・ブレイク: 株価チャートが押し目から高値更新へ向かう形状を形成。';

// -----------------------------------------------------------
// module-level sub-components (inline 関数 component 禁止)
// -----------------------------------------------------------

/** rank circle: rank ≤ 3 = gold / それ以外 = accent */
function RankCircle({ rank }) {
  const isTop3 = rank <= 3;
  return (
    <span
      aria-hidden
      className={isTop3 ? 'screener-rank-pop' : undefined}
      style={{
        flexShrink: 0,
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        fontSize: 11,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        background: isTop3
          ? 'color-mix(in srgb, var(--color-gold) 18%, transparent)'
          : 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
        color: isTop3 ? 'var(--color-gold)' : 'var(--color-accent)',
        animationDelay: `${rowRevealDelay(rank - 1)}ms`,
      }}
    >
      {rank}
    </span>
  );
}

/** 銘柄 row 1 件。rank1 のみ featured (padding 広め / ticker 大)。
 *  右側に RS percentile (主) + 交差シグナルラベル (副) を縦積みで透明表示。 */
function LeaderRow({ ticker, rs, signal, rank, onSelect }) {
  const isFeatured = rank === 1;
  return (
    <li
      className="screener-reveal"
      style={{ animationDelay: `${rowRevealDelay(rank - 1)}ms` }}
    >
      <button
        type="button"
        className="screener-hero-row"
        onClick={() => onSelect(ticker)}
        data-testid={`idle-hero-ticker-${ticker}`}
        aria-label={`${ticker} の詳細を表示`}
        style={{
          width: '100%',
          textAlign: 'left',
          borderRadius: 'var(--radius-sm, 4px)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2, 8px)',
          // rank1 のみ padding 一段広げ (SPEC: scarcity asymmetry — 1要素だけ突出)
          padding: isFeatured ? '10px var(--space-3, 12px)' : '6px 8px',
        }}
      >
        <RankCircle rank={rank} />
        {/* ロゴ: CompanyLogo (TV→FMP→頭文字円 3段 fallback) */}
        <span style={{ flexShrink: 0 }}>
          <CompanyLogo ticker={ticker} size={isFeatured ? 22 : 18} />
        </span>
        {/* ticker (mono / fw700) — rank1 のみフォントを一段大きく (big max2 scarcity) */}
        <span
          className="screener-hero-ticker"
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: isFeatured ? 15 : 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {ticker}
        </span>
        {/* 右側: RS (主) + シグナルラベル (副)。§38: 色 neutral、買い断定なし */}
        <span
          style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 1,
            lineHeight: 1.25,
          }}
        >
          {typeof rs === 'number' && (
            <span
              style={{
                fontSize: isFeatured ? 13 : 12,
                fontWeight: 700,
                color: 'var(--text-secondary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              RS {rs}
            </span>
          )}
          {signal && (
            <span
              style={{
                fontSize: isFeatured ? 11 : 10,
                fontWeight: 500,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              {signal}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

// -----------------------------------------------------------
// メイン component (export)
// -----------------------------------------------------------

/**
 * ScreenerIdleHero
 * @param {object} props
 * @param {Function} props.onSelect - ticker string を受け取る。Workspace の setActiveTicker 相当。
 */
export default function ScreenerIdleHero({ onSelect }) {
  // 自前 fetch: fetchScannerUniverse (auth 自動 / dedup 60s) で母集団を取得しフロントで交差計算。
  const [fetchState, setFetchState] = useState({
    tickers: [],
    loading: true,
    error: null,
    relaxed: false, // true = 厳格0件で formation まで緩和した候補
  });

  useEffect(() => {
    const ac = new AbortController();
    async function load() {
      try {
        // api.js の fetchScannerUniverse は positional 引数 (universeSize)。
        // object を渡すと universe_size=[object Object] → backend 422 になるため必ず数値で渡す。
        // signal は fetch に渡せないが、下の ac.signal.aborted ガードで unmount 後 setState を防ぐ。
        const data = await fetchScannerUniverse(3000);
        if (ac.signal.aborted) return;
        const items = Array.isArray(data?.items) ? data.items : [];

        // 厳格交差 → 0件なら formation 含む緩和交差にフォールバック
        let matched = items.filter(matchesStrict);
        let relaxed = false;
        if (matched.length === 0) {
          matched = items.filter(matchesRelaxed);
          relaxed = matched.length > 0;
        }

        // rs_percentile 降順 top3
        const top3 = matched
          .slice()
          .sort((a, b) => (b.rs_percentile ?? 0) - (a.rs_percentile ?? 0))
          .slice(0, 3)
          .map((it) => ({
            ticker: it.ticker,
            rs: it.rs_percentile,
            signal: deriveSignalLabel(it),
          }));

        setFetchState({ tickers: top3, loading: false, error: null, relaxed });
      } catch (e) {
        if (ac.signal.aborted) return;
        setFetchState({ tickers: [], loading: false, error: String(e), relaxed: false });
      }
    }
    load();
    return () => ac.abort();
  }, []);

  const { tickers, loading, error, relaxed } = fetchState;
  const isEmpty = !loading && !error && tickers.length === 0;

  // ── loading state ──
  if (loading) {
    return (
      <div
        data-testid="screener-idle-hero"
        data-state="loading"
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-3, 12px)',
          color: 'var(--text-muted)',
          padding: 'var(--space-6, 24px)',
        }}
      >
        <Hourglass size={20} strokeWidth={1.5} aria-hidden style={{ opacity: 0.55 }} />
        <span style={{ fontSize: 12, lineHeight: 1.6, textAlign: 'center' }}>
          今日の筆頭を絞り込み中…
        </span>
      </div>
    );
  }

  // ── error state ──
  if (error) {
    return (
      <div
        data-testid="screener-idle-hero"
        data-state="error"
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-3, 12px)',
          color: 'var(--text-muted)',
          padding: 'var(--space-6, 24px)',
          textAlign: 'center',
        }}
      >
        <AlertCircle size={20} strokeWidth={1.5} aria-hidden style={{ opacity: 0.55 }} />
        <span style={{ fontSize: 12, lineHeight: 1.6 }}>データ取得に失敗しました</span>
        <span style={{ fontSize: 11 }}>
          左の一覧から銘柄を選ぶと、ここに詳細が表示されます
        </span>
      </div>
    );
  }

  // ── empty state (交差0件) ──
  if (isEmpty) {
    return (
      <div
        data-testid="screener-idle-hero"
        data-state="empty"
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-3, 12px)',
          color: 'var(--text-muted)',
          padding: 'var(--space-6, 24px)',
          textAlign: 'center',
        }}
      >
        <Hourglass size={20} strokeWidth={1.5} aria-hidden style={{ opacity: 0.55 }} />
        <span style={{ fontSize: 12, lineHeight: 1.6 }}>
          本日は条件をすべて満たす銘柄が見つかりませんでした
        </span>
        <span style={{ fontSize: 11 }}>
          左の一覧から銘柄を選ぶと、ここに詳細が表示されます
        </span>
      </div>
    );
  }

  // ── main state ──
  return (
    <div
      data-testid="screener-idle-hero"
      data-state="main"
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: 'var(--space-6, 24px) var(--space-5, 20px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4, 16px)',
      }}
    >
      {/* ─── section ヘッダー: L字 gold frame (ScreenerPane と同パターン) ─── */}
      <div className="screener-reveal" style={{ animationDelay: '0ms' }}>
        <div
          style={{
            borderLeft: '3px solid var(--color-gold)',
            paddingLeft: 'var(--space-3, 12px)',
            marginBottom: 'var(--space-3, 12px)',
          }}
        >
          {/* eyebrow: 交差条件を明示 (透明表示 = ブラックボックス解消) */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              marginBottom: 2,
            }}
          >
            RS75 × 決算3条件 × Cup/ブレイク
          </div>
          <h4
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2, 8px)',
              fontSize: 'var(--text-h2, 18px)',
              fontWeight: 500,
              lineHeight: 1.25,
              letterSpacing: '-0.01em',
              margin: 0,
              paddingBottom: 'var(--space-2, 8px)',
              borderBottom: '1px solid color-mix(in srgb, var(--color-gold) 32%, transparent)',
              color: 'var(--text-primary)',
            }}
          >
            <Crown
              size={16}
              strokeWidth={1.75}
              aria-hidden
              style={{ color: 'var(--color-gold)', flexShrink: 0 }}
            />
            今日の筆頭
          </h4>
        </div>

        {/* section 説明: §38 軸明示 + ⓘ ツールチップ + 免責1行 */}
        <p
          style={{
            margin: '0 0 var(--space-2, 8px) 0',
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
          }}
        >
          <Info
            size={13}
            strokeWidth={1.75}
            aria-label="絞り込み条件の説明"
            title={CRITERIA_TOOLTIP}
            style={{ flexShrink: 0, marginTop: 2, opacity: 0.7, cursor: 'help' }}
          />
          <span>
            相対力(RS)上位 ・ 直近決算の3条件クリア ・ Cup/ブレイク形成 を
            <strong style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>すべて満たす</strong>
            銘柄。スクリーニング結果であり投資推奨ではありません。
          </span>
        </p>

        {/* 緩和フォールバック時の注記 (透明性: なぜこの候補か) */}
        {relaxed && (
          <p
            data-testid="idle-hero-relaxed-note"
            style={{
              margin: '0 0 var(--space-2, 8px) 0',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--text-muted)',
            }}
          >
            ※本日は「ブレイク確定/待ち」が少なく、カップ形成中まで広げた候補です。
          </p>
        )}
      </div>

      {/* ─── 銘柄リスト (上位3件) ─── */}
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1, 4px)',
        }}
      >
        {tickers.map((t, idx) => (
          <LeaderRow
            key={t.ticker}
            ticker={t.ticker}
            rs={t.rs}
            signal={t.signal}
            rank={idx + 1}
            onSelect={onSelect}
          />
        ))}
      </ul>

      {/* ─── 導線文 (下部) ─── */}
      <div
        className="screener-reveal"
        style={{ animationDelay: `${rowRevealDelay(tickers.length)}ms` }}
      >
        <div
          style={{
            marginTop: 'var(--space-4, 16px)',
            paddingTop: 'var(--space-4, 16px)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1, 4px)',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            ← 左の一覧から銘柄を選ぶと、ここに詳細が表示されます
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            「注目」と「絞り込み」を切り替えて候補を探せます。
          </span>
        </div>
      </div>
    </div>
  );
}
