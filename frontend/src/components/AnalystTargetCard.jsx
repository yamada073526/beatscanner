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

export default function AnalystTargetCard({ ticker, currentPrice = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  useMinuteTick(); // 1 分毎に re-render で「最終更新 X 分前」 更新

  // v125 P8-4: AnalystPanel への jump 動線 (footer link)。
  // AnalystPanel は Pane 3 内の AccordionSection (id='sec-analyst' or 'sec-analyst-v3') に mount。
  // V2 default mode: AccordionSection collapsed → expandSection で開く + scrollIntoView
  // V3 mode: ChapterTabs の analyst tab 内に mount (sec-analyst-v3) → 直接 scroll
  const expandSection = useWorkspaceStore((s) => s.expandSection);
  const handleJumpToAnalyst = () => {
    // V3 ON 時の anchor 優先、 fallback で V2 default の anchor
    const el =
      document.getElementById('sec-analyst-v3') ||
      document.getElementById('sec-analyst');
    if (!el) return;
    // V2 mode の AccordionSection 用 expand (V3 mode では no-op)
    try { expandSection('analyst-panel'); } catch { /* noop */ }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      <section className="panel-card atc-card" data-testid="analyst-target-card" aria-busy style={{ minHeight: 116 }}>
        <header className="atc-head">
          <h3 className="atc-title">アナリスト目標株価</h3>
        </header>
        <div className="atc-skeleton" />
      </section>
    );
  }

  if (errored || !data) {
    return (
      <section className="panel-card atc-card" data-testid="analyst-target-card" style={{ minHeight: 116 }}>
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
      <section className="panel-card atc-card" data-testid="analyst-target-card" style={{ minHeight: 116 }}>
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
      className="panel-card atc-card"
      data-testid="analyst-target-card"
      data-spotlight="card"
      style={{ minHeight: 116 }}
    >
      <header className="atc-head">
        <h3 className="atc-title">アナリスト目標株価</h3>
        {count != null && (
          <Chip variant="display" size="xs" tone="muted">
            アナリスト {count} 人
          </Chip>
        )}
      </header>

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

      {/* Trust Cliff 防止 disclaimer (3 体合議 verdict、 upside マイナス時の誤読対策) +
          最終更新 (CLAUDE.md「動的データには 最終更新 X 分前 を併記」 永続ルール) +
          v125 P8-4 AnalystPanel jump link (アナリスト名 / grade 動線、 user 帰宅後要望) */}
      <footer className="atc-footer">
        <span className="atc-disclaimer">
          コンセンサスは目安。 アナリスト予想は外れることがあります。
        </span>
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
      </footer>
    </section>
  );
}
