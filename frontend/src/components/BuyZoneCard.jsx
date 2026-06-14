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
import { MapPin } from 'lucide-react';
import { fetchTechnical, fetchPriceHistory, TECHNICAL_CANONICAL_PATTERNS } from '../api.js';
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

// v185 B (2026-06-08): compact=true で narration detail / meta を抑制 (conclusion + 免責は保持)。
// v185 dogfood (3体合議): variant='unified' は横並び統一の signal。BuyZone は既に card-price-hero パターン
//   (chip+価格+現在価格delta を先頭) のため hero/構成は不変。Step3 で is-card-unified class のみ付与。
export default function BuyZoneCard({ ticker, compact = false, variant = 'default' }) {
  const isUnified = variant === 'unified';
  const [technical, setTechnical] = useState(null);
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      // canonical patterns で統一 (prefetchAll / StockPriceChart と同一 URL → dedupGet cache hit)。
      fetchTechnical(ticker, TECHNICAL_CANONICAL_PATTERNS),
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
  // v130 P1 #10 (2 体合議 verdict [FILTER]、 2026-05-30 user dogfood「ほぼ全銘柄で表示、 客観判断できない」):
  //   旧版 (v127 R16-3) は role !== 'overhead_resistance' のみで filter、 ほぼ全銘柄 hit していた。
  //   O'Neil 基準「3 回は偶然、 5 回以上は本物」 と「resistance_turned_support (= 抵抗線突破後の支持線転換、
  //   最も actionable な signal)」 のみ採用、 NVDA $195 / LLY $1130 型 genuine signal だけ残す。
  const boxSupport = (cupHandle?.box_support
      && Number.isFinite(cupHandle.box_support.level)
      && cupHandle.box_support.role === 'resistance_turned_support'
      && (cupHandle.box_support.touch_count ?? 0) >= 5)
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
      <section className="panel-card bzc-card" data-testid="buy-zone-card" aria-busy style={{ minHeight: 128 }}>
        <header className="bzc-head">
          <h3 className="bzc-title">直近ブレイクアウト支持線</h3>
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
  // v134 P2 Phase 2 (SPEC v2): pullback_to_support state は box_support 上に「押し目接近中」 narrative を出す。
  const useBox = !!boxSupport;
  const cupState = cupHandle?.state;
  const isPullback = cupState === 'pullback_to_support';
  const zoneKey = isPullback
    ? 'pullback_to_support'
    : (useBox ? 'box_support' : classifyBuyZone('breakout_confirmed'));
  const label = BUY_ZONE_LABEL_JP[zoneKey];
  const desc = BUY_ZONE_DESC_JP[zoneKey];
  const cardTitle = isPullback
    ? '押し目接近中 (支持線テスト)'
    : (useBox ? '長期ボックス支持線' : '直近ブレイクアウト支持線');

  // narration placeholder inject (数値は backend 計算、 JS は文字列置換のみ)
  let detailText;
  let conclusionText = desc.conclusion;
  if (isPullback) {
    // {DIST_PCT} を backend の dist_to_band_pct で inject、 absolute value で表示
    const distPct = Number.isFinite(cupHandle?.dist_to_band_pct)
      ? Math.abs(cupHandle.dist_to_band_pct).toFixed(1)
      : '—';
    conclusionText = desc.conclusion.replace('{DIST_PCT}', distPct);
    detailText = desc.detail;
  } else if (useBox) {
    const months = Math.max(1, Math.round((boxSupport.lookback_weeks || 0) / 4.3));
    detailText = desc.detail
      .replace('{N}', String(months))
      .replace('{M}', String(boxSupport.touch_count ?? '—'));
  } else {
    detailText = desc.detail.replace(/ブレイクアウト価格/, `ブレイクアウト価格 (${fmtUsd(breakoutPrice)})`);
  }

  // v130 P1 #5 (3 体合議): 支持線/breakout 価格 を hero に、 現在価格との distance を delta sub に。
  // 「これが割れたら撤退」 の閾値が hero として最重要 (qa-dogfooder verdict)。
  const heroLabel = useBox ? '支持線' : 'ブレイクアウト';
  const deltaTone = distancePct == null ? 'muted' : (distancePct >= 0 ? 'gain' : 'loss');

  return (
    <section
      className={`panel-card bzc-card${isUnified ? ' is-card-unified' : ''}`}
      data-testid="buy-zone-card"
      data-spotlight="card"
      style={{ minHeight: 128 }}
    >
      {/* v132 P1-G + v134 P2 Phase 2: chip + hero 1 row 統合、 pullback 状態は「押し目接近中」 chip (warning) で区別。 */}
      <div className="card-price-hero" data-testid={isPullback ? 'buy-zone-card-pullback-to-support' : 'buy-zone-card-price-hero'}>
        <Chip variant="display" size="xs" tone={isPullback ? 'warning' : 'gain'} className="card-price-hero__chip">
          <MapPin size={11} strokeWidth={2} className="card-zone-context__icon" aria-hidden="true" />
          {isPullback ? '押し目接近中' : 'サポートゾーン'}
        </Chip>
        <span className="card-price-hero__value" aria-label={`${heroLabel} ${fmtUsd(refPrice)}`}>
          {fmtUsd(refPrice)}
        </span>
        {Number.isFinite(currentPrice) && distancePct != null && (
          <span className={`card-price-hero__delta card-price-hero__delta--${deltaTone}`}>
            現在 {fmtUsd(currentPrice)} ({fmtPct(distancePct)})
          </span>
        )}
      </div>
      <header className="bzc-head">
        <h3 className="bzc-title">{cardTitle}</h3>
        <Chip variant="display" size="xs" tone="accent">
          {label}
        </Chip>
      </header>

      <div className="bzc-body">
        <div className="bzc-narration">
          <p className="bzc-desc bzc-desc--conclusion">{conclusionText}</p>
          {!compact && <p className="bzc-desc bzc-desc--detail">{detailText}</p>}
        </div>

        {!compact && (
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
              ブレイクアウト価格 <span className="bzc-meta-value">{fmtUsd(breakoutPrice)}</span>
            </span>
          )}
          {distancePct != null && (
            <span>
              {useBox ? 'vs 支持線' : 'vs ブレイクアウト'} <span className="bzc-meta-value">{fmtPct(distancePct)}</span>
            </span>
          )}
        </div>
        )}

        {/* 強制 footer (citation + disclaimer) */}
        <footer className="bzc-footer">
          <span className="bzc-source">{BUY_ZONE_FOOTER.source}</span>
          <span className="bzc-disclaimer">{BUY_ZONE_FOOTER.disclaimer}</span>
        </footer>
      </div>
    </section>
  );
}
