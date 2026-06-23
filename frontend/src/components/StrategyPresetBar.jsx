/**
 * StrategyPresetBar — 戦略プリセット bar (screener_v2 フラグ裏・MVP)
 *
 * 設計規律:
 *   - Chip(variant="segmented") + ChipGroup を使用 (自前 div 禁止)
 *   - 色は semantic CSS 変数のみ (生 hex 禁止)
 *   - 余白は gap-N (space-y-N/space-x-N 禁止)
 *   - shadow/glow/panel-card/bs-panel/surface-card 系 class 追加禁止
 *
 * Props:
 *   active    — 選択中の preset key ('earnings_pass' | 'new_high_break' | null)
 *   onSelect  — (presetKey: string | null) => void
 *               同じ key を再クリックで null (解除)
 */
import Chip, { ChipGroup } from './ui/Chip.jsx';

/** プリセット定義 (SSOT: ここだけ) */
export const STRATEGY_PRESETS = [
  {
    key: 'earnings_pass',
    label: '決算合格',
    title: '直近決算で絶対6条件（ファンダ5条件＋キャッシュ創出力）を満たす銘柄',
  },
  {
    key: 'new_high_break',
    label: '新高値ブレイク',
    title: '52週高値を更新し、買い場圏 (pivot ≤+5%) にある銘柄',
  },
];

export default function StrategyPresetBar({ active = null, onSelect }) {
  return (
    <div
      className="screener-strategy-bar"
      data-testid="screener-strategy-bar"
    >
      <ChipGroup
        ariaLabel="戦略プリセット"
        role="radiogroup"
        gap="normal"
      >
        {STRATEGY_PRESETS.map(({ key, label, title }) => (
          <Chip
            key={key}
            variant="segmented"
            size="sm"
            pressed={active === key}
            ariaPressed={active === key}
            title={title}
            onClick={() => onSelect?.(active === key ? null : key)}
            data-testid={`screener-strategy-${key}`}
          >
            {label}
          </Chip>
        ))}
      </ChipGroup>
    </div>
  );
}
