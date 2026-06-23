/**
 * StrategyPresetBar — 戦略プリセット bar (screener_v2 フラグ裏・MVP)
 *
 * 設計規律:
 *   - mockup v8 承認済デザインに忠実な角丸タイル UI
 *   - 色は semantic CSS 変数のみ (生 hex 禁止)
 *   - 余白は gap-N (space-y-N/space-x-N 禁止)
 *   - shadow/glow/panel-card/bs-panel/surface-card 系 class 追加禁止
 *   - アイコン発光は filter: drop-shadow (SVG filter・低リスク) のみ
 *   - box-shadow は var(--shadow-*) token のみ
 *
 * Props:
 *   active    — 選択中の preset key ('earnings_pass' | 'new_high_break' | null)
 *   onSelect  — (presetKey: string | null) => void
 *               同じ key を再クリックで null (解除)
 */
import { BadgeCheck, TrendingUp } from 'lucide-react';

/** プリセット定義 (SSOT: ここだけ) */
export const STRATEGY_PRESETS = [
  {
    key: 'earnings_pass',
    label: '決算合格',
    title: '直近決算で絶対6条件（ファンダ5条件＋キャッシュ創出力）を満たす銘柄',
    desc: '直近の決算シーズンで絶対6条件をすべて満たした銘柄',
    Icon: BadgeCheck,
  },
  {
    key: 'new_high_break',
    label: '新高値ブレイク',
    title: '52週高値を更新し、買い場圏 (pivot ≤+5%) にある銘柄',
    desc: '52週高値を更新し、買い場圏（節目+5%以内）にある銘柄',
    Icon: TrendingUp,
  },
];

export default function StrategyPresetBar({ active = null, onSelect }) {
  return (
    <div
      className="screener-strategy-bar"
      data-testid="screener-strategy-bar"
      role="radiogroup"
      aria-label="戦略プリセット"
    >
      {STRATEGY_PRESETS.map(({ key, label, title, desc, Icon }) => {
        const isSelected = active === key;
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
            <span className="screener-strategy-tile__icon">
              <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <span className="screener-strategy-tile__body">
              <span className="screener-strategy-tile__label">{label}</span>
              <span className="screener-strategy-tile__desc">{desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
