/**
 * FtdRegimeBanner — 市場局面 (Follow-Through Day) バナー 共有 component
 *
 * v175 B-Top2 で ScreenerPane に実装した component を Sprint 3 で共有 module 化。
 * ScreenerPane と CustomScreenerPanel の両方から import して使う。
 * 二重定義を防ぐため、この module が SSOT (唯一の定義場所)。
 *
 * 設計制約:
 *   - inline 関数 component 禁止 → module-level に hoist ([[feedback_pane_error_boundary]])
 *   - 文言は ftd.js の静的 dict のみ (§38: action 断定なし、 price action の事実のみ)
 *   - data-testid="ftd-regime-banner" を loading / main 両 state に付与
 *     ([[feedback_testid_all_render_paths]])
 *   - 発光系 (.bs-panel / .panel-card) に触らない。 新規 glow host を作らず
 *     既存 CSS token のみで完結 (border + bg-card)
 *   - ftd.js の fetch は api.js dedupGet で重複吸収されるため、
 *     ScreenerPane / CustomScreenerPanel 両方に mount しても API は 1 本化される
 */
import { useFtdMap, ftdRegime, ftdToneColor } from './ftd.js';

const BANNER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2, 8px)',
  padding: 'var(--space-2, 8px) var(--space-3, 12px)',
  marginBottom: 'var(--space-3, 12px)',
  borderRadius: 'var(--radius-md, 12px)',
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
};

/**
 * 市場局面バナー。3 指数 (S&P500 / NASDAQ / DJIA) の最強 FTD status を 1 行で表示する。
 * 全指数データ未取得時は null を返して非表示 (ノイズ回避)。
 *
 * @returns {JSX.Element|null}
 */
export default function FtdRegimeBanner() {
  const { ftdMap, loading } = useFtdMap();

  if (loading) {
    return (
      <div data-testid="ftd-regime-banner" style={BANNER_STYLE}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>市場局面を計算中…</span>
      </div>
    );
  }

  const regime = ftdRegime(ftdMap);
  if (regime.status === 'none') return null; // 全指数データ無し → banner 非表示 (ノイズ回避)

  const color = ftdToneColor(regime.tone);
  return (
    <div
      data-testid="ftd-regime-banner"
      title="市場局面 (Follow-Through Day): 下落相場の底打ち → 新規上昇トレンド入りを確認する指標。主要 3 指数 (S&P500 / NASDAQ / DJIA) のうち最も進んだ局面を表示しています。"
      style={BANNER_STYLE}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em', flexShrink: 0 }}>市場局面</span>
      <span style={{ fontSize: 12, fontWeight: 700, color, whiteSpace: 'nowrap', flexShrink: 0 }}>{regime.label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 0 }}>
        {regime.detail}
      </span>
    </div>
  );
}
