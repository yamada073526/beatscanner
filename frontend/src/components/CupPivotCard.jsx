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
import { BUY_ZONE_LABEL_JP, BUY_ZONE_DESC_JP, BUY_ZONE_FOOTER, CUP_SELL_ZONE_DESC_JP, classifyBuyZone } from '../lib/buyZoneLabels.js';
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

  // v126 R11-3 + R13-5 + v127 R16-3 (5/29): 'formation' + 'breakout_pending' + 'breakout_extended'
  //   + 'cup_completing' (カップ完成間近・未突破、 LLY 型) の 4 state catch。
  // AAPL/NVDA: formation or breakout_pending、 LLY: cup_completing、 GE/META 等真の ATH 更新: breakout_extended。
  // breakout_confirmed のみ別 BuyZoneCard 担当 (重複回避)。
  const showCupPivot = cupHandle?.detected
    && ['formation', 'breakout_pending', 'breakout_extended', 'cup_completing'].includes(state)
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
        {/* v126 R14-4 (user dogfood feedback): breakout_pending chip 自己主張強化。
            - data-cup-state attribute で既存 pulse animation 経路 (index.css §6561) を発火
            - state='breakout_pending' のみ size up xs→sm + tone warning + glow halo
            - 他 state (formation / breakout_extended) は xs / accent のまま (静寂 hierarchy 維持) */}
        <Chip
          variant="display"
          size={state === 'breakout_pending' ? 'sm' : 'xs'}
          tone={state === 'breakout_pending' ? 'warning' : 'accent'}
          data-cup-state={state}
        >
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
          {/* v126 R13-5: breakout_extended は cup data なし、 代わりに ATH 252w high + overshoot % を meta 表示 */}
          {state === 'breakout_extended' ? (
            <>
              {Number.isFinite(cupHandle.ath_252w_high) && (
                <span title="ATH = All-Time High (1 年最高値): 過去 252 営業日 (= 約 1 年) で最も高い終値">
                  ATH <span className="cpc-meta-value">{fmtUsd(cupHandle.ath_252w_high)}</span>
                  {/* v126 R14-5 (user dogfood「ATH 用語 教育文」): retail 投資家向け補足文。
                      muted small text で「直近 1 年最高値」 を併記、 hover で title tooltip も表示。 */}
                  <span className="cpc-meta-note">直近 1 年最高値</span>
                </span>
              )}
              {Number.isFinite(cupHandle.extended_overshoot_pct) && (
                <span>
                  rim overshoot <span className="cpc-meta-value">{fmtPct(cupHandle.extended_overshoot_pct)}</span>
                </span>
              )}
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* v126 R14-6 (5/29 user 要望、 金融アナリスト Sonnet verdict 案 A):
            CupPivotCard 内に sell section 併記。 buy narration の下に divider + sell zone narration。
            既存 SellZoneCard (50DMA absolute) との役割分担: pivot 相対値 (S1 -8% / S2 +20-25% / S5 50DMA break) を担当。 */}
        {CUP_SELL_ZONE_DESC_JP[state] && (
          <div className="cpc-section cpc-section--sell">
            <div className="cpc-section-header">
              <span className="cpc-section-label">{CUP_SELL_ZONE_DESC_JP[state].label}</span>
            </div>
            <p className="cpc-desc cpc-desc--conclusion cpc-desc--sell">{CUP_SELL_ZONE_DESC_JP[state].conclusion}</p>
            <p className="cpc-desc cpc-desc--detail">{CUP_SELL_ZONE_DESC_JP[state].detail}</p>
          </div>
        )}

        {/* 金融アナリスト Opus verdict (R8-3): 強制 footer (citation + disclaimer) */}
        <footer className="cpc-footer">
          <span className="cpc-source">{BUY_ZONE_FOOTER.source}</span>
          <span className="cpc-disclaimer">{BUY_ZONE_FOOTER.disclaimer}</span>
        </footer>
      </div>
    </section>
  );
}
