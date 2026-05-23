/**
 * AnalystPanel — handover v82 Phase 3 (multi-review 6 体合議後)
 *
 * @no-llm — このコンポーネントは Anthropic SDK / Claude API を一切呼ばない。
 *           narration は静的 template のみ (景表法見送り、 raw fact text)。
 *
 * 構成 (5 原則 #1「2 秒で読める」):
 *   上段常時: TargetPriceRangeBar (pure CSS) + RecommendationStackedBar (pure CSS) + MomentumKpi
 *   下段 <details> 折りたたみ (default 閉): RatingChangesTimeline + Pro lock
 *
 * 状態 3 段階分岐:
 *   1. カバー外 (全 sources empty)        → 「アナリストカバー外」
 *   2. 一時失敗 (任意 source が error/timeout) → 該当 sub-view を skeleton
 *   3. データあり                           → 全 view 描画 + signal_quality chip
 *
 * memory anchors:
 *   - project_pane3_visual_explainer_redesign.md (Phase 3 verdict)
 *   - feedback_llm_calc_separation.md (narration 静的のみ)
 *   - feedback_chart_overlay_safety.md (Recharts 不使用、 pure CSS のみで安全)
 */
import { useEffect, useRef, useState } from 'react';
import { fetchAnalyst } from '../api.js';
import { canUse } from '../lib/planGating.js';
import Chip from './ui/Chip.jsx';
// v100 UI/UX verdict C: 目標株価 low/median/high に count-up animation 適用
import { useCountUp as _useCountUpHook } from '../hooks/useCountUp.js';
// Phase 2.7 Sprint 1 #1': Tier M halo sweep (1 回限り) — useHaloSweepOnce 共通 hook
import { useHaloSweepOnce } from '../hooks/useHaloSweepOnce.js';

// ── signal_quality → tone / label ──────────────────────────────────
function confidenceToTone(confidence) {
  if (confidence === 'high') return 'gain';
  if (confidence === 'medium') return 'warning';
  return 'muted';
}
function confidenceLabel(confidence) {
  if (confidence === 'high') return '公式データ';
  if (confidence === 'medium') return '推定データ';
  return '未確認';
}

// ── 数値フォーマット ──────────────────────────────────────────────
function fmtUsd(v) {
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
}
function fmtPct(v) {
  if (!Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

// ── 文言テーブル (静的 template、 LLM 通過しない) ──────────────────
function consensusLabel(rc) {
  if (rc === 'bullish') return '強気';
  if (rc === 'bearish') return '弱気';
  if (rc === 'mixed') return '拮抗';
  if (rc === 'neutral') return '中立';
  return '—';
}
function consensusTone(rc) {
  if (rc === 'bullish') return 'gain';
  if (rc === 'bearish') return 'loss';
  if (rc === 'mixed') return 'warning';
  return 'muted';
}
function actionLabel(action) {
  if (action === 'upgrade') return '上方修正';
  if (action === 'downgrade') return '下方修正';
  if (action === 'initiate') return '新規カバー';
  if (action === 'maintain') return '据え置き';
  return action || '—';
}
function actionTone(action) {
  if (action === 'upgrade') return 'gain';
  if (action === 'downgrade') return 'loss';
  if (action === 'initiate') return 'accent';
  return 'muted';
}

// ── pure CSS Target Price Range Bar (Recharts 不使用) ──────────────
function TargetPriceRangeBar({ targetRange, currentPrice }) {
  const { high, low, mean, median } = targetRange || {};
  // v100 (handover §100点 UI/UX verdict C): low / median / high に count-up animation 適用
  const lowSafe = Number.isFinite(low) ? low : null;
  const medianSafe = Number.isFinite(median) ? median : null;
  const highSafe = Number.isFinite(high) ? high : null;
  const animatedLow = _useCountUpHook(lowSafe, { duration: 700, digits: 2 });
  const animatedMedian = _useCountUpHook(medianSafe, { duration: 700, digits: 2 });
  const animatedHigh = _useCountUpHook(highSafe, { duration: 700, digits: 2 });
  if (!Number.isFinite(high) || !Number.isFinite(low) || high === low) {
    return <div className="anp-empty">目標株価分布データなし</div>;
  }
  const span = high - low;
  const pos = (v) => {
    if (!Number.isFinite(v)) return null;
    return ((v - low) / span) * 100;
  };
  const markers = [
    { label: 'Low', value: low, pos: 0, tone: 'muted' },
    { label: 'Median', value: median, pos: pos(median), tone: 'accent' },
    { label: 'Mean', value: mean, pos: pos(mean), tone: 'accent' },
    { label: 'High', value: high, pos: 100, tone: 'muted' },
  ];
  const currentPos = Number.isFinite(currentPrice) ? pos(currentPrice) : null;
  return (
    <div className="anp-range">
      <div className="anp-range-track" role="img" aria-label="アナリスト目標株価分布">
        <div className="anp-range-fill" />
        {markers.map((m) =>
          m.pos == null ? null : (
            <div
              key={m.label}
              className={`anp-range-marker anp-tone-${m.tone}`}
              style={{ left: `${m.pos}%` }}
              title={`${m.label}: ${fmtUsd(m.value)}`}
            />
          ),
        )}
        {currentPos != null && (
          <div
            className="anp-range-current"
            style={{ left: `${Math.max(0, Math.min(100, currentPos))}%` }}
            title={`現在値: ${fmtUsd(currentPrice)}`}
          />
        )}
      </div>
      <div className="anp-range-legend">
        <span>{fmtUsd(animatedLow)}</span>
        <span className="anp-range-mid">中央 {fmtUsd(animatedMedian)}</span>
        <span>{fmtUsd(animatedHigh)}</span>
      </div>
    </div>
  );
}

// ── pure CSS Recommendation Stacked Bar ────────────────────────────
function RecommendationStackedBar({ distribution }) {
  const { buy = 0, hold = 0, sell = 0, total = 0 } = distribution || {};
  if (!total) {
    return <div className="anp-empty">推奨分布データなし</div>;
  }
  const pct = (v) => Math.round((v / total) * 1000) / 10;
  const buyPct = pct(buy);
  const holdPct = pct(hold);
  const sellPct = pct(sell);
  return (
    <div className="anp-stack">
      <div className="anp-stack-bar" role="img" aria-label="アナリスト推奨分布">
        {buyPct > 0 && (
          <div
            className="anp-stack-seg anp-stack-buy"
            style={{ width: `${buyPct}%` }}
            title={`Buy ${buy} 人 (${buyPct}%)`}
          />
        )}
        {holdPct > 0 && (
          <div
            className="anp-stack-seg anp-stack-hold"
            style={{ width: `${holdPct}%` }}
            title={`Hold ${hold} 人 (${holdPct}%)`}
          />
        )}
        {sellPct > 0 && (
          <div
            className="anp-stack-seg anp-stack-sell"
            style={{ width: `${sellPct}%` }}
            title={`Sell ${sell} 人 (${sellPct}%)`}
          />
        )}
      </div>
      <div className="anp-stack-legend">
        <span className="anp-stack-label-buy">Buy {buy}</span>
        <span className="anp-stack-label-hold">Hold {hold}</span>
        <span className="anp-stack-label-sell">Sell {sell}</span>
      </div>
    </div>
  );
}

// ── Momentum KPI (3 重符号化: icon + 色 + chip) ───────────────────
function MomentumKpi({ recentChanges, ratingConsensus }) {
  const { upgrades = 0, downgrades = 0, window_days = 90 } = recentChanges || {};
  const net = upgrades - downgrades;
  const arrow = net > 0 ? '▲' : net < 0 ? '▼' : '—';
  const tone = net > 0 ? 'gain' : net < 0 ? 'loss' : 'muted';
  return (
    <div className="anp-kpi">
      <div className="anp-kpi-head">
        <span className={`anp-kpi-arrow anp-tone-${tone}`}>{arrow}</span>
        <span className="anp-kpi-net tabular-nums">
          {net > 0 ? '+' : ''}{net}
        </span>
        <Chip variant="display" tone={consensusTone(ratingConsensus)} size="xs">
          {consensusLabel(ratingConsensus)}
        </Chip>
      </div>
      <div className="anp-kpi-detail tabular-nums">
        過去 {window_days} 日: 上方 {upgrades} / 下方 {downgrades}
      </div>
    </div>
  );
}

// ── Rating Changes Timeline (Pro lock 内側) ────────────────────────
function RatingChangesTimeline({ changes, plan }) {
  if (!changes?.length) {
    return <div className="anp-empty">直近の格付け変更データなし</div>;
  }
  const isPro = canUse('analyst_estimates', plan);
  return (
    <ul className="anp-timeline">
      {changes.map((c, i) => {
        // Free: 頭文字のみ (例 "M.K. (Morgan Stanley)" → "M*")、 Pro: フル firm 名
        const firmDisplay = isPro
          ? c.firm
          : (c.firm || '').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 3) + '*';
        return (
          <li key={`${c.date || i}-${i}`} className="anp-timeline-item">
            <div className="anp-timeline-date tabular-nums">
              {c.date ? c.date.slice(0, 10) : '—'}
            </div>
            <div className="anp-timeline-body">
              <Chip variant="display" tone={actionTone(c.action)} size="xs">
                {actionLabel(c.action)}
              </Chip>
              <span className="anp-timeline-firm" title={isPro ? '' : 'Pro でフル firm 名を表示'}>
                {firmDisplay}
              </span>
              {c.previous_grade && c.new_grade && (
                <span className="anp-timeline-grade">
                  {c.previous_grade} → {c.new_grade}
                </span>
              )}
              {Number.isFinite(c.target_price) && (
                <span className="anp-timeline-price tabular-nums">
                  {fmtUsd(c.target_price)}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── 静的 fact caption (LLM 通過しない、 景表法対象外) ─────────────
function FactCaption({ distribution, recentChanges }) {
  const { buy = 0, hold = 0, sell = 0, total = 0 } = distribution || {};
  const { upgrades = 0, downgrades = 0, window_days = 90 } = recentChanges || {};
  if (!total && !upgrades && !downgrades) return null;
  const buyPct = total ? Math.round((buy / total) * 100) : 0;
  return (
    <p className="anp-fact tabular-nums">
      アナリスト {total} 人中 {buy} 人 ({buyPct}%) が Buy 評価、
      過去 {window_days} 日で上方修正 {upgrades} 件 / 下方修正 {downgrades} 件
    </p>
  );
}

// ── Empty States ──────────────────────────────────────────────────
function NoCoverageView({ ticker }) {
  return (
    <div className="anp-state-empty">
      <p className="anp-state-title">{ticker} はアナリストカバー外</p>
      <p className="anp-state-sub">
        日本株や smallcap など、 主要アナリスト 5 人未満の銘柄はカバー対象外です。
      </p>
    </div>
  );
}
function LoadingSkeleton() {
  return (
    <div className="anp-skel">
      <div className="anp-skel-bar" style={{ width: '78%' }} />
      <div className="anp-skel-bar" style={{ width: '64%' }} />
      <div className="anp-skel-bar" style={{ width: '54%' }} />
    </div>
  );
}

// ── Footer (金商法 disclaimer + データ提供 chip) ───────────────────
function PanelFooter({ signalQuality }) {
  return (
    <div className="anp-footer">
      <Chip variant="display" tone="muted" size="xs">データ提供: FMP</Chip>
      <Chip
        variant="display"
        tone={confidenceToTone(signalQuality?.confidence)}
        size="xs"
        title={
          signalQuality
            ? `信頼性: ${signalQuality.confidence} / アナリスト ${signalQuality.consensus_count ?? '?'} 人 / 鮮度 ${signalQuality.freshness_days ?? '?'} 日`
            : 'signal_quality 未取得'
        }
      >
        {confidenceLabel(signalQuality?.confidence)}
      </Chip>
      <span className="anp-footer-note">
        本表示は情報提供のみを目的とし、 投資勧誘ではありません。 最終判断はご自身でお願いします。
      </span>
    </div>
  );
}

// ── 本体 ────────────────────────────────────────────────────────────
// Phase 2.8 Sprint 1 #3: haloTriggerRef prop
//   AccordionSection 内にある場合、親が haloTriggerRef (useRef) を渡し
//   onOpenChange(id, true) 時に haloTriggerRef.current?.() を呼ぶことで accordion 展開時に halo 発火。
//   haloTriggerRef.current に triggerOnAccordionOpen をセットする。
export default function AnalystPanel({ ticker, plan = 'free', currentPrice = null, haloTriggerRef = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  // Phase 2.7 Sprint 1 #1': Tier M halo sweep ref (1 回限り)
  const haloRef = useRef(null);
  // Phase 2.8 Sprint 1 #3: triggerOnAccordionOpen を受け取り haloRef に data-halo-ready を付与
  // Phase 2.9 Sprint 2 #Bug2: haloTriggerRef 経由 (accordion-controlled) なら IO observe を skip、
  // parent (JudgmentDetail) の haloFiredSetRef が 1 回限り保証 (re-mount でも persist)。
  const { triggerOnAccordionOpen } = useHaloSweepOnce(haloRef, { skipIO: !!haloTriggerRef });

  // Phase 2.8 Sprint 1 #3: haloTriggerRef に trigger 関数を register
  // (mount 時 1 回のみ、親が AccordionSection の onOpenChange から呼ぶ)
  useEffect(() => {
    if (haloTriggerRef && typeof haloTriggerRef === 'object') {
      haloTriggerRef.current = triggerOnAccordionOpen;
    }
  // triggerOnAccordionOpen は useCallback で stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [haloTriggerRef]);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrored(false);
      try {
        const res = await fetchAnalyst(ticker);
        if (cancelled) return;
        if (!res) {
          setErrored(true);
          setData(null);
        } else {
          setData(res);
        }
      } catch {
        if (!cancelled) {
          setErrored(true);
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ticker]);

  if (loading && !data) {
    return (
      <section className="panel-card anp-panel" aria-busy>
        <header className="anp-head">
          <h3 className="anp-title">アナリスト視点</h3>
        </header>
        <LoadingSkeleton />
      </section>
    );
  }

  if (errored || !data) {
    return (
      <section className="panel-card anp-panel">
        <header className="anp-head">
          <h3 className="anp-title">アナリスト視点</h3>
        </header>
        <div className="anp-state-empty">
          <p className="anp-state-sub">データ取得に失敗しました。 時間を置いて再度お試しください。</p>
        </div>
      </section>
    );
  }

  const sources = data.sources || {};
  const allEmpty = Object.values(sources).every((s) => s === 'empty');
  if (allEmpty) {
    return (
      <section className="panel-card anp-panel">
        <header className="anp-head">
          <h3 className="anp-title">アナリスト視点</h3>
        </header>
        <NoCoverageView ticker={data.ticker || ticker} />
        <PanelFooter signalQuality={data.signal_quality} />
      </section>
    );
  }

  const m = data.precomputed_metrics || {};
  const targetRange = m.target_range || {};
  const distribution = m.rating_distribution || {};
  const ratingConsensus = m.rating_consensus || 'unknown';
  const upsideAvailable = Number.isFinite(m.target_upside_pct);

  return (
    // Phase 2.7 Sprint 1 #1': tier-m-glow wrapper で halo sweep を適用
    // panel-card anp-panel は内側に維持 (入れ子 surface-card 禁止、glow_elevation_postmortem.md §v58→v59)
    <div
      ref={haloRef}
      className="tier-m-glow"
      data-testid="analyst-panel-wrapper"
      data-spotlight="card"
    >
    <section className="panel-card anp-panel">
      <header className="anp-head">
        <h3 className="anp-title">アナリスト視点</h3>
        {upsideAvailable && (
          <Chip
            variant="display"
            size="xs"
            tone={m.target_upside_pct > 0 ? 'gain' : m.target_upside_pct < 0 ? 'loss' : 'muted'}
          >
            目標 {fmtPct(m.target_upside_pct)}
          </Chip>
        )}
      </header>

      <FactCaption distribution={distribution} recentChanges={m.recent_changes} />

      <div className="anp-grid">
        <div className="anp-cell">
          <h4 className="anp-subhead">目標株価レンジ</h4>
          <TargetPriceRangeBar targetRange={targetRange} currentPrice={currentPrice} />
        </div>
        <div className="anp-cell">
          <h4 className="anp-subhead">推奨分布</h4>
          <RecommendationStackedBar distribution={distribution} />
        </div>
        <div className="anp-cell">
          <h4 className="anp-subhead">直近 90 日のモメンタム</h4>
          <MomentumKpi recentChanges={m.recent_changes} ratingConsensus={ratingConsensus} />
        </div>
      </div>

      <details className="anp-details">
        <summary className="anp-details-summary">
          直近の格付け変更 ({(data.top_5_changes || []).length} 件)
        </summary>
        <RatingChangesTimeline changes={data.top_5_changes} plan={plan} />
      </details>

      <PanelFooter signalQuality={data.signal_quality} />
    </section>
    </div>
  );
}
