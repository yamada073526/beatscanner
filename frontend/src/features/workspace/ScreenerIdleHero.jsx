/**
 * ScreenerIdleHero — screener master-detail の Pane3 idle (銘柄未選択時) に表示する
 * 「今日の筆頭」Preview Hero。
 *
 * SPEC 2026-06-20: スクリーナー構造再設計 案A §2(共通5原理) + §3(案A) + §5(DoD)
 *
 * 設計原則:
 *   - 自前 fetch: mount 時に /api/scanner/rs?min_percentile=80&limit=3 を直接取得。
 *     _heroCache / ScreenerPane への依存なし。custom モード (ScreenerPane unmount) でも動作。
 *   - 発光ゼロ: .panel-card/.bs-panel/.surface-card 不使用。border + tinted-bg + token のみ。
 *   - §38/§5: 軸明示「RS 上位」、断定/最上級禁止、免責1行。
 *   - testid を loading/error/empty/main 全 render path に付与。
 *   - inline 関数 component 禁止 (module-level hoist)。
 *   - shadow ゼロ堅持。raw hex 禁止。
 */
import { useState, useEffect } from 'react';
import { Hourglass, Crown, AlertCircle } from 'lucide-react';
import CompanyLogo from '../../components/CompanyLogo.jsx';

// stagger 定数 (ScreenerPane.jsx と同値で統一感)
const ROW_REVEAL_LEAD = 240; // ms
const ROW_REVEAL_STEP = 64;  // ms

function rowRevealDelay(idx) {
  return ROW_REVEAL_LEAD + idx * ROW_REVEAL_STEP;
}

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

/** 銘柄 row 1 件。rank1 のみ featured (padding 広め / ticker 大) */
function LeaderRow({ ticker, badge, rank, onSelect }) {
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
        {/* 指標 badge (RS / 合致度、静的表示) */}
        {badge && (
          <span
            title={badge}
            style={{
              flexShrink: 0,
              maxWidth: '56%',
              textAlign: 'right',
              fontSize: isFeatured ? 13 : 11,
              fontWeight: 700,
              color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {badge}
          </span>
        )}
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
  // 自前 fetch: _heroCache / ScreenerPane に依存せず mount 時に RS 上位 3 件を取得。
  // custom モード (ScreenerPane unmount) でも loading が解ける。
  const [fetchState, setFetchState] = useState({ tickers: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/scanner/rs?min_percentile=80&limit=3');
        if (cancelled) return;
        if (!r.ok) {
          setFetchState({ tickers: [], loading: false, error: `HTTP ${r.status}` });
          return;
        }
        const data = await r.json();
        if (cancelled) return;
        // RS endpoint レスポンス: { items: [{ticker, universe_percentile, ...}] }
        const items = Array.isArray(data.items) ? data.items.slice(0, 3) : [];
        const tickers = items.map((it) => ({
          ticker: it.ticker,
          badge: it.universe_percentile != null ? `RS ${it.universe_percentile}` : undefined,
        }));
        setFetchState({ tickers, loading: false, error: null });
      } catch (e) {
        if (cancelled) return;
        setFetchState({ tickers: [], loading: false, error: String(e) });
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const { tickers, loading, error } = fetchState;
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
          スクリーニング中…
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

  // ── empty state (該当銘柄 0件) ──
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
          本日は条件に合う銘柄が見つかりませんでした
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
      {/* ─── section ヘッダー: L字 gold frame (ScreenerPane §307,341 と同パターン) ─── */}
      <div className="screener-reveal" style={{ animationDelay: '0ms' }}>
        <div
          style={{
            borderLeft: '3px solid var(--color-gold)',
            paddingLeft: 'var(--space-3, 12px)',
            marginBottom: 'var(--space-3, 12px)',
          }}
        >
          {/* eyebrow: 11px / letterSpacing 0.08em / text-muted */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              marginBottom: 2,
            }}
          >
            RS 上位
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

        {/* section 説明: §38 軸明示 + 免責1行 */}
        <p
          style={{
            margin: '0 0 var(--space-3, 12px) 0',
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--text-muted)',
          }}
        >
          RS 上位 80% 銘柄から絞り込んだ筆頭候補。
          スクリーニング結果であり投資推奨ではありません。
        </p>
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
            badge={t.badge}
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
