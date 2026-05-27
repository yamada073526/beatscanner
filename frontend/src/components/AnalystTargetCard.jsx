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

  // CLS envelope: fetch 前後で section 高さを固定 (envelope 116px) して伸縮防止
  if (loading && !data) {
    return (
      <section className="panel-card atc-card" aria-busy style={{ minHeight: 116 }}>
        <header className="atc-head">
          <h3 className="atc-title">アナリスト目標株価</h3>
        </header>
        <div className="atc-skeleton" />
      </section>
    );
  }

  if (errored || !data) {
    return (
      <section className="panel-card atc-card" style={{ minHeight: 116 }}>
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
      <section className="panel-card atc-card" style={{ minHeight: 116 }}>
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
    </section>
  );
}
