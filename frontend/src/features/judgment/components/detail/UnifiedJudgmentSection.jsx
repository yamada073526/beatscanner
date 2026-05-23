/**
 * UnifiedJudgmentSection — Phase G Phase 1 (handover v98 §0-B)
 *
 * 4 components (Hero + SummaryBrief + KpiStrip + TriageBanner + FiveConditionsCard) を
 * 章 1「判定」 として 1 つの unified section に統合する wrapper。
 *
 * 設計方針 (handover v98 §0-B):
 *   - feature flag `pane3_v2=1` で URL parameter or localStorage 切替 (default off)
 *   - dogfood で revert option 保持 (sub-component 内部は完全に不変、wrapper のみ)
 *   - 章扉「I. 判定」 (Aman menu idiom、 Noto Serif JP)
 *   - 上下 spacing 統一 + gold accent 強化 ([[feedback-gold-accent-continuity]])
 *   - 「1 つの大きな段」 感の演出 (sub-component 間に subtle divider)
 *
 * Phase 2 で予定 (本 Phase 1 では未着手):
 *   - sub-component 内部の Card frameless 化 (二重 wrap 完全排除)
 *   - sub-component 順序 / spacing の最終 polish
 *
 * memory anchor:
 *   - feedback_cls_envelope_pattern.md (CLS envelope は sub-component 側で完結済)
 *   - feedback_gold_accent_continuity.md (gold accent は全 panel 一貫で signal 検出)
 *   - feedback_icon_brand_consistency.md (章番号は ローマ数字 "I." for Aman idiom)
 */
import React from 'react';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children - Hero, SummaryBrief, KpiStrip, TriageBanner, FiveConditionsCard
 */
/**
 * @param {object} props
 * @param {React.ReactNode} props.children - Hero, SummaryBrief, KpiStrip, TriageBanner, FiveConditionsCard
 * @param {boolean} [props.frameless=false] - Phase 2: 内部 sub-component を frameless 化、
 *   章内 sub-component 間に gold-fade hairline で「節」 を表現 (Aman pavilion 流の控えめな仕切り)。
 *
 * Phase 2 verdict (vision-eval 6 runs):
 *   AAPL Phase 1 → Phase 2: overall -1.73 (regression)
 *   MSFT Phase 1 → Phase 2: overall -1.47 (regression)
 *   2 ticker avg: Phase 1 +2.97 → Phase 2 +1.37 (frameless で borders が消えると vision AI が
 *   「視覚的階層 less」 と判定する仮説)。
 *
 *   よって default false に戻す。 frameless mode 試用は ?pane3_v2_frameless=1 で opt-in。
 */
export default function UnifiedJudgmentSection({ children, frameless = false }) {
  const bodyClass = frameless
    ? 'judgment-chapter-body is-frameless-children'
    : 'judgment-chapter-body';
  return (
    <section
      className="judgment-chapter judgment-chapter--verdict"
      aria-labelledby="judgment-chapter-verdict-heading"
      data-testid="judgment-chapter-verdict"
    >
      <header className="judgment-chapter-heading">
        <span className="judgment-chapter-number" aria-hidden="true">I.</span>
        <h2
          id="judgment-chapter-verdict-heading"
          className="judgment-chapter-title"
        >
          判定
        </h2>
      </header>
      <div className={bodyClass}>
        {children}
      </div>
    </section>
  );
}
