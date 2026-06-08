/**
 * AnalystTargetCard — Chart 直下に「アナリスト目標株価」 を hero として表示する summary card.
 *
 * SPEC 2026-05-28 Sprint 4 (pillar 2 technical analysis):
 *   - 既存 /api/analyst/{ticker} を消費 (backend 6h cache + asyncio.Lock 共有)
 *   - precomputed_metrics.target_range = { mean, median, high, low, std_dev, count }
 *   - 中央 hero: consensus (mean、 fw700 28px) / 左右 sub: low / high / 右上 badge: アナリスト N 人
 *   - 静的 dictionary narration のみ (LLM 不使用、 景表法 §5 / 金商法 §38 safe)
 *   - 5 原則 §1「2 秒で読める」: consensus 数値が visual hierarchy 最上位
 *
 * memory anchors:
 *   - project_pane3_visual_explainer_redesign.md (Phase 3 verdict 反映)
 *   - feedback_llm_calc_separation.md (narration 静的のみ)
 *   - feedback_data_completeness_guard.md (sources field で 3 段階分岐)
 *   - feedback_cls_envelope_pattern.md (root minHeight envelope で fetch 前後の section 伸縮防止)
 *   - chip_primitive_canonical.md (Chip primitive 経由のみ)
 */
import { useEffect, useState } from 'react';
import { fetchAnalyst } from '../api.js';
import Chip from './ui/Chip.jsx';
// v125 P8-4: footer「直近の grade 変更を見る」 link 用に workspaceStore の expandSection を読み込み、
// click で AnalystPanel (sec-analyst-v3 or sec-analyst) の AccordionSection を expand + smooth scroll。
import { useWorkspaceStore } from '../state/workspaceStore.js';

// 「最終更新 X 分前」 表示用、 1 分毎に再レンダーを促す tick state
function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
}

function fmtRelativeMin(fetchedAt) {
  if (!fetchedAt) return null;
  const diffMs = Date.now() - fetchedAt;
  const min = Math.max(0, Math.floor(diffMs / 60_000));
  if (min < 1) return '更新したて';
  if (min < 60) return `${min} 分前`;
  const hour = Math.floor(min / 60);
  return `${hour} 時間前`;
}

function fmtUsd(v) {
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
}

function fmtPct(v) {
  if (!Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

// v185 B (2026-06-08): compact=true で 2 次情報 (footer の最終更新 / grade jump link) を抑制し、
//   v5 テクニカル章「価格目安」 横並び grid で card 高さを近づける。免責 (disclaimer) は保持 (景表法 §5)。
// v185 dogfood (3体合議): variant='unified' で card-price-hero パターン (chip+大価格+delta を先頭) に揃え、
//   CupPivot/BuyZone と縦構成統一 (hero→header→body→footer)。v4 (variant='default') は従来描画で不変。
export default function AnalystTargetCard({ ticker, currentPrice = null, compact = false, variant = 'default' }) {
  const isUnified = variant === 'unified';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  useMinuteTick(); // 1 分毎に re-render で「最終更新 X 分前」 更新

  // v125 P8-4 + R6-1: AnalystPanel への jump 動線 (footer link)。
  // V2 default mode: AccordionSection collapsed (children unmount or invisible) → expandSection 必要。
  // expandSection は Zustand state update → React re-render → AccordionSection content mount に
  // tick が必要 (同期取れない) ため、 setTimeout で 1 tick + 100ms 待ってから scroll する (R6-1 timing fix)。
  // V3 mode: ChapterTabs の analyst tab 内 mount (sec-analyst-v3)、 default tab='analyst' なら最初から存在。
  const expandSection = useWorkspaceStore((s) => s.expandSection);
  const handleJumpToAnalyst = () => {
    // R9-1 第 3 真因 fix: BeatScanner workspace は WorkspaceShell.jsx PaneContainer (overflow-y:auto) が
    // 内部 scroll container。 `window.scrollTo` は window scroll のみで内部 div の scrollTop は変化しない。
    // → 対象 element の最近接 scrollable ancestor を探し、 その container 経由で scroll する。
    // SPA mode 互換 (window が scrollable な場合は従来通り window.scrollTo) も自動判別。
    try { expandSection('analyst-panel'); } catch { /* noop */ }
    setTimeout(() => {
      const candidates = [
        () => document.getElementById('sec-analyst-v3'),
        () => document.getElementById('acc-header-sec-analyst'),
        () => document.getElementById('sec-analyst'),
        () => document.querySelector('[data-testid="analyst-panel-wrapper"]'),
        () => document.querySelector('[data-testid="chapter-section-ii"]'),
      ];
      let el = null;
      for (const find of candidates) {
        try { el = find(); if (el) break; } catch { /* noop */ }
      }
      if (!el) {
        // eslint-disable-next-line no-console
        console.warn('[AnalystTargetCard] jump target not found');
        return;
      }
      // 最近接の scrollable ancestor を探す (overflow-y:auto/scroll かつ scrollHeight > clientHeight)
      let container = el.parentElement;
      while (container) {
        const sty = window.getComputedStyle(container);
        if ((sty.overflowY === 'auto' || sty.overflowY === 'scroll')
            && container.scrollHeight > container.clientHeight + 4) break;
        container = container.parentElement;
      }
      const rect = el.getBoundingClientRect();
      if (!container) {
        // SPA mode (window が scroll)
        const offsetTop = window.pageYOffset + rect.top - 72;
        window.scrollTo({ top: offsetTop, behavior: 'smooth' });
      } else {
        // workspace mode (PaneContainer が scroll)
        const cRect = container.getBoundingClientRect();
        const offsetTop = container.scrollTop + (rect.top - cRect.top) - 24;
        container.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
    }, 100);
  };

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    fetchAnalyst(ticker)
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          setErrored(true);
          setData(null);
        } else {
          setData(res);
          setFetchedAt(Date.now());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrored(true);
          setData(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  // CLS envelope: fetch 前後で section 高さを固定 (envelope 116px) + data-testid を全 state に付与
  if (loading && !data) {
    return (
      <section className="panel-card atc-card" data-testid="analyst-target-card" aria-busy style={{ minHeight: 128 }}>
        <header className="atc-head">
          <h3 className="atc-title">アナリスト目標株価</h3>
        </header>
        <div className="atc-skeleton" />
      </section>
    );
  }

  if (errored || !data) {
    return (
      <section className="panel-card atc-card" data-testid="analyst-target-card" style={{ minHeight: 128 }}>
        <header className="atc-head">
          <h3 className="atc-title">アナリスト目標株価</h3>
        </header>
        <div className="atc-state-empty">
          <p className="atc-state-sub">データ取得に失敗しました</p>
        </div>
      </section>
    );
  }

  const sources = data.sources || {};
  // sources.price_target が ok でなければ「カバー外」 表示 (per-source data namespace 厳守)
  if (sources.price_target !== 'ok') {
    return (
      <section className="panel-card atc-card" data-testid="analyst-target-card" style={{ minHeight: 128 }}>
        <header className="atc-head">
          <h3 className="atc-title">アナリスト目標株価</h3>
        </header>
        <div className="atc-state-empty">
          <p className="atc-state-sub">アナリストカバー外</p>
        </div>
      </section>
    );
  }

  const m = data.precomputed_metrics || {};
  const targetRange = m.target_range || {};
  const consensus = Number.isFinite(targetRange.mean) ? targetRange.mean : null;
  const low = Number.isFinite(targetRange.low) ? targetRange.low : null;
  const high = Number.isFinite(targetRange.high) ? targetRange.high : null;
  const count = Number.isFinite(targetRange.count) ? targetRange.count : null;

  // upside_pct (現在価格との乖離 %)
  const upsidePct = Number.isFinite(m.target_upside_pct) ? m.target_upside_pct : null;
  // upside の色: positive (gain) / negative (loss) / null (muted)
  const upsideTone = upsidePct == null ? 'muted' : (upsidePct >= 0 ? 'gain' : 'loss');

  return (
    <section
      className={`panel-card atc-card${isUnified ? ' is-card-unified' : ''}`}
      data-testid="analyst-target-card"
      data-spotlight="card"
      style={{ minHeight: 128 }}
    >
      {/* v185 dogfood (3体合議): v5 unified は card-price-hero (chip+大価格+delta) を先頭に置き、
          CupPivot/BuyZone と縦構成 (hero→header→body→footer) を揃える。v4 は従来描画 (下の !isUnified ブロック)。 */}
      {isUnified && (
        <div className="card-price-hero" data-testid="analyst-target-card-price-hero">
          <Chip variant="display" size="xs" tone="muted" className="card-price-hero__chip">
            コンセンサス
          </Chip>
          <span className="card-price-hero__value" aria-label={`コンセンサス ${fmtUsd(consensus)}`}>
            {fmtUsd(consensus)}
          </span>
          {upsidePct != null && (
            <span className={`card-price-hero__delta card-price-hero__delta--${upsideTone}`}>
              現在価格から {fmtPct(upsidePct)}
            </span>
          )}
        </div>
      )}

      <header className="atc-head">
        <h3 className="atc-title">アナリスト目標株価</h3>
        {count != null && (
          <Chip variant="display" size="xs" tone="muted">
            アナリスト {count} 人
          </Chip>
        )}
      </header>

      {/* v4 (default): 従来の atc-body (hero + range)。v5 unified では hero を上の card-price-hero に移譲。 */}
      {!isUnified && (
        <div className="atc-body">
          <div className="atc-hero">
            <div className="atc-consensus-label">コンセンサス (目安)</div>
            <div className="atc-consensus-value">{fmtUsd(consensus)}</div>
            {upsidePct != null && (
              <div className={`atc-upside atc-upside--${upsideTone}`}>
                現在価格から {fmtPct(upsidePct)}
              </div>
            )}
          </div>

          <div className="atc-range">
            <div className="atc-range-cell">
              <div className="atc-range-label">Low</div>
              <div className="atc-range-value">{fmtUsd(low)}</div>
            </div>
            <div className="atc-range-divider" />
            <div className="atc-range-cell">
              <div className="atc-range-label">High</div>
              <div className="atc-range-value">{fmtUsd(high)}</div>
            </div>
          </div>
        </div>
      )}

      {/* v5 unified + 非 compact: Low/High range のみ残す (compact では delta で代替し省略=横並び高さ圧縮)。 */}
      {isUnified && !compact && (
        <div className="atc-body">
          <div className="atc-range">
            <div className="atc-range-cell">
              <div className="atc-range-label">Low</div>
              <div className="atc-range-value">{fmtUsd(low)}</div>
            </div>
            <div className="atc-range-divider" />
            <div className="atc-range-cell">
              <div className="atc-range-label">High</div>
              <div className="atc-range-value">{fmtUsd(high)}</div>
            </div>
          </div>
        </div>
      )}

      {/* v130 P1 #7 (3 体合議 2026-05-30 user dogfood): footer を 2-row grid 化、
          disclaimer 単独行 + 最終更新/jump link を 2 行目で左右分離。 旧 1-row flex で
          disclaimer flex:1 が「最終更新 X 分前」 を圧迫し視覚混在していた問題を解消。 */}
      <footer className="atc-footer">
        <span className="atc-disclaimer">
          コンセンサスは目安。 アナリスト予想は外れることがあります。
        </span>
        {!compact && (
          <div className="atc-footer-row2">
            {fetchedAt && (
              <span className="atc-updated">最終更新 {fmtRelativeMin(fetchedAt)}</span>
            )}
            <button
              type="button"
              className="atc-jump-analyst"
              onClick={handleJumpToAnalyst}
              data-testid="analyst-target-card-jump-link"
            >
              直近の grade 変更を見る →
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}
