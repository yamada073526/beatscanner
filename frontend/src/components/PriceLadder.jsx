import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fetchAnalyst, fetchTechnical, fetchPriceHistory, TECHNICAL_CANONICAL_PATTERNS } from '../api.js';
import { DIST_DAYS_LABEL_JP, classifyDistDays } from '../lib/distributionDaysLabels.js';
import Chip from './ui/Chip.jsx';
import CompassInfoButton from '../features/judgment/components/detail/sections/CompassInfoButton.jsx';
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
// round11 D: 現在価格行の当日ミニスパークライン (既存 primitive 流用、 module cache 内蔵。
// 色は当日実績の gain/loss = 業界ルール本来用途で §38 非該当)。
import RowSparkline from '../features/judgment/components/list/RowSparkline.jsx';

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

// round8 #1/#3 (ladder ⇄ チャート連動): チャートに対応線がある level のみ hover 強調 / click ジャンプ可。
// 連動は React 再レンダーでなく「.ds-judgment-detail への data 属性 + CSS」 で行う (recharts の再描画コスト
// 回避 + keep-mounted 複数 instance でも closest() でインスタンス局所)。 52週/損切りは対応線なし。
const CHART_LINKED = new Set(['target', 'pivot', 'support', 'sma50', 'sma200', 'ext15', 'ext25']);

// round8 #4 (前回比): per-ticker の「前回見た価格」 を localStorage に記録し、 10 分以上ぶりの再訪で
// 「前回チェック時から ±$X (±Y%)」 を表示する (過去の実績変化 = 事実記述、 §38 OK。 色も業界ルールの
// 本来用途 = 実績の上昇緑/下落赤)。 10 分未満の再訪では表示も更新もしない (連続リロードで「前回」 が
// 消えるのを防ぐ)。
const LASTSEEN_PREFIX = 'bs:pl:lastseen:';
function loadLastSeen(t) {
  try {
    const r = localStorage.getItem(LASTSEEN_PREFIX + t);
    if (!r) return null;
    const p = JSON.parse(r);
    return Number.isFinite(p?.price) && Number.isFinite(p?.ts) ? p : null;
  } catch { return null; }
}
function saveLastSeen(t, price) {
  try { localStorage.setItem(LASTSEEN_PREFIX + t, JSON.stringify({ price, ts: Date.now() })); } catch { /* noop */ }
}
function relTime(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

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
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2, 8px)',
      }}>
        価格目安
        {/* D2 compass Phase B: 状態コンパス「今の価格」と同じ §38-safe 解説モーダル (共有 ⓘ)。 */}
        <CompassInfoButton modalKey="price" ariaLabel="今の価格(テクニカル)の見方" />
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
  // round4: 450ms だと行の stagger 着地と重なり知覚不能 → round5 (user「一瞬で完了」): 2000ms に再延長。
  // スコアボードがゆっくり回り切る感覚 (行は ~700ms で出揃うので残り 1.3s はカウントだけが動く)。
  const countProgress = useCountUp(ladderInView ? 1 : null, { duration: 2000, digits: 3, forceFromZero: true });
  const pf = ladderInView ? countProgress : 1;
  // round8 #2 (spine 区間ハイライト): hover 行 ⇄ 現在価格行 の間を spine 上で accent ハイライト。
  // useInViewOnce の callback ref と DOM 測定用 ref を merge して同じ要素に付ける。
  const containerRef = useRef(null);
  const [hoverKey, setHoverKey] = useState(null);
  const [rangeBox, setRangeBox] = useState(null);
  // round8 #1: hover 中の level に対応するチャート線を強調 (data-pl-hl 属性、 CSS 駆動)。
  // round9: あわせて hover 価格を CustomEvent で通知 → チャートが点線ガイドを表示 (52週/損切り等、
  // 固有の線が無い level も全行反応)。
  const detailRoot = () => containerRef.current?.closest('.ds-judgment-detail') || null;
  const setChartHl = (key, price) => {
    const r = detailRoot();
    if (!r) return;
    if (key && CHART_LINKED.has(key)) r.setAttribute('data-pl-hl', key);
    else r.removeAttribute('data-pl-hl');
    try {
      r.dispatchEvent(new CustomEvent('pl-hover-price', { detail: { price: Number.isFinite(price) ? price : null } }));
    } catch { /* noop */ }
  };
  // round8 #3: click でチャートへ smooth scroll + 対応線を 1.8s フラッシュ。
  // round9 fix: 旧 querySelector('.recharts-wrapper') は detail 内の最初の recharts (過去業績推移等) に
  // 当たり上にスクロールしすぎた → 価格チャート固有の marker class から閉包する section を特定。
  const flashChart = (key) => {
    const r = detailRoot();
    if (!r || !CHART_LINKED.has(key)) return;
    const marker = r.querySelector('.pl-chartline-target, .pl-chartline-pivot, .pl-chartline-support, .pl-chartline-sma50, .pl-chartline-sma200');
    const chart = marker?.closest('section') || marker?.closest('.recharts-wrapper');
    if (!chart) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    chart.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    r.setAttribute('data-pl-flash', key);
    window.setTimeout(() => r.removeAttribute('data-pl-flash'), 1800);
  };

  useLayoutEffect(() => {
    if (!hoverKey) { setRangeBox(null); return; }
    const c = containerRef.current;
    if (!c) return;
    const hov = c.querySelector(`[data-testid="price-ladder-row-${hoverKey}"]`);
    const cur = c.querySelector('[data-testid="price-ladder-row-current"]');
    if (!hov || !cur || hov === cur) { setRangeBox(null); return; }
    const cr = c.getBoundingClientRect();
    const hc = hov.getBoundingClientRect();
    const uc = cur.getBoundingClientRect();
    const hMid = hc.top + hc.height / 2 - cr.top;
    const uMid = uc.top + uc.height / 2 - cr.top;
    setRangeBox({ top: Math.min(hMid, uMid), height: Math.max(2, Math.abs(uMid - hMid)) });
  }, [hoverKey]);
  // round8 #4 (前回比): state はここ、 effect は current (useMemo) 宣言後に置く (TDZ 回避)。
  const [prevSeen, setPrevSeen] = useState(null);
  // round11 A: 縮尺モード (行間を実際の価格差に比例させる「本物の数直線」 表示)。 session 内のみ保持。
  const [scaleMode, setScaleMode] = useState(false);
  // round11 B (逆連動): チャートの pl-chartline-* hover → ladder 行を強調 (CustomEvent 受信)。
  const [chartHoverKey, setChartHoverKey] = useState(null);
  useEffect(() => {
    const r = containerRef.current?.closest('.ds-judgment-detail');
    if (!r) return undefined;
    const on = (e) => setChartHoverKey(e?.detail?.key || null);
    r.addEventListener('pl-chart-hover', on);
    return () => r.removeEventListener('pl-chart-hover', on);
    // loading 解除後に container が mount されるため dep に loading (mount 前の attach 空振り回避)
  }, [loading]);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    Promise.allSettled([
      fetchAnalyst(ticker),
      // v195 round2: チャート/prefetchAll と同一 patterns 文字列に統一。 dedupGet は URL key cache のため
      // 文字列が違うと coalesce が効かず二重 fetch になっていた (+ sma_200 が ladder に届かず 1:1 mirror が破れていた)。
      fetchTechnical(ticker, TECHNICAL_CANONICAL_PATTERNS),
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
    // round11 fix (user「50DMA+15/25 が出ない」 真因): overlay 配列の末尾が null のことがある
    // (直近日の SMA 未計算等)。 旧実装は末尾 1 点だけ読んで null → 行ごと消えていた。
    // 末尾から遡って最後の有限値を採用する (チャートは connectNulls で描けるため不一致が起きていた)。
    const lastOverlay = (key) => {
      const data = technical?.overlays?.find((o) => o.key === key)?.data;
      if (!Array.isArray(data)) return null;
      for (let i = data.length - 1; i >= 0; i--) {
        const v = data[i]?.value;
        if (Number.isFinite(v)) return v;
      }
      return null;
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
      // round10 (user「チャートの 50DMA+15%/+25% がいくらか ladder に無い」): チャートと同表記で追加
      // (IBD extended の過熱水準。 §38: 計算式どおりの事実値、 チャート既出ラベルの 1:1 mirror)。
      { key: 'ext25', label: '50DMA +25%', price: Number.isFinite(sma50) ? sma50 * 1.25 : null },
      { key: 'ext15', label: '50DMA +15%', price: Number.isFinite(sma50) ? sma50 * 1.15 : null },
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

  // round8 #4 (前回比): 10 分以上ぶりの再訪なら前回値を表示し、 今回値で更新 (current は上の useMemo 産)。
  useEffect(() => {
    setPrevSeen(null); // ticker 切替時に他銘柄の残骸を出さない
    if (!ticker || !Number.isFinite(current)) return;
    const prev = loadLastSeen(ticker);
    if (prev && prev.price > 0 && Date.now() - prev.ts > 10 * 60 * 1000) {
      setPrevSeen(prev);
      saveLastSeen(ticker, current);
    } else if (!prev) {
      saveLastSeen(ticker, current);
    }
  }, [ticker, current]);

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
          {/* v195 round4 (user「pill は窮屈」): Chip 撤回 → 状態 dot ● + テキスト。 枠なしで開放感を保ちつつ、
              dot が「動的な状態表示」 の記号として静的キャプションと区別する (右の地合い Chip とは種類が違う
              情報というコントラストも生まれる、 ui-designer 案B)。 */}
          {/* round5 (user「自己主張がない」): dot を中立 muted → ブランド accent + ゆっくり点滅 (pl-status-dot)
              に変更し「ライブな状態表示」 の記号性を強化。 文字も 12px に。 accent は方向色でない (§38 OK)。 */}
          {stateText ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
              <span className="pl-status-dot" aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: 'var(--color-accent)' }} />
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
        // round4 (ui-designer 微調整): 10/700/0.10em + secondary 寄り色 + gold 50% で視認性を一段上げる
        // (user「まだ見づらい」)。 L3 の控えめさは維持しつつ weight/bar 濃度でくっきりさせる。
        const groupLabel = (text) => (
          <div
            className="pl-row"
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'color-mix(in srgb, var(--text-secondary) 70%, var(--text-muted))',
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              borderLeft: '3px solid color-mix(in srgb, var(--color-gold) 50%, var(--border))',
              paddingLeft: 'var(--space-2, 8px)',
              margin: 'var(--space-4, 16px) 0 var(--space-1, 4px)',
              ...stagger(),
            }}
          >
            {text}
          </div>
        );

        const levelRow = (l, extra = null) => {
          const dist = (Number.isFinite(l.price) && Number.isFinite(current)) ? (l.price / current - 1) * 100 : null;
          return (
            <div
              key={l.key}
              data-testid={`price-ladder-row-${l.key}`}
              // round4: .pl-level = hover インタラクション scope (行 lift + bg sweep + label/price 増光 +
              //   micro-bar)。 冠 (.pl-row のみ) には効かせない。 §38: 全て中立色、 方向/行動の示唆なし。
              // round11 B: chartHoverKey 一致 (チャート線 hover の逆連動) でも同じ強調 (.pl-level-hl)。
              className={`pl-row pl-level${chartHoverKey === l.key ? ' pl-level-hl' : ''}`}
              // round8 #2: spine 区間ハイライト / #1: チャート対応線の強調 + 価格ガイド / #3: click でチャートへ
              onMouseEnter={() => { setHoverKey(l.key); setChartHl(l.key, l.price); }}
              onMouseLeave={() => { setHoverKey(null); setChartHl(null, null); }}
              onClick={CHART_LINKED.has(l.key) ? () => flashChart(l.key) : undefined}
              // round9 (user「なぞるとカクカク」): hover の拡大/浮き上がりは内側 .pl-level-inner に適用し、
              // 外側 (当たり判定) の geometry を固定する。 旧: 行自体が scale して当たり判定が動き、
              // 行境界で hover が揺れていた (transform-on-hover jitter)。
              style={{
                cursor: CHART_LINKED.has(l.key) ? 'pointer' : undefined,
                ...stagger(),
                ...(extra || {}),
              }}
            >
              {/* round10 (user「帯が狭くなった」): padding を外側→内側へ移し、 板 (inner bg) が行の
                  全領域 (上下 8px + インデント込み) を覆う round8 までの太さに戻す。 hover 判定は外側 =
                  geometry 固定のままなのでカクつき対策は維持 (transform は hit-test に影響するが、 判定は
                  parent の :hover / onMouseEnter で行うため inner の変形は無関係)。 */}
              <div
                className="pl-level-inner"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3, 12px)',
                  padding: 'var(--space-2, 8px) 0',
                  paddingLeft: 'var(--space-5, 20px)',
                  paddingRight: 'var(--space-3, 12px)',
                }}
              >
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', minWidth: 0 }}>
                {/* 線サンプル swatch: チャート凡例と同 idiom でチャートの線と 1:1 対応を示す
                    (identity 色 3 つのみ、 他は中立 — §38 verdict)。 hover でふわっと膨らむ (.pl-swatch) */}
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
                {/* label/price の色は hover 増光のため CSS class へ (inline だと :hover で上書きできない) */}
                <span className="pl-level-label" style={{ fontSize: 12, fontWeight: 500 }}>{l.label}</span>
              </span>
              <span style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 'var(--space-3, 12px)' }}>
                {/* round6 (user「株価の数字もカウントアップして」): 距離% と同じ pf 係数で 0→実値。
                    0 起点は方向を示唆しない中立演出 (現値→目標の遷移は §38 予測示唆になるため不可)。 */}
                <span className="pl-level-price" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(l.price * pf)}</span>
                <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', minWidth: 72, textAlign: 'right' }}>
                  {/* v195 round3: 視界進入時に 0→実値の count-up (係数 pf)。 距離% は事実記述 (§38 OK 判定済 idiom) */}
                  {dist != null ? `現在から ${fmtPct(dist * pf)}` : '—'}
                </span>
                {/* round4 (hover micro-bar): 距離の絶対値に比例した中立バーが hover で右から伸びる。
                    色は muted 45% (方向色なし)、 情報は距離%の重複可視化 = §38 セーフ */}
                {dist != null && (
                  <span
                    className="pl-distbar"
                    aria-hidden="true"
                    style={{ '--pl-bar': `${Math.round(Math.min(Math.abs(dist), 50) * 2.4)}px` }}
                  />
                )}
              </span>
              </div>
            </div>
          );
        };

        const currentRow = (l, extra = null) => (
          <div
            key={l.key}
            data-testid={`price-ladder-row-${l.key}`}
            className="pl-row pl-level"
            style={{
              position: 'relative',
              ...stagger(),
              ...(extra || {}),
            }}
          >
            {/* spine 上の accent tick (現在価格アンカー、 §38 中立ブランド色)。 .pl-tick = scaleX 0→1 入場 */}
            <span aria-hidden="true" className="pl-tick" style={{
              position: 'absolute',
              left: 'calc(-1 * var(--space-4, 16px) - 1px)',
              // round6 (user「●が文字中心より若干上」): baseline 行内の視覚中心に合わせ +2px 下げ
              top: 'calc(50% + 2px)',
              transform: 'translateY(-50%)',
              width: 11,
              height: 3,
              borderRadius: 2,
              background: 'var(--color-accent)',
            }} />
            <div className="pl-level-inner" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3, 12px)', padding: 'var(--space-3, 12px) 0', paddingRight: 'var(--space-3, 12px)' }}>
              {/* round12 (user 採用①+③): 当日スパークライン (round11 D) を価格の隣 → ラベル横へ一体化。
                  価格側に置くと「どの期間の波形か」 の帰属が浮いて見えた → ラベルと同じ視線グループに移し、
                  小さな「当日」 キャプションで帰属を明示 (intraday 5分足、 gain/loss 色は実績の本来用途 = §38 OK)。 */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{l.label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} aria-hidden="true">
                  <RowSparkline ticker={ticker} period="1d" width={52} height={16} />
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>当日</span>
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3, 12px)' }}>
                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{fmtUsd(l.price * pf)}</span>
                <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', minWidth: 72, textAlign: 'right' }}>
                  {Number.isFinite(sma50Dist) ? `50DMA ${fmtPct(sma50Dist * pf)}` : '基準'}
                </span>
              </span>
            </div>
          </div>
        );

        return (
          <>
          {/* round11 A: 等間隔 ⇄ 縮尺 (行間=実際の価格差に比例) の表示モード切替 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-1, 4px)' }}>
            <div className="pl-scale-toggle" role="group" aria-label="価格目安の表示モード">
              <button type="button" className={scaleMode ? '' : 'is-active'} onClick={() => setScaleMode(false)}>等間隔</button>
              <button type="button" className={scaleMode ? 'is-active' : ''} onClick={() => setScaleMode(true)}>縮尺</button>
            </div>
          </div>
          <div
            // v195 round3: 視界進入で data-pl-inview が付き、 index.css 側で .pl-row/.pl-tick の
            // animation が arming される (mount 起点だと画面外で再生済になる真因の修正)。
            // round4: spine を borderLeft → 子要素 .pl-spine に変更 (視界進入時に上→下へ描画される
            // draw アニメ用。 「軸が先に降りて、 目盛りが乗る」 演出順)。
            // useInViewOnce (callback ref) と DOM 測定用 ref を同じ要素へ merge
            ref={(el) => { ladderRef(el); containerRef.current = el; }}
            data-pl-inview={ladderInView ? 'true' : undefined}
            style={{
              position: 'relative',
              paddingLeft: 'var(--space-4, 16px)',
              // round7: hover 拡大 (scale 1.012、 center 基準) のはみ出し ~8px/側 の逃げ場。
              // 全行一律なので右端整列は保たれる (pane 外への見切れ解消)。
              paddingRight: 'var(--space-3, 12px)',
            }}
          >
            <span className="pl-spine" aria-hidden="true" />
            {/* round8 #2: hover 行 ⇄ 現在価格 の「距離レンジ」 を spine 上に accent 表示 (数直線メタファ強化、
                §38: 中立ブランド色 + 距離の事実可視化のみ) */}
            {rangeBox && (
              <span className="pl-spine-range" aria-hidden="true" style={{ top: rangeBox.top, height: rangeBox.height }} />
            )}
            {scaleMode ? (
              // round11 A: 縮尺モード — 冠/ゾーンは出さず空間そのものに語らせる (本物の数直線)。
              // 前回比行は等間隔モードのみ表示 (図の純度優先)。
              // round12 (user 採用③): 行間 = 価格差の sqrt に比例 + 上限 cap。 旧線形比例は遠い水準
              // (52週高値/安値等) が行間をほぼ独占し、 近接水準が下限 4px に張り付く「スカスカ」 が真因。
              // sqrt で遠距離を圧縮しつつ近距離の差は知覚可能に保ち、 合計を SCALE_PX へ正規化した上で
              // 1 区間の突出を CAP_PX で頭打ちにする。
              (() => {
                const sqrtGaps = levels.map((l, i) => (i === 0 ? 0 : Math.sqrt(Math.max(0, levels[i - 1].price - l.price))));
                const totalSqrt = sqrtGaps.reduce((a, b) => a + b, 0) || 1;
                const SCALE_PX = 340;
                const CAP_PX = 72;
                return levels.map((l, i) => {
                  const extra = i === 0 ? null : {
                    marginTop: Math.round(Math.min(CAP_PX, Math.max(4, (sqrtGaps[i] / totalSqrt) * SCALE_PX))),
                  };
                  return l.isCurrent ? currentRow(l, extra) : levelRow(l, extra);
                });
              })()
            ) : (
              <>
                {upper.length > 0 && (
                  // round11 C: ゾーンの極薄グラデ (中立 accent 3%、 現在価格から離れるほど僅かに深い「静かな奥行き」)
                  <div className="pl-zone-upper">
                    {groupLabel('上値')}
                    {upper.map((l) => levelRow(l))}
                  </div>
                )}
                {cur && currentRow(cur)}
            {/* round8 #4: 前回チェック時からの実績変化 (10 分以上ぶりの再訪時のみ)。 過去事実の記述で
                色は業界ルール本来用途 (実績の上昇=緑/下落=赤)。 §38 (将来予測) には該当しない。 */}
            {cur && prevSeen && (() => {
              const d = current - prevSeen.price;
              const pct = prevSeen.price > 0 ? (d / prevSeen.price) * 100 : null;
              const color = d === 0 ? 'var(--text-muted)' : d > 0 ? 'var(--color-gain)' : 'var(--color-loss)';
              return (
                <div
                  className="pl-row"
                  data-testid="price-ladder-lastseen"
                  style={{ paddingLeft: 'var(--space-5, 20px)', marginTop: -6, paddingBottom: 'var(--space-1, 4px)', fontSize: 11, color: 'var(--text-muted)', ...stagger() }}
                >
                  前回チェック時 ({relTime(prevSeen.ts)} · {fmtUsd(prevSeen.price)}) から{' '}
                  <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}{pct != null ? ` (${fmtPct(pct)})` : ''}
                  </span>
                </div>
              );
            })()}
                {lower.length > 0 && (
                  <div className="pl-zone-lower">
                    {groupLabel('下値')}
                    {lower.map((l) => levelRow(l))}
                  </div>
                )}
              </>
            )}
          </div>
          </>
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
