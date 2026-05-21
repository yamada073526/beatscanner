import React, { useState, useEffect, useRef } from 'react';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';
import ConditionRow from './ConditionRow.jsx';
import FiveConditionsOverviewModal from './FiveConditionsOverviewModal.jsx';
import { useWorkspaceStore } from '../../../../state/workspaceStore.js';
import { BarChart3 } from 'lucide-react';
// Sprint 4 (Phase 2): 案1 section in-view fade-in
import SectionFade from '../../primitives/SectionFade.jsx';

/**
 * FiveConditionsCard — VerdictDetail と ConditionGrid を統合した unified card (PR-2)
 *
 * 6 体合議 (2026-05-12) 結論:
 *  - 旧: VerdictDetail (5 条件 summary) + ConditionGrid (5 条件詳細 card 群) の二重表示
 *  - 新: 1 つの card 内に 5 つの ConditionRow、Linear 流「同時に 1 つだけ展開」accordion
 *
 * 5 原則「2 秒判定」「1 クリック減」「シンプルかつリッチ」を同時に満たす。
 * narrow pane (300-500px) で summary/詳細の二重表示を統合、scroll 量を半減。
 *
 * @param {object} props
 * @param {Array} props.conditions
 * @param {number} props.passedCount
 * @param {number} props.totalCount
 * @param {boolean} props.isPro
 * @param {() => void} props.onUpgrade
 */
/**
 * Sprint 5: condition click → collapsed AccordionSection 自動展開 + smooth scroll。
 * feedback_condition_pulse_pattern.md 流儀に従い、static dictionary で mapping を定義。
 * 0-indexed: idx=3 → 条件 4 (CC コール / アナリスト視点) → 'analyst-panel'
 * LLM 不変、静的 dictionary のみ (Hallucination Guard 4 重防御 §4 該当外)。
 */
const CONDITION_SECTION_MAP = {
  0: null, // 条件 1: EarningsHistoryChart expanded → pulse のみ
  1: null, // 条件 2: EarningsHistoryChart expanded → pulse のみ
  2: null, // 条件 3: EarningsHistoryChart expanded → pulse のみ
  3: 'analyst-panel', // 条件 4 (CC コール): AnalystPanel collapsed → 自動展開
  4: null, // 条件 5: GuidanceCard expanded → pulse のみ
};

export default function FiveConditionsCard({
  conditions = [],
  passedCount,
  totalCount,
  isPro = true,
  onUpgrade,
  onConditionPulse,
}) {
  // null = どれも展開されていない (default)
  // index = その index のみ展開 (Linear 流「同時に 1 つだけ」)
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [showOverview, setShowOverview] = useState(false);

  // Sprint 3 (Phase 2): Tier M halo sweep — IntersectionObserver で 1 回限り発火。
  // data-halo-fired 属性で記録し、再 mount でも 2 回目は発火しない。
  // glow_elevation_postmortem.md §v62: is-arriving は useArrivalSpotlight 一元。
  // 本 hook は halo sweep (CSS animation) の trigger のみ担当。
  // feedback_pge_loop_pitfalls.md §4: infinite animation 禁止。
  // prefers-reduced-motion: CSS @media で animation を無効化 (index.css 側)。
  const cardRef = useRef(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    // prefers-reduced-motion: halo sweep を skip
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    // 既に発火済みなら skip (ページ内で再 mount されても 2 回目は発火しない)
    if (el.dataset.haloFired === '1') return;

    // hotfix (Sprint 3 evaluator 指摘): timer を useEffect scope に hoist して
    // cleanup で確実に clearTimeout (IO callback 内 return は cleanup として機能しない)
    let timer = null;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) return;

        // 発火済み flag を先に立てる (animation finish() 後に data-halo-fired に移す)
        if (el.dataset.haloFired === '1') return;

        // once: 1 回だけ発火
        io.disconnect();

        // data-halo-ready を付与 → CSS の [data-halo-ready="1"]::after が animation 開始
        el.dataset.haloReady = '1';

        // animation 終了後に ::after を非表示に (2 回目抑制)
        const HALO_DURATION_MS = 620; // CSS var(--motion-stage) 600ms + buffer 20ms
        timer = setTimeout(() => {
          el.removeAttribute('data-halo-ready');
          el.dataset.haloFired = '1';
        }, HALO_DURATION_MS);
      },
      {
        rootMargin: '-10% 0px -10% 0px', // 上下 10% 入ったときに発火 (画面中央近くで点灯)
        threshold: 0.15, // 15% 以上可視になったら発火
      }
    );

    io.observe(el);

    // useEffect cleanup: unmount 時に IO disconnect + 残 timer clearTimeout
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };

    return () => {
      io.disconnect();
    };
  }, []); // mount 時 once 実行

  // Sprint 5: condition 4 click → AnalystPanel 自動展開 + smooth scroll
  const expandSection = useWorkspaceStore((s) => s.expandSection);

  // 他セクション (GuidanceCard 等) と統一: タイトル横の cyan ? chip (3 体合議 2026-05-12)
  // user 元提案 + UI/UX 推奨案 1 で converge、整合性最優先
  const titleWithHelp = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2, 8px)' }}>
      ファンダメンタル 5 条件
      <button
        type="button"
        onClick={() => setShowOverview(true)}
        style={{
          display: 'inline-flex',
          width: 16,
          height: 16,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          fontSize: 9,
          fontWeight: 700,
          background: 'rgba(34, 211, 238, 0.15)',
          color: 'rgb(56, 189, 248)',
          border: '1px solid rgba(34, 211, 238, 0.4)',
          cursor: 'pointer',
          transition: 'background var(--motion-fast) ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34, 211, 238, 0.30)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34, 211, 238, 0.15)'; }}
        aria-label="ファンダメンタル 5 条件の評価ロジックを表示"
      >
        ？
      </button>
    </span>
  );

  return (
    // Sprint 3: tier-m-glow wrapper — halo sweep の IO observe 対象。
    // Card の forwardRef 非対応のため、Card を囲む div に ref + tier-m-glow を付与。
    // contain: paint 禁止 (glow_elevation_postmortem.md v54)。
    // overflow: visible で halo が clip されない (index.css .tier-m-glow で設定済)。
    // Sprint 4: SectionFade で section in-view fade-in (案1) を outer wrapper に適用
    // Phase 3 #6: SectionFade の style prop 経由で viewTransitionName を付与。
    // SectionFade は修正不要 (既存 style prop サポート済)。Recharts/chart 系に触れない。
    <SectionFade style={{ viewTransitionName: 'pane3-five-conditions' }}>
    <div ref={cardRef} className="tier-m-glow" data-testid="five-conditions-card-wrapper">
    <Card data-testid="five-conditions-card">
      <div style={{ padding: 'var(--space-6, 24px)' }}>
        <SectionHeader
          id="judgment-conditions"
          icon={<BarChart3 size={18} strokeWidth={1.5} />}
          title={titleWithHelp}
          label={
            passedCount != null && totalCount != null
              ? `${passedCount}/${totalCount} 合致`
              : null
          }
        />
        {conditions.length === 0 ? (
          // P0-3: skeleton placeholder — 5 行のフレームを表示してページ open 時から枠を見せる。
          // prefers-reduced-motion 対応: animation は CSS で制御。
          <ul
            aria-label="分析中の 5 条件"
            style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-2, 8px)' }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <li
                key={n}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3, 12px)',
                  padding: 'var(--space-3, 12px) 0',
                  borderTop: n === 1 ? 'none' : '1px solid var(--border)',
                  opacity: 0.5,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    color: 'var(--text-muted)',
                  }}
                >
                  {n}
                </span>
                <span
                  style={{
                    flex: 1,
                    height: 12,
                    borderRadius: 4,
                    background: 'var(--bg-subtle)',
                    // 5 条件の実コンテンツ可変感: 60-85% で randomize (Vision eval 改善提案 #3)
                    maxWidth: `${[78, 65, 82, 60, 72][n - 1]}%`,
                  }}
                  className="ds-skeleton-bar"
                />
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>分析中...</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 'var(--space-2, 8px)',
            }}
          >
            {conditions.map((c, i) => (
              <ConditionRow
                key={i}
                index={i + 1}
                condition={c}
                expanded={expandedIndex === i}
                onToggle={() =>
                  setExpandedIndex((prev) => (prev === i ? null : i))
                }
                isPro={isPro}
                onUpgrade={onUpgrade}
                onConditionPulse={(idx) => {
                  // Sprint 5: static dictionary で対応 AccordionSection を自動展開 + smooth scroll。
                  // feedback_condition_pulse_pattern.md 流儀: LLM 不変、静的 mapping のみ。
                  const targetSectionId = CONDITION_SECTION_MAP[idx] ?? null;
                  if (targetSectionId) {
                    expandSection(targetSectionId);
                    // 80ms 後に smooth scroll (expand state が React re-render されるのを待つ)。
                    // AccordionSection の DOM id 構造: id prop="sec-analyst" → headerId="acc-header-sec-analyst"。
                    // 'analyst-panel' → AccordionSection id="sec-analyst" の mapping。
                    const SECTION_ID_MAP = {
                      'analyst-panel': 'sec-analyst',
                    };
                    const domId = SECTION_ID_MAP[targetSectionId] || `sec-${targetSectionId}`;
                    setTimeout(() => {
                      try {
                        // header button を scroll target に (開いた section の先頭が viewport に来る)
                        const headerEl = document.getElementById(`acc-header-${domId}`);
                        if (headerEl) {
                          headerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      } catch {
                        // scroll 失敗は silent
                      }
                    }, 80);
                  }
                  // 既存 pulse callback (DiagramCard 連動) は必ず呼ぶ
                  if (typeof onConditionPulse === 'function') {
                    onConditionPulse(idx);
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>
      {showOverview && (
        <FiveConditionsOverviewModal onClose={() => setShowOverview(false)} />
      )}
    </Card>
    </div>
    </SectionFade>
  );
}
