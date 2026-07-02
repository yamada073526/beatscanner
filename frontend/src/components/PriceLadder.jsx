import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fetchAnalyst, fetchTechnical, fetchPriceHistory, TECHNICAL_CANONICAL_PATTERNS } from '../api.js';
import { DIST_DAYS_LABEL_JP, classifyDistDays } from '../lib/distributionDaysLabels.js';
// Sprint 3 §3.4: 出来高 chip SSOT (lib/volume.js — 当日除く直前50日、backend §1.3 と同一基準)
import { computeAvgVol50, computeVolRatio } from '../lib/volume.js';
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
import { smoothScrollToElement } from '../lib/smoothScroll.js';
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
function buildTechnicalState({ current, sma50, pivot, support, sma50Dist, retest }) {
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
  const posText = parts.length ? `${parts.join('・')} にあります。` : null;
  // v219 (resistance_retest): 旧レジスタンス→支持転換 水準への押し戻しを §38-safe な事実記述で先頭に
  // (行動指示・将来予測・最上級なし)。flag default OFF で gate 済 (呼出側で retest を null 化)。
  if (retest && retest.detected) {
    const rp = Number.isFinite(retest.retracement_pct) ? Math.round(retest.retracement_pct) : null;
    const tail = retest.approach_level === 'shallow' ? '・到達途上' : '';
    const retestText = `旧レジスタンス・リテスト水準に接近${rp != null ? ` (直近高値から約${rp}%押し戻し${tail})` : ''}。`;
    return posText ? `${retestText}${posText}` : retestText;
  }
  return posText;
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

export default function PriceLadder({ ticker, plan, onUpgrade }) {
  // Phase2 task3 (G2 gate): pivot/support は Premium 固有レベル (cup_handle 由来)。 premium 以外
  // (free/pro) では値をロック (• • • + 🔒) し、 構造 (spine 上の位置) のみ無料で見せる。 stop は
  // current×0.92 で自明のため無料開放 (Q2 user 判断)。 cup_handle 由来で null の premium レベルは
  // levels の Number.isFinite filter で自然に消える = 案b 誠実 (存在しない値を匂わせない・Q1 user 判断)。
  const isLocked = (l) => !!l.premium && plan !== 'premium';
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
  // v7 リッチ化 (2026-07-02 user gate): ブレイク確認ゾーン (pivot 行 〜 現在価格行) の静的ブラケット。
  // rangeBox (hover レンジ) と同じ DOM 計測パターンを流用 — 座標のハードコード無し、価格差からの逆算もしない
  // (pivot は Premium ロックのままなので新規の漏洩経路にはならない: 既存レイアウトの縦間隔で暗に示される
  // 相対距離を可視化するだけ)。
  const [zoneBox, setZoneBox] = useState(null);
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
    smoothScrollToElement(chart, { block: 'center' });
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
  // v7 リッチ化: ブレイク未確認 (現在値 < pivot) のときのみ、pivot 行の上端 〜 現在価格行の下端を
  // ブラケット表示。ブレイク確認後・pivot 未検出時は zoneBox=null で非表示 (§38: 常時表示にしない)。
  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c || !Number.isFinite(pivot) || !Number.isFinite(current) || current >= pivot) {
      setZoneBox(null);
      return;
    }
    const pivotEl = c.querySelector('[data-testid="price-ladder-row-pivot"]');
    const curEl = c.querySelector('[data-testid="price-ladder-row-current"]');
    if (!pivotEl || !curEl) { setZoneBox(null); return; }
    const cr = c.getBoundingClientRect();
    const pr = pivotEl.getBoundingClientRect();
    const ur = curEl.getBoundingClientRect();
    setZoneBox({ top: pr.top - cr.top, height: Math.max(2, (ur.top + ur.height) - pr.top) });
  }, [pivot, current, levels]);
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

  const { levels, current, sma50Dist, distCount, stateText, volRatio, pivot, isBreakoutConfirmed } = useMemo(() => {
    const prices = priceData?.prices;
    const current = (prices?.length && Number.isFinite(prices[prices.length - 1]?.close))
      ? prices[prices.length - 1].close : null;
    // analyst consensus (per-source namespace: price_target === 'ok' のときのみ)
    const consensus = analyst?.sources?.price_target === 'ok'
      ? (Number.isFinite(analyst?.precomputed_metrics?.target_range?.mean)
        ? analyst.precomputed_metrics.target_range.mean : null)
      : null;
    const cup = technical?.patterns?.cup_handle || null;
    // v220: フラグ廃止。Premium gate 一本化のため isRetestEnabled() 撤去。
    const retest = technical?.patterns?.resistance_retest?.detected
      ? technical.patterns.resistance_retest : null;
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
    // v195 round2 (金融レビュー): 52週高値 (O'Neil 式「新高値ブレイク」の核)。 1y prices から算出、追加 fetch ゼロ。
    // Phase2 task3: 52週安値 (low52) と 200日線 (sma200) はレベル蒸留 (11→7) で撤去。
    const closes = Array.isArray(prices) ? prices.map((p) => p?.close).filter(Number.isFinite) : [];
    const high52 = closes.length ? Math.max(...closes) : null;
    // 損切り目安 = 現在価格 × 0.92 (8% ルール、今エントリー想定で常に現在価格の下値に置く)。
    // チャートの stop8 (高値×0.92=高値トレイル) は別概念で、 ladder に出すと「損切りが現在より上」 と
    // 混乱する (高値から 8% 超下落した銘柄)。 ladder は現在基準で下値に統一し、 ラベルでも基準を明示
    // (チャートが「(高値比)」 と明示しているのと対称。 同名「-8%」 が別価格を指す Trust Cliff の解消)。
    const stop = Number.isFinite(current) ? current * 0.92 : null;
    // 累進開示 (user 承認 2026-06-30 v6): 損切り −8% は「買値基準・ブレイク後」 の規律。 ブレイク未確認 (監視)
    // で現在値基準の −8% を見せると「下落余地=買い場」 の押し目買い誤読 + 価格逆算 (§38) を招くため、
    // breakout 確認状態 (breakout_support / breakout_extended) でのみ stop レベルを提示する (旧 Q2「常時無料」を更新)。
    const isBreakoutConfirmed = cup?.state === 'breakout_support' || cup?.state === 'breakout_extended';

    // Phase2 task3 (案A×G2 gate): レベルを 11→7 に蒸留 (落とす: ext25/ext15/sma200/low52)。
    // pivot/support = Premium 固有 (cup_handle 由来)。 premium:true → isLocked で値ロック (• • •)。
    // stop は current×0.92 で自明のため無料開放 (premium 付与しない・Q2 user 判断)。
    // null の premium レベルは下の Number.isFinite filter で自然に消える = 案b 誠実 (Q1 user 判断)。
    const raw = [
      { key: 'high52', label: '52週高値', price: high52 },
      { key: 'target', label: 'アナリスト目標', price: consensus },
      { key: 'pivot', label: pivotLabel, price: pivot, premium: true },
      { key: 'current', label: '現在価格', price: current, isCurrent: true },
      { key: 'sma50', label: '50日移動平均', price: sma50 },
      { key: 'support', label: supportLabel, price: support, premium: true },
      { key: 'stop', label: 'リスク確認ライン (買値−8%)', price: isBreakoutConfirmed ? stop : null },
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
    const stateText = buildTechnicalState({ current, sma50, pivot, support, sma50Dist, retest });

    // Sprint 3 §3.4: 相対出来高 chip 用 (当日除く直前50日平均比)。
    // isNonEquityTicker は StockPriceChart の関数を再実装せず、ticker prop から簡易判定する。
    // gate: 非株式 or データ不足 (null) は Number.isFinite(volRatio) で自然に非表示になる。
    // ⚠️ distCount の prices.slice(-26) は IBD Distribution Days 専用。avgVol50 と混同しない。
    const isNonEquityPl = !ticker ? false : (() => {
      const NON_EQ = new Set(['^GSPC', '^IXIC', '^DJI', '^VIX', '^TNX', 'DX-Y.NYB', 'CL=F', 'JPY=X']);
      const t = String(ticker).toUpperCase();
      return NON_EQ.has(t) || t.startsWith('^') || t.endsWith('=F') || t.endsWith('=X');
    })();
    const avgVol50Pl = (!isNonEquityPl && Array.isArray(prices)) ? computeAvgVol50(prices) : null;
    const todayVol = (Array.isArray(prices) && prices.length)
      ? Number(prices[prices.length - 1]?.volume) : NaN;
    const volRatio = computeVolRatio(todayVol, avgVol50Pl);

    return { levels: raw, current, sma50Dist, distCount, stateText, volRatio, pivot, isBreakoutConfirmed };
  }, [analyst, technical, priceData, ticker]);

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
      {(stateText || Number.isFinite(distCount) || Number.isFinite(volRatio)) && (
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
          {/* 右端 chip 群: 地合い + 出来高(相対比) を横並びで表示。
              両者は別指標 — 地合い=機関売り圧(IBD 25日窓)、出来高chip=今日の商いの相対水準。
              DistributionDays と相対出来高の「両輪」で売り圧 × 商い厚みを1視線に収める (§3.5)。 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', flexWrap: 'wrap' }}>
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
            {/* Sprint 3 §3.4: 相対出来高 chip。
                tone LOCKED = muted 一択 (§38 / 投資業界色ルール):
                  出来高は方向を持たない指標。>=1.5 で緑は「緑=上昇」と誤読される恐れ。
                  <1.0 で赤は「赤=下落」と誤読される。数値が大小を担い、色で煽らない。
                gate: isNonEquity は上の volRatio 計算時に null になるため !Number.isFinite(volRatio) で自動非表示。
                文言: 事実記述のみ。「急増」「買い場」「ブレイク」等の方向断定・将来予測は絶対禁止 (§38)。 */}
            {Number.isFinite(volRatio) && (
              <Chip variant="display" size="xs" tone="muted">
                出来高: 50日平均比 ×{volRatio.toFixed(2)}
              </Chip>
            )}
          </div>
        </div>
      )}
      {/* 案A (v195 dogfood 2026-06-10、 ui-designer 提案): 「縦軸(spine) + tick」 ladder。
          旧 border 箱 + 均等行リストが「数直線に見えない」(user「ダサい」) ため撤廃。 左に連続した spine
          (border-left) を引き、 現在価格を accent tick + 20px 値でアンカー、 上値/下値を L3 hairline ラベルで
          グループ化 (§C-11 面の引き算)。 §38: 方向は空間配置(現在価格の上/下)+ラベルのみ、 緑/赤の方向色は不使用。
          発光 host 化しない (.panel-card 不使用、 border-left は box-shadow でないため glow 危険ゾーン外)。 */}
      {(() => {
        // mount stagger: 描画順に 40ms 刻みの animationDelay (index.css §PriceLadder の .pl-row と対、
        // ホテルのメニューが一品ずつ供される所作。 reduced-motion は CSS 側で一括無効)。
        let seq = 0;
        const stagger = () => ({ animationDelay: `${(seq++) * 40}ms` });

        const levelRow = (l, extra = null) => {
          const lk = isLocked(l);
          // ロック行は距離% も出さない (price/current から逆算でき = 漏洩)。 非ロック時のみ算出。
          const dist = (!lk && Number.isFinite(l.price) && Number.isFinite(current)) ? (l.price / current - 1) * 100 : null;
          // round4: .pl-level = hover インタラクション scope (行 lift + bg sweep + label/price 増光 + micro-bar)。
          //   §38: 全て中立色、 方向/行動の示唆なし。 round11 B: chartHoverKey 一致 (逆連動) でも .pl-level-hl。
          // Phase2 task3 Trust Cliff: ロック行 (premium 固有・無料時) は hover/click を一切配線しない。
          //   pivot/support は CHART_LINKED に残るため、 配線すると hover で chart に点線ガイド + data-pl-hl で
          //   ロック価格が漏洩する。 → .pl-level を付けず (hover 強調なし)、 onMouseEnter/onClick も undefined。
          const interactive = !lk;
          return (
            <div
              key={l.key}
              data-testid={`price-ladder-row-${l.key}`}
              data-locked={lk ? 'true' : undefined}
              className={`pl-row${interactive ? ` pl-level${chartHoverKey === l.key ? ' pl-level-hl' : ''}` : ''}`}
              // round8 #2: spine 区間ハイライト / #1: チャート対応線の強調 + 価格ガイド / #3: click でチャートへ
              onMouseEnter={interactive ? () => { setHoverKey(l.key); setChartHl(l.key, l.price); } : undefined}
              onMouseLeave={interactive ? () => { setHoverKey(null); setChartHl(null, null); } : undefined}
              onClick={(interactive && CHART_LINKED.has(l.key)) ? () => flashChart(l.key) : undefined}
              // round9 (user「なぞるとカクカク」): hover の拡大/浮き上がりは内側 .pl-level-inner に適用し、
              // 外側 (当たり判定) の geometry を固定する (transform-on-hover jitter 対策)。
              style={{
                cursor: (interactive && CHART_LINKED.has(l.key)) ? 'pointer' : undefined,
                opacity: lk ? 0.6 : undefined,
                ...stagger(),
                ...(extra || {}),
              }}
            >
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
                {/* 線サンプル swatch: チャート凡例と 1:1 (identity 色 3 つのみ、 他は中立 — §38)。
                    ロック行は対応線を強調しない (漏洩防止) ため swatch も border 色で中立化 (mockup .lv.locked .tick)。 */}
                <span
                  className="pl-swatch"
                  aria-hidden="true"
                  style={{
                    width: 14,
                    height: 2.5,
                    borderRadius: 2,
                    flexShrink: 0,
                    background: lk ? 'var(--border)' : (LEVEL_SWATCH[l.key] || NEUTRAL_SWATCH),
                  }}
                />
                {/* label/price の色は hover 増光のため CSS class へ (inline だと :hover で上書きできない) */}
                <span className="pl-level-label" style={{ fontSize: 12, fontWeight: 500 }}>{l.label}</span>
              </span>
              <span style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 'var(--space-3, 12px)' }}>
                {lk ? (
                  // G2 ロック表示: 値は • • • (letter-spacing) + 🔒 Premium。 count-up pf は適用しない (値を出さない)。
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>• • •</span>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--color-gold-dark)', whiteSpace: 'nowrap' }}>
                      <span aria-hidden="true">🔒 </span>Premium
                    </span>
                  </span>
                ) : (
                  <>
                    {/* round6: 距離% と同じ pf 係数で 0→実値。 0 起点は方向非示唆の中立演出 (§38)。 */}
                    <span className="pl-level-price" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(l.price * pf)}</span>
                    <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', minWidth: 72, textAlign: 'right' }}>
                      {dist != null ? `現在から ${fmtPct(dist * pf)}` : '—'}
                    </span>
                    {/* round4 (hover micro-bar): 距離の絶対値に比例した中立バー (方向色なし、 §38 セーフ)。 */}
                    {dist != null && (
                      <span
                        className="pl-distbar"
                        aria-hidden="true"
                        style={{ '--pl-bar': `${Math.round(Math.min(Math.abs(dist), 50) * 2.4)}px` }}
                      />
                    )}
                  </>
                )}
              </span>
              </div>
            </div>
          );
        };

        const currentRow = (l, extra = null) => {
          // round13 (v6 「余地」 callout): 現在価格の直下に「ブレイク確認/損切り」 の余地を §38-safe に提示。
          //   - ブレイクまでの距離は pivot (Premium 固有) からの逆算になるため、 free は値を出さず 🔒 のみ
          //     (premium は実距離)。 矢印は使わない (本 component の §38 規律: 行動示唆の矢印 BAN)。
          //   - 損切り 買値−8% は breakout 確認状態でのみ (累進開示。 監視中の現在値基準 −8% は押し目買い誘発)。
          const pivotLevel = levels.find((lv) => lv.key === 'pivot');
          const pivotLocked = pivotLevel ? isLocked(pivotLevel) : false;
          const preBreakoutUp = Number.isFinite(pivot) && Number.isFinite(current) && current < pivot;
          const pivotDistPct = preBreakoutUp ? (pivot / current - 1) * 100 : null;
          const showRoom = preBreakoutUp || isBreakoutConfirmed;
          return (
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
            {showRoom && (
              <div
                data-testid="price-ladder-room"
                style={{ paddingLeft: 'var(--space-5, 20px)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3, 12px)', fontSize: 10, lineHeight: 1.3 }}
              >
                {preBreakoutUp && (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    ブレイク確認まで{' '}
                    {pivotLocked ? (
                      <span style={{ color: 'var(--color-gold-dark)', fontWeight: 700 }}>
                        <span aria-hidden="true">🔒 </span>Premium
                      </span>
                    ) : (
                      <b style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(pivotDistPct)}</b>
                    )}
                  </span>
                )}
                {isBreakoutConfirmed && (
                  <span style={{ color: 'var(--color-warning)' }}>損切り目安 買値 −8%</span>
                )}
              </div>
            )}
          </div>
          );
        };

        return (
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
            {/* v7 リッチ化: ブレイク確認ゾーン (pivot 行 〜 現在価格行) の破線ブラケット。中立色のみ (§38)。 */}
            {zoneBox && (
              <>
                <span
                  className="pl-zone-bracket"
                  aria-hidden="true"
                  data-testid="price-ladder-zone-bracket"
                  style={{ top: zoneBox.top, height: zoneBox.height }}
                />
                <span
                  className="pl-zone-label"
                  aria-hidden="true"
                  style={{ top: zoneBox.top + zoneBox.height / 2 - 14, lineHeight: 1.25 }}
                >
                  ブレイク確認<br />ゾーン
                </span>
              </>
            )}
            {/* round11 A → Phase2 task3: 縮尺固定 (toggle 撤去・Q3 user 判断)。 冠/ゾーン・前回比行も撤去し
                空間そのものに語らせる (本物の数直線)。 行間 = 価格差の sqrt に比例 + 上限 cap (近接水準が
                下限 4px に張り付く「スカスカ」 回避: 遠距離を sqrt 圧縮、 合計を SCALE_PX へ正規化、 1 区間の
                突出を CAP_PX で頭打ち)。 */}
            {(() => {
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
            })()}
          </div>
        );
      })()}
      {/* Phase2 task3 (G2 ティーザー): 無料 (premium 以外) かつロック対象が実在するときのみ表示。
          mockup v5 .pl-teaser (gold dashed border + 短文 + CTA)。 box-shadow なし (発光 host にしない)。
          ロック対象名は実在する premium レベルから動的生成 = 案b 誠実 (存在しない値を匂わせない)。
          CTA / 強調文字色は app の gold display-chip idiom (color-mix gold×text-primary) でテーマ安全。 */}
      {(() => {
        if (plan === 'premium') return null;
        const lockedLevels = levels.filter(isLocked);
        if (lockedLevels.length === 0) return null;
        const names = lockedLevels.map((l) => (l.key === 'pivot' ? '買い目安 Pivot' : l.key === 'support' ? '支持線目安' : l.label));
        return (
          <div
            data-testid="price-ladder-teaser"
            style={{
              marginTop: 'var(--space-3, 12px)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3, 12px)',
              border: '1px dashed color-mix(in srgb, var(--color-gold) 55%, transparent)',
              borderRadius: 'var(--radius-sm, 8px)',
              padding: '10px 13px',
              background: 'color-mix(in srgb, var(--color-gold) 6%, transparent)',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 13, flexShrink: 0 }}>🔒</span>
            <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              <b style={{ color: 'var(--color-gold-dark)', fontWeight: 700 }}>{names.join('・')}</b>
              {' '}は Premium で開放。取っ手付きカップの買い点・底値帯を数値で。
            </span>
            {onUpgrade && (
              <button
                type="button"
                onClick={onUpgrade}
                style={{
                  marginLeft: 'auto',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm, 8px)',
                  border: '1px solid color-mix(in srgb, var(--color-gold) 50%, transparent)',
                  background: 'color-mix(in srgb, var(--color-gold) 18%, transparent)',
                  color: 'color-mix(in srgb, var(--color-gold-dark) 70%, var(--text-primary))',
                  cursor: 'pointer',
                }}
              >
                Premium を見る
              </button>
            )}
          </div>
        );
      })()}
      {/* v6 ブレイク確認 出来高ゲージ: O'Neil +40% (×1.40) を「未確認/確認」 で可視化。
          §38: 達成 (×1.40 到達) のみ gain 色 (過去の確定事実 polarity)、 未達は中立 muted。 文言は事実記述のみ
          (「買い場/急増/ブレイクだ」 等の断定・将来予測は使わない)。 gate: cup pivot がある (ブレイク文脈) かつ
          volRatio が有限 (非株式/データ不足は自動非表示) のときのみ。 volRatio は上の useMemo で算出済 (追加 fetch 0)。 */}
      {Number.isFinite(pivot) && Number.isFinite(volRatio) && (() => {
        const VOL_THRESHOLD = 1.40; // O'Neil ブレイク確認の出来高 (+40%)
        const SCALE_MAX = 1.6;      // ゲージ右端
        const achieved = volRatio >= VOL_THRESHOLD;
        const fillPct = Math.min(volRatio / SCALE_MAX, 1) * 100;
        const thrPct = (VOL_THRESHOLD / SCALE_MAX) * 100;
        return (
          <div
            data-testid="price-ladder-volgauge"
            style={{ marginTop: 'var(--space-4, 16px)', paddingTop: 'var(--space-3, 12px)', borderTop: '1px solid var(--border)' }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 18 }}>
              ブレイク確認の出来高（+40% 基準）
            </div>
            <div className="pl-vgauge-track">
              <div className={`pl-vgauge-fill${achieved ? ' achieved' : ''}`} style={{ width: `${fillPct}%` }} />
              <div className="pl-vgauge-needle" style={{ left: `${fillPct}%` }} />
              <span className="pl-vgauge-nlab" style={{ left: `${fillPct}%` }}>×{volRatio.toFixed(2)}</span>
              <div className="pl-vgauge-thr" style={{ left: `${thrPct}%` }} />
              <span className="pl-vgauge-thrlab" style={{ left: `${thrPct}%` }}>+40% 基準</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>
              <span>×0</span><span>×0.5</span><span>×1.0</span><span>×1.6</span>
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
              {achieved
                ? '出来高は +40% 基準に到達しています（過去の確定値）。'
                : '出来高は +40% 基準に未到達です（現時点でブレイクは確認できていません）。'}
              {' '}有効なブレイクは <b style={{ color: 'var(--text-secondary)' }}>「買い目安 pivot を上抜け」かつ「出来高 +40%」</b> の両方が必要です。
            </p>
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
