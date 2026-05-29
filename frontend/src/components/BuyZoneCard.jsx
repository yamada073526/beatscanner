/**
 * BuyZoneCard — MarketSurge 互換 過去 breakout-based support level narration.
 *
 * v126 R8-3 Phase 3 (MarketSurge 互換テクニカルシグナル NVDA 型):
 *   - /api/technical/{ticker}?fields=cup_handle のレスポンス内 last_breakout を消費
 *   - last_breakout.price === 過去の breakout_confirmed signal の pivot price
 *     = 「直前 breakout price (= 上値抵抗線 → 次回の support level の目安)」
 *   - 静的 dictionary narration (buyZoneLabels.js)、 LLM 不使用
 *   - 金融アナリスト Opus verdict: 「これ以上下がらない」 等の断定 BAN、
 *     「目安」 「ただし support 割れは pattern failure の signal にもなり得る」 等の客観表現
 *   - 出典 + テクニカル disclaimer 強制 footer
 *
 * non-display 条件:
 *   - last_breakout なし (過去 breakout signal が pattern_signals に存在しない)
 *   - last_breakout.price 取得不可
 *   = null return で Pane 3 ノイズゼロ
 *
 * memory anchors:
 *   - buyZoneLabels.js (静的 dictionary SSOT)
 *   - feedback_data_completeness_guard.md (per-source data namespace)
 *   - feedback_cls_envelope_pattern.md (root minHeight envelope)
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchTechnical, fetchPriceHistory } from '../api.js';
import { BUY_ZONE_LABEL_JP, BUY_ZONE_DESC_JP, BUY_ZONE_FOOTER, classifyBuyZone } from '../lib/buyZoneLabels.js';
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

export default function BuyZoneCard({ ticker }) {
  const [technical, setTechnical] = useState(null);
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      fetchTechnical(ticker, 'cup_handle'),
      fetchPriceHistory(ticker, '1y'),
    ])
      .then(([techRes, priceRes]) => {
        if (cancelled) return;
        setTechnical(techRes.status === 'fulfilled' ? techRes.value : null);
        setPriceData(priceRes.status === 'fulfilled' ? priceRes.value : null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  const cupHandle = technical?.patterns?.cup_handle || null;
  const lastBreakout = cupHandle?.last_breakout || null;
  const breakoutPrice = Number.isFinite(lastBreakout?.price) ? lastBreakout.price : null;
  // v127 R16-3 (NVDA $200): box_support (複数回 test された長期ボックス支持線) を優先、 last_breakout は fallback。
  const boxSupport = (cupHandle?.box_support && Number.isFinite(cupHandle.box_support.level))
    ? cupHandle.box_support : null;
  // support 基準値: box_support 優先、 なければ last_breakout pivot
  const refPrice = boxSupport ? boxSupport.level : breakoutPrice;

  // 現在価格 (price-history 最新 close)
  const currentPrice = useMemo(() => {
    if (!priceData?.prices?.length) return null;
    const last = priceData.prices[priceData.prices.length - 1];
    return Number.isFinite(last?.close) ? last.close : null;
  }, [priceData]);

  // support 水準からの distance % (現在価格 vs 支持線)
  const distancePct = useMemo(() => {
    if (!Number.isFinite(currentPrice) || !Number.isFinite(refPrice) || refPrice <= 0) return null;
    return ((currentPrice / refPrice) - 1) * 100;
  }, [currentPrice, refPrice]);

  if (loading && !technical) {
    return (
      <section className="panel-card bzc-card" data-testid="buy-zone-card" aria-busy style={{ minHeight: 116 }}>
        <header className="bzc-head">
          <h3 className="bzc-title">直近 breakout support</h3>
        </header>
        <div className="bzc-state-empty">
          <p className="bzc-state-sub">読み込み中…</p>
        </div>
      </section>
    );
  }

  // v127 R16-3: box_support も last_breakout も無ければ非表示 (Trust Cliff、 ノイズゼロ)
  if (!boxSupport && !breakoutPrice) {
    return null;
  }

  // v127 R16-3 (NVDA $200): box_support 優先表示、 なければ last_breakout fallback。
  const useBox = !!boxSupport;
  const zoneKey = useBox ? 'box_support' : classifyBuyZone('breakout_confirmed');
  const label = BUY_ZONE_LABEL_JP[zoneKey];
  const desc = BUY_ZONE_DESC_JP[zoneKey];
  const cardTitle = useBox ? '長期ボックス支持線' : '直近 breakout support';

  // narration placeholder inject (数値は backend 計算、 JS は文字列置換のみ)
  let detailText;
  if (useBox) {
    const months = Math.max(1, Math.round((boxSupport.lookback_weeks || 0) / 4.3));
    detailText = desc.detail
      .replace('{N}', String(months))
      .replace('{M}', String(boxSupport.touch_count ?? '—'));
  } else {
    detailText = desc.detail.replace(/breakout price/, `breakout price (${fmtUsd(breakoutPrice)})`);
  }

  return (
    <section
      className="panel-card bzc-card"
      data-testid="buy-zone-card"
      data-spotlight="card"
      style={{ minHeight: 116 }}
    >
      <header className="bzc-head">
        <h3 className="bzc-title">{cardTitle}</h3>
        <Chip variant="display" size="xs" tone="accent">
          {label}
        </Chip>
      </header>

      <div className="bzc-body">
        <div className="bzc-narration">
          <p className="bzc-desc bzc-desc--conclusion">{desc.conclusion}</p>
          <p className="bzc-desc bzc-desc--detail">{detailText}</p>
        </div>

        <div className="bzc-meta">
          <span>
            現在 <span className="bzc-meta-value">{fmtUsd(currentPrice)}</span>
          </span>
          {useBox ? (
            <>
              <span>
                支持線 <span className="bzc-meta-value">{fmtUsd(boxSupport.level)}</span>
              </span>
              <span>
                test <span className="bzc-meta-value">{boxSupport.touch_count}回</span>
              </span>
            </>
          ) : (
            <span>
              breakout price <span className="bzc-meta-value">{fmtUsd(breakoutPrice)}</span>
            </span>
          )}
          {distancePct != null && (
            <span>
              {useBox ? 'vs 支持線' : 'vs breakout'} <span className="bzc-meta-value">{fmtPct(distancePct)}</span>
            </span>
          )}
        </div>

        {/* 強制 footer (citation + disclaimer) */}
        <footer className="bzc-footer">
          <span className="bzc-source">{BUY_ZONE_FOOTER.source}</span>
          <span className="bzc-disclaimer">{BUY_ZONE_FOOTER.disclaimer}</span>
        </footer>
      </div>
    </section>
  );
}
