/**
 * ScreenerPane — Pane 1「スクリーナー」 tab の専用 view (Phase 4-A Sprint 4-A-2 stub)
 *
 * SPEC 2026-05-28 Phase 4-A §11-A patch (6 体合議 verdict):
 *   - Hero「スクリーニング結果 3 セクション × top 5」 (Leader+Breakout+CWH 交差 / RS 急上昇 / 新規 Cup-Handle)
 *   - Explorer (テーブル + chip filter) = 既存 CustomScreenerPanel 流用
 *   - default OFF feature flag (isPillar2Pane1())、 user gate 3 後に default ON 化
 *
 * 本 file は Sprint 4-A-2 stub (雛形のみ):
 *   - Hero 3-column layout の placeholder
 *   - Explorer は CustomScreenerPanel embedded
 *   - 各 Hero section に data-testid 統一 (R3 hotfix lesson [[testid-all-render-paths]])
 *   - 「Phase 4-A WIP」 banner で feature flag preview と明示
 *
 * Phase 4-A Sprint 4-A-3 (user gate 3 通過後) で:
 *   - 「Leader+Breakout+CWH 交差」: /api/scanner/rs?min_percentile=80&limit=5 + Cup-Handle JOIN
 *   - 「RS 急上昇」: /api/scanner/rs?sort=delta&min_delta=10&limit=5 (Sprint 2.5 で backend 実装済)
 *   - 「新規 Cup-Handle」: /api/scanner/cup-handle?last=24h&limit=5
 *   - chip filter active highlight + sticky filter bar
 *   - section 間 ticker exclusion (qa-dogfooder verdict)
 *   - demo モード blur + ProTeaser overlay (marketer verdict)
 *
 * memory anchor: [[feedback-screener-hero-3sections]] (v125 Pane 1 Hero 設計 SSOT)
 */
import { Suspense, lazy } from 'react';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

// CustomScreenerPanel を lazy 化 (既存 modal lazy chunk と reuse、 Workspace.jsx と統一)
const CustomScreenerPanel = lazy(() => import('../../components/CustomScreenerPanel.jsx'));

/**
 * Hero section placeholder (Sprint 4-A-3 で fetch 実装予定)
 * @param {object} props
 * @param {string} props.title - section title (例: 「Leader+Breakout+CWH 交差」)
 * @param {string} props.testId - data-testid 値
 * @param {string} props.description - section 説明 (objective、 「推奨ではありません」 含む)
 */
function HeroSectionPlaceholder({ title, testId, description }) {
  return (
    <div
      data-testid={testId}
      style={{
        flex: 1,
        minHeight: 200,
        padding: 'var(--space-4, 16px)',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius-md, 8px)',
        background: 'var(--bg-subtle)',
      }}
    >
      <h4
        style={{
          fontSize: 13,
          fontWeight: 600,
          margin: '0 0 6px',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </h4>
      <p
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          margin: '0 0 12px',
          lineHeight: 1.4,
        }}
      >
        {description}
      </p>
      <p
        style={{
          fontSize: 11,
          color: 'var(--color-warning)',
          margin: 0,
          fontStyle: 'italic',
        }}
      >
        Sprint 4-A-3 で top 5 銘柄 fetch + 表示予定 (user gate 3 通過後)
      </p>
    </div>
  );
}

/**
 * ScreenerPane stub
 * @param {object} props
 * @param {object} props.detailContext - { user, isPro, onUpgrade, onSignIn }
 * @param {boolean} props.isProUser
 * @param {Function} props.handleUpgradeRequest
 */
export default function ScreenerPane({ detailContext = {}, isProUser = false, handleUpgradeRequest }) {
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);

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
      {/* WIP banner (Phase 4-A Sprint 4-A-2 stub、 user gate 3 通過後 削除予定) */}
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
        Phase 4-A Sprint 4-A-2 WIP (feature flag preview)。 Hero 完全 layout は Sprint 4-A-3 で実装予定。
      </div>

      {/* Hero: 3 セクション × top 5 (Sprint 4-A-3 で fetch 実装) */}
      <section
        data-testid="screener-hero"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-3, 12px)',
          marginBottom: 'var(--space-4, 16px)',
        }}
      >
        <HeroSectionPlaceholder
          title="Leader + Breakout + Cup-Handle 交差"
          testId="screener-hero-leader-breakout-cwh"
          description="RS percentile ≥ 80 ∩ 52w high 近接 ∩ Cup-Handle 検出済 の 3 条件交差結果 (推奨ではありません)"
        />
        <HeroSectionPlaceholder
          title="RS 急上昇"
          testId="screener-hero-rs-rising"
          description="前日比で RS percentile が +10pt 以上上昇した銘柄 (短期 momentum trader 向け screening 結果、 推奨ではありません)"
        />
        <HeroSectionPlaceholder
          title="新規 Cup-Handle 検出"
          testId="screener-hero-new-cup-handle"
          description="過去 24h 以内に Cup-Handle pattern が検出された銘柄 (IBD MarketSmith 流の breakout candidate alert)"
        />
      </section>

      {/* Explorer: 既存 CustomScreenerPanel embedded (Sprint 4-A-3 で chip filter active highlight 強化) */}
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
