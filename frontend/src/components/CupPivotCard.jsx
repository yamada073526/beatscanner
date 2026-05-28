/**
 * CupPivotCard — MarketSurge 互換 Cup-Handle pivot buy point の narration card.
 *
 * v126 R8-3 Phase 2 (MarketSurge 互換テクニカルシグナル):
 *   - 既存 /api/technical/{ticker}?fields=cup_handle のレスポンスを消費
 *   - state === 'formation' (= カップ形成中、 まだ breakout してない) の銘柄のみ表示
 *   - 静的 dictionary narration (buyZoneLabels.js)、 LLM 不使用
 *   - 金融アナリスト Opus verdict (5/29): 「上抜けたら買い」 BAN、 「目安」 idiom 厳守
 *   - 出典明示 footer + テクニカル disclaimer 強制
 *   - SellZoneCard と同 layout idiom (panel-card + chip header + 2 field narration + meta + footer)
 *
 * non-display 条件 (Trust Cliff 防止):
 *   - cup_handle.detected === false (pattern なし)
 *   - state !== 'formation' (breakout_confirmed 等、 Phase 3 BuyZoneCard に委譲)
 *   - pivot.price 取得不可
 *   = 表示する余地なしの場合は何も描画しない (null return)、 Pane 3 ノイズ最小化
 *
 * memory anchors:
 *   - buyZoneLabels.js (静的 dictionary SSOT)
 *   - project_cup_handle_design.md (cup-handle SSOT)
 *   - feedback_data_completeness_guard.md (per-source data namespace)
 *   - feedback_cls_envelope_pattern.md (root minHeight envelope)
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchTechnical } from '../api.js';
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

export default function CupPivotCard({ ticker }) {
  const [technical, setTechnical] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    fetchTechnical(ticker, 'cup_handle')
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          setErrored(true);
          setTechnical(null);
        } else {
          setTechnical(res);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrored(true);
          setTechnical(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  const cupHandle = technical?.patterns?.cup_handle || null;
  const state = cupHandle?.state || null;
  const buyZone = useMemo(() => classifyBuyZone(state), [state]);

  // pivot price + 現在価格との distance
  const pivotPrice = Number.isFinite(cupHandle?.pivot?.price) ? cupHandle.pivot.price : null;
  // 現在価格: StockPriceChart と同じ技術 endpoint には ない (price-history 必要)。
  // CLS envelope のため簡略化、 pivot まで何 % は cup_handle 内の追加メタ次第で展開可。
  // 現状 chip にだけ pivot price を出して、 meta 行は depth / weeks を表示 (情報密度確保)。

  // non-display 判定: Phase 2 は state=formation のみ表示 (breakout_confirmed 等は Phase 3 BuyZoneCard)
  if (loading) {
    return (
      <section className="panel-card cpc-card" data-testid="cup-pivot-card" aria-busy style={{ minHeight: 116 }}>
        <header className="cpc-head">
          <h3 className="cpc-title">Cup-Handle pivot</h3>
        </header>
        <div className="cpc-state-empty">
          <p className="cpc-state-sub">読み込み中…</p>
        </div>
      </section>
    );
  }

  // v126 R11-3 (5/29 user dogfood): 'formation' + 'breakout_pending' 両 state catch。
  // AAPL detected:true,state:'breakout_pending' で検出済みだが旧 'formation' のみ条件で漏れていた。
  // breakout_pending = handle 形成中で pivot 上抜け待ち、 narration「pivot 上抜けで新波動入りの目安」 対象。
  const showCupPivot = cupHandle?.detected
    && (state === 'formation' || state === 'breakout_pending')
    && pivotPrice != null
    && !errored;
  if (!showCupPivot) {
    return null;
  }

  const label = BUY_ZONE_LABEL_JP[buyZone];
  const desc = BUY_ZONE_DESC_JP[buyZone];

  // pivot price を narration の placeholder ($X.XX) に inject (静的 dictionary は固定文言、
  // 数値の動的 inject は Python aggregator でなく frontend で直接行うのが BeatScanner pattern)
  const detailWithPrice = desc.detail.replace(/pivot price/, `pivot price (${fmtUsd(pivotPrice)})`);

  return (
    <section
      className="panel-card cpc-card"
      data-testid="cup-pivot-card"
      data-spotlight="card"
      style={{ minHeight: 116 }}
    >
      <header className="cpc-head">
        <h3 className="cpc-title">Cup-Handle pivot</h3>
        <Chip variant="display" size="xs" tone="accent">
          {label}
        </Chip>
      </header>

      <div className="cpc-body">
        <div className="cpc-narration">
          <p className="cpc-desc cpc-desc--conclusion">{desc.conclusion}</p>
          <p className="cpc-desc cpc-desc--detail">{detailWithPrice}</p>
        </div>

        <div className="cpc-meta">
          <span>
            pivot <span className="cpc-meta-value">{fmtUsd(pivotPrice)}</span>
          </span>
          {Number.isFinite(cupHandle.cup?.depth_pct) && (
            <span>
              cup 深さ <span className="cpc-meta-value">{fmtPct(cupHandle.cup.depth_pct)}</span>
            </span>
          )}
          {Number.isFinite(cupHandle.cup?.weeks) && (
            <span>
              形成 <span className="cpc-meta-value">{cupHandle.cup.weeks} 週</span>
            </span>
          )}
        </div>

        {/* 金融アナリスト Opus verdict (R8-3): 強制 footer (citation + disclaimer) */}
        <footer className="cpc-footer">
          <span className="cpc-source">{BUY_ZONE_FOOTER.source}</span>
          <span className="cpc-disclaimer">{BUY_ZONE_FOOTER.disclaimer}</span>
        </footer>
      </div>
    </section>
  );
}
