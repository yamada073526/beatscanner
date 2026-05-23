/**
 * UnifiedJudgmentSection — 章 1「I. 判定」 専用 wrapper (Phase G Phase 1、 handover v98 §0-B)
 *
 * v99 末 (Phase G Phase 3) で ChapterSection に generalize 済。 本 file は backward
 * compatibility と「章 1 専用」 entry point として薄い wrapper を維持。
 *
 * Phase 2 verdict (vision-eval 6 runs):
 *   AAPL Phase 1 → Phase 2: overall -1.73 (regression)
 *   MSFT Phase 1 → Phase 2: overall -1.47 (regression)
 *   2 ticker avg: Phase 1 +2.97 → Phase 2 +1.37
 *   よって default frameless=false (Phase 1 wrapper のみ)、 frameless mode は opt-in。
 */
import React from 'react';
import ChapterSection from './ChapterSection.jsx';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children - Hero, SummaryBrief, KpiStrip, TriageBanner, FiveConditionsCard
 * @param {boolean} [props.frameless=false] - Phase 2 frameless mode (?pane3_v2_frameless=1 で opt-in)
 */
export default function UnifiedJudgmentSection({ children, frameless = false }) {
  return (
    <ChapterSection
      chapterNumber="I"
      chapterTitle="判定"
      frameless={frameless}
    >
      {children}
    </ChapterSection>
  );
}
