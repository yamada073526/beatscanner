/**
 * ScreenerPane — Pane 1「スクリーナー」 tab の専用 view (Phase 4-A Sprint 4-A-2/3)
 *
 * SPEC 2026-05-28 Phase 4-A §11-A patch (6 体合議 verdict):
 *   - Hero「スクリーニング結果 3 セクション × top 5」 (Leader+Breakout+CWH 交差 / RS 急上昇 / 新規 Cup-Handle)
 *   - Explorer (テーブル + chip filter) = 既存 CustomScreenerPanel 流用
 *   - default OFF feature flag (isPillar2Pane1())、 user gate 3 後に default ON 化
 *
 * Sprint 4-A-3 着地 (本 file):
 *   - Hero 3 セクション の実 fetch 実装 (frontend Promise.all 並列 + ticker intersection)
 *   - 「Leader+Breakout+CWH 交差」 = /api/scanner/rs?min_percentile=80 ∩ /api/scanner/cup-handle?filter=cup
 *   - 「RS 急上昇」 = /api/scanner/rs?sort=delta&min_delta=10&limit=5 (Sprint 2.5 backend)
 *   - 「新規 Cup-Handle」 = /api/scanner/cup-handle?filter=cup → frontend で signal_date >= today-1 filter
 *   - section 間 ticker exclusion (S1 → S2 → S3、 「同じ 5 銘柄」 退屈回避、 qa-dogfooder verdict)
 *   - 各 section ticker click で activeTicker setter + home tab 遷移
 *   - migration 未適用時 (delta column 不在) は「データ準備中」 表示
 *   - 「推奨ではありません」 文言を各 section 説明に明記 (金商法 §38 / 景表法 §5 safe)
 *
 * Phase 4-A Sprint 4-A-4 残作業 (本 Sprint で着手しない):
 *   - chip filter active highlight (Hero 上部の [Leader] [RS 急] [CWH] chip)
 *   - sticky filter bar
 *   - demo モード blur + ProTeaser overlay
 *
 * memory anchor: [[feedback-screener-hero-3sections]] / [[feedback-oneill-screener-frontend-intersection]]
 */
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import Chip from '../../components/ui/Chip.jsx';

// CustomScreenerPanel を lazy 化 (既存 modal lazy chunk と reuse、 Workspace.jsx と統一)
const CustomScreenerPanel = lazy(() => import('../../components/CustomScreenerPanel.jsx'));

// v147 (user dogfood AAPL): cup-handle scanner の state badge を日本語ラベルに。
//   旧版は raw state 文字列 (例「breakout_extended」) をそのまま表示していた (英語混在 + 意味不明)。
//   StockPriceChart の cupChipLabel + extended chip と文言を一致させる。
//   breakout_extended (= AAPL 型「定義通りでない高値圏ブレイク」) も識別可能に。§38 回避で事実記述。
const CUP_STATE_LABEL_JP = {
  breakout_confirmed: 'ブレイク確定',
  breakout_pending: 'ブレイク待機',
  pullback_to_support: '押し目接近',
  formation: '形成中',
  cup_completing: 'カップ完成間近',
  // v148 ⑦ (SPEC extended_screener): screener badge は「高値圏突破」 (2 秒理解・和語的)。
  // chart chip は「高値圏ブレイク・過延伸」 のまま使い分け (StockPriceChart.jsx)。
  breakout_extended: '高値圏突破',
  formation_market_weak: '形成中・市場待機',
};

// v148 ⑦: extended badge に 50DMA 乖離数値を併記 (§38/§5: price action 記述 + 乖離数値、 action 断定禁止)。
// masked item は top-level sma50_deviation_pct、 premium item は payload.sma50_deviation_pct。
function extendedBadge(item) {
  // masked item は top-level sma50_deviation_pct、 premium item は payload.sma50_deviation_pct
  // (旧 signal 互換で payload.extended_gate.sma50_deviation_pct も fallback、 backend mask と対称)。
  const dev = item?.sma50_deviation_pct
    ?? item?.payload?.sma50_deviation_pct
    ?? item?.payload?.extended_gate?.sma50_deviation_pct;
  if (dev == null || Number.isNaN(Number(dev))) return '高値圏突破';
  const n = Number(dev);
  return `高値圏突破 · 50DMA ${n >= 0 ? '+' : ''}${n}%`;
}

// ── fetcher: backend /api/scanner/rs (Leader + delta sort 両用) ──
async function fetchRsLeader({ limit = 20 } = {}) {
  try {
    const r = await fetch(`/api/scanner/rs?min_percentile=80&limit=${limit}`);
    if (!r.ok) return { items: [], error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { items: [], error: String(e) };
  }
}

async function fetchRsDelta({ minDelta = 10, limit = 5 } = {}) {
  try {
    const r = await fetch(`/api/scanner/rs?sort=delta&min_delta=${minDelta}&limit=${limit}&min_percentile=1`);
    if (!r.ok) return { items: [], error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { items: [], error: String(e) };
  }
}

// ── fetcher: backend /api/scanner/cup-handle (cup-only mode) ──
async function fetchCupHandle({ limit = 20 } = {}) {
  try {
    const r = await fetch(`/api/scanner/cup-handle?filter=cup`);
    if (!r.ok) return { items: [], error: `HTTP ${r.status}` };
    const data = await r.json();
    // items は state priority sorted、 必要な数だけ slice
    return { ...data, items: (data.items || []).slice(0, limit) };
  } catch (e) {
    return { items: [], error: String(e) };
  }
}

/**
 * Hero section card (実 fetch result 表示)
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.testId
 * @param {string} props.description - 「推奨ではありません」 含む objective 説明
 * @param {Array<object>} props.tickers - [{ticker, badge?: string}]
 * @param {boolean} props.loading
 * @param {string} props.emptyMessage - tickers 0 件時の文言
 * @param {Function} props.onSelect
 * @param {React.Ref<HTMLDivElement>} props.sectionRef - chip click scroll-to 用 ref
 * @param {boolean} props.active - chip filter active 時 highlight
 * @param {boolean} props.demoMode - true なら top 1 visible + 残 blur + ProTeaser overlay (v125 P5-2)
 * @param {Function} props.onUpgrade - ProTeaser CTA で呼び出し (Pro 訴求 modal 起動)
 * @param {string|null} props.error - P6-2: per-source partial failure 文言 (null なら error UI 非表示)
 * @param {Function} props.onRetry - P6-2: retry button click handler
 */
function HeroSection({ title, testId, description, tickers, loading, emptyMessage, onSelect, sectionRef, active = false, demoMode = false, onUpgrade, error = null, onRetry }) {
  // v125 P5-2: demo モード時は top 1 visible + 残り blur (marketer 6 体合議 verdict)
  const visibleCount = demoMode ? 1 : tickers.length;
  const blurredCount = demoMode ? Math.max(0, tickers.length - 1) : 0;
  return (
    <div
      ref={sectionRef}
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      style={{
        flex: 1,
        minHeight: 220,
        padding: 'var(--space-4, 16px)',
        border: active
          ? '1px solid var(--color-accent)'
          : '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 8px)',
        background: 'var(--bg-card)',
        boxShadow: active
          ? '0 0 0 2px color-mix(in srgb, var(--color-accent) 25%, transparent)'
          : 'none',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      <h4
        style={{
          fontSize: 13,
          fontWeight: 600,
          margin: '0 0 4px',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </h4>
      <p
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          margin: '0 0 12px',
          lineHeight: 1.4,
        }}
      >
        {description}
      </p>
      {loading ? (
        <div data-testid={`${testId}-loading`} style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-3, 12px)' }}>
          読み込み中…
        </div>
      ) : error ? (
        // P6-2: per-source partial failure UI (「該当銘柄なし」 vs「データ取得失敗」 を明示)
        <div
          data-testid={`${testId}-error`}
          style={{
            display: 'grid',
            gap: 6,
            fontSize: 11,
            color: 'var(--color-warning)',
            textAlign: 'center',
            padding: 'var(--space-3, 12px)',
            border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'color-mix(in srgb, var(--color-warning) 6%, transparent)',
          }}
        >
          <span>{error}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                padding: '4px 10px',
                fontSize: 10,
                fontWeight: 600,
                border: '1px solid var(--color-warning)',
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'transparent',
                color: 'var(--color-warning)',
                cursor: 'pointer',
                justifySelf: 'center',
              }}
            >
              再取得
            </button>
          )}
        </div>
      ) : tickers.length === 0 ? (
        <div data-testid={`${testId}-empty`} style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-3, 12px)' }}>
          {emptyMessage || '該当銘柄なし'}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tickers.map((t, idx) => {
            // v125 P5-2: demo モード時は idx === 0 のみ visible、 残りは blur
            const isBlurred = demoMode && idx >= visibleCount;
            return (
              <li key={t.ticker}>
                <button
                  type="button"
                  onClick={isBlurred ? onUpgrade : () => onSelect(t.ticker)}
                  data-testid={`screener-hero-ticker-${isBlurred ? 'blurred' : t.ticker}`}
                  data-blurred={isBlurred ? 'true' : 'false'}
                  aria-label={isBlurred ? 'Premium プランで全銘柄を解放' : `${t.ticker} の詳細を表示`}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 12,
                    fontWeight: 600,
                    textAlign: 'left',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    filter: isBlurred ? 'blur(4px)' : 'none',
                    opacity: isBlurred ? 0.5 : 1,
                    pointerEvents: isBlurred ? 'none' : 'auto',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{t.ticker}</span>
                  {t.badge && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{t.badge}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* v125 P5-2: demo モード時の ProTeaser overlay (marketer 6 体合議 verdict)
          「Premium で全 N 銘柄」 文言で具体性 + LP「3 銘柄/日まで無料試用」 整合 */}
      {demoMode && blurredCount > 0 && (
        <button
          type="button"
          onClick={onUpgrade}
          data-testid={`screener-hero-proteaser-${testId}`}
          style={{
            marginTop: 'var(--space-2, 8px)',
            width: '100%',
            padding: '8px 12px',
            fontSize: 11,
            fontWeight: 600,
            textAlign: 'center',
            border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
            color: 'var(--color-accent)',
            cursor: 'pointer',
            transition: 'background 0.2s ease',
          }}
        >
          Premium で残り {blurredCount} 銘柄を解放
        </button>
      )}
    </div>
  );
}

/**
 * ScreenerPane
 * @param {object} props
 * @param {object} props.detailContext - { user, isPro, onUpgrade, onSignIn }
 * @param {boolean} props.isProUser
 * @param {Function} props.handleUpgradeRequest
 */
export default function ScreenerPane({ detailContext = {}, isProUser = false, handleUpgradeRequest }) {
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);

  // v125 P5-2: demo モード判定 (未ログイン + 非 Pro)。
  // marketer 6 体合議 verdict: demo user に「top 1 visible + 残り blur」 で訴求、
  // LP「3 銘柄/日まで無料試用」 と整合 (各 Hero section top 1 = 3 銘柄/日 換算)
  const demoMode = !detailContext?.user || !isProUser;

  // 3 Hero section の state (P6-2: error flag を追加で「該当銘柄なし」 vs「データ取得失敗」 区別)
  const [leaderCwh, setLeaderCwh] = useState({ tickers: [], loading: true, error: null });
  const [rsRising, setRsRising] = useState({ tickers: [], loading: true, migrationPending: false, error: null });
  const [newCwh, setNewCwh] = useState({ tickers: [], loading: true, error: null });
  // P6-2: fetch retry trigger
  const [retryNonce, setRetryNonce] = useState(0);
  const handleRetry = () => setRetryNonce((n) => n + 1);

  // Sprint 4-A-4: chip filter active state + scroll-to refs
  // activeChip: null = all visible (default) / 'leader' / 'rising' / 'new-cwh' のいずれかで該当 section を highlight
  const [activeChip, setActiveChip] = useState(null);
  const leaderRef = useRef(null);
  const risingRef = useRef(null);
  const newCwhRef = useRef(null);

  const handleChipClick = (chipKey) => {
    // 同 chip を再 click で全 highlight 解除 (toggle、 Linear 流)
    const next = activeChip === chipKey ? null : chipKey;
    setActiveChip(next);
    // scroll-into-view (smooth、 nearest = scroll 最小化)
    if (next) {
      const ref = next === 'leader' ? leaderRef : next === 'rising' ? risingRef : newCwhRef;
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  };

  useEffect(() => {
    let cancelled = false;

    // P6-2: retry 時の loading state 初期化
    setLeaderCwh({ tickers: [], loading: true, error: null });
    setRsRising({ tickers: [], loading: true, migrationPending: false, error: null });
    setNewCwh({ tickers: [], loading: true, error: null });

    (async () => {
      // 3 fetch 並列起動
      const [rsLeader, rsDelta, cup] = await Promise.all([
        fetchRsLeader({ limit: 30 }),
        fetchRsDelta({ minDelta: 10, limit: 30 }),
        fetchCupHandle({ limit: 30 }),
      ]);
      if (cancelled) return;

      // P6-2: per-source error 判定 (fetcher は error field 返却で graceful、 ここで「該当銘柄なし」 と区別)
      const rsLeaderFailed = !!rsLeader.error;
      const rsDeltaFailed = !!rsDelta.error;
      const cupFailed = !!cup.error;

      // section 1: Leader + Breakout + CWH 交差 = RS >= 80 ∩ Cup-Handle 検出
      // v133 方針 #12 Option A: cup item の gc_confirmed lookup map で Cup-Handle カードに GC badge 強化
      // v148 ⑦ (3 体合議 qa-dogfooder MAJOR-A / frontend MINOR): breakout_extended は正統 cup-handle
      // ではないため section ① (disclaimer なし) から除外。 extended は section ③ (高値圏突破 badge +
      // disclaimer) のみで露出させ、 §5 優良誤認 (extended を「CWH 交差」 と誤認) を防ぐ。
      const cupItemsForSection1 = (cup.items || []).filter((c) => c.state !== 'breakout_extended');
      const cupTickers = new Set(cupItemsForSection1.map((c) => c.ticker));
      const gcByTicker = new Map();
      for (const c of cupItemsForSection1) {
        if (c.gc_confirmed) gcByTicker.set(c.ticker, true);
      }
      const intersection = [];
      for (const item of (rsLeader.items || [])) {
        if (cupTickers.has(item.ticker)) {
          const gc = gcByTicker.get(item.ticker);
          intersection.push({
            ticker: item.ticker,
            badge: gc ? `RS ${item.universe_percentile} ✦ GC` : `RS ${item.universe_percentile}`,
          });
          if (intersection.length >= 5) break;
        }
      }
      // section 1 は RS + Cup 両方が必要、 どちらか失敗で error 表示
      setLeaderCwh({
        tickers: intersection,
        loading: false,
        error: (rsLeaderFailed || cupFailed) ? (rsLeaderFailed && cupFailed ? '両 source 取得失敗' : rsLeaderFailed ? 'RS 取得失敗' : 'Cup-Handle 取得失敗') : null,
      });

      // section 2: RS 急上昇 = sort=delta items (section 1 で使われた ticker は除外、 qa-dogfooder verdict)
      const usedTickers = new Set(intersection.map((t) => t.ticker));
      const migrationPending = rsDelta?.sources?.delta_1d_percentile === 'empty_migration_pending';
      const risingItems = [];
      for (const item of (rsDelta.items || [])) {
        if (usedTickers.has(item.ticker)) continue;
        risingItems.push({
          ticker: item.ticker,
          badge: item.delta_1d_percentile != null ? `+${item.delta_1d_percentile}pt` : 'RS '.concat(item.universe_percentile ?? ''),
        });
        usedTickers.add(item.ticker);
        if (risingItems.length >= 5) break;
      }
      setRsRising({
        tickers: risingItems,
        loading: false,
        migrationPending,
        error: rsDeltaFailed ? 'RS scanner 取得失敗' : null,
      });

      // section 3: 新規 Cup-Handle 検出 (last 24h は signal_date でなく state=breakout_confirmed/pending を優先)
      // section 1/2 で使われた ticker を除外、 v133 方針 #12: GC 確認済 ticker は badge に ✦ GC を追加
      const newCwhItems = [];
      for (const item of (cup.items || [])) {
        if (usedTickers.has(item.ticker)) continue;
        // v148 ⑦: extended は「高値圏突破 · 50DMA +X%」、 cup 系は既存ラベル
        const baseBadge = item.state === 'breakout_extended'
          ? extendedBadge(item)
          : (CUP_STATE_LABEL_JP[item.state] || item.state || '形成中');
        newCwhItems.push({
          ticker: item.ticker,
          badge: item.gc_confirmed ? `${baseBadge} ✦ GC` : baseBadge,
        });
        usedTickers.add(item.ticker);
        if (newCwhItems.length >= 5) break;
      }
      setNewCwh({
        tickers: newCwhItems,
        loading: false,
        error: cupFailed ? 'Cup-Handle scanner 取得失敗' : null,
      });
    })();

    return () => { cancelled = true; };
  }, [retryNonce]);

  const handleSelect = (sym) => {
    setActiveTicker(sym);
    // screener から click 後は home へ自動遷移 (Pane 3 で詳細表示)
    setActiveTab('home');
  };

  return (
    <div
      data-testid="screener-pane"
      style={{ padding: 'var(--space-4, 16px)', height: '100%', overflowY: 'auto' }}
    >
      {/* WIP banner (Phase 4-A Sprint 4-A-4 chip filter 着地、 demo blur + WorkspaceHeader 既存 button 削除は残作業) */}
      <div
        data-testid="screener-wip-banner"
        style={{
          padding: '8px 12px',
          marginBottom: 16,
          borderRadius: 'var(--radius-sm, 4px)',
          background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
          fontSize: 11,
          color: 'var(--color-warning)',
        }}
      >
        Phase 4-A Sprint 4-A-4 (feature flag preview)。 Hero 3 セクション fetch + chip filter active highlight + demo blur + ProTeaser overlay 実装済、 WorkspaceHeader 既存 button 削除は user gate 3 通過後。
      </div>

      {/* Sprint 4-A-4: chip filter (Hero 3 section の jump + active highlight、 ui-designer 6 体合議 verdict) */}
      <div
        data-testid="screener-chip-filter"
        style={{
          display: 'flex',
          gap: 'var(--space-2, 8px)',
          marginBottom: 'var(--space-3, 12px)',
          flexWrap: 'wrap',
        }}
      >
        <Chip
          variant="filter"
          size="sm"
          tone="accent"
          pressed={activeChip === 'leader'}
          onClick={() => handleChipClick('leader')}
          ariaLabel="Leader + Breakout + Cup-Handle 交差 section に jump"
        >
          Leader + Breakout + CWH
        </Chip>
        <Chip
          variant="filter"
          size="sm"
          tone="accent"
          pressed={activeChip === 'rising'}
          onClick={() => handleChipClick('rising')}
          ariaLabel="RS 急上昇 section に jump"
        >
          RS 急上昇
        </Chip>
        <Chip
          variant="filter"
          size="sm"
          tone="accent"
          pressed={activeChip === 'new-cwh'}
          onClick={() => handleChipClick('new-cwh')}
          ariaLabel="新規 Cup-Handle 検出 section に jump"
        >
          新規 Cup-Handle
        </Chip>
      </div>

      {/* Hero: 3 セクション × top 5 */}
      <section
        data-testid="screener-hero"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-3, 12px)',
          marginBottom: 'var(--space-4, 16px)',
        }}
      >
        <HeroSection
          title="Leader + Breakout + Cup-Handle 交差"
          testId="screener-hero-leader-breakout-cwh"
          description="RS percentile ≥ 80 ∩ Cup-Handle 検出済 (推奨ではありません)"
          tickers={leaderCwh.tickers}
          loading={leaderCwh.loading}
          error={leaderCwh.error}
          emptyMessage="交差銘柄 0 件"
          onSelect={handleSelect}
          sectionRef={leaderRef}
          active={activeChip === 'leader'}
          demoMode={demoMode}
          onUpgrade={handleUpgradeRequest}
          onRetry={handleRetry}
        />
        <HeroSection
          title="RS 急上昇"
          testId="screener-hero-rs-rising"
          description={
            rsRising.migrationPending
              ? '前日比 percentile 急上昇 (データ準備中: migration 適用後 cron 次回実行で populate)'
              : '前日比で RS percentile が +10pt 以上上昇 (推奨ではありません)'
          }
          tickers={rsRising.tickers}
          loading={rsRising.loading}
          error={rsRising.error}
          emptyMessage={rsRising.migrationPending ? 'データ準備中' : '急上昇銘柄なし'}
          onSelect={handleSelect}
          sectionRef={risingRef}
          active={activeChip === 'rising'}
          demoMode={demoMode}
          onUpgrade={handleUpgradeRequest}
          onRetry={handleRetry}
        />
        <HeroSection
          title="新規 Cup-Handle 検出"
          testId="screener-hero-new-cup-handle"
          description="Cup-Handle pattern 検出済 (IBD MarketSmith 流のブレイクアウト候補)。高値圏突破は正統 cup-with-handle とは形成過程が異なります。投資の推奨ではありません。"
          tickers={newCwh.tickers}
          loading={newCwh.loading}
          error={newCwh.error}
          emptyMessage="検出銘柄なし"
          onSelect={handleSelect}
          sectionRef={newCwhRef}
          active={activeChip === 'new-cwh'}
          demoMode={demoMode}
          onUpgrade={handleUpgradeRequest}
          onRetry={handleRetry}
        />
      </section>

      {/* Explorer: 既存 CustomScreenerPanel embedded */}
      <section data-testid="screener-explorer" style={{ marginTop: 'var(--space-4, 16px)' }}>
        <h3
          style={{
            fontSize: 12,
            fontWeight: 600,
            margin: '0 0 12px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Explorer
        </h3>
        <Suspense fallback={<div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading…</div>}>
          <CustomScreenerPanel
            user={detailContext.user}
            isPro={isProUser}
            onUpgrade={handleUpgradeRequest}
            onSelect={handleSelect}
          />
        </Suspense>
      </section>
    </div>
  );
}
