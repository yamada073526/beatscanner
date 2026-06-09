import { useEffect, useMemo, useState } from 'react';
import { fetchAnalyst, fetchTechnical, fetchPriceHistory } from '../api.js';
import { DIST_DAYS_LABEL_JP, classifyDistDays } from '../lib/distributionDaysLabels.js';
import Chip from './ui/Chip.jsx';
// v195 round2 (§38 verdict 条件付き OK): チャート線と 1:1 mirror の「線サンプル swatch」用 identity 色。
// hex の定義は StockPriceChart に集約 (ここで raw hex を複製しない)。 identity 色は 3 つ
// (アナリスト目標=accent / SMA50 / SMA200) に限定し、 損切り/サポート/pivot は中立
// (行全体の色塗りや 損切り=赤 は「売れ」の行動示唆に読まれ §38/§5 抵触のため BAN)。
import { SMA_50_COLOR, SMA_200_COLOR } from './StockPriceChart.jsx';
// v195 round3: stagger を「視界に入った瞬間」 に発火 (mount 時は画面外で再生済 = user「一気に表示される」 の真因)。
// useInViewOnce は ForwardOutlookSection で本番検証済。 count-up も同 hook 群 (進捗係数 0→1 を 1 本だけ回し、
// 各行は dist×係数 を表示 — 行ごとの hook 不要)。
import { useInViewOnce } from '../hooks/useInViewOnce.js';
import { useCountUp } from '../hooks/useCountUp.js';

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

// v195 round2: チャート線 identity 色の swatch map (§38 条件付き OK の 3 つのみ)。
// その他 (損切り/サポート/pivot/52週) は中立 — 赤/青の行塗りは「売れ/買え」 の行動示唆に読まれ §38/§5 抵触。
const LEVEL_SWATCH = {
  target: 'var(--color-accent)',
  sma50: SMA_50_COLOR,
  sma200: SMA_200_COLOR,
};
const NEUTRAL_SWATCH = 'color-mix(in srgb, var(--text-muted) 60%, transparent)';

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
  // v195 round3: ladder が視界に入った瞬間に stagger + count-up を発火 (once)。
  const [ladderRef, ladderInView] = useInViewOnce({ threshold: 0.1, rootMargin: '0px' });
  // 距離% の count-up 進捗係数 (0→1)。 reduced-motion は hook 内で即 1。 inView 前は係数 1 で実値表示
  // (motion 環境では行自体が opacity 0 のため見えない / reduced-motion 環境では最初から実値 = §38 セーフ)。
  const countProgress = useCountUp(ladderInView ? 1 : null, { duration: 450, digits: 3, forceFromZero: true });
  const pf = ladderInView ? countProgress : 1;

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    Promise.allSettled([
      fetchAnalyst(ticker),
      // v195 round2: チャート/prefetchAll と同一 patterns 文字列に統一。 dedupGet は URL key cache のため
      // 文字列が違うと coalesce が効かず二重 fetch になっていた (+ sma_200 が ladder に届かず 1:1 mirror が破れていた)。
      fetchTechnical(ticker, 'cup_handle,sma_50,sma_200,rs,dma_cross'),
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
    // v195 round2 (金融レビュー): breakout_extended (ATH 過延伸再分類) の pivot は「もう乗れない節目」。
    // 「買い目安」 と確定的に呼ぶと Trust Cliff のためラベルを中立化。
    const pivotLabel = cup?.state === 'breakout_extended' ? '節目 (pivot・ブレイク済)' : '買い目安 (pivot)';
    // v195 round2 (金融レビュー): box_support (底値帯) と last_breakout (突破点) は性質が違う。
    // fallback 時に「サポート」 と呼ぶのは厳密には誤り → ラベル分岐で honest に。
    const supportFromBox = Number.isFinite(cup?.box_support?.level);
    const support = supportFromBox
      ? cup.box_support.level
      : (Number.isFinite(cup?.last_breakout?.price) ? cup.last_breakout.price : null);
    const supportLabel = supportFromBox ? 'サポート' : '直近ブレイク水準';
    const lastOverlay = (key) => {
      const ov = technical?.overlays?.find((o) => o.key === key);
      const last = ov?.data?.[ov.data.length - 1];
      return Number.isFinite(last?.value) ? last.value : null;
    };
    const sma50 = lastOverlay('sma_50');
    // v195 round2 (金融レビュー最優先): SMA200 はチャートに描画済なのに ladder に無い = 1:1 mirror の破れ。
    const sma200 = lastOverlay('sma_200');
    // v195 round2 (金融レビュー): 52週高値/安値 (O'Neil 式「新高値ブレイク」の核)。 1y prices から算出、追加 fetch ゼロ。
    const closes = Array.isArray(prices) ? prices.map((p) => p?.close).filter(Number.isFinite) : [];
    const high52 = closes.length ? Math.max(...closes) : null;
    const low52 = closes.length ? Math.min(...closes) : null;
    // 損切り目安 = 現在価格 × 0.92 (8% ルール、今エントリー想定で常に現在価格の下値に置く)。
    // チャートの stop8 (高値×0.92=高値トレイル) は別概念で、 ladder に出すと「損切りが現在より上」 と
    // 混乱する (高値から 8% 超下落した銘柄)。 ladder は現在基準で下値に統一し、 ラベルでも基準を明示
    // (チャートが「(高値比)」 と明示しているのと対称。 同名「-8%」 が別価格を指す Trust Cliff の解消)。
    const stop = Number.isFinite(current) ? current * 0.92 : null;

    const raw = [
      { key: 'high52', label: '52週高値', price: high52 },
      { key: 'target', label: 'アナリスト目標', price: consensus },
      { key: 'pivot', label: pivotLabel, price: pivot },
      { key: 'current', label: '現在価格', price: current, isCurrent: true },
      { key: 'sma50', label: '50日移動平均', price: sma50 },
      { key: 'sma200', label: '200日移動平均', price: sma200 },
      { key: 'support', label: supportLabel, price: support },
      { key: 'low52', label: '52週安値', price: low52 },
      { key: 'stop', label: '損切り目安 (現在−8%)', price: stop },
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
          {/* v195 round3 (user 不満1「サマリーが説明文と同属性に見える」): 静的キャプションと区別するため
              Chip primitive に昇格。 右の地合いバッジと同じ視覚語彙 = 「これは銘柄固有のデータポイント」 と伝わる。 */}
          {stateText ? (
            <Chip variant="display" size="xs" tone="muted">
              {stateText}
            </Chip>
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
      {/* 案A (v195 dogfood 2026-06-10、 ui-designer 提案): 「縦軸(spine) + tick」 ladder。
          旧 border 箱 + 均等行リストが「数直線に見えない」(user「ダサい」) ため撤廃。 左に連続した spine
          (border-left) を引き、 現在価格を accent tick + 20px 値でアンカー、 上値/下値を L3 hairline ラベルで
          グループ化 (§C-11 面の引き算)。 §38: 方向は空間配置(現在価格の上/下)+ラベルのみ、 緑/赤の方向色は不使用。
          発光 host 化しない (.panel-card 不使用、 border-left は box-shadow でないため glow 危険ゾーン外)。 */}
      {(() => {
        const curIdx = levels.findIndex((l) => l.isCurrent);
        const upper = curIdx > 0 ? levels.slice(0, curIdx) : [];
        const lower = (curIdx >= 0 && curIdx < levels.length - 1) ? levels.slice(curIdx + 1) : [];
        const cur = curIdx >= 0 ? levels[curIdx] : null;
        // mount stagger: 描画順に 40ms 刻みの animationDelay (index.css §PriceLadder の .pl-row と対、
        // ホテルのメニューが一品ずつ供される所作。 reduced-motion は CSS 側で一括無効)。
        let seq = 0;
        const stagger = () => ({ animationDelay: `${(seq++) * 40}ms` });

        // グループ冠「上値/下値」: v195 round3 (user「ファンダ章の来期コンセンサスと親戚に見えると統一感」) —
        // ForwardOutlookSection の L3 idiom (11/600/muted/uppercase 0.08em) + MetricBlock と同じ
        // gold 35% の borderLeft 3px に揃え、 ファンダ章と視覚語彙を共有。 gold は装飾 accent で
        // 上値=gold の意味付けではない (§38 方向色に非抵触、 elevation whitelist 内 color-mix)。
        const groupLabel = (text) => (
          <div
            className="pl-row"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderLeft: '3px solid color-mix(in srgb, var(--color-gold) 35%, var(--border))',
              paddingLeft: 'var(--space-2, 8px)',
              margin: 'var(--space-3, 12px) 0 var(--space-1, 4px)',
              ...stagger(),
            }}
          >
            {text}
          </div>
        );

        const levelRow = (l) => {
          const dist = (Number.isFinite(l.price) && Number.isFinite(current)) ? (l.price / current - 1) * 100 : null;
          return (
            <div
              key={l.key}
              data-testid={`price-ladder-row-${l.key}`}
              className="pl-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3, 12px)',
                padding: 'var(--space-2, 8px) 0',
                // 傘下行は冠 (gold accent + pad 8px) より深いインデントで「冠の庇の下」 を空間で示す
                paddingLeft: 'var(--space-5, 20px)',
                ...stagger(),
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', minWidth: 0 }}>
                {/* 線サンプル swatch: チャート凡例と同 idiom でチャートの線と 1:1 対応を示す
                    (identity 色 3 つのみ、 他は中立 — §38 verdict)。 hover で僅かに膨らむ (.pl-swatch) */}
                <span
                  className="pl-swatch"
                  aria-hidden="true"
                  style={{
                    width: 14,
                    height: 2.5,
                    borderRadius: 2,
                    flexShrink: 0,
                    background: LEVEL_SWATCH[l.key] || NEUTRAL_SWATCH,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{l.label}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3, 12px)' }}>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{fmtUsd(l.price)}</span>
                <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', minWidth: 72, textAlign: 'right' }}>
                  {/* v195 round3: 視界進入時に 0→実値の count-up (係数 pf)。 距離% は事実記述 (§38 OK 判定済 idiom) */}
                  {dist != null ? `現在から ${fmtPct(dist * pf)}` : '—'}
                </span>
              </span>
            </div>
          );
        };

        const currentRow = (l) => (
          <div
            key={l.key}
            data-testid={`price-ladder-row-${l.key}`}
            className="pl-row"
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 'var(--space-3, 12px)',
              padding: 'var(--space-3, 12px) 0',
              ...stagger(),
            }}
          >
            {/* spine 上の accent tick (現在価格アンカー、 §38 中立ブランド色)。 .pl-tick = scaleX 0→1 入場 */}
            <span aria-hidden="true" className="pl-tick" style={{
              position: 'absolute',
              left: 'calc(-1 * var(--space-4, 16px) - 1px)',
              top: '50%',
              transform: 'translateY(-50%)',
              width: 11,
              height: 3,
              borderRadius: 2,
              background: 'var(--color-accent)',
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{l.label}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3, 12px)' }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{fmtUsd(l.price)}</span>
              <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', minWidth: 72, textAlign: 'right' }}>
                {Number.isFinite(sma50Dist) ? `50DMA ${fmtPct(sma50Dist * pf)}` : '基準'}
              </span>
            </span>
          </div>
        );

        return (
          <div
            // v195 round3: 視界進入で data-pl-inview が付き、 index.css 側で .pl-row/.pl-tick の
            // animation が arming される (mount 起点だと画面外で再生済になる真因の修正)。
            ref={ladderRef}
            data-pl-inview={ladderInView ? 'true' : undefined}
            style={{
              position: 'relative',
              borderLeft: '2px solid var(--border)',
              paddingLeft: 'var(--space-4, 16px)',
            }}
          >
            {upper.length > 0 && groupLabel('上値')}
            {upper.map(levelRow)}
            {cur && currentRow(cur)}
            {lower.length > 0 && groupLabel('下値')}
            {lower.map(levelRow)}
          </div>
        );
      })()}
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
