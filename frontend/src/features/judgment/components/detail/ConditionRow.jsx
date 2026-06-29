import { useState } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Info } from 'lucide-react';
import Sparkline from '../../../../components/Sparkline.jsx';
import ConditionSparkline from './ConditionSparkline.jsx';
import {
  DeltaRow,
  CONDITION_DETAILS,
  ConditionModal,
  compactDetail,
} from '../../../../components/ConditionCard.jsx';
// v100 (handover §100点 multi-review UI/UX verdict C):
// 5 条件 value に count-up animation を適用、 motion 軸 +5-8pt 期待。
// Bloomberg / Robinhood idiom = 数値が 0 → target へ 600ms ease-out で count-up。
import { useCountUp } from '../../../../hooks/useCountUp.js';

/**
 * ConditionRow — 5 条件統合 row primitive (PR-2、§-1-B 撤回後の正攻法 redesign)
 *
 * collapsed: PASS/FAIL バッジ + 条件名 + 値 (旧 VerdictDetail 相当)
 * expanded: 上記 + detail テキスト + Sparkline + DeltaRow + ? モーダル (旧 ConditionCard 相当)
 *
 * 6 体合議推奨 (2026-05-12): Linear Issue Detail / Notion property 流の expandable row
 * narrow pane (300-500px) で summary/詳細の二重表示を統合、5 原則「1 クリック減」順守
 *
 * @param {object} props
 * @param {number} props.index - 1..5
 * @param {object} props.condition - { name, passed, value, detail, series, threshold, label }
 * @param {boolean} props.expanded
 * @param {() => void} props.onToggle
 * @param {boolean} props.isPro
 * @param {() => void} props.onUpgrade
 * @param {(idx: number) => void} [props.onConditionPulse] - handover v82 Phase 5.5:
 *   onClick で onToggle と並行 trigger、 DiagramCard 該当条件 + step を pulse highlight。
 *   index は 1-based なので 0-based に変換して渡す (mapping は 0-indexed)。
 */
export default function ConditionRow({
  index,
  condition,
  expanded,
  onToggle,
  isPro = true,
  onUpgrade,
  onConditionPulse,
}) {
  const [showModal, setShowModal] = useState(false);
  // 2026-06-28 dogfood: row hover (tint 強化 / translateY lift / chevron scale) は「違和感」 と feedback、撤去。
  // 2026-06-29 Sprint 2b: clickable affordance を取り戻すため calm hover を再導入 — bg tint を僅かに濃くし
  // border を僅かに強める「のみ」 (lift / glow / chevron scale は #104 で除去済、再導入しない)。
  // 判定サマリー bucket/mini (#110) の控えめ hover と一貫させる狙いだが、行は既に PASS/FAIL の色 tint を
  // 持つため neutral var(--bg-hover) で塗り潰さず、同色の alpha を上げて色アイデンティティを保つ。
  // useState で hover を管理 (useCountUp の再レンダー中に inline style 直接変更だと resting に戻る罠を回避)。
  const [rowHover, setRowHover] = useState(false);
  const reduce = useReducedMotion();
  const passed = condition.passed;
  const detailContent = CONDITION_DETAILS[index];
  // 未充足は「下落/ネガティブ」 でなく「中立」 (CLAUDE.md 投資業界色ルール): PASS は緑、 FAIL は赤でなく
  // neutral (mockup pane3-detail-v1.html .mk-no 準拠)。 ★じっちゃま逆張り銘柄 (NVDA 等) の「成長中だが
  // 閾値未達」 を赤で「悪い銘柄」 と誤認させる Trust Cliff を防ぐ。
  const valueColor = passed ? 'var(--color-gain)' : 'var(--text-secondary)';
  // v100: count-up animation を value に適用。 string value (backend 整形済 "12.3%" 等) は数値抽出不能なので
  // raw value のみ animate (typeof === 'number')、 string は instant 表示 fallback。
  const numericRawValue = typeof condition.value === 'number' ? condition.value : null;
  const animatedValue = useCountUp(numericRawValue, { duration: 600, digits: 2 });
  // useCountUp は string value 時 numericRawValue=null で animation skip、 display は元 string 維持。
  const displayValue = typeof condition.value === 'number' ? animatedValue : condition.value;
  // Sparkline (Recharts SVG stroke) には CSS var を文字列で渡す。
  // 既存 ConditionCard の raw hex は ALLOWED-HEX で grandfather 済、
  // 新規追加は design-system-check で block されるため CSS var 経由。
  const sparkColor = passed ? 'var(--color-gain)' : 'var(--text-muted)';
  const bgPass = 'rgba(52, 239, 129, 0.06)';
  // FAIL (未充足) は赤でなく neutral slate — 未充足は「中立」 であって「下落」 ではない (CLAUDE.md 投資業界色ルール)。
  const bgFail = 'rgba(148, 163, 184, 0.06)';
  const borderPass = 'rgba(52, 239, 129, 0.20)';
  const borderFail = 'rgba(148, 163, 184, 0.20)';
  // Sprint 2b calm hover: resting の同色を僅かに濃く (alpha 0.06→0.10 / border 0.20→0.32)。控えめに留める。
  const bgPassHover = 'rgba(52, 239, 129, 0.10)';
  const bgFailHover = 'rgba(148, 163, 184, 0.10)';
  const borderPassHover = 'rgba(52, 239, 129, 0.32)';
  const borderFailHover = 'rgba(148, 163, 184, 0.32)';

  return (
    <li
      data-testid={`condition-row-${index - 1}`}
      onMouseEnter={() => setRowHover(true)}
      onMouseLeave={() => setRowHover(false)}
      style={{
        listStyle: 'none',
        // Sprint 2b: calm hover で bg tint + border を僅かに強める「のみ」 (lift / glow / chevron scale なし)。
        background: rowHover ? (passed ? bgPassHover : bgFailHover) : passed ? bgPass : bgFail,
        border: '1px solid',
        borderColor: rowHover
          ? passed
            ? borderPassHover
            : borderFailHover
          : passed
            ? borderPass
            : borderFail,
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        transition: reduce ? 'none' : 'background-color 0.15s ease, border-color 0.15s ease',
      }}
    >
      {/* ── Summary row (always visible) ────────────────────────────── */}
      {/* v202 (2026-06-11 user feedback): タイトル横に「？」チップを置き、カードを展開せず
          個別条件モーダルを開けるようにする。<button> 入れ子 (invalid HTML + a11y) を避けるため、
          行全体のトグルは絶対配置の透明 button (inset:0、背面) とし、content grid を pointer-events:none
          で被せる (クリックは背面トグルへ透過)。「？」 だけ pointer-events:auto + stopPropagation。 */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => {
            onToggle();
            // handover v82 Phase 5.5: DiagramCard 該当条件 + step を pulse highlight。
            // index は 1-based、 mapping は 0-indexed なので変換。
            if (typeof onConditionPulse === 'function') {
              onConditionPulse(index - 1);
            }
          }}
          title="※ 図解との関連を示すものであり、 因果関係を保証しません"
          aria-expanded={expanded}
          aria-controls={`condition-detail-${index}`}
          aria-label={`${condition.label || condition.name || `条件 ${index}`} ${passed ? 'PASS' : 'FAIL'} — クリックで詳細を${expanded ? '閉じる' : '展開'}`}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            margin: 0,
          }}
        />
        <div
          style={{
            position: 'relative',
            pointerEvents: 'none',
            width: '100%',
            display: 'grid',
            // v86 R3: 数値カラムを固定幅 80px に変更 (auto → 80px)、 行をまたいだ縦の桁揃えを担保
            // Sprint 1: ミニスパークライン カラム (96px) を追加 → 5 カラム構成
            // Sprint B: ConditionSparkline が sparkline + trend chip を flex row で内包するため
            //           sparkline 列を 96px → auto に変更 (chip 幅分を自然に収容)。
            //           overflow 防止のため列に minmax(96px, auto) を使用。
            gridTemplateColumns: '24px 1fr 80px minmax(96px, auto) 16px',
            alignItems: 'center',
            gap: 'var(--space-3, 12px)',
            padding: 'var(--space-3, 12px) var(--space-3, 12px)',
            textAlign: 'left',
            color: 'inherit',
          }}
        >
        <span
          aria-label={passed ? 'PASS' : 'FAIL'}
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            // PASS = 充足 (solid green badge)。 FAIL = 未充足 → mockup .mk-no 準拠の neutral grey tint + 「—」。
            // 赤 (下落/ネガティブ) で「悪い銘柄」 と誤認させない (Trust Cliff 回避)。
            background: passed ? 'var(--color-gain)' : 'rgba(148, 163, 184, 0.12)',
            color: passed ? 'var(--bg-card)' : 'var(--text-muted)',
          }}
        >
          {passed ? '✓' : '—'}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-primary)',
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}
            >
              {condition.label || condition.name || `条件 ${index}`}
            </span>
            {/* v202.1 (user feedback 2026-06-12「行の？が section 見出しの？と同形で階層が並列に見える」):
                行レベルは lucide ⓘ muted ghost に降格 — cyan「？」=セクション全体解説 (タイトル横) /
                灰 ⓘ=個別条件解説 (行) の記号差で階層を表現。hover で cyan に立ち上がる (Aman「主張せず
                必要な時だけ存在感」、旧 R5 展開内 ⓘ と同 idiom)。展開不要でモーダルが開く機能は維持。
                content grid は pointer-events:none のため、この button だけ auto に戻す + stopPropagation。 */}
            {detailContent && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
                style={{
                  pointerEvents: 'auto',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  padding: 3,
                  color: 'var(--text-muted)',
                  opacity: 0.6,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-pill, 9999px)',
                  cursor: 'pointer',
                  transition: 'opacity var(--motion-fast) ease, color var(--motion-fast) ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                aria-label={`${condition.name || `条件 ${index}`}の詳しい解説を表示`}
                aria-haspopup="dialog"
                title="この条件の詳しい解説を見る"
              >
                <Info size={13} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
          {condition.threshold && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-muted)',
                marginTop: 2,
              }}
            >
              閾値: {condition.threshold}
            </div>
          )}
        </div>
        {condition.value != null && (() => {
          // v86 R2 Vision 改善提案 #3: 数値と補助単位を 2 層階層に分離。
          //  - 数値: fw700 / tabular-nums / text-align:right
          //  - 単位 (B / M / %): 0.75em の補助 tier、 色も text-muted で控えめに。
          // v100 (handover §100点 UI/UX verdict C): displayValue で count-up animation 適用。
          const parts = formatValueParts(displayValue);
          return (
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                lineHeight: 1.05,
                color: valueColor,
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
                whiteSpace: 'nowrap',
              }}
            >
              {parts.num}
              {parts.unit && (
                <span
                  style={{
                    fontSize: '0.75em',
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    marginLeft: 2,
                  }}
                >
                  {parts.unit}
                </span>
              )}
            </div>
          );
        })()}
        {/* Sprint 1: per-condition ミニスパークライン (collapsed 状態でも常時表示)
            SPEC §5 Sprint 1: width 96px / height 32px / neutral slate baseline + PASS/FAIL dot
            data 不在時は ConditionSparkline 内部で null return → placeholder div で幅を確保 */}
        <ConditionSparkline
          series={condition.series}
          passed={passed}
          conditionIndex={index - 1}
          conditionName={condition.label || condition.name}
        />

        <span
          aria-hidden="true"
          style={{
            // chevron: default 12px muted、 expanded 中は rotate 90° + primary。 hover 演出は撤去 (2026-06-28 dogfood)。
            fontSize: 12,
            color: expanded ? 'var(--text-primary)' : 'var(--text-muted)',
            transition: 'transform var(--motion-fast) var(--ease-out-cubic), color var(--motion-fast) ease',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            display: 'inline-block',
            lineHeight: 1,
            fontWeight: 700,
          }}
        >
          ▸
        </span>
        </div>
      </div>

      {/* ── Detail (expandable, height spring animation) ─────────────── */}
      {/* v202 (2026-06-11 user feedback): 旧・即時 mount/unmount → AnimatePresence + m.div で
          height 0↔auto を spring animate。AccordionSection と同 idiom (overflow:hidden で children を
          clip、residual なし)。reduce で duration 0。MotionProvider (LazyMotion+domAnimation) 配下のため m 安全。 */}
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            id={`condition-detail-${index}`}
            key={`condition-detail-${index}`}
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 32 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                padding: 'var(--space-1, 4px) var(--space-3, 12px) var(--space-3, 12px) 44px',
                display: 'grid',
                gap: 'var(--space-3, 12px)',
                borderTop: '1px solid rgba(148, 163, 184, 0.12)',
              }}
            >
              {/* 3 期 detail テキスト */}
              {condition.detail && (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.5,
                  }}
                >
                  {compactDetail(condition.detail)}
                </div>
              )}

              {/* Sparkline */}
              {Array.isArray(condition.series) && condition.series.some((v) => v != null) && (
                <div style={{ height: 56, minHeight: 56 }}>
                  <Sparkline data={condition.series} color={sparkColor} />
                </div>
              )}

              {/* DeltaRow (前期比) — Pro lock 内蔵 */}
              <DeltaRow
                index={index}
                series={condition.series}
                isPro={isPro}
                onUpgradeClick={onUpgrade}
              />

              {/* v202: 個別条件の解説モーダルは title 横「？」 チップに統合 (展開不要で開ける)。
                  旧・展開内 ⓘ ボタンは撤去 (同一 ConditionModal を二重 trigger していたため)。 */}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {showModal && detailContent && (
        <ConditionModal detail={detailContent} onClose={() => setShowModal(false)} />
      )}
    </li>
  );
}

// v86 R2 Vision 改善提案 #3: 数値と補助単位 (B/M/%) を 2 層階層に分離。
// 戻り値: { num: string, unit: string|null }
function formatValueParts(v) {
  if (v == null) return { num: '—', unit: null };
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1e9) return { num: (v / 1e9).toFixed(1), unit: 'B' };
    if (Math.abs(v) >= 1e6) return { num: (v / 1e6).toFixed(1), unit: 'M' };
    if (Math.abs(v) >= 100) return { num: v.toFixed(0), unit: null };
    return { num: v.toFixed(2), unit: null };
  }
  // string 受け取り: backend 整形済の "12.3%" 等から数値部と単位を分離。
  const s = String(v);
  const m = s.match(/^([\-+]?[\d.,]+)\s*([%a-zA-Z]+)$/);
  if (m) return { num: m[1], unit: m[2] };
  return { num: s, unit: null };
}
