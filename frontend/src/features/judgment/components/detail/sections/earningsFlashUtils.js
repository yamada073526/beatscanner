// ─────────────────────────────────────────────────────────────────────────────
// earningsFlashUtils.js — EarningsFlashSummary の React 非依存 flag + 色/format 層。
//
// EarningsFlashSummary.jsx から物理抽出した「feature flag (flash v2-v5 / 粗利 / segment /
// guidance 履歴) と §38 静的 色/format ヘルパ (deltaColor / surpriseColor / splitNumUnit /
// barePct / heroChipBg)」。JSX/hooks 非依存・外部 import 不要 (完全自立)。
//
// @no-llm: backend ガード済値の静的整形専用。色は CSS var / color-mix のみ (景表法/§38 規律)。
// JSX 返却ヘルパ (NumUnit / HeroPct / YoyPct / CountUpDelta 等) は component 側に残置。
// ─────────────────────────────────────────────────────────────────────────────

// ガイダンス履歴基盤 Sprint 4 (6体合議 §10 条件9): 判定バッジ = default ON (user 承認 2026-06-11)。
// ?guidance_pit=0 が kill switch。前回比修正 (会社ガイダンス比、§38 事実 OK) / 発表時比サプライズを表示。
export function isGuidanceHistoryEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('guidance_pit');
    if (urlParam === '0') return false;
    if (urlParam === '1') return true;
    return window.localStorage?.getItem('guidance_pit') !== '0';
  } catch {
    return true;
  }
}

// 決算ハイライト Phase2 (四半期グロスマージン): default ON (user 承認 2026-06-11、 headless dogfood で
// AAPL=49.3%[模範一致]/NVDA=74.9% + 中立色 + 銀行 gate + production 不変まで検証済)。?flash_gm=0 が kill switch。
// 粗利率は DiagramCard(推移図)/ProfileCard(年次) と粒度差別化 (本行=直近四半期実値)。Phase1 の flash と同パターン。
// ※ セグメント別売上行は既存 2 箇所 (DiagramCard SegmentBar / ProfileCard SegmentSection、 同一四半期粒度) と
//   重複するため、 アンカー導線 (案a) を opt-in (?flash_seg=1) で別途検証中 (6体合議 マーケ verdict)。
export function isGrossMarginEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('flash_gm');
    if (urlParam === '0') return false;
    if (urlParam === '1') return true;
    return window.localStorage?.getItem('flash_gm') !== '0';
  } catch {
    return true;
  }
}

// 決算ハイライト Phase2 (セグメント別売上): default ON (user 承認 2026-06-11、headless dogfood 済)。
// ?flash_seg=0 が kill switch。既存表示 (DiagramCard SegmentBar / ProfileCard SegmentSection) は
// 折りたたみ/on-demand でデフォルト非表示のため、章冒頭インライン = EPS/売上と同じ summary+detail
// (実 DOM probe で 3 箇所同時表示でないことを確認、6体合議 マーケ verdict の再評価で inline 採用)。
export function isSegmentEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('flash_seg');
    if (urlParam === '0') return false;
    if (urlParam === '1') return true;
    return window.localStorage?.getItem('flash_seg') !== '0';
  } catch {
    return true;
  }
}

// 決算ハイライト デザイン v2 (再設計、default ON = user 承認 2026-06-11、?flash_v2=0 が kill switch)。
// EPS のみ hero (26px/800 唯一の焦点) + 直後 1 hairline で主役/従属を分割 + 残りは 15px 以下に静かに従属。
// 「全数値 18px」 が焦点分散・文字壁になった round1 の失敗を是正 (3体合議 round2、root cause=一律拡大で
// コントラスト潰れ)。§38 (判断色なし) / 5条件カードの色独占 / 発光バグ / gold いずれにも無抵触 (色不変)。
export function isFlashV2Enabled() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('flash_v2');
    if (urlParam === '0') return false;
    if (urlParam === '1') return true;
    return window.localStorage?.getItem('flash_v2') !== '0';
  } catch {
    return true;
  }
}

// 決算ハイライト v3 polish (default ON = user 承認 2026-06-11、?flash_v3=0 が kill switch): 3体 design review。
// ① S-1 単位従属化 (数値本体を主役化、$/%/億ドル を 0.62em muted) ② H-1 行 hover reading-lamp (極薄 bg
// tint + 1px 寄り、CSS class、影/glow 不使用)。prefers-reduced-motion は index.css 側 @media で尊重。
export function isFlashV3Enabled() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('flash_v3');
    if (urlParam === '0') return false;
    if (urlParam === '1') return true;
    return window.localStorage?.getItem('flash_v3') !== '0';
  } catch {
    return true;
  }
}

// 決算ハイライト v4 color (default ON = user 承認 2026-06-11、?flash_v4=0 が kill): 過去確定実績の方向に muted 緑/赤。
// §38/§5 verdict (金融+マーケ+ui 3体合議 2026-06-11): 過去の確定事実 (予実差 beat/miss・前年比) の着色は
// 「陽線=緑」 同型の事実の色分けで §38 射程外。来期=未来予想・粗利率=水準 は中立維持 (色 NG)。色は数値本体でなく
// 「予実差 + 主要前年比」 の差分にだけ投下 (ui-designer 案、画面に緑 2-3 点)。5条件カードの面の緑(verdict) と
// ハイライトの線の緑(事実) の格を muted (color-mix) で分離。投資色: 上昇緑/下落赤、評価語と併用しない。
export function isFlashV4Enabled() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('flash_v4');
    if (urlParam === '0') return false;
    if (urlParam === '1') return true;
    return window.localStorage?.getItem('flash_v4') !== '0';
  } catch {
    return true;
  }
}
// 過去確定実績の方向 % → 色。v4 OFF / 0 / 欠損 は中立 (--text-secondary)。muted gain/loss を token から color-mix。
// 用途 = 前年比 (YoY、方向のみの事実)。予想比 (サプライズ) は surpriseColor (±3% verdict) を使う。
export function deltaColor(pct) {
  if (!isFlashV4Enabled() || !Number.isFinite(pct) || pct === 0) return 'var(--text-secondary)';
  return pct > 0
    ? 'color-mix(in oklab, var(--color-gain) 80%, var(--text-primary))'
    : 'color-mix(in oklab, var(--color-loss) 80%, var(--text-primary))';
}
// 予想比 (サプライズ%) の色: backend _verdict (±3%) と 1:1 mirror — Beat ≥+3% 緑 / Miss ≤−3% 赤 /
// In-line (±3% 未満) は琥珀 (「今期 決算結果」 ScorecardCell の In-line 黄と整合、user 指摘 2026-06-12
// 「+1.6% が緑なのは他セクションの色定義と不一致」)。|pct|<0.05 は表示が "0.0%" に丸まるため中立
// (表示と色の乖離防止、上級者 review P3)。muted color-mix は deltaColor と同 idiom。
export function surpriseColor(pct) {
  if (!isFlashV4Enabled() || !Number.isFinite(pct) || Math.abs(pct) < 0.05) return 'var(--text-secondary)';
  if (pct >= 3.0) return 'color-mix(in oklab, var(--color-gain) 80%, var(--text-primary))';
  if (pct <= -3.0) return 'color-mix(in oklab, var(--color-loss) 80%, var(--text-primary))';
  return 'color-mix(in oklab, var(--color-warning) 85%, var(--text-primary))';
}

// S-1 (v3): 数値本体を主役化し、 単位/記号 ($ / % / 億ドル / 兆ドル 等) を従属サイズ (0.62em) + muted に。
// v3 OFF では従来通りプレーンな span。 backend 値の整形済文字列を split するだけ (再計算なし、§38)。
export function splitNumUnit(str) {
  if (typeof str !== 'string') return { pre: '', num: str || '', post: '' };
  const m = str.match(/^([+\-]?\$?)([\d.,]+)(.*)$/);
  if (!m) return { pre: '', num: str, post: '' };
  return { pre: m[1] || '', num: m[2] || '', post: m[3] || '' };
}

// 決算ハイライト v5 (default ON = user 承認 2026-06-12、?flash_v5=0 が kill switch):
// headline (EPS+売上) を列揃え grid に。3体 design review (列揃え=scannability の王道、財務 table)。
// 右揃え + tabular-nums で桁が縦に揃い「予想比列を縦に一筆書き」 で 2 秒理解。罫線ゼロ・余白で列分離。
// v5.1 フォント穏当化 (26px extreme 解消) → v5.3 Beat/Miss hero (予想比 20px 色 hero、3体 review 反映)
// → default ON 昇格 (user 起床 dogfood「良くなった」 2026-06-12)。
export function isFlashV5Enabled() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('flash_v5');
    if (urlParam === '0') return false;
    if (urlParam === '1') return true;
    return window.localStorage?.getItem('flash_v5') !== '0';
  } catch {
    return true;
  }
}
// 列揃え用の bare な方向 % ("↑3.1%"、prefix なし。予想比/前年比 の語は列見出しが担う)。
export function barePct(pct) {
  if (!Number.isFinite(pct)) return null;
  const sym = pct > 0 ? '↑' : pct < 0 ? '↓' : '';
  return `${sym}${Math.abs(pct).toFixed(1)}%`;
}
// 予想比 hero セル (module-level component — useCountUp は hook のため closure 不可)。
// 20px/700 + surpriseColor (±3% verdict 緑/琥珀/赤) + 分類語 (Beat/予想並み/Miss、静的 dict) 併記
// (色だけだと In-line 琥珀を初心者が「注意?」 と誤読、persona review A案。§38=過去確定の事実分類)。
// count-up (0→target 2000ms / easeOutSine、v5.7.2): ticker 切替時は前値→新値へ滑らかに遷移
// (useCountUp fromRef)。prefers-reduced-motion は hook 内蔵で即 final 値。
// chip 背景: verdict 色の 12% tint (案A 8% と案B 15% の中庸)。中立 (ゼロ近傍/v4 OFF) は bg-subtle。
// 「面」 が強調を担うため hero サイズは 20px のまま据置 (案B の 13px 縮小は user 優先順位①と逆行のため不採用)。
export function heroChipBg(pct) {
  if (!isFlashV4Enabled() || !Number.isFinite(pct) || Math.abs(pct) < 0.05) return 'var(--bg-subtle)';
  if (pct >= 3.0) return 'color-mix(in oklab, var(--color-gain) 12%, transparent)';
  if (pct <= -3.0) return 'color-mix(in oklab, var(--color-loss) 12%, transparent)';
  return 'color-mix(in oklab, var(--color-warning) 12%, transparent)';
}
