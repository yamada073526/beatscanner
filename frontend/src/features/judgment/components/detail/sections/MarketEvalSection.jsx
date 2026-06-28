import { useEffect, useState } from 'react';
import AnalystPanel from '../../../../../components/AnalystPanel.jsx';
import InsightsPanel from '../../../../../components/InsightsPanel.jsx';
import { AccordionSection } from '../../../primitives/index.js';
import { fetchAnalyst } from '../../../../../api.js';

/**
 * L6「その他」fold 群の先頭 2 fold = アナリスト視点 / 市場の声。
 * 正本 mockup: docs/specs/mockups/pane3-detail-v1.html の L6「その他」(#more)。
 *
 * v294 第2弾 (§1+§2 統合): v6 単一経路へ純化。旧 v2-v5 の
 *   - 章扉 (ChapterSection「市場評価」II/③) → JudgmentDetail の「その他」⑤ に統合済のため撤去
 *   - ChapterTabs (アナリスト視点 / 市場の声 の tab 切替) → mockup の fold 2個へ
 *   - QuarterlyHistory fold (章①の ChapterTabs に統合済で重複) → 撤去
 *   - isV2 / isV3 / isV5 / isScrollV1 分岐 → 撤去 (revert flag は v6 default ON 昇格済で formality)
 * を物理削除。AnalystPanel の hover halo wiring (analystHaloTriggerRef) は維持。
 *
 * v294 f-sum: 折りたたみ時も mockup の f-sum を出す。アナリスト視点は目標株価/件数を動的表示
 * (fetchAnalyst は @no-llm・prefetch 済 cache hit、collapsed summary は非LLM source のみ可
 *  = feedback_accordion_collapsed_unmount)。市場の声は LLM source のため静的説明文に留める。
 */
const fmtTargetUsd = (v) => (Number.isFinite(v) ? `$${v.toFixed(0)}` : null);

export default function MarketEvalSection({
  selectedTicker,
  plan,
  detail,
  detailContext,
  expandedSections,
  analystHaloTriggerRef,
  haloFiredSetRef,
}) {
  // アナリスト視点 fold の collapsed summary (mockup「目標 $305 · n=37」)。
  const [analystSummary, setAnalystSummary] = useState(null);
  useEffect(() => {
    if (!selectedTicker) {
      setAnalystSummary(null);
      return;
    }
    let cancelled = false;
    fetchAnalyst(selectedTicker)
      .then((d) => {
        if (cancelled || !d) return;
        const tr = d.precomputed_metrics?.target_range || {};
        const target = fmtTargetUsd(Number.isFinite(tr.median) ? tr.median : tr.mean);
        const n = d.signal_quality?.consensus_count;
        const parts = [];
        if (target) parts.push(`目標 ${target}`);
        if (Number.isFinite(n) && n > 0) parts.push(`n=${n}`);
        setAnalystSummary(parts.length ? parts.join(' · ') : null);
      })
      .catch(() => {
        if (!cancelled) setAnalystSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTicker]);

  if (!selectedTicker) return null;
  return (
    <>
      {/* fold #1: アナリスト視点 */}
      <AccordionSection
        id="sec-analyst"
        title="アナリスト視点"
        tier={2}
        defaultOpen={false}
        summary={analystSummary}
        controlledOpen={expandedSections.has('analyst-panel') || undefined}
        onOpenChange={(id, isOpen) => {
          if (isOpen && !haloFiredSetRef.current.has('analyst-panel')) {
            haloFiredSetRef.current.add('analyst-panel');
            setTimeout(() => analystHaloTriggerRef.current?.(), 500);
          }
        }}
      >
        <AnalystPanel
          ticker={selectedTicker}
          plan={plan}
          currentPrice={Number.isFinite(detail?.price) ? Number(detail.price) : null}
          haloTriggerRef={analystHaloTriggerRef}
        />
      </AccordionSection>

      {/* fold #2: 市場の声 */}
      <AccordionSection
        id="sec-insights"
        title="市場の声"
        tier={2}
        defaultOpen={false}
        summary="直近ニュースの論点要約"
        controlledOpen={expandedSections.has('insights') || undefined}
      >
        <InsightsPanel
          ticker={selectedTicker}
          user={detailContext.user}
          isPro={detailContext.isPro}
          onUpgradeClick={detailContext.onUpgrade}
          onSignIn={detailContext.onSignIn}
        />
      </AccordionSection>
    </>
  );
}
