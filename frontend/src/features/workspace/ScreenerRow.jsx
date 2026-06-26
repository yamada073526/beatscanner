/**
 * ScreenerRow.jsx — スクリーナー共有 row primitive (Sprint 1)
 *
 * 目的:
 *   screener_v2 の preset (ScreenerPane) と custom (CustomScreenerPanel) の
 *   銘柄行 module を 1 つの primitive に統合し、「モード切替で別アプリ感」を解消する。
 *   痛み 2 (Pane/Panel 二重構造) 解消の核。
 *
 * 設計原則 (SPEC §5 Sprint1 / 3体合議 追記条件):
 *   - 追記条件 1 (token化必須): raw 数値 (fontSize/gap/padding/borderRadius) を inline で持たない。
 *     design_system.md の --text-* / --space-* / --radius-* トークン + className + CSS のみ。
 *   - 追記条件 2 (純粋表示 primitive): filter/count ロジックを持たない。
 *     itemPasses 単一 predicate は親に残す (facet count 整合維持)。
 *   - 追記条件 3 (A-1 物理隔離): screenerV2 prop/branch に閉じ、legacy 行は不触。
 *   - 追記条件 4 (D-1 構造化 props): matchBadges/metrics/lockState を構造化オブジェクトで受ける。
 *   - 追記条件 5 (edge state testid): loading/error/empty/main 全 render path に付与。
 *   - 追記条件 6 (demo click): onSelect を経由し runAnalyze 直呼び禁止 (親側で handleLPTickerClick)。
 *   - 追記条件 7 (件数母集団差の UX 説明): mode prop で preset/custom を受け取り tooltip に使用。
 *
 * testid 一覧:
 *   screener-row-{ticker}           — main render path
 *   screener-row-loading-skeleton   — loading state (親から渡す skeleton row)
 *   screener-row-error-{ticker}     — error/name 欠損 fallback
 *   screener-row-empty              — 0 件 empty state (親が列挙前に表示)
 *
 * Props 契約 (§9 判断 D-1 確定型):
 * @param {string}   ticker         — ティッカー (必須)
 * @param {string}   [name]         — 会社名 (null 許容、fallback: ticker)
 * @param {string}   [logoTicker]   — ロゴ用 ticker (未指定時 ticker を使用)
 * @param {number}   [rank]         — 順位 (上位強調: 1-3 は gold)
 * @param {boolean}  [isTop]        — 上位行フラグ (余り強調 typography 用)
 * @param {Array}    matchBadges    — ヒット理由バッジ配列 (D-1 構造化)
 *   { label: string, value?: number, unit?: string,
 *     valueText?: string,  — 合否理由の行内コンパクト表示 (例 "+28%"、静的dict由来)
 *     reason?: string,     — 合否理由の完全文 (tooltip/aria、§38安全な事実言い換え)
 *     colorRole?: 'gain'|'loss'|'warning'|'neutral', group?: 'fundamental'|'technical'|'demand' }
 * @param {Array}    [metrics]      — 右端数値配列 (D-1 構造化)
 *   { key: string, value: number|null, category: 'fundamental'|'technical'|'demand' }
 * @param {Object}   [lockState]    — locked 状態 (free/pro/premium)
 *   { tier: 'premium'|'pro', label: string }
 * @param {boolean}  [isSelected]   — 選択済みフラグ (checkbox 連動)
 * @param {Function} [onSelect]     — 行クリック handler (親側で handleLPTickerClick を経由)
 * @param {Function} [onCheckbox]   — checkbox change handler
 * @param {Function} [onUpgrade]    — locked 行クリック handler (Pro/Premium upgrade 導線)
 * @param {string}   [mode]         — 'preset' | 'custom' (件数母集団差 UX 用)
 * @param {boolean}  [showCheckbox] — checkbox 表示フラグ (custom モードで true)
 */

import Chip from '../../components/ui/Chip.jsx';
import CompanyLogo from '../../components/CompanyLogo.jsx';
import { Lock, Zap, BarChart3, TrendingUp } from 'lucide-react';

// Sprint G: matchBadges[0].group → leading icon tile (G2 接ぎ木1 surge)
// mapping: technical→Zap / fundamental→BarChart3 / demand→TrendingUp
// §38: cyan tile は brand accent (技術シグナル識別)、「上昇=緑」意味付けなし
const GROUP_ICON = {
  technical: Zap,
  fundamental: BarChart3,
  demand: TrendingUp,
};

// ─── colorRole → CSS token マッピング (§38 準拠: 緑/赤断定回避) ──────────────
// gain/loss/warning は投資業界色ルール、neutral はデフォルト (CLAUDE.md 厳守)
const COLOR_ROLE_TOKEN = {
  gain:    'var(--color-gain)',
  loss:    'var(--color-loss)',
  warning: 'var(--color-warning)',
  neutral: 'var(--text-muted)',
};

// ─── Loading skeleton row ─────────────────────────────────────────────────────
/**
 * ScreenerRowSkeleton — fetch 中の skeleton (CLS ゼロ design)
 * 行高さを main row と同一 (--space-9 = 36px) に固定して fetch 前後の CLS を防ぐ
 * ([[feedback_cls_envelope_pattern]])
 */
export function ScreenerRowSkeleton({ index = 0 }) {
  return (
    <div
      className="screener-row screener-row--skeleton"
      data-testid="screener-row-loading-skeleton"
      aria-hidden="true"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span className="screener-row__logo-slot" />
      <span className="screener-row__body">
        <span className="screener-row__ticker-line">
          <span className="screener-row__skeleton-text screener-row__skeleton-text--ticker" />
          <span className="screener-row__skeleton-text screener-row__skeleton-text--rs" />
        </span>
        <span className="screener-row__chip-line">
          <span className="screener-row__skeleton-text screener-row__skeleton-text--badge" />
          <span className="screener-row__skeleton-text screener-row__skeleton-text--name" />
        </span>
      </span>
    </div>
  );
}

// ─── Empty state row ──────────────────────────────────────────────────────────
/**
 * ScreenerRowEmpty — 0 件時 empty message (親 component が描画)
 */
export function ScreenerRowEmpty({ message = '該当銘柄なし' }) {
  return (
    <div
      className="screener-row screener-row--empty"
      data-testid="screener-row-empty"
    >
      <span className="screener-row__empty-text">{message}</span>
    </div>
  );
}

// ─── Main ScreenerRow ─────────────────────────────────────────────────────────
/**
 * ScreenerRow — 共有銘柄行 primitive
 *
 * CSS は index.css の .screener-row スコープに集約。
 * raw 数値 inline style は持たない (追記条件 1)。
 * filter/count ロジックを持たない (追記条件 2)。
 */
export default function ScreenerRow({
  ticker,
  name,
  logoTicker,
  rank,
  isTop = false,
  matchBadges = [],
  metrics = [],
  lockState,
  isSelected = false,
  onSelect,
  onCheckbox,
  onUpgrade,
  mode = 'custom',
  showCheckbox = false,
  lastReportDate = undefined,   // 決算期混同ガード: 直近決算の報告日 "YYYY-MM-DD" (null=不明)
  showReportDate = false,       // 決算関連 preset (earnings_pass / new_high_break) でのみ併記
}) {
  // error fallback: ticker が無い場合は error state を返す
  if (!ticker) {
    return (
      <div
        className="screener-row screener-row--error"
        data-testid="screener-row-error-unknown"
        role="alert"
      >
        <span className="screener-row__empty-text">銘柄データを取得できませんでした</span>
      </div>
    );
  }

  // name 欠損 fallback (name は null 許容)
  const displayName = name || ticker;
  const logoSrc = logoTicker || ticker;
  const isLocked = !!lockState;

  // 行クリック: locked なら onUpgrade、通常は onSelect (親で handleLPTickerClick を経由)
  const handleRowClick = () => {
    if (isLocked) {
      onUpgrade?.();
      return;
    }
    onSelect?.(ticker);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRowClick();
    }
  };

  // RS metrics の取得 (right side に表示)
  const rsMetric = metrics.find((m) => m.key === 'rs_percentile');
  const rsValue = rsMetric?.value;

  // matchBadges の表示 (最大 2 件、spacing 確保のため)
  const visibleBadges = matchBadges.slice(0, 2);

  // Pass 2b: matchBadges を意味グループ (fundamental/technical/demand) で proximity 分節。
  // group 未指定は 'other' に集約。グループ順を固定し、グループ間に余白を確保 (痛み4)。
  // 現状 row は 2 badge と minimal だが、Phase 2 (#2/#5) の facet 追加で効果が増す構造基盤。
  const BADGE_GROUP_ORDER = ['fundamental', 'technical', 'demand', 'other'];
  const badgeGroups = (() => {
    const map = new Map();
    for (const b of visibleBadges) {
      const g = b.group || 'other';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(b);
    }
    return BADGE_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, badges: map.get(g) }));
  })();

  // 件数母集団差の tooltip (追記条件 7)
  const modeTooltip = mode === 'preset'
    ? 'preset: RS×テクニカル交差の上位銘柄'
    : 'custom: 全銘柄を条件でフィルタ';

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        'screener-row',
        isTop ? 'screener-row--top' : '',
        rank === 1 ? 'screener-row--rank-first' : '', // Sprint3: gold hairline は rank-1 のみ (scarcity)
        isSelected ? 'screener-row--selected' : '',
        isLocked ? 'screener-row--locked' : '',
      ].filter(Boolean).join(' ')}
      data-testid={`screener-row-${ticker}`}
      data-rank-top={isTop ? 'true' : undefined}
      data-mode={mode}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      title={modeTooltip}
      aria-label={
        isLocked
          ? `${ticker}: ${lockState.label}`
          : `${ticker} ${displayName} の詳細を表示`
      }
    >
      {/* checkbox (custom モードで hover 時表示) */}
      {showCheckbox && (
        <span
          className={[
            'screener-row__checkbox-slot',
            isSelected ? 'screener-row__checkbox-slot--visible' : '',
          ].filter(Boolean).join(' ')}
        >
          <input
            type="checkbox"
            className="screener-row__checkbox"
            checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onCheckbox?.(ticker, e.target.checked);
            }}
            data-testid={`screener-row-select-${ticker}`}
            aria-label={`${ticker} を選択`}
          />
        </span>
      )}

      {/* Sprint G: leading icon tile (matchBadges[0].group で種別識別、badge なし行は非表示) */}
      {(() => {
        const firstGroup = matchBadges[0]?.group;
        const TileIcon = firstGroup ? GROUP_ICON[firstGroup] : null;
        if (!TileIcon) return null;
        return (
          <span className="screener-row__signal-tile" aria-hidden="true">
            <TileIcon size={12} strokeWidth={1.75} />
          </span>
        );
      })()}

      {/* ロゴ (常時表示・hover で消さない) */}
      <span className="screener-row__logo-slot">
        <CompanyLogo
          ticker={logoSrc}
          size={isTop ? 28 : 24}
          monoFallback
        />
      </span>

      {/* メイン列: 2 段レイアウト */}
      <span className="screener-row__body">
        {/* 1 行目: ティッカー + RS 数値 */}
        <span className="screener-row__ticker-line">
          <span
            className={[
              'screener-row__ticker',
              isTop ? 'screener-row__ticker--top' : '',
            ].filter(Boolean).join(' ')}
          >
            {ticker}
          </span>

          {/* RS 数値 (§38: color polarity なし、数値のみ) */}
          {rsValue != null && (
            <span
              className={[
                'screener-row__rs',
                rsValue >= 85 ? 'screener-row__rs--high' : '',
              ].filter(Boolean).join(' ')}
            >
              RS {Math.round(rsValue)}
            </span>
          )}

          {/* locked 鍵アイコン */}
          {isLocked && (
            <span className="screener-row__lock" aria-hidden="true">
              <Lock size={11} strokeWidth={2} />
              <span className="screener-row__lock-label">{lockState.label}</span>
            </span>
          )}
        </span>

        {/* 2 行目: ヒット理由バッジ + 会社名 */}
        <span className="screener-row__chip-line">
          {visibleBadges.length > 0 && (
            <span className="screener-row__badges">
              {badgeGroups.map(({ group, badges }) => (
                <span
                  className="screener-row__badge-group"
                  key={group}
                  data-badge-group={group}
                >
                  {badges.map((badge, i) => {
                    // 合否理由 静的dict: reason(完全文) を優先、無ければ従来の value/unit。
                    const tooltip = badge.reason
                      || (badge.value != null
                        ? `${badge.label}: ${badge.value}${badge.unit || ''}`
                        : badge.label);
                    return (
                      <Chip
                        key={badge.label + i}
                        size="xs"
                        variant="display"
                        tone="muted"
                        title={tooltip}
                        aria-label={tooltip}
                      >
                        {badge.label}
                        {badge.valueText && (
                          <span className="screener-row__badge-value">{badge.valueText}</span>
                        )}
                      </Chip>
                    );
                  })}
                </span>
              ))}
            </span>
          )}
          {/* 決算期混同ガード: 直近決算の報告日を honest 併記 (この行の決算指標がいつの決算に
              基づくかを明示し「先期を今期と混同」を構造的に解消)。NULL は「決算日不明」で
              silent pass せず鮮度未確認を誠実に表示 (§3-4 Trust Cliff)。 */}
          {showReportDate && (
            <span
              className={[
                'screener-row__report-date',
                lastReportDate ? '' : 'screener-row__report-date--unknown',
              ].filter(Boolean).join(' ')}
              title={lastReportDate
                ? `直近決算の報告日: ${lastReportDate}（この行の決算指標が基づく四半期）`
                : '直近決算の報告日が取得できていません（決算指標の鮮度は要確認）'}
            >
              {lastReportDate ? `決算 ${lastReportDate}` : '決算日不明'}
            </span>
          )}
          <span className="screener-row__name">{displayName}</span>
        </span>
      </span>
    </div>
  );
}
