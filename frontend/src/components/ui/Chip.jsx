/**
 * Chip primitive (BeatScanner SSOT)
 *
 * 4 体合議 round 7 (handover v69 dogfood 2026-05-15 終盤) で導入。
 * 各タブ / 各 section で散在していた inline style chips (Pane2MetaToggle /
 * PeriodChipBar / PortfolioPeriodPerformanceRow / AccountSwitcher /
 * JudgmentList フィルタ・ソート / Insights chips 等) を本コンポーネントに統一する。
 *
 * 設計原則:
 *   - 全 chip は `<Chip>` 経由で描画する (inline style 禁止)
 *   - variant は React props でのみ宣言、style props は受け付けない (escape hatch 禁止)
 *   - 値の SSOT は CSS の `.ds-chip[data-*]` 属性セレクタ (frontend/src/index.css §Chip)
 *   - Aman 級ブランド表現: active は border + text accent 色のみ (背景塗りつぶし最小化、Bootstrap 臭排除)
 *
 * Props:
 *   size: 'xs' | 'sm' (default) | 'md'
 *     xs = 10/14px font, 1px 6px padding   (子セクション内 micro chip)
 *     sm = 11/16px font, 2px 10px padding  (Pane 2 上部 segmented control 標準)
 *     md = 12/18px font, 4px 14px padding  (AccountSwitcher / JudgmentList filter)
 *   variant: 'segmented' (default) | 'filter' | 'display' | 'switcher'
 *     segmented = タブ風選択 (期間 chips、ON/OFF が排他的)
 *     filter    = ON/OFF 選択 (リスト絞り込み、複数 toggle が並ぶ)
 *     display   = status badge (累計入金、vs SPY、実現損益等。クリック不可が default)
 *     switcher  = AccountSwitcher 用 large pill (account 切替に特化)
 *   tone: 'muted' (default) | 'accent' | 'gain' | 'loss' | 'warning'
 *   pressed: boolean (segmented / filter で active 状態)
 *   icon: ReactNode (左側 icon、span でも button でも可)
 *   children: label text
 *   onClick: function (省略 = clickable でない span として描画)
 *   title: hover tooltip 文字列 (display variant で説明文を出す用)
 *   ariaLabel: a11y 用
 *   ariaPressed: 明示指定 (省略時は pressed prop と onClick の有無で auto)
 *   className: 追加 class (極力使わない、必要に応じて margin 等のみ)
 */

const VALID_SIZES = ['xs', 'sm', 'md'];
// 'add' = round 8 (6 体合議): add-action trigger 用 variant。
//   dashed border + Plus icon (children あり=label / なし=icon-only circular)。
//   AccountSwitcher 「+ 口座を追加」 + WatchlistAddButton trigger を同 variant で吸収。
// v153 Round 2-D: 'solid' = tinted card 上で「浮く」 高コントラスト badge (display の border 0.50 が
//   同系色 card に溶ける問題の解、 border/text を全不透明 theme token に)。 index.css §Chip 参照。
const VALID_VARIANTS = ['segmented', 'filter', 'display', 'switcher', 'add', 'solid'];
// handover v79 (2026-05-17、 UI/UX + マーケ subagent verdict): 'elite' tone を新設。
//   gold #d4af37 (ALLOWED-HEX 登録済、 handover v69 保有銘柄ゴールド) で hue 流用。
//   RS percentile ≥ 95 / ≤ 5 等の extreme value で「希少性視認」 を演出 (5 原則 #1 #3 整合)。
//   投資業界色ルール (緑/赤/amber/cyan) と重複しない hue で「別の意味」 を 1 秒識別。
const VALID_TONES = ['muted', 'accent', 'gain', 'loss', 'warning', 'elite'];
// round 9 (6 体合議): rollup / item / action の階層を CSS hook で表現するための data 属性。
// JSX 側で role を宣言 → CSS は `[data-role="rollup"]` で font-weight 強化等。
// Chip prop の意味階層を変えず、ChipGroup.Separator と組合せて「合計 | 個別」を視覚分離。
const VALID_ROLES = ['rollup', 'item', 'action'];

export default function Chip({
  size = 'sm',
  variant = 'segmented',
  tone = 'muted',
  pressed = false,
  role,
  icon = null,
  children,
  onClick,
  title,
  ariaLabel,
  ariaPressed,
  className = '',
  type = 'button',
  ...rest
}) {
  const sz = VALID_SIZES.includes(size) ? size : 'sm';
  const vr = VALID_VARIANTS.includes(variant) ? variant : 'segmented';
  const tn = VALID_TONES.includes(tone) ? tone : 'muted';
  const rl = VALID_ROLES.includes(role) ? role : undefined;
  const isClickable = typeof onClick === 'function';
  const Tag = isClickable ? 'button' : 'span';
  const ariaPressedFinal =
    typeof ariaPressed === 'boolean'
      ? ariaPressed
      : isClickable && (vr === 'segmented' || vr === 'filter' || vr === 'switcher')
      ? pressed
      : undefined;
  // add variant で children が空 (icon-only) のとき circular border に切替えるため data flag。
  const isIconOnly = children == null || children === '';
  return (
    <Tag
      type={isClickable ? type : undefined}
      className={`ds-chip${className ? ' ' + className : ''}`}
      data-size={sz}
      data-variant={vr}
      data-tone={tn}
      data-role={rl}
      data-pressed={pressed ? 'true' : undefined}
      data-icon-only={isIconOnly ? 'true' : undefined}
      aria-pressed={ariaPressedFinal}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      {...rest}
    >
      {icon}
      {!isIconOnly && <span className="ds-chip__label">{children}</span>}
    </Tag>
  );
}

/**
 * ChipGroup — 複数 chips を横並びにする wrapper.
 * prefix label (例:「期間:」) も内包する。
 *
 * Props:
 *   prefix: string (任意) — chip 群の左に出る label
 *   ariaLabel: string (chip 群全体の a11y label)
 *   role: 'group' (default) | 'radiogroup' (segmented 排他選択時推奨)
 *   gap: 'tight' (3px) | 'normal' (default, 4px) | 'loose' (8px)
 */
export function ChipGroup({
  prefix,
  ariaLabel,
  role = 'group',
  gap = 'normal',
  children,
  className = '',
}) {
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={`ds-chip-group${className ? ' ' + className : ''}`}
      data-gap={gap}
    >
      {prefix && <span className="ds-chip-group__prefix">{prefix}</span>}
      {children}
    </div>
  );
}

/**
 * ChipSeparator — round 9 (6 体合議): rollup と個別 item の階層境界を視覚的に分離する hairline.
 *
 * round 10 hotfix: ChipGroup.Separator (compound component pattern) は Vite minify との
 * 相性で side-effect assignment が tree-shake される可能性があり、本番で undefined component
 * となり画面真っ白の原因になった。named export `ChipSeparator` に統一して回避。
 *
 * 使用例:
 *   <Chip role="rollup" pressed>合計</Chip>
 *   <ChipSeparator />
 *   <Chip role="item">デフォルト</Chip>
 *
 * Aman 級「無駄を削ぐ」 + 「意味のある構造表現は保持」原則に従い、1px hairline で控えめに区切る。
 */
export function ChipSeparator() {
  return <span aria-hidden="true" className="ds-chip-group__separator" />;
}
// 互換維持: 既存呼び出し (今 round で書いたばかりだが念のため) は ChipGroup.Separator も使える。
ChipGroup.Separator = ChipSeparator;

/**
 * ChipBar — Pane 上部の grey-bar 領域 (Pane2MetaToggle / PeriodChipBar の wrapper).
 * 共通の padding / background / border-bottom を持つ。
 *
 * Props:
 *   children: ChipGroup の list (1 つでも複数でも可)
 *   stacked: 縦に複数 group を並べる場合 true (default false)
 */
export function ChipBar({ children, stacked = false, className = '' }) {
  return (
    <div
      className={`ds-chip-bar${stacked ? ' is-stacked' : ''}${className ? ' ' + className : ''}`}
    >
      {children}
    </div>
  );
}
