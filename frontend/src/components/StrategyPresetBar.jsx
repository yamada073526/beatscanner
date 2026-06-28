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
import { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, TrendingUp, LayoutGrid, Crown, Moon, Sunrise, Lock } from 'lucide-react';

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
  {
    // 市場をリードし始めた銘柄 (SPEC_2026-06-28 market_leading)。個別の相対力が市場(SPY)を上回り始めた中位帯の
    //   銘柄を 1 クリックで一覧化。tier=Premium だが countFree=true (件数 Free / 詳細 Premium の freemium 分割・
    //   user 決定③)。件数は masked facet 非依存 (rs/vs_spy/ocf/roe/eps/beat は全 free) で free でも真値が出るため
    //   isLocked 除外で件数を見せ集客フックにする (詳細=銘柄リストは CustomScreenerPanel が Premium gate)。
    //   §38: title/desc は「相対力が市場を上回り始めた / 直近決算ビート」(観測事実) のみ・将来上昇の断定なし・緑不使用。
    key: 'market_leading',
    label: '市場をリードし始めた銘柄',
    title: '相対力が市場（SPY）を上回り始めた中位帯の銘柄。直近決算ビートで、キャッシュ創出力と利益成長の質を伴う。',
    desc: '相対力が市場（SPY）を上回り始めた、直近決算ビートの銘柄',
    Icon: Sunrise,
    tier: 'prem',
    tierLabel: 'Premium',
    countFree: true, // 件数 Free (集客フック)。tier=prem でも件数を隠さない (masked 非依存で真値)。
  },
];

export default function StrategyPresetBar({ active = null, onSelect, counts = {}, isPremiumUser = true }) {
  // S4: カードは名前のみ表示 (desc 撤廃)。説明 (title 全文) は branded tooltip で hover/focus 時に提示。
  //   feedback_tooltip_portal_pattern: createPortal + position:fixed + getBoundingClientRect で
  //   親の overflow/transform を escape。native title 属性は二重表示回避のため除去 (button から外す)。
  //   モバイル/タッチはカード選択で seasonchip + 条件一覧に内容が出る。grid を壊さないよう trigger は
  //   button 直付け・tip state は bar に lift・portal は document.body へ 1 個だけ描画 (wrap span なし)。
  //   方向は below 固定で全カード統一 (上段=下/下段=上 のバラつき解消)。
  //   ※ 各 preset の desc フィールドは短文メタとして保持 (現 UI は未描画・将来モバイル条件1行等に再利用余地)。
  const [tip, setTip] = useState(null); // null=非表示 | { content, left, top, placement }
  const tipRef = useRef(null);
  // 描画後に幅を測り viewport 左右はみ出しを内側へ補正 (右端カードの右切れ対策)。
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const tr = tipRef.current.getBoundingClientRect();
    const m = 8;
    let dx = 0;
    if (tr.right > window.innerWidth - m) dx = (window.innerWidth - m) - tr.right;
    if (tr.left + dx < m) dx = m - tr.left;
    if (dx) tipRef.current.style.left = `${tip.left + dx}px`;
  }, [tip]);
  const openTip = (el, content) => {
    if (!el || !content) return;
    const r = el.getBoundingClientRect();
    // 方向は below 固定で全カード統一 (上段=下/下段=上 のバラつき解消・user 指摘)。
    //   下に ~130px 未満しか無い時のみ above にフォールバック (viewport 端のクリップ回避)。
    const placement = (window.innerHeight - r.bottom) < 130 ? 'above' : 'below';
    setTip({
      content,
      left: Math.round(r.left + r.width / 2),
      top: Math.round(placement === 'above' ? r.top - 8 : r.bottom + 8),
      placement,
    });
  };
  const closeTip = () => setTip(null);

  return (
    <div
      className="screener-strategy-bar"
      data-testid="screener-strategy-bar"
      role="radiogroup"
      aria-label="戦略プリセット"
    >
      {[...STRATEGY_PRESETS]
        .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])
        .map(({ key, label, title, Icon, tier, tierLabel, countFree }) => {
        const isSelected = active === key;
        const count = counts[key];
        // SPEC_2026-06-25 §4.2.2: Premium 限定 preset を非 Premium が見る場合、masked universe で
        //   count=0 になり「0 銘柄＝価値ゼロ」と誤読される (Trust Cliff・訴求毀損)。0 を出さず 🔒 表示。
        // S4 market_leading: countFree=true は件数が masked facet 非依存で free でも真値が出る (件数 Free の集客
        //   フック)。詳細=銘柄リストのみ Premium gate (CustomScreenerPanel) のため、tile 件数は隠さない。
        const isLocked = tier === 'prem' && !isPremiumUser && !countFree;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            data-testid={`screener-strategy-${key}`}
            className={`screener-strategy-tile${isSelected ? ' is-selected' : ''}`}
            onClick={() => onSelect?.(isSelected ? null : key)}
            onMouseEnter={(e) => openTip(e.currentTarget, title)}
            onMouseLeave={closeTip}
            onFocus={(e) => openTip(e.currentTarget, title)}
            onBlur={closeTip}
          >
            {/* S4 compact (2026-06-28): icon を左、右に body (label / foot) を縦積みする横レイアウト。
                desc は撤廃しカード高を最小化 (説明は hover tooltip)。6 枚 3×2 で下半分の結果領域を拡張 (user 要望)。 */}
            <span className="screener-strategy-tile__icon">
              <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <div className="screener-strategy-tile__body">
              {/* S4 (desc 撤廃): カードは名前 + 件数 + tier のみ (原則1「極力読ませない」・最コンパクト)。
                  説明文 (desc/title) は hover/focus の branded tooltip に一本化 (ミスマッチ解消)。 */}
              <span className="screener-strategy-tile__label">{label}</span>
              {/* foot: 件数 (Premium ロック時は 🔒) + tier badge */}
              <div className="screener-strategy-tile__foot">
                {isLocked ? (
                  <span
                    className="screener-strategy-tile__count screener-strategy-tile__count--locked"
                    aria-label="Premium 限定"
                  >
                    <Lock size={12} strokeWidth={2} aria-hidden="true" /> Premium 限定
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
            </div>
          </button>
        );
      })}
      {/* S4: desc 全文 (title) の branded tooltip。portal + position:fixed で grid/overflow を escape。
          hover/focus で表示・viewport 端は useLayoutEffect で補正。1 個だけ描画 (active card 用)。 */}
      {tip && createPortal(
        <span
          ref={tipRef}
          role="tooltip"
          className="screener-strategy-tip"
          style={{
            position: 'fixed',
            left: tip.left,
            top: tip.top,
            transform: tip.placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          }}
        >
          {tip.content}
        </span>,
        document.body
      )}
    </div>
  );
}
