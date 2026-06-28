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
 *   isPremiumUser — Premium 判定 (default true)。false かつ tier==='prem' の preset は
 *               件数を出さず 🔒 表示にする (SPEC_2026-06-25 §4.2.2: 非 Premium に
 *               「0 銘柄」を見せない Trust Cliff 対応。masked universe で 0 と出る誤読を防ぐ)。
 */
import { BadgeCheck, TrendingUp, LayoutGrid, Crown, Moon, Lock } from 'lucide-react';

// カードはプラン昇順 (Free→Pro→Premium) で並べ「重要度＝上位プランほど右」を視覚化 (user 確定 2026-06-28)。
//   STRATEGY_PRESETS の物理順 (= 件数算出 / 他 consumer の SSOT) は不変のまま、表示時にのみ並べ替える
//   (mockup screener-quiet-quality-v1.html renderPresets の TIER_ORDER と同方式)。Array.sort は安定なので
//   同 tier 内は配列の定義順を保つ。
const TIER_ORDER = { free: 0, pro: 1, prem: 2 };

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
  {
    // 逆張り「静かな強さ」(SPEC_2026-06-28 §10 Sprint3)。RS(相対力)は上位なのに出来高が静かで機関の殺到もない、
    //   まだ人気化していない利益の質が高い銘柄を 1 クリックで一覧化。tier=Premium (競合に同機能なしの差別化・
    //   中核 facet は free だが 1 クリック curation + 較正閾値を Premium gate。新高値ブレイクと同じ freemium)。
    //   §38: desc は「人気化前」(状態描写) に留め「お宝/割安/上がる」断定を避ける。
    key: 'quiet_quality',
    label: '静かな強さ',
    title: 'RS（相対力）は上位なのに出来高が静か・機関も未殺到で、まだ人気化していない利益の質が高い銘柄',
    desc: 'RSは強いのに出来高が静か（人気化前）・利益の質も高い銘柄',
    Icon: Moon,
    tier: 'prem',
    tierLabel: 'Premium',
  },
];

export default function StrategyPresetBar({ active = null, onSelect, counts = {}, isPremiumUser = true }) {
  return (
    <div
      className="screener-strategy-bar"
      data-testid="screener-strategy-bar"
      role="radiogroup"
      aria-label="戦略プリセット"
    >
      {[...STRATEGY_PRESETS]
        .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])
        .map(({ key, label, title, desc, Icon, tier, tierLabel }) => {
        const isSelected = active === key;
        const count = counts[key];
        // SPEC_2026-06-25 §4.2.2: Premium 限定 preset を非 Premium が見る場合、masked universe で
        //   count=0 になり「0 銘柄＝価値ゼロ」と誤読される (Trust Cliff・訴求毀損)。0 を出さず 🔒 表示。
        const isLocked = tier === 'prem' && !isPremiumUser;
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

            {/* foot: 件数 (Premium ロック時は 🔒) + tier badge */}
            <div className="screener-strategy-tile__foot">
              {isLocked ? (
                <span
                  className="screener-strategy-tile__count screener-strategy-tile__count--locked"
                  aria-label="Premium 限定"
                >
                  <Lock size={13} strokeWidth={2} aria-hidden="true" /> Premium 限定
                </span>
              ) : (
                <span className="screener-strategy-tile__count">
                  <b>{count != null ? count : '–'}</b> 銘柄
                </span>
              )}
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
