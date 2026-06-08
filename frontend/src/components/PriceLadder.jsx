import { useEffect, useMemo, useState } from 'react';
import { fetchAnalyst, fetchTechnical, fetchPriceHistory } from '../api.js';
import { DIST_DAYS_LABEL_JP, classifyDistDays } from '../lib/distributionDaysLabels.js';
import Chip from './ui/Chip.jsx';

/**
 * PriceLadder — テクニカル章の価格指標を「現在価格を中心とした縦の数直線」 に統合する component。
 *
 * v187 (2026-06-08、3体合議 ui-designer / 金融アナリスト / qa-dogfooder 全員一致):
 *   横並び売買目安カード5枚 (アナリスト目標 / Cup pivot / サポート / 通常レンジ / Distribution) の
 *   「並列が見辛い」 を根治。価格レベル (アナリスト目標 / 買い目安 pivot / 現在価格 / 50DMA /
 *   サポート / 損切り) を**価格降順の縦リスト**で表示し、現在価格を境に上=上値の目安・下=下値の目安。
 *
 * § 38 ガード:
 *   - 価格 + 現在価格からの距離% のみ (事実記述)。「上抜けたら買い」 等の行動指示・将来予測・矢印は BAN。
 *   - ラベルは静的文字列 (LLM 不使用)。narration なし。
 *   - 色は中立 gray + 現在価格行 hero (accent border) のみ。**緑/赤は使わない**
 *     (上=目標でも「上昇緑」 ではない、CLAUDE.md 投資業界色ルール厳守)。
 *
 * チャート (StockPriceChart) の水平ライン群と**同一 API・同一値**で 1:1 mirror:
 *   consensus=analyst / pivot=cup_handle.pivot / sma50=overlays sma_50 /
 *   support=box_support|last_breakout / stop=maxClose(1y)×0.92 (チャート stop8 と一致)。
 *
 * memory: [[feedback_chart_overlay_safety]] (Number.isFinite guard) /
 *   [[feedback_cls_envelope_pattern]] (minHeight envelope) /
 *   [[feedback_testid_all_render_paths]] (data-testid 全 state)。
 *   発光バグ回避: card (.panel-card) でなく chart 付随のレベル表 (token inline、発光 host にしない)。
 */

function fmtUsd(v) {
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : '—';
}
function fmtPct(v) {
  if (!Number.isFinite(v)) return '—';
  const s = v > 0 ? '+' : '';
  return `${s}${v.toFixed(1)}%`;
}

/**
 * §38 セーフな状態サマリー: 現在価格と各テクニカルレベルの位置関係を「事実記述」 のみで返す。
 * LLM 不使用 (機械判定 + 静的文)。「買い」「反発期待」「上昇トレンド」 等の行動指示・将来予測・
 * 最上級は一切含めない ([[feedback_condition_pulse_pattern]] の STATE_LABEL_JP と同じ静的 dict パターン)。
 */
function buildTechnicalState({ current, sma50, pivot, support, sma50Dist }) {
  if (!Number.isFinite(current)) return null;
  const parts = [];
  if (Number.isFinite(sma50)) {
    parts.push(current >= sma50 ? '50日移動平均の上' : '50日移動平均の下');
  }
  // 過熱 (50DMA から大きく伸びた) を優先、 なければ pivot との位置関係
  if (Number.isFinite(sma50Dist) && sma50Dist >= 15) {
    parts.push('50日線から伸びた位置 (過熱目安)');
  } else if (Number.isFinite(pivot)) {
    parts.push(current < pivot ? '買い目安 (pivot) の手前' : '買い目安 (pivot) を上回る位置');
  }
  if (Number.isFinite(support)) {
    const d = (current / support - 1) * 100;
    if (Math.abs(d) <= 2) parts.push('サポート目安の近辺');
  }
  if (parts.length === 0) return null;
  return `${parts.join('・')} にあります。`;
}

function SectionLabel() {
  return (
    <div style={{ marginBottom: 'var(--space-2, 8px)' }}>
      <div style={{
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: 'var(--text-primary)',
        textTransform: 'uppercase',
      }}>
        価格目安
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
        現在価格を基準とした上値・下値の目安
      </div>
    </div>
  );
}

export default function PriceLadder({ ticker }) {
  const [analyst, setAnalyst] = useState(null);
  const [technical, setTechnical] = useState(null);
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    Promise.allSettled([
      fetchAnalyst(ticker),
      fetchTechnical(ticker, 'cup_handle,sma_50'),
      fetchPriceHistory(ticker, '1y'),
    ])
      .then(([a, t, p]) => {
        if (cancelled) return;
        const av = a.status === 'fulfilled' ? a.value : null;
        const tv = t.status === 'fulfilled' ? t.value : null;
        const pv = p.status === 'fulfilled' ? p.value : null;
        setAnalyst(av);
        setTechnical(tv);
        setPriceData(pv);
        if (!av && !tv && !pv) setErrored(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  const { levels, current, sma50Dist, distCount, stateText } = useMemo(() => {
    const prices = priceData?.prices;
    const current = (prices?.length && Number.isFinite(prices[prices.length - 1]?.close))
      ? prices[prices.length - 1].close : null;
    // analyst consensus (per-source namespace: price_target === 'ok' のときのみ)
    const consensus = analyst?.sources?.price_target === 'ok'
      ? (Number.isFinite(analyst?.precomputed_metrics?.target_range?.mean)
        ? analyst.precomputed_metrics.target_range.mean : null)
      : null;
    const cup = technical?.patterns?.cup_handle || null;
    const pivot = Number.isFinite(cup?.pivot?.price) ? cup.pivot.price : null;
    const support = Number.isFinite(cup?.box_support?.level)
      ? cup.box_support.level
      : (Number.isFinite(cup?.last_breakout?.price) ? cup.last_breakout.price : null);
    const sma50 = (() => {
      const ov = technical?.overlays?.find((o) => o.key === 'sma_50');
      const last = ov?.data?.[ov.data.length - 1];
      return Number.isFinite(last?.value) ? last.value : null;
    })();
    // 損切り目安 = 現在価格 × 0.92 (8% ルール、今エントリー想定で常に現在価格の下値に置く)。
    // チャートの stop8 (高値×0.92=高値トレイル) は別概念で、 ladder に出すと「損切りが現在より上」 と
    // 混乱する (高値から 8% 超下落した銘柄)。 ladder は現在基準で下値に統一。
    const stop = Number.isFinite(current) ? current * 0.92 : null;

    const raw = [
      { key: 'target', label: 'アナリスト目標', price: consensus },
      { key: 'pivot', label: '買い目安 (pivot)', price: pivot },
      { key: 'current', label: '現在価格', price: current, isCurrent: true },
      { key: 'sma50', label: '50日移動平均', price: sma50 },
      { key: 'support', label: 'サポート', price: support },
      { key: 'stop', label: '損切り目安 (−8%)', price: stop },
    ].filter((l) => Number.isFinite(l.price));
    raw.sort((a, b) => b.price - a.price);

    const sma50Dist = (Number.isFinite(current) && Number.isFinite(sma50) && sma50 > 0)
      ? (current / sma50 - 1) * 100 : null;

    // 地合い (Distribution Days): 前日比 -0.2% 以下 かつ 出来高前日超 を直近 25 営業日でカウント (IBD)。
    const distCount = (() => {
      if (!Array.isArray(prices) || prices.length < 7) return null;
      const win = prices.slice(-26);
      let count = 0;
      let valid = 0;
      for (let i = 1; i < win.length; i++) {
        const t = win[i];
        const y = win[i - 1];
        if (!Number.isFinite(t?.close) || !Number.isFinite(y?.close) || y.close <= 0) continue;
        if (!Number.isFinite(t?.volume) || !Number.isFinite(y?.volume)) continue;
        valid++;
        if ((t.close / y.close - 1) * 100 <= -0.2 && t.volume > y.volume) count++;
      }
      return valid < 5 ? null : count;
    })();
    const stateText = buildTechnicalState({ current, sma50, pivot, support, sma50Dist });

    return { levels: raw, current, sma50Dist, distCount, stateText };
  }, [analyst, technical, priceData]);

  // loading: CLS envelope (minHeight) + skeleton
  if (loading && !priceData) {
    return (
      <div data-testid="price-ladder" data-state="loading" aria-busy style={{ minHeight: 220 }}>
        <SectionLabel />
        <div style={{
          height: 180,
          borderRadius: 'var(--radius-lg, 16px)',
          background: 'var(--bg-muted)',
          animation: 'skel-pulse 1.5s ease-in-out infinite',
        }} />
      </div>
    );
  }

  // empty / errored: Trust Cliff 防止 (空 panel を出さず honest fallback)
  if (errored || !Number.isFinite(current) || levels.length < 2) {
    return (
      <div data-testid="price-ladder" data-state={errored ? 'errored' : 'empty'} style={{ minHeight: 80 }}>
        <SectionLabel />
        <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 'var(--space-2, 8px) 0' }}>
          {errored ? '価格データの取得に失敗しました' : '価格目安データがありません'}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="price-ladder" data-state="main" style={{ minHeight: 220 }}>
      <SectionLabel />
      {/* §38 状態サマリー (位置の事実記述、LLM 不使用) + 地合いバッジ (Distribution Days、市場全体の指標)。
          地合いは価格 ladder と性質が違うため、 同じ数直線でなく上部の 1 行に分離して提示。 */}
      {(stateText || Number.isFinite(distCount)) && (
        <div
          data-testid="price-ladder-summary"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2, 8px)',
            marginBottom: 'var(--space-2, 8px)',
            flexWrap: 'wrap',
          }}
        >
          {stateText ? (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {stateText}
            </span>
          ) : <span />}
          {Number.isFinite(distCount) && (() => {
            const zone = classifyDistDays(distCount);
            const tone = zone === 'pressure' ? 'loss'
              : zone === 'caution' ? 'warning'
              : zone === 'healthy' ? 'gain' : 'muted';
            return (
              <Chip variant="display" size="xs" tone={tone}>
                地合い: {DIST_DAYS_LABEL_JP[zone] || '—'} ({distCount}日/25)
              </Chip>
            );
          })()}
        </div>
      )}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg, 16px)',
        overflow: 'hidden',
        background: 'var(--bg-card)',
      }}>
        {levels.map((l, i) => {
          const dist = (Number.isFinite(l.price) && Number.isFinite(current))
            ? (l.price / current - 1) * 100 : null;
          return (
            <div
              key={l.key}
              data-testid={`price-ladder-row-${l.key}`}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 'var(--space-3, 12px)',
                padding: l.isCurrent
                  ? 'var(--space-3, 12px) var(--space-4, 16px)'
                  : 'var(--space-2, 8px) var(--space-4, 16px)',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                background: l.isCurrent ? 'var(--bg-subtle)' : 'transparent',
                borderLeft: l.isCurrent ? '3px solid var(--color-accent)' : '3px solid transparent',
              }}
            >
              <span style={{
                fontSize: l.isCurrent ? 13 : 12,
                fontWeight: l.isCurrent ? 600 : 500,
                color: l.isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>
                {l.label}
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3, 12px)' }}>
                <span style={{
                  fontSize: l.isCurrent ? 20 : 15,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  fontVariantNumeric: 'tabular-nums',
                  color: l.isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                  {fmtUsd(l.price)}
                </span>
                <span style={{
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--text-muted)',
                  minWidth: 64,
                  textAlign: 'right',
                }}>
                  {l.isCurrent
                    ? (Number.isFinite(sma50Dist) ? `50DMA ${fmtPct(sma50Dist)}` : '基準')
                    : (dist != null ? `現在から ${fmtPct(dist)}` : '—')}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <p style={{
        fontSize: 10,
        color: 'var(--text-muted)',
        marginTop: 'var(--space-2, 8px)',
        fontStyle: 'italic',
        lineHeight: 1.5,
      }}>
        ※ 各価格は目安。テクニカル分析は将来の値動きを保証するものではありません。
      </p>
    </div>
  );
}
