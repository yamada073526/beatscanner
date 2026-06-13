/**
 * WorkspaceHeader — WorkspaceShell の header slot 用 component.
 *
 * v65 §4-B Item 2 (3 体並列レビュー反映 — UX デザイナー + マーケター + Anthropic engineer):
 *   - 上段 (32px) を CSS Grid `[logo][hero-search][actions]` に再構成
 *   - 検索を中央 Hero 化 (max-width 480px、placeholder 文言で意図明示)
 *     ※ input 実体は持たない (Linear 方式)。click → 既存 CmdPalette を開く
 *     ※ workspace mode では sticky-search-band は非表示なので二重化なし (App.jsx L720-802 確認済)
 *   - 「旧 UI」link を kebab dropdown (MoreHorizontal) に格納 (Trust Cliff 逆効果回避) → v206 で kebab ごと撤去 (?layout=classic 封印 案C)
 *   - 下段 (24px、collapsible): MarketStripCompact (Tier 1 8 指標)
 *
 * 設計:
 *   - shell の `header` slot は height:56px 固定 (WorkspaceShell.jsx)
 *   - 折りたたみ時の余白は許容 (上段だけ表示、下段消失)。WS-7 で shell 連携改修
 *   - lucide-react icons / a11y: aria-expanded + aria-controls
 *   - 折りたたみ状態は Zustand workspaceStore で persist
 */
// v118 P6: PanelRightOpen / PanelRightClose 削除 (Pane4 toggle 廃止)
// v120 Sprint 3: SlidersHorizontal = 銘柄スクリーナー access point icon (multi-review 6 体合議 verdict 反映、 UI/UX R3 で Filter → SlidersHorizontal に格上げ品格維持)
// v206 (2026-06-13): kebab「旧 UI に戻す」抜け道撤去 (?layout=classic 封印 案C) に伴い、
//   kebab 専用だった useState/useEffect/useLayoutEffect/useRef/createPortal/MoreHorizontal import を削除。
import { Search, SlidersHorizontal } from 'lucide-react';
import MarketStripCompact from './MarketStripCompact.jsx';
import MarketStatusPill from './MarketStatusPill.jsx';
import { useWorkspaceStore } from '../../state/workspaceStore.js';

/**
 * @param {object} [props]
 * @param {boolean} [props.isPro] - Pro/Premium tier 判定 (Workspace.jsx から伝播)
 * @param {() => void} [props.onOpenScreener] - スクリーナー button click handler (Pro user 時 modal open)
 * @param {(featureName: string) => void} [props.onUpgrade] - 非 Pro user click 時 ProTeaser 起動
 */
// v125 P6-1: Pane 1 nav screener tab feature flag (Workspace.jsx と同一 logic、 entry 1 本化用)
// 2026-05-28 v125 gate 3 通過: default ON (user 帰宅後 dogfood で flag default ON OK 判断)
// URL ?pillar2_pane1=0 で kill switch (revert 容易性のため残置、 enable 時 = 既存 button hide)
function isPillar2Pane1() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('pillar2_pane1');
    if (urlParam === '0') return false;
    return true;
  } catch {
    return true;
  }
}

export default function WorkspaceHeader({ isPro = false, onOpenScreener, onUpgrade } = {}) {
  // v125 P6-1: feature flag enable 時は既存 screener button hide (Pane 1 nav に一本化)
  const hideScreenerBtn = isPillar2Pane1();
  // v108 multi-review verdict: headerCollapsed state は store 残置 (migration risk 回避) するが
  //   button 削除 + 常時展開固定で実質無効化。 toggleHeader も呼び出し箇所なくなる。
  // v118 P6: pane4Expanded / togglePane4 削除 (Pane4 廃止)

  // v206 (2026-06-13): kebab menu (旧 UI 切替の抜け道) を撤去。 ?layout=classic 封印方針 (案C、
  //   user 承認)。 旧 UI への唯一の menu item だったため kebab ごと削除。 将来 settings/help が
  //   必要になったら再設置する。 手動 URL ?layout=classic の封印は workspace に詳細ポートフォリオ
  //   画面 (ロット履歴/TWR/vs SPY、 現状 classic のみ) を移植後に実施予定 ([[project_logged_out_pc_lp_routing]])。

  // 検索 pill click → 既存 ⌘K palette を起動 (input 実体を持たず state 二重化を回避)
  const openSearch = () => {
    try {
      const evt = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
      window.dispatchEvent(evt);
    } catch { /* noop */ }
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        width: '100%',
        minWidth: 0,
      }}
    >
      {/* ── 上段 (32px、常時表示): Grid [Logo][Hero Search][Actions] ──── */}
      <div
        style={{
          height: 32,
          minHeight: 32,
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 12,
          padding: '0 12px',
          flexShrink: 0,
        }}
      >
        {/* ── 左: Logo + Brand ─────────────────────────────────── */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <img
            src="/favicon.svg"
            alt="BeatScanner ロゴ"
            width={20}
            height={20}
            style={{ display: 'block', flexShrink: 0 }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            BeatScanner
          </span>
        </div>

        {/* ── 中央: Hero 検索 pill (max-width 480px、click → ⌘K palette) ──
            v65 §4-B-2: UX/マーケター推奨。input 実体なし (Linear 方式)。
            placeholder で意図明示「ティッカー or 会社名 — NVDA, Apple…」 */}
        <button
          type="button"
          onClick={openSearch}
          aria-label="銘柄を検索 (Cmd+K)"
          title="銘柄を検索 (⌘K)"
          style={{
            justifySelf: 'center',
            width: '100%',
            maxWidth: 480,
            minWidth: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 12px',
            height: 26,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-pill, 9999px)',
            background: 'var(--bg-card)',
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'text',
            transition: 'border-color 0.15s, background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(56,189,248,0.30)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <Search size={13} aria-hidden style={{ flexShrink: 0 }} />
          <span
            style={{
              flex: '1 1 auto',
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            ティッカーまたは会社名で決算を見る — NVDA, Apple…
          </span>
          <kbd
            style={{
              fontFamily: 'inherit',
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'var(--bg-subtle, rgba(0,0,0,0.05))',
              color: 'var(--text-muted)',
              flexShrink: 0,
            }}
          >
            ⌘K
          </kbd>
        </button>

        {/* ── 右: Actions cluster ───────────────────────────────── */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
        {/* v65 §B Step 2: MarketStatusPill (NYSE 開閉状態 + 次イベントまでの時間) */}
        <MarketStatusPill />
        {/* v118 P6: Pane 4 inspector toggle button 削除 (Pane4 機能廃止) */}

        {/* v120 Sprint 3 (multi-review 6 体合議 verdict 反映): 銘柄スクリーナー access button.
            P6 で Pane 4 削除 → workspace mode から CustomScreenerPanel への access 経路消失 (Trust Cliff 級) の fix.
            desktop ≥768px: icon + label「スクリーナー」 (Marketer A-1 機能発見性 fix)
            mobile <768px: icon only + tooltip (Marketer A-1 mobile fallback)
            非 Pro user: Pro amber badge + click → ProTeaser (Marketer A-2 + Trust Cliff fair lock)

            v125 P6-1: feature flag enable (?pillar2_pane1=1) 時は hide (entry 1 本化、 qa-dogfooder 6 体合議 verdict)
            default OFF では visible 維持 (user 影響 0)、 user gate 3 通過後 = flag default ON で完全削除予定。 */}
        {!hideScreenerBtn && (
        <button
          type="button"
          onClick={() => {
            if (!isPro) {
              onUpgrade?.('銘柄スクリーナー');
              return;
            }
            onOpenScreener?.();
          }}
          aria-label="銘柄スクリーナー (Cup-Handle × ファンダ 5 条件)"
          title="銘柄スクリーナー"
          data-testid="ws-header-screener-btn"
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 10px',
            height: 24,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-pill, 9999px)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(56,189,248,0.08)';
            e.currentTarget.style.borderColor = 'rgba(56,189,248,0.30)';
            e.currentTarget.style.color = 'var(--color-accent-strong)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-card)';
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <SlidersHorizontal size={13} strokeWidth={1.75} aria-hidden />
          <span className="ws-screener-btn-label">スクリーナー</span>
          {!isPro && (
            <span
              aria-hidden
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--color-gold)',
                padding: '1px 5px',
                borderRadius: 999,
                background: 'color-mix(in srgb, var(--color-gold) 14%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-gold) 30%, transparent)',
                textTransform: 'uppercase',
                lineHeight: 1.3,
              }}
            >
              Pro
            </span>
          )}
        </button>
        )}

        {/* v206 (2026-06-13): kebab「旧 UI (Classic SPA) に戻す」 抜け道を撤去 (?layout=classic 封印 案C、 user 承認)。 */}

        {/* v108 multi-review 5 体合議 verdict (2026-05-24): 指標バー折りたたみ button 削除。
            UI/UX + Frontend + QA = 3/5 賛成 (chrome 清潔、 「2 秒理解」 5 原則整合)、
            金融 + マーケ = 削除反対 (morning routine anchor) → 妥協案: button 削除 + 指標常時表示維持。
            workspaceStore の headerCollapsed state は削除しない (localStorage migration risk 回避)、
            component 側で常に展開状態に固定。 既存 user の persist (headerCollapsed=true) は無効化される。 */}
        </div>
      </div>

      {/* ── 下段 (24px、 常時展開): Tier 1 指標バー ────────────── */}
      <div
        id="ws-tier1-strip"
        style={{
          maxHeight: 24,
          minHeight: 0,
          overflow: 'hidden',
          borderTop: '1px solid var(--border)',
        }}
      >
        <MarketStripCompact />
      </div>
    </div>
  );
}
