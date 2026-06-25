/**
 * StrategyPresetBar — 戦略プリセット bar (screener_v2 フラグ裏・MVP)
 *
 * 設計規律:
 *   - mockup v8 承認済デザインに忠実な縦カード 4 列グリッド UI
 *   - 色は semantic CSS 変数のみ (生 hex 禁止)
 *   - 余白は var(--space-N) (space-y-N/space-x-N 禁止)
 *   - shadow/glow/panel-card/bs-panel/surface-card 系 class 追加禁止
 *   - アイコン発光は filter: drop-shadow (SVG filter・低リスク) のみ
 *   - box-shadow は var(--shadow-*) token のみ
 *
 * Props:
 *   active    — 選択中の preset key ('earnings_pass' | 'new_high_break' | 'hot_sector' | 'sector_leader' | null)
 *   onSelect  — (presetKey: string | null) => void
 *               同じ key を再クリックで null (解除)
 *   counts    — { [presetKey]: number | null } プリセット別件数 (null = 算出中 → "–" 表示)
 */
import { BadgeCheck, TrendingUp, LayoutGrid, Crown } from 'lucide-react';

/** プリセット定義 SSOT (Phase A) */
export const STRATEGY_PRESETS = [
  {
    key: 'earnings_pass',
    label: '決算合格',
    title: '直近決算で絶対6条件（ファンダ5条件＋キャッシュ創出力）を満たす銘柄',
    desc: '直近の決算シーズンで絶対6条件をすべて満たした銘柄',
    Icon: BadgeCheck,
    tier: 'free',
    tierLabel: 'Free',
  },
  {
    key: 'new_high_break',
    label: '新高値ブレイク',
    title: '52週高値圏にある好決算銘柄。精度を上げるほど実ブレイク・買い場圏に純化',
    desc: '52週高値圏（高値圏〜実ブレイク）の好決算銘柄',
    Icon: TrendingUp,
    tier: 'prem',
    tierLabel: 'Premium',
  },
  {
    key: 'hot_sector',
    label: '旬のセクター',
    title: '資金が向かうセクター × その中の好決算銘柄（テーマ物色）',
    desc: '資金が向かうセクター × その中の好決算銘柄（テーマ物色）',
    Icon: LayoutGrid,
    tier: 'pro',
    tierLabel: 'Pro',
  },
  {
    key: 'sector_leader',
    label: 'セクター別リーダー',
    title: '各セクター内で相対力が上位、かつ営業CFマージン15%以上',
    desc: '各セクター内で相対力が上位、かつ営業CFマージン15%以上',
    Icon: Crown,
    tier: 'pro',
    tierLabel: 'Pro',
  },
];

export default function StrategyPresetBar({ active = null, onSelect, counts = {} }) {
  return (
    <div
      className="screener-strategy-bar"
      data-testid="screener-strategy-bar"
      role="radiogroup"
      aria-label="戦略プリセット"
    >
      {STRATEGY_PRESETS.map(({ key, label, title, desc, Icon, tier, tierLabel }) => {
        const isSelected = active === key;
        const count = counts[key];
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            title={title}
            data-testid={`screener-strategy-${key}`}
            className={`screener-strategy-tile${isSelected ? ' is-selected' : ''}`}
            onClick={() => onSelect?.(isSelected ? null : key)}
          >
            {/* top: icon + label 横並び */}
            <div className="screener-strategy-tile__top">
              <span className="screener-strategy-tile__icon">
                <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="screener-strategy-tile__label">{label}</span>
            </div>

            {/* desc: 2行ぶん min-height で foot を揃える */}
            <p className="screener-strategy-tile__desc">{desc}</p>

            {/* foot: 件数 + tier badge */}
            <div className="screener-strategy-tile__foot">
              <span className="screener-strategy-tile__count">
                <b>{count != null ? count : '–'}</b> 銘柄
              </span>
              <span className={`screener-tier-badge screener-tier-badge--${tier}`}>
                {tierLabel}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
