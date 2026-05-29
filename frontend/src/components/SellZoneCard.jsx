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
import { SELL_ZONE_LABEL_JP, SELL_ZONE_DESC_JP, SELL_ZONE_FOOTER, classifyZone } from '../lib/sellZoneLabels.js';
// v125 P8-5 R5 hotfix (3 体合議統合推奨案): zone value を Chip primitive 化、 header に配置で
// AnalystTargetCard と H 方向 visual rhythm 統一 (frontend-architect 案 A + ui-designer 案 B 集約)。
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
      // v127 R16-3 (R6): 200DMA Break 判定のため sma_200 も取得
      fetchTechnical(ticker, 'sma_50,sma_200'),
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

  // v126 R13-4 R1 (5/29 sub-agent verdict): 50DMA Break with Heavy Volume detection。
  // 直近 5 営業日に close が sma50 を下抜けた日 + その日 volume が 50d avg の 1.4 倍以上、 該当時 dmaBreak=true。
  const dmaBreak = useMemo(() => {
    if (!priceData?.prices?.length || !technical?.overlays) return false;
    const sma50Overlay = technical.overlays.find((ov) => ov.key === 'sma_50');
    if (!sma50Overlay?.data?.length) return false;
    const smaMap = new Map(sma50Overlay.data.map((d) => [d.time, d.value]));
    const recent5 = priceData.prices.slice(-5);
    if (recent5.length < 2) return false;
    // 50d avg volume (直近 50 営業日)
    const volumes50 = priceData.prices.slice(-50).map((p) => p.volume).filter(Number.isFinite);
    if (volumes50.length < 10) return false;
    const avgVol50 = volumes50.reduce((a, b) => a + b, 0) / volumes50.length;
    // 直近 5 日のうち sma50 下抜け + volume 1.4x avg の日があるか
    for (let i = 1; i < recent5.length; i++) {
      const today = recent5[i];
      const yest = recent5[i - 1];
      // v127 R16-3 fix: price は date キー / overlay smaMap は time キー (= date 文字列)。
      // 旧 today.time は undefined で smaMap.get が常に miss → dmaBreak が常時 false の silent bug だった。
      const smaToday = smaMap.get(today.date);
      const smaYest = smaMap.get(yest.date);
      if (!Number.isFinite(smaToday) || !Number.isFinite(smaYest)) continue;
      const crossedBelow = yest.close >= smaYest && today.close < smaToday;
      const heavyVol = Number.isFinite(today.volume) && today.volume >= avgVol50 * 1.4;
      if (crossedBelow && heavyVol) return true;
    }
    return false;
  }, [priceData, technical]);

  // v127 R16-3 (R6): 200DMA Break detection。200DMA (長期移動平均) を下抜け、 かつ現在も下回る
  // (= 一時的な髭でなく break 確定) を直近 10 営業日の fresh cross で判定。50DMA break より重大。
  const dma200Break = useMemo(() => {
    if (!priceData?.prices?.length || !technical?.overlays) return false;
    const sma200Overlay = technical.overlays.find((ov) => ov.key === 'sma_200');
    if (!sma200Overlay?.data?.length) return false;
    const smaMap = new Map(sma200Overlay.data.map((d) => [d.time, d.value]));
    const recent = priceData.prices.slice(-10);
    if (recent.length < 2) return false;
    // 現在 close が 200DMA 未満 (break 確定) でなければ false (一時的な dip 後の回復を除外)
    const last = recent[recent.length - 1];
    // v127 R16-3 fix: price は date キー / overlay smaMap は time キー (= date 文字列) のため date で引く。
    const smaLast = smaMap.get(last.date);
    if (!Number.isFinite(smaLast) || !Number.isFinite(last?.close) || last.close >= smaLast) return false;
    // 直近 10 日に下抜け (yest >= sma, today < sma) が発生したか (fresh break のみ、 旧来の下降は対象外)
    for (let i = 1; i < recent.length; i++) {
      const today = recent[i];
      const yest = recent[i - 1];
      const smaToday = smaMap.get(today.date);
      const smaYest = smaMap.get(yest.date);
      if (!Number.isFinite(smaToday) || !Number.isFinite(smaYest)) continue;
      if (yest.close >= smaYest && today.close < smaToday) return true;
    }
    return false;
  }, [priceData, technical]);

  const zone = classifyZone(extensionPct, { dmaBreak, dma200Break });
  const zoneLabel = SELL_ZONE_LABEL_JP[zone] || SELL_ZONE_LABEL_JP.unknown;
  const zoneDesc = SELL_ZONE_DESC_JP[zone] || SELL_ZONE_DESC_JP.unknown;

  // CLS envelope。 data-testid は全 state に付与 (QA / snap-pdca-loop selector 安定性)
  if (loading && !priceData && !technical) {
    return (
      <section className="panel-card szc-card" data-testid="sell-zone-card" aria-busy style={{ minHeight: 128 }}>
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
      <section className="panel-card szc-card" data-testid="sell-zone-card" style={{ minHeight: 128 }}>
        <header className="szc-head">
          <h3 className="szc-title">50DMA extension 状況</h3>
        </header>
        <div className="szc-state-empty">
          <p className="szc-state-sub">テクニカルデータ取得に失敗しました</p>
        </div>
      </section>
    );
  }

  // v125 P8-5 R5 hotfix (3 体合議統合推奨案): zone tone を Chip primitive の tone prop に mapping。
  // normal=muted (中立) / extended=warning (amber) / climax/stop_hit=loss (赤)、 unknown=muted。
  const chipTone =
    zone === 'extended' ? 'warning' :
    // v126 R13-4 R1: dma_break も climax/stop_hit と同様 loss tone (赤、 警告)
    // v127 R16-3 (R6): dma200_break も loss tone (200DMA break = 最重大の下値警告)
    (zone === 'climax' || zone === 'stop_hit' || zone === 'dma_break' || zone === 'dma200_break') ? 'loss' :
    'muted';

  // v130 P1 #5 (3 体合議 2026-05-30): price hero delta tone を zone と連動。
  // normal は muted (中立)、 extended は warning (amber)、 climax/stop/dma break は loss (赤)。
  const deltaTone =
    zone === 'extended' ? 'warning' :
    (zone === 'climax' || zone === 'stop_hit' || zone === 'dma_break' || zone === 'dma200_break') ? 'loss' :
    'muted';

  return (
    <section
      className="panel-card szc-card"
      data-testid="sell-zone-card"
      data-spotlight="card"
      style={{ minHeight: 128 }}
    >
      {/* v130 P1 #5: 現在価格 hero + 50DMA からの extension % を sub に。 dogfood「一番読みたいのは株価」 を 2 秒判読 hierarchy で実現。 */}
      <div className="card-price-hero" data-testid="sell-zone-card-price-hero">
        <span className="card-price-hero__label">現在</span>
        <span className="card-price-hero__value" aria-label={`現在価格 ${fmtUsd(currentPrice)}`}>
          {fmtUsd(currentPrice)}
        </span>
        {Number.isFinite(extensionPct) && Number.isFinite(sma50Latest) && (
          <span className={`card-price-hero__delta card-price-hero__delta--${deltaTone}`}>
            50DMA {fmtUsd(sma50Latest)} から {fmtPct(extensionPct)}
          </span>
        )}
      </div>
      <header className="szc-head">
        <h3 className="szc-title">50DMA extension 状況</h3>
        {/* v125 P8-5 R5: zone value を Chip 化、 header 右に配置で AnalystTargetCard と visual rhythm 統一。
            「現在の zone」 label を削除 (header title「50DMA extension 状況」 と redundant)。 */}
        <Chip variant="display" size="xs" tone={chipTone}>
          {zoneLabel}
        </Chip>
      </header>

      <div className="szc-body">
        {/* v125 P8-5 R5: narration 2 field (conclusion / detail) 構造、 旧 reason+source を detail に merge。
            conclusion は visual anchor として font 13.5px 600 で前面化 (ui-designer 案 B)。
            detail は muted text-secondary 11px で 1 行に圧縮 (qa-dogfooder 段数縮小)。 */}
        <div className="szc-narration">
          <p className="szc-desc szc-desc--conclusion">{zoneDesc.conclusion}</p>
          <p className="szc-desc szc-desc--detail">{zoneDesc.detail}</p>
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

        {/* v127 (5/29 user dogfood): チャート右端の extended / climax ラインの意味を併記。
            user「extended +15% の意味が記載ない」+ 「pivot 上抜け後 +20-25%」(S2 Profit Take、 別基準) との混同防止。
            投資業界色ルール: amber=過熱警告 / red=climax 危険。 */}
        <div
          className="szc-legend"
          style={{
            marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px',
            fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: 1.5,
          }}
        >
          <span>
            <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>―</span>{' '}
            50DMA +15%（extended、 過熱注意）
          </span>
          <span>
            <span style={{ color: 'var(--color-loss)', fontWeight: 700 }}>―</span>{' '}
            50DMA +25%（climax top、 反落警戒）
          </span>
          <span style={{ opacity: 0.85 }}>
            ※「pivot 上抜け後 +20-25%」（S2 Profit Take）とは基準点が異なります
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

      {/* v126 R14-6 (sub-agent verdict、 景表法 §5 対称性): CupPivotCard と同じ footer pattern。
          「50DMA break = 売り確定」 誤認を防ぐ disclaimer + IBD 出典強制表示。 */}
      <footer className="szc-footer">
        <span className="szc-source">{SELL_ZONE_FOOTER.source}</span>
        <span className="szc-disclaimer">{SELL_ZONE_FOOTER.disclaimer}</span>
      </footer>
    </section>
  );
}
