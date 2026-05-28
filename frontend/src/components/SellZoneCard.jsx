/**
 * SellZoneCard — IBD 50DMA extension rule + 8% trailing stop の objective marker card.
 *
 * SPEC 2026-05-28 Sprint 6 (pillar 2 technical analysis):
 *   - 既存 /api/technical/{ticker} の sma_50 overlay + /api/price-history の最新 close を消費
 *   - 静的 dictionary (sellZoneLabels.js) で narration、 LLM 不使用
 *   - 金商法 §38 (断定的判断提供) / 景表法 §5 (優良誤認) safe
 *   - 8% trailing stop は Phase 1 では汎用説明のみ表示、 portfolio integration は Phase 2 defer
 *   - chart-overlay-safety 4 層防御の対象外 (Recharts 不使用、 pure CSS)
 *
 * memory anchors:
 *   - feedback_condition_pulse_pattern.md (静的 dictionary narration pattern)
 *   - feedback_llm_calc_separation.md (narration 静的のみ)
 *   - feedback_cls_envelope_pattern.md (root minHeight envelope)
 *   - feedback_chart_overlay_safety.md (Recharts 不使用のため対象外)
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchPriceHistory, fetchTechnical } from '../api.js';
import { SELL_ZONE_LABEL_JP, SELL_ZONE_DESC_JP, classifyZone } from '../lib/sellZoneLabels.js';

function fmtUsd(v) {
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
}

function fmtPct(v) {
  if (!Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

export default function SellZoneCard({ ticker }) {
  const [priceData, setPriceData] = useState(null);
  const [technical, setTechnical] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  // 3 体合議 verdict M6: partial failure (technical 単独失敗) を silent でなく visible に
  const [techFailed, setTechFailed] = useState(false);
  const [priceFailed, setPriceFailed] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    setTechFailed(false);
    setPriceFailed(false);
    Promise.allSettled([
      fetchPriceHistory(ticker, '1y'),
      fetchTechnical(ticker, 'sma_50'),
    ])
      .then(([priceRes, techRes]) => {
        if (cancelled) return;
        const priceOK = priceRes.status === 'fulfilled' ? priceRes.value : null;
        const techOK = techRes.status === 'fulfilled' ? techRes.value : null;
        setPriceData(priceOK);
        setTechnical(techOK);
        setPriceFailed(!priceOK);
        setTechFailed(!techOK || !techOK.overlays?.length);
        if (!priceOK && !techOK) setErrored(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  // 直近 close (最新営業日)
  const currentPrice = useMemo(() => {
    if (!priceData?.prices?.length) return null;
    const last = priceData.prices[priceData.prices.length - 1];
    return Number.isFinite(last?.close) ? last.close : null;
  }, [priceData]);

  // 直近 sma_50 値 (date → value lookup の最新値)
  const sma50Latest = useMemo(() => {
    if (!technical?.overlays) return null;
    const sma50 = technical.overlays.find((ov) => ov.key === 'sma_50');
    if (!sma50 || !Array.isArray(sma50.data) || sma50.data.length === 0) return null;
    // sma50.data: [{time: 'YYYY-MM-DD', value: number}] (date 昇順)
    const last = sma50.data[sma50.data.length - 1];
    return Number.isFinite(last?.value) ? last.value : null;
  }, [technical]);

  // extension % = (current / sma50 - 1) * 100
  const extensionPct = useMemo(() => {
    if (!Number.isFinite(currentPrice) || !Number.isFinite(sma50Latest) || sma50Latest <= 0) return null;
    return (currentPrice / sma50Latest - 1) * 100;
  }, [currentPrice, sma50Latest]);

  const zone = classifyZone(extensionPct);
  const zoneLabel = SELL_ZONE_LABEL_JP[zone] || SELL_ZONE_LABEL_JP.unknown;
  const zoneDesc = SELL_ZONE_DESC_JP[zone] || SELL_ZONE_DESC_JP.unknown;

  // CLS envelope。 data-testid は全 state に付与 (QA / snap-pdca-loop selector 安定性)
  if (loading && !priceData && !technical) {
    return (
      <section className="panel-card szc-card" data-testid="sell-zone-card" aria-busy style={{ minHeight: 116 }}>
        <header className="szc-head">
          <h3 className="szc-title">50DMA extension 状況</h3>
        </header>
        <div className="szc-state-empty">
          <p className="szc-state-sub">読み込み中…</p>
        </div>
      </section>
    );
  }

  if (errored) {
    return (
      <section className="panel-card szc-card" data-testid="sell-zone-card" style={{ minHeight: 116 }}>
        <header className="szc-head">
          <h3 className="szc-title">50DMA extension 状況</h3>
        </header>
        <div className="szc-state-empty">
          <p className="szc-state-sub">テクニカルデータ取得に失敗しました</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="panel-card szc-card"
      data-testid="sell-zone-card"
      data-spotlight="card"
      style={{ minHeight: 116 }}
    >
      <header className="szc-head">
        <h3 className="szc-title">50DMA extension 状況</h3>
      </header>

      <div className="szc-body">
        <div className="szc-zone">
          <div className="szc-zone-label">現在の zone</div>
          <div className={`szc-zone-value szc-zone-value--${zone}`}>{zoneLabel}</div>
        </div>

        {/* v125 user dogfood hotfix: narration 3 field 構造 (結論 → 理由 → 根拠)。
            user 要望「結論を先、 根拠は灰色で控えめ」 を反映。 */}
        <div className="szc-narration">
          <p className="szc-desc szc-desc--conclusion">{zoneDesc.conclusion}</p>
          <p className="szc-desc szc-desc--reason">{zoneDesc.reason}</p>
          <p className="szc-desc szc-desc--source">{zoneDesc.source}</p>
        </div>

        <div className="szc-meta">
          <span>
            現在 <span className="szc-meta-value">{fmtUsd(currentPrice)}</span>
          </span>
          <span>
            50DMA <span className="szc-meta-value">{fmtUsd(sma50Latest)}</span>
          </span>
          <span>
            extension <span className="szc-meta-value">{fmtPct(extensionPct)}</span>
          </span>
        </div>

        {/* 3 体合議 verdict M6: partial failure を visible に */}
        {(priceFailed || techFailed) && (
          <p className="szc-warning">
            {priceFailed && '現在価格データ取得失敗。 '}
            {techFailed && !priceFailed && '50DMA データ取得失敗、 zone 判定不正確の可能性あり。 '}
          </p>
        )}
      </div>
    </section>
  );
}
