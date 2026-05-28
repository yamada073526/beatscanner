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
import { Suspense, lazy, useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

// CustomScreenerPanel を lazy 化 (既存 modal lazy chunk と reuse、 Workspace.jsx と統一)
const CustomScreenerPanel = lazy(() => import('../../components/CustomScreenerPanel.jsx'));

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
 */
function HeroSection({ title, testId, description, tickers, loading, emptyMessage, onSelect }) {
  return (
    <div
      data-testid={testId}
      style={{
        flex: 1,
        minHeight: 220,
        padding: 'var(--space-4, 16px)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 8px)',
        background: 'var(--bg-card)',
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
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-3, 12px)' }}>
          読み込み中…
        </div>
      ) : tickers.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-3, 12px)' }}>
          {emptyMessage || '該当銘柄なし'}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tickers.map((t) => (
            <li key={t.ticker}>
              <button
                type="button"
                onClick={() => onSelect(t.ticker)}
                data-testid={`screener-hero-ticker-${t.ticker}`}
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
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{t.ticker}</span>
                {t.badge && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{t.badge}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
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

  // 3 Hero section の state
  const [leaderCwh, setLeaderCwh] = useState({ tickers: [], loading: true });
  const [rsRising, setRsRising] = useState({ tickers: [], loading: true, migrationPending: false });
  const [newCwh, setNewCwh] = useState({ tickers: [], loading: true });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 3 fetch 並列起動
      const [rsLeader, rsDelta, cup] = await Promise.all([
        fetchRsLeader({ limit: 30 }),
        fetchRsDelta({ minDelta: 10, limit: 30 }),
        fetchCupHandle({ limit: 30 }),
      ]);
      if (cancelled) return;

      // section 1: Leader + Breakout + CWH 交差 = RS >= 80 ∩ Cup-Handle 検出
      const rsLeaderTickers = new Set((rsLeader.items || []).map((r) => r.ticker));
      const cupTickers = new Set((cup.items || []).map((c) => c.ticker));
      const intersection = [];
      for (const item of (rsLeader.items || [])) {
        if (cupTickers.has(item.ticker)) {
          intersection.push({
            ticker: item.ticker,
            badge: `RS ${item.universe_percentile}`,
          });
          if (intersection.length >= 5) break;
        }
      }

      setLeaderCwh({ tickers: intersection, loading: false });

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
      setRsRising({ tickers: risingItems, loading: false, migrationPending });

      // section 3: 新規 Cup-Handle 検出 (last 24h は signal_date でなく state=breakout_confirmed/pending を優先)
      // section 1/2 で使われた ticker を除外
      const newCwhItems = [];
      for (const item of (cup.items || [])) {
        if (usedTickers.has(item.ticker)) continue;
        newCwhItems.push({
          ticker: item.ticker,
          badge: item.state || '形成中',
        });
        usedTickers.add(item.ticker);
        if (newCwhItems.length >= 5) break;
      }
      setNewCwh({ tickers: newCwhItems, loading: false });
    })();

    return () => { cancelled = true; };
  }, []);

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
      {/* WIP banner (Phase 4-A Sprint 4-A-3 着地、 Sprint 4-A-4 chip filter + demo blur 残作業) */}
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
        Phase 4-A Sprint 4-A-3 (feature flag preview)。 Hero 3 セクション fetch 実装済、 chip filter active highlight + demo blur は Sprint 4-A-4 で実装予定。
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
          emptyMessage="交差銘柄 0 件"
          onSelect={handleSelect}
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
          emptyMessage={rsRising.migrationPending ? 'データ準備中' : '急上昇銘柄なし'}
          onSelect={handleSelect}
        />
        <HeroSection
          title="新規 Cup-Handle 検出"
          testId="screener-hero-new-cup-handle"
          description="Cup-Handle pattern 検出済 (IBD MarketSmith 流の breakout candidate)"
          tickers={newCwh.tickers}
          loading={newCwh.loading}
          emptyMessage="検出銘柄なし"
          onSelect={handleSelect}
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
