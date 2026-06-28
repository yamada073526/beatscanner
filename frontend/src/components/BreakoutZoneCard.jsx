/**
 * BreakoutZoneCard — 新高値ブレイク (pattern_type='breakout') の現在進行形 state narration.
 *
 * SPEC_2026-06-28 (Pane3 breakout pending detail、3体合議 condition付賛成):
 *   - /api/technical/{ticker}?patterns=...,breakout の patterns.breakout (bo_*) を消費
 *   - BuyZoneCard (cup_handle.last_breakout = 過去の支持線文脈) とは時制が異なる「今の途上状態」
 *     → 役割分離のため別 component (ui-designer + frontend-architect 一致)。CSS idiom は共有 (新規 glow host 無)
 *   - 静的 dictionary narration (buyZoneLabels.js の BUY_ZONE_DESC_JP.bo_*)、LLM 不使用
 *   - §38/Trust Cliff: bo_pending は「日中上抜け・終値未確定」を最初から明示 (点灯解除を織り込む)。
 *     緑/上昇色は一切使わず amber(warning)/muted 固定。
 *   - tier (D⑫整合): pending 中立 viz (chip + conclusion + intraday_note + 免責) = 無料 /
 *     確度判別の精密数値 (pivot 価格・出来高比・pivot 乖離率) = Premium。frontend 分岐のみ
 *     (既存 BuyZoneCard/SellZoneCard と同方式、moat は数値でなく状態解釈)。
 *
 * non-display 条件 (Pane3 ノイズゼロ):
 *   - breakout 未検出 / state が bo_* でない (classifyBreakoutZone → 'unknown')
 *   - 非株式 (指数/先物/為替/ETF) = isNonEquityTicker
 *   = null return
 *
 * memory anchors:
 *   - buyZoneLabels.js (静的 dictionary SSOT) / project_breakout_signal (bo_* 命名・D⑫)
 *   - feedback_section38_buy_signal_boundary / feedback_new_ui_only
 *   - feedback_judgmentdetail_dual_mount_paths (3経路 mount) / feedback_testid_all_render_paths
 */
import { useEffect, useMemo, useState } from 'react';
import { Target, Clock } from 'lucide-react';
import { fetchTechnical, fetchPriceHistory, TECHNICAL_CANONICAL_PATTERNS } from '../api.js';
import { BUY_ZONE_LABEL_JP, BUY_ZONE_DESC_JP, BUY_ZONE_FOOTER, classifyBreakoutZone } from '../lib/buyZoneLabels.js';
import Chip from './ui/Chip.jsx';

// 非株式 (指数/先物/為替) 判定: StockPriceChart の isNonEquityTicker と同基準 (^で始まる指数 / =X 為替 / =F 先物)。
function isNonEquityTicker(ticker) {
  if (!ticker || typeof ticker !== 'string') return false;
  const t = ticker.toUpperCase();
  return t.startsWith('^') || t.includes('=X') || t.includes('=F');
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

// "YYYY-MM-DD" → "M/D"。staleness 明示用 (ui-designer 必須条件: 「M/D 終値時点」)。
function fmtMonthDay(d) {
  if (!d || typeof d !== 'string') return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

export default function BreakoutZoneCard({ ticker, plan = 'free', compact = false, variant = 'default', onUpgrade }) {
  const isUnified = variant === 'unified';
  const isPremium = plan === 'premium';
  const [technical, setTechnical] = useState(null);
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      // canonical patterns (breakout 含む) で統一 → StockPriceChart/BuyZoneCard と同一 URL で dedupGet cache hit。
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

  const isNonEquity = isNonEquityTicker(ticker);
  const bo = technical?.patterns?.breakout || null;
  const zoneKey = (bo?.detected) ? classifyBreakoutZone(bo.state) : 'unknown';

  // pivot 価格: payload の pivot_high 優先、なければ levels[] の pivot_high kind から。
  const pivotPrice = useMemo(() => {
    if (Number.isFinite(bo?.pivot_high)) return bo.pivot_high;
    const lvl = Array.isArray(bo?.levels)
      ? bo.levels.find((l) => l?.kind === 'pivot_high' && Number.isFinite(l?.price))
      : null;
    return lvl ? lvl.price : null;
  }, [bo]);

  // 現在価格 (price-history 最新 close) + as_of (データ最終日 = staleness 明示)
  const currentPrice = useMemo(() => {
    if (!priceData?.prices?.length) return null;
    const last = priceData.prices[priceData.prices.length - 1];
    return Number.isFinite(last?.close) ? last.close : null;
  }, [priceData]);
  const asOf = useMemo(() => {
    if (!priceData?.prices?.length) return null;
    return priceData.prices[priceData.prices.length - 1]?.date || null;
  }, [priceData]);

  if (loading && !technical) {
    return (
      <section className="panel-card bzc-card" data-testid="breakout-zone-card" aria-busy style={{ minHeight: 128 }}>
        <header className="bzc-head">
          <h3 className="bzc-title">新高値ブレイク</h3>
        </header>
        <div className="bzc-state-empty">
          <p className="bzc-state-sub">読み込み中…</p>
        </div>
      </section>
    );
  }

  // 非表示条件 (Pane3 ノイズゼロ): 未検出 / bo_* でない / 非株式
  if (!bo || !bo.detected || zoneKey === 'unknown' || isNonEquity) {
    return null;
  }

  const label = BUY_ZONE_LABEL_JP[zoneKey];
  const desc = BUY_ZONE_DESC_JP[zoneKey];
  if (!desc) return null;

  // pending/soft は「途上・確認不十分」= warning で注意喚起 (最もアクション余地)。
  // confirmed/extended は事実報告 = muted (ui-designer: 確定は控えめ「もう過ぎた話」)。
  const isPendingLike = zoneKey === 'bo_pending' || zoneKey === 'bo_soft';
  const chipTone = isPendingLike ? 'warning' : 'muted';

  const cardTitle = '新高値ブレイク';

  // narration placeholder inject (数値は backend 計算、JS は文字列置換のみ = §38/Hallucination Guard)
  const conclusionText = desc.conclusion;
  let detailText = desc.detail;
  const baseRise = Number.isFinite(bo?.base_rise_pct) ? Math.abs(bo.base_rise_pct).toFixed(1) : '—';
  if (zoneKey === 'bo_extended') {
    detailText = desc.detail.replace('{BASE_RISE_PCT}', baseRise);
  }
  const intradayNote = desc.intraday_note || null;

  // §38: 価格 hero / distance を上昇色で塗らない (中立 muted 固定)。
  const distancePct = (Number.isFinite(currentPrice) && Number.isFinite(pivotPrice) && pivotPrice > 0)
    ? ((currentPrice / pivotPrice) - 1) * 100
    : null;

  return (
    <section
      className={`panel-card bzc-card${isUnified ? ' is-card-unified' : ''}`}
      data-testid="breakout-zone-card"
      data-spotlight="card"
      style={{ minHeight: 128 }}
    >
      {/* chip + hero 1 row (BuyZoneCard と同 idiom)。hero 価格は Premium のみ数値、無料は「直近高値水準」テキスト。 */}
      <div className="card-price-hero" data-testid="breakout-zone-card-price-hero">
        <Chip variant="display" size="xs" tone={chipTone} className="card-price-hero__chip">
          <Target size={11} strokeWidth={2} className="card-zone-context__icon" aria-hidden="true" />
          {label}
        </Chip>
        <span className="card-price-hero__value" aria-label={isPremium && Number.isFinite(pivotPrice) ? `直近高値 ${fmtUsd(pivotPrice)}` : '直近高値水準'}>
          {isPremium && Number.isFinite(pivotPrice) ? fmtUsd(pivotPrice) : '直近高値水準'}
        </span>
        {isPremium && Number.isFinite(currentPrice) && distancePct != null && (
          <span className="card-price-hero__delta card-price-hero__delta--muted">
            現在 {fmtUsd(currentPrice)} ({fmtPct(distancePct)})
          </span>
        )}
      </div>

      <header className="bzc-head">
        <h3 className="bzc-title">{cardTitle}</h3>
        {asOf && <span className="bzc-asof" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtMonthDay(asOf)} 終値時点</span>}
      </header>

      <div className="bzc-body">
        <div className="bzc-narration">
          <p className="bzc-desc bzc-desc--conclusion">{conclusionText}</p>

          {/* intraday_note は読み流し防止のため amber 左ボーダーの「囁き系」block (ui-designer 必須条件 2)。 */}
          {intradayNote && (
            <aside
              className="bzc-intraday-note"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                marginTop: 8,
                paddingLeft: 8,
                borderLeft: '2px solid var(--color-warning)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              <Clock size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-warning)' }} aria-hidden="true" />
              <span>{intradayNote}</span>
            </aside>
          )}

          {/* detail (一般ルール説明 + 乖離率等の精密数値) は Premium のみ。無料は確度誘導 chip。 */}
          {!compact && isPremium && (
            <p className="bzc-desc bzc-desc--detail">{detailText}</p>
          )}
        </div>

        {/* Premium: 確度判別の精密数値 (pivot 価格・出来高比・pivot 乖離率)。 */}
        {!compact && isPremium && (
          <div className="bzc-meta">
            {Number.isFinite(pivotPrice) && (
              <span>直近高値 <span className="bzc-meta-value">{fmtUsd(pivotPrice)}</span></span>
            )}
            {Number.isFinite(bo.volume_ratio) && (
              <span>出来高 <span className="bzc-meta-value">{bo.volume_ratio.toFixed(2)}x</span></span>
            )}
            {Number.isFinite(bo.base_rise_pct) && (
              <span>pivot 乖離 <span className="bzc-meta-value">{fmtPct(bo.base_rise_pct)}</span></span>
            )}
          </div>
        )}

        {/* 無料層: 確度数値は Premium 誘導 (lock icon でなく chip、ui-designer 推奨)。 */}
        {!compact && !isPremium && (
          <div className="bzc-meta" data-testid="breakout-zone-card-premium-teaser">
            <Chip
              variant="display"
              size="xs"
              tone="accent"
              onClick={onUpgrade}
              style={onUpgrade ? { cursor: 'pointer' } : undefined}
            >
              確度の詳細 (出来高比・pivot 乖離) は Premium
            </Chip>
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
