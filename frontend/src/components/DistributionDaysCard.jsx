/**
 * DistributionDaysCard — IBD Distribution Day カウンター (機関の売り圧力目安).
 *
 * v127 R16-3 (R12-1 Phase 1 R2、 sub-agent verdict ★★★★★ retail 必須):
 *   - Distribution Day = 前日比 -0.2% 以上の下落 かつ 出来高が前日超 の日 (IBD/O'Neil)。
 *     直近25営業日でカウントし、 機関投資家の売り (distribution) の目安として表示。
 *   - narration は静的 dictionary (distributionDaysLabels.js)、 LLM 不使用 (金商法 §38 / 景表法 §5 safe)。
 *   - 数値計算 (count) は frontend で price/volume から直接算出 (LLM に数値を作らせない物理分離)。
 *
 * memory:
 *   - feedback_sell_zone_static_dict.md (sell narration は静的 dictionary 一択)
 *   - feedback_testid_all_render_paths.md (data-testid を全 state に付与)
 *   - feedback_chart_overlay_safety.md (Recharts 不使用のため対象外)
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchPriceHistory } from '../api.js';
import { DIST_DAYS_LABEL_JP, DIST_DAYS_DESC_JP, DIST_DAYS_FOOTER, classifyDistDays } from '../lib/distributionDaysLabels.js';
import Chip from './ui/Chip.jsx';

// v185 B (2026-06-08): compact=true で narration detail を抑制 (count + conclusion + 免責は保持)。
export default function DistributionDaysCard({ ticker, compact = false }) {
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    fetchPriceHistory(ticker, '1y')
      .then((res) => {
        if (cancelled) return;
        setPriceData(res);
        if (!res?.prices?.length) setErrored(true);
      })
      .catch(() => { if (!cancelled) setErrored(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  // distribution day = 前日比 -0.2% 以上の下落 かつ 出来高が前日超 (IBD)。直近25営業日 (= 26日 26比較ペア) でカウント。
  const distCount = useMemo(() => {
    const prices = priceData?.prices;
    if (!Array.isArray(prices) || prices.length < 7) return null;
    const win = prices.slice(-26); // 直近26日 → 最大25 比較ペア
    let count = 0;
    let validPairs = 0;
    for (let i = 1; i < win.length; i++) {
      const today = win[i];
      const yest = win[i - 1];
      if (!Number.isFinite(today?.close) || !Number.isFinite(yest?.close) || yest.close <= 0) continue;
      if (!Number.isFinite(today?.volume) || !Number.isFinite(yest?.volume)) continue;
      validPairs++;
      const pct = (today.close / yest.close - 1) * 100;
      if (pct <= -0.2 && today.volume > yest.volume) count++;
    }
    if (validPairs < 5) return null; // 出来高欠落等でデータ不足 → unknown
    return count;
  }, [priceData]);

  const zone = classifyDistDays(distCount);
  const zoneLabel = DIST_DAYS_LABEL_JP[zone] || DIST_DAYS_LABEL_JP.unknown;
  const zoneDesc = DIST_DAYS_DESC_JP[zone] || DIST_DAYS_DESC_JP.unknown;
  // 健全=緑(ポジティブ) / 注意=amber(警告) / 圧力=赤(危険) の traffic-light (投資業界色ルール準拠)
  const chipTone =
    zone === 'pressure' ? 'loss' :
    zone === 'caution' ? 'warning' :
    zone === 'healthy' ? 'gain' : 'muted';

  // CLS envelope。 data-testid は全 state に付与 (QA selector 安定性、 [[feedback-testid-all-render-paths]])
  if (loading && !priceData) {
    return (
      <section className="panel-card ddc-card" data-testid="distribution-days-card" aria-busy style={{ minHeight: 116 }}>
        <header className="ddc-head"><h3 className="ddc-title">Distribution Days</h3></header>
        <div className="ddc-state-empty"><p className="ddc-state-sub">読み込み中…</p></div>
      </section>
    );
  }

  if (errored || zone === 'unknown') {
    return (
      <section className="panel-card ddc-card" data-testid="distribution-days-card" style={{ minHeight: 116 }}>
        <header className="ddc-head">
          <h3 className="ddc-title">Distribution Days</h3>
          <Chip variant="display" size="xs" tone="muted">判定不可</Chip>
        </header>
        <div className="ddc-state-empty"><p className="ddc-state-sub">{DIST_DAYS_DESC_JP.unknown.detail}</p></div>
        <footer className="ddc-footer">
          <span className="ddc-source">{DIST_DAYS_FOOTER.source}</span>
          <span className="ddc-disclaimer">{DIST_DAYS_FOOTER.disclaimer}</span>
        </footer>
      </section>
    );
  }

  return (
    <section className="panel-card ddc-card" data-testid="distribution-days-card" data-spotlight="card" style={{ minHeight: 116 }}>
      <header className="ddc-head">
        <h3 className="ddc-title">Distribution Days</h3>
        <Chip variant="display" size="xs" tone={chipTone}>{zoneLabel}</Chip>
      </header>
      <div className="ddc-body">
        <div className="ddc-count-row">
          <div className="ddc-count">
            <span className={`ddc-count-num ddc-count-num--${zone}`}>{distCount}</span>
            <span className="ddc-count-unit">日 / 25営業日</span>
          </div>
          <div className="ddc-narration">
            <p className="ddc-desc ddc-desc--conclusion">{zoneDesc.conclusion}</p>
            {!compact && <p className="ddc-desc ddc-desc--detail">{zoneDesc.detail}</p>}
          </div>
        </div>
      </div>
      <footer className="ddc-footer">
        <span className="ddc-source">{DIST_DAYS_FOOTER.source}</span>
        <span className="ddc-disclaimer">{DIST_DAYS_FOOTER.disclaimer}</span>
      </footer>
    </section>
  );
}
