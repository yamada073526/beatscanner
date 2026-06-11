/**
 * EarningsFlashSummary — ファンダ章冒頭の「決算ハイライト」 (v199、SPEC_2026-06-10_earnings-flash-summary)
 *
 * @no-llm: このコンポーネントは backend 計算済値の静的テンプレート整形専用。LLM API 呼び出し禁止。
 *   Hallucination Guard §4 (LLM 不使用宣言) に基づく。pre-commit hook Check 6 が LLM import を BLOCK する。
 *
 * 決算速報スタイル (memory project-chapter-summary-jitchama-style 模範) の事実文構造
 * (EPS 予実 / 売上予実 + YoY / 来期コンセンサス) を章冒頭に置き、
 * 「今回の決算が予想に対してどうだったか」 を 2 秒で読めるようにする (5 原則 1 + 原則 4 人力の代替)。
 * ※ UI に「速報」 の語を使わない (リアルタイム性の暗示 = Trust Cliff、6体合議マーケ条件)。個人名も出さない。
 *
 * §38 / §5 ガード (6体合議 6/6 条件付賛成、2026-06-10):
 *   - 全行 backend ガード済値を「読むだけ」。frontend 再計算禁止 (銀行/与信の偽サプライズ防止)。
 *   - 判断語・最上級・verdict 語なし。数値に語らせる (「予想 $1.95 → $2.01 (予想比 +3.1%)」)。
 *   - 予実差/YoY に緑/赤を塗らない (中立統一。色エネルギーは直下の 5 条件カードに集中、UI+金融 verdict)。
 *   - count-up 演出なし (決算タブとの演出差別化 = 「要約 → 詳細」 の階層、UI verdict)。
 *   - 来期の状態語は GUIDANCE_STATE_JP (ForwardOutlookSection) を import 流用 (文言 single source)。
 *     dict に無い state (unknown/null) は行ごと非表示 (捏造しない)。
 *
 * データ規律 (feedback_data_completeness_guard):
 *   - guidance prop (= /api/guidance/{ticker}/basic、親 fetch 済) を読むだけ。自前 fetch しない。
 *   - YoY のみ quarterly-history (dedupGet 化済 = useEpsBeatStreak 等と coalesce) を limit=8 で参照。
 *   - 欠損は行ごと非表示。部分欠損で「全項目揃っている前提の文」 を組まない。
 *
 * 設計境界: 新規 glow host を作らない (wrapper は class なし div + semantic token のみ)。
 * module-level component (inline 関数 component 禁止 = feedback_pane_error_boundary)。
 * loading/errored/empty/main 全 render path に data-testid (feedback_testid_all_render_paths)。
 */
import React, { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { fetchQuarterlyHistory, fetchGuidanceSurprise, fetchConsensusDrift } from '../../../../../api.js';
import { fmtMoney, fmtEps, GUIDANCE_STATE_JP } from '../../../../../components/ForwardOutlookSection.jsx';
import { displaySegmentName } from '../../../../../lib/segmentNames.js';
import {
  FLASH_LABELS,
  FLASH_TERMS,
  SURPRISE_VERDICT_JP,
  classifySurprise,
  fmtSurprisePct,
  fmtYoyPct,
  fmtGrossMargin,
  fmtGuidanceRevLine,
  GUIDANCE_REVISION_JP,
  GUIDANCE_PIT_CONSENSUS_JP,
  CONSENSUS_DRIFT_JP,
  aggregateConsensusDrift,
} from '../../../constants/earningsFlashTemplates.js';
// v5.4 motion (3体 persona review 推奨案A): 予想比 hero を 0→target の count-up で登場させ
// 「ここが重要」 の視線誘導に。useCountUp は prefers-reduced-motion 内蔵 (即 final 値)。
// v5.5 (user「気づいた時点で終わっている」): mount 発火 → useInViewOnce の入場発火に変更 + 1200ms
// (画面外で走り終わる真因を解消。ForwardOutlookSection MetricBlock と同 idiom)。
import { useCountUp } from '../../../../../hooks/useCountUp.js';
import { useInViewOnce } from '../../../../../hooks/useInViewOnce.js';

const TESTID = 'earnings-flash-summary';

// ガイダンス履歴基盤 Sprint 4 (6体合議 §10 条件9): 判定バッジ = default ON (user 承認 2026-06-11)。
// ?guidance_pit=0 が kill switch。前回比修正 (会社ガイダンス比、§38 事実 OK) / 発表時比サプライズを表示。
function isGuidanceHistoryEnabled() {
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
function isGrossMarginEnabled() {
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
function isSegmentEnabled() {
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
function isFlashV2Enabled() {
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
function isFlashV3Enabled() {
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
function isFlashV4Enabled() {
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
function deltaColor(pct) {
  if (!isFlashV4Enabled() || !Number.isFinite(pct) || pct === 0) return 'var(--text-secondary)';
  return pct > 0
    ? 'color-mix(in oklab, var(--color-gain) 80%, var(--text-primary))'
    : 'color-mix(in oklab, var(--color-loss) 80%, var(--text-primary))';
}
// 予想比 (サプライズ%) の色: backend _verdict (±3%) と 1:1 mirror — Beat ≥+3% 緑 / Miss ≤−3% 赤 /
// In-line (±3% 未満) は琥珀 (「今期 決算結果」 ScorecardCell の In-line 黄と整合、user 指摘 2026-06-12
// 「+1.6% が緑なのは他セクションの色定義と不一致」)。|pct|<0.05 は表示が "0.0%" に丸まるため中立
// (表示と色の乖離防止、上級者 review P3)。muted color-mix は deltaColor と同 idiom。
function surpriseColor(pct) {
  if (!isFlashV4Enabled() || !Number.isFinite(pct) || Math.abs(pct) < 0.05) return 'var(--text-secondary)';
  if (pct >= 3.0) return 'color-mix(in oklab, var(--color-gain) 80%, var(--text-primary))';
  if (pct <= -3.0) return 'color-mix(in oklab, var(--color-loss) 80%, var(--text-primary))';
  return 'color-mix(in oklab, var(--color-warning) 85%, var(--text-primary))';
}

// S-1 (v3): 数値本体を主役化し、 単位/記号 ($ / % / 億ドル / 兆ドル 等) を従属サイズ (0.62em) + muted に。
// v3 OFF では従来通りプレーンな span。 backend 値の整形済文字列を split するだけ (再計算なし、§38)。
function splitNumUnit(str) {
  if (typeof str !== 'string') return { pre: '', num: str || '', post: '' };
  const m = str.match(/^([+\-]?\$?)([\d.,]+)(.*)$/);
  if (!m) return { pre: '', num: str, post: '' };
  return { pre: m[1] || '', num: m[2] || '', post: m[3] || '' };
}
function NumUnit({ str, size, weight, color, letterSpacing, unitScale = '0.62em' }) {
  const baseStyle = { fontSize: size, fontWeight: weight, color, whiteSpace: 'nowrap', ...(letterSpacing ? { letterSpacing } : {}) };
  if (!isFlashV3Enabled() || str == null) {
    return <span style={baseStyle}>{str}</span>;
  }
  const { pre, num, post } = splitNumUnit(str);
  // unitScale: 単位 ($ / % / 億ドル) の従属サイズ。v5 grid は 0.8em (穏当、桁優位は保ちつつ過度な縮小を回避)、
  // それ以外 (v2/v3/v4 行) は従来 0.62em のまま (user 承認済の既存 default ON 行を不変に保つ)。
  const unitStyle = { fontSize: unitScale, fontWeight: 500, color: 'var(--text-muted)' };
  return (
    <span style={baseStyle}>
      {pre && <span style={unitStyle}>{pre}</span>}
      {num}
      {post && <span style={{ ...unitStyle, marginLeft: 1 }}>{post}</span>}
    </span>
  );
}

// 決算ハイライト v5 (default ON = user 承認 2026-06-12、?flash_v5=0 が kill switch):
// headline (EPS+売上) を列揃え grid に。3体 design review (列揃え=scannability の王道、財務 table)。
// 右揃え + tabular-nums で桁が縦に揃い「予想比列を縦に一筆書き」 で 2 秒理解。罫線ゼロ・余白で列分離。
// v5.1 フォント穏当化 (26px extreme 解消) → v5.3 Beat/Miss hero (予想比 20px 色 hero、3体 review 反映)
// → default ON 昇格 (user 起床 dogfood「良くなった」 2026-06-12)。
function isFlashV5Enabled() {
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
function barePct(pct) {
  if (!Number.isFinite(pct)) return null;
  const sym = pct > 0 ? '↑' : pct < 0 ? '↓' : '';
  return `${sym}${Math.abs(pct).toFixed(1)}%`;
}
// 予想比 hero セル (module-level component — useCountUp は hook のため closure 不可)。
// 20px/700 + surpriseColor (±3% verdict 緑/琥珀/赤) + 分類語 (Beat/予想並み/Miss、静的 dict) 併記
// (色だけだと In-line 琥珀を初心者が「注意?」 と誤読、persona review A案。§38=過去確定の事実分類)。
// count-up (0→target 800ms、motion review 推奨案A): ticker 切替時は前値→新値へ滑らかに遷移
// (useCountUp fromRef)。prefers-reduced-motion は hook 内蔵で即 final 値。
// chip 背景: verdict 色の 12% tint (案A 8% と案B 15% の中庸)。中立 (ゼロ近傍/v4 OFF) は bg-subtle。
// 「面」 が強調を担うため hero サイズは 20px のまま据置 (案B の 13px 縮小は user 優先順位①と逆行のため不採用)。
function heroChipBg(pct) {
  if (!isFlashV4Enabled() || !Number.isFinite(pct) || Math.abs(pct) < 0.05) return 'var(--bg-subtle)';
  if (pct >= 3.0) return 'color-mix(in oklab, var(--color-gain) 12%, transparent)';
  if (pct <= -3.0) return 'color-mix(in oklab, var(--color-loss) 12%, transparent)';
  return 'color-mix(in oklab, var(--color-warning) 12%, transparent)';
}
function HeroPct({ pct, inView = true, delay = '0s' }) {
  // v5.5: 入場 (inView) で 0→target を 1200ms count-up (user「800ms mount 発火は気づく前に終わる」)。
  const target = inView && Number.isFinite(pct) ? Math.abs(pct) : null;
  const animated = useCountUp(target, { duration: 1200, digits: 1, forceFromZero: true });
  if (!Number.isFinite(pct)) return null;
  const cls = classifySurprise(pct);
  const color = surpriseColor(pct);
  const sym = pct > 0 ? '↑' : pct < 0 ? '↓' : '';
  const shown = animated ?? 0;
  return (
    // v5.5 chip 化 (design review 案B「Terminal 列美」): 色テキスト → 12% tint の色面 chip。
    // pop-in 200ms (ds-flash-chip、EPS/売上 stagger ≤120ms)。reduced-motion は index.css 側で無効化。
    // v5.6 (typography review): hero 20→16px (Bloomberg/Koyfin の hero/本文比 1.23× に正常化、20px=1.54×
    // が「素人感」 主因)、分類語 10→11px (chip 内 16/11=1.45× で一体タグ)、padding/radius/gap も微修正。
    <span
      className="ds-flash-chip"
      style={{
        justifySelf: 'end',
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 4,
        whiteSpace: 'nowrap',
        background: heroChipBg(pct),
        padding: '3px 8px',
        borderRadius: 5,
        animationDelay: delay,
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color, fontVariantNumeric: 'tabular-nums' }}>
        {sym}{shown.toFixed(1)}%
      </span>
      {cls && <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color }}>{SURPRISE_VERDICT_JP[cls]}</span>}
    </span>
  );
}

// 前年比セル (count-up 対応、v5.5 user「前年比もカウントアップを」)。入場 inView で 0→target。
function YoyPct({ pct, inView = true }) {
  const target = inView && Number.isFinite(pct) ? Math.abs(pct) : null;
  const animated = useCountUp(target, { duration: 1200, digits: 1, forceFromZero: true });
  if (!Number.isFinite(pct)) return <span style={{ justifySelf: 'end', fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>—</span>;
  const sym = pct > 0 ? '↑' : pct < 0 ? '↓' : '';
  // v5.6 (typography review): 12/500 で結果列より格を下げ「副次列」 を明確化 (weight 混在解消)。
  return (
    <span style={{ justifySelf: 'end', fontSize: 12, fontWeight: 500, color: deltaColor(pct), whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {sym}{(animated ?? 0).toFixed(1)}%
    </span>
  );
}

// headline (EPS + 売上) の列揃え grid。整形済 str + raw pct を受け、 セル単位に配置 (列が縦に揃う)。
// v5.3 Beat/Miss hero (user feedback 2026-06-11「EPS/売上の絶対値より、何%のサプライズかが最重要」+
//   3体 design review 2026-06-11):
//   ヒエラルキーを反転 — 予想比 (サプライズ%) を hero (20px/700 + deltaColor 緑/赤) に。結果=補助 (15px)、
//   予想=de-emphasize (13px muted)、前年比=色シグナル (14px)。「強調は色に任せる」 を体現 (サイズ差は穏当、
//   旧 26px extreme を回避し色で焦点化)。列順は 予想→結果→予想比(hero)→前年比 で自然な読み (予想 を残すのは
//   review P0「% の基準が画面内に無いと初心者が混乱」)。見出しは「予想比」 (QA: 予実差 より初心者に明快)。
function HeadlineGrid({ eps, rev, onDetailClick }) {
  // v5.5: count-up は grid の入場で発火 (IO 1 個を 2 つの HeroPct で共有)。
  const [gridRef, gridInView] = useInViewOnce();
  const colHead = (txt) => (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', justifySelf: 'end' }}>{txt}</span>
  );
  // 該当データ無しの数値セル: honest な em-dash (recipes §C-9)。空セルの「穴/故障感」 を回避 (UI review)。
  const emCell = () => (
    <span style={{ justifySelf: 'end', fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>—</span>
  );
  // ラベル (EPS/売上高) = 視覚優先 2 位 (user 方針 2026-06-12「①予想比 ②ラベル ③結果は目立たせない」)。
  // 11/500 → 12/600 で立てる (初心者+上級者 persona review 収束)。色は secondary 維持 (hero と競合しない)。
  const labelCell = (txt) => (
    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{txt}</span>
  );
  // 予想 = 最弱 (12px/400 muted、weight 下げてさらに退かせる)。% の基準として残すのみ (review P0)。
  const estCell = (str) => (
    <span style={{ justifySelf: 'end' }}>{str != null ? <NumUnit str={str} size={12} weight={400} color={'var(--text-muted)'} unitScale={'0.75em'} /> : emCell()}</span>
  );
  // 結果 (実績) = 13/500/secondary、単位 0.75em (hero 縮小後に相対適正化、typography review)。
  const resultCell = (str) => (
    <span style={{ justifySelf: 'end' }}>{str != null ? <NumUnit str={str} size={13} weight={500} color={'var(--text-secondary)'} unitScale={'0.75em'} /> : emCell()}</span>
  );
  // 予想比 = hero (HeroPct component: 20px/700 chip + surpriseColor ±3% verdict + count-up + 分類語)。
  const heroPct = (pct, delay) => (Number.isFinite(pct) ? <HeroPct pct={pct} inView={gridInView} delay={delay} /> : emCell());
  // 前年比 = 色シグナル (13px/600 + deltaColor=方向色 + count-up)。hero と確実に 1 段差 (persona review)。
  const yoyCell = (pct) => <YoyPct pct={pct} inView={gridInView} />;
  return (
    <div
      ref={gridRef}
      data-testid={`${TESTID}-headline-grid`}
      className={onDetailClick ? 'ds-flash-grid' : undefined}
      onClick={onDetailClick}
      role={onDetailClick ? 'button' : undefined}
      tabIndex={onDetailClick ? 0 : undefined}
      onKeyDown={onDetailClick ? (e) => { if (e.key === 'Enter') onDetailClick(e); } : undefined}
      title={onDetailClick ? 'クリックで決算セクションの詳細へ' : undefined}
      style={{
        display: 'grid',
        // 全データ列 minmax(0,auto) (狭幅でも nowrap がはみ出さない、frontend review)。列: 予想/結果/予想比/前年比。
        gridTemplateColumns: '52px minmax(0,auto) minmax(0,auto) minmax(0,auto) minmax(0,auto)',
        alignItems: 'baseline',
        columnGap: 'var(--space-5, 20px)',
        rowGap: 'var(--space-3, 12px)',
        fontVariantNumeric: 'tabular-nums',
        borderBottom: '1px solid var(--border)',
        paddingBottom: 'var(--space-3, 12px)',
        marginBottom: 'var(--space-1, 4px)',
        cursor: onDetailClick ? 'pointer' : undefined,
      }}
    >
      {/* 列見出し (予想 / 結果 / 予想比 hero / 前年比、薄 muted) */}
      {labelCell('')}{colHead('予想')}{colHead('結果')}{colHead('予想比')}{colHead('前年比')}
      {/* EPS 行 (予想比 hero chip + 前年比 = backend eps_yoy_pct、v5.5 で「—」解消) */}
      {labelCell(FLASH_LABELS.eps)}
      {estCell(eps.estStr)}
      {resultCell(eps.actStr)}
      {heroPct(eps.surprisePct, '0.05s')}
      {yoyCell(eps.yoyPct)}
      {/* 売上 行 (予想比 hero chip、前年比は色シグナル) */}
      {rev ? labelCell(FLASH_LABELS.revenue) : null}
      {rev ? estCell(rev.estStr) : null}
      {rev ? resultCell(rev.actStr) : null}
      {rev ? heroPct(rev.surprisePct, '0.12s') : null}
      {rev ? yoyCell(rev.yoyPct) : null}
    </div>
  );
}

// (旧 SegmentItem = 1 行詰め込みの部門別部品は v5.6 で LowerGrid (SegStack 縦積み) に置換し削除。)

// 判定バッジ (10px neutral、色なし — §38。サイズで前方視界の主役 19px と階層差別化、ui verdict)
// v2 (?flash_v2=1): 塗り pill → 左 hairline タグ (灰塊を消し「組版された端末タグ」 の格調、ui-designer 案⑤)。
function GuidanceBadge({ scope, sym, label, testid }) {
  const v2 = isFlashV2Enabled();
  const v2Style = {
    display: 'inline-flex', alignItems: 'baseline', gap: 4, fontSize: 10, fontWeight: 500,
    color: 'var(--text-secondary)', borderLeft: '2px solid var(--border)', paddingLeft: 6, whiteSpace: 'nowrap',
  };
  const v1Style = {
    display: 'inline-flex', alignItems: 'baseline', gap: 4, fontSize: 10, fontWeight: 500,
    color: 'var(--text-secondary)', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap',
  };
  return (
    <span data-testid={testid} style={v2 ? v2Style : v1Style}>
      {scope && <span style={{ color: 'var(--text-muted)', ...(v2 ? { fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' } : {}) }}>{scope}</span>}
      <span aria-hidden>{sym}</span>
      {label}
    </span>
  );
}

// ── 行プリミティブ (module-level、ノーラベル直出しブロックの 1 行) ──
// typography (6体合議 ui-designer 案): label 11px/500/secondary/uppercase、数値 tabular-nums、
// 予想 = muted (過去情報)、結果 = primary 15px/700 (主役)、→ = muted (中立の橋渡し、色なし)。
function FlashRow({ label, children, testid, dividerAfter }) {
  const v2 = isFlashV2Enabled();
  const v3 = isFlashV3Enabled();
  return (
    <div
      data-testid={testid}
      className={v3 ? 'ds-flash-row-v3' : undefined}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--space-3, 12px)',
        flexWrap: 'wrap',
        // v2 再設計: 全行 hairline は「表」化して焦点を均一化する失敗だったため廃止。
        // hero (EPS) の直後にだけ 1 本 hairline を引き、「主役 / 従属」 を物理分割する (3体合議)。
        ...(v2 && dividerAfter ? { borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-3, 12px)', marginBottom: 'var(--space-1, 4px)' } : {}),
      }}
    >
      <span
        style={{
          width: 52,
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
        }}
      >
        {label}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
        {children}
      </span>
    </div>
  );
}

// 「予想 X → 結果 Y (予想比 ±Z%)」 の値部分。est が null (basis mismatch 抑止等) なら結果のみ。
function EstimateToActual({ estStr, actStr, surpriseStr, surpriseColor, hero }) {
  const v2 = isFlashV2Enabled();
  // v2 再設計 (3体合議 round2): 焦点は EPS hero ただ1点 (26px/800)。 他行は v1 並み (15px) に静かに従属。
  // 「全数値 18px」 で焦点分散・文字壁になった失敗の是正 = 1 点だけ突出、 残りは退かせる引き算。
  const actSize = v2 && hero ? 26 : 15;
  return (
    <>
      {estStr != null && (
        <>
          <span style={{ fontSize: v2 ? 11 : 12, color: 'var(--text-muted)' }}>{FLASH_TERMS.estimate}</span>
          <span style={{ fontSize: v2 ? 12 : 13, fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{estStr}</span>
          <span aria-hidden style={{ fontSize: v2 ? 12 : 13, color: 'var(--text-muted)' }}>→</span>
        </>
      )}
      <NumUnit str={actStr} size={actSize} weight={v2 && hero ? 800 : 700} color={'var(--text-primary)'} letterSpacing={v2 && hero ? '-0.01em' : undefined} />
      {/* 予実差 % : v4 で過去確定の beat/miss を muted 緑/赤 (deltaColor)、それ以外は中立。§38: 過去確定事実のみ */}
      {surpriseStr != null && (
        <span style={{ fontSize: 12, fontWeight: 500, color: surpriseColor || 'var(--text-secondary)', whiteSpace: 'nowrap' }}>({surpriseStr})</span>
      )}
    </>
  );
}

// v5.5 デザイン刷新 (2026-06-12、design review 2体統合): 旧 borderLeft 2px の素朴 wrapper →
// ds-flash-card (1px 枠 + radius 10 + 左 3px gold hairline、index.css) + ヘッダー帯 + body の 3 層。
// CLS envelope: 旧 232 + ヘッダー帯 (~36px) ≈ 268。
const cardOuterStyle = {
  minHeight: 268,
  marginBottom: 'var(--space-4, 16px)',
};
// ヘッダー帯 (案A「ホテルのサイン板」): 決算サマリー label + 期 + 操作群。下 hairline で grid 面と分離。
const headerBandStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '9px 14px 9px 16px',
  borderBottom: '1px solid var(--border)',
};
const headerTitleStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};
const headerPeriodStyle = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};
const bodyStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2, 8px)',
  padding: 'var(--space-3, 12px) var(--space-4, 16px)',
};

function skeletonLineStyle(width) {
  return {
    height: 12,
    width,
    maxWidth: '100%',
    borderRadius: 4,
    background: 'var(--bg-subtle)',
    animation: 'anp-skel-shimmer 1.6s linear infinite',
    backgroundImage: 'linear-gradient(90deg, var(--bg-subtle) 25%, var(--bg-hover) 50%, var(--bg-subtle) 75%)',
    backgroundSize: '200% 100%',
  };
}

// ── 下段 (部門別 + 粗利率) = LowerGrid (v5.6 文字壁解消、design review A案 2026-06-12) ──
// FlashRow の自由流し (「iPhone … ・ Service … ・他N部門」 1 行詰め込み) が「カオスな文字壁」 だった主因。
// 上段 HeadlineGrid と同じ 52px label 列で整列し、各部門を「名称 / 金額 / 前年比」 縦積みセルに。
// 視線が上段から下段まで列で縦断でき、雑然感が消える。来期 (将来) は別の future-strip に分離。
const lowerLabelCell = (txt) => (
  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{txt}</span>
);
function SegStack({ seg }) {
  const yoy = seg?.yoy_pct;
  const sym = Number.isFinite(yoy) ? (yoy > 0 ? '↑' : yoy < 0 ? '↓' : '') : null;
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displaySegmentName(seg)}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney((seg?.value_b || 0) * 1e9)}</span>
      {sym != null && (
        <span style={{ fontSize: 11, fontWeight: 500, color: deltaColor(yoy), fontVariantNumeric: 'tabular-nums' }}>{sym}{Math.abs(yoy).toFixed(1)}%</span>
      )}
    </span>
  );
}
function LowerGrid({ segs, restCount, gmStr, gmPp }) {
  const gmPpStr = Number.isFinite(gmPp) ? `${gmPp > 0 ? '↑' : gmPp < 0 ? '↓' : ''}${Math.abs(gmPp).toFixed(1)}pt` : null;
  return (
    <div
      data-testid={`${TESTID}-lower-grid`}
      style={{
        display: 'grid',
        gridTemplateColumns: '52px 1fr 1fr 1fr',
        columnGap: 'var(--space-5, 20px)',
        rowGap: 'var(--space-3, 12px)',
        alignItems: 'start',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {segs && segs.length > 0 && (
        <>
          {lowerLabelCell(FLASH_LABELS.segment)}
          <SegStack seg={segs[0]} />
          {segs[1] ? <SegStack seg={segs[1]} /> : <span />}
          {restCount > 0 ? <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center', whiteSpace: 'nowrap' }}>他 {restCount} 部門</span> : <span />}
        </>
      )}
      {gmStr != null && (
        <>
          {lowerLabelCell(FLASH_LABELS.grossMargin)}
          <span style={{ gridColumn: '2 / 5', display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
            <NumUnit str={gmStr} size={14} weight={600} color={'var(--text-primary)'} unitScale={'0.75em'} />
            {gmPpStr != null && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                前年比 <span style={{ fontWeight: 600, color: deltaColor(gmPp), fontVariantNumeric: 'tabular-nums' }}>{gmPpStr}</span>
              </span>
            )}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.ticker
 * @param {object|null} props.guidance - JudgmentDetail の guidance (/api/guidance/{ticker}/basic、親 fetch 済)
 * @param {boolean} [props.isLoading=false] - guidance 取得中フラグ (親判定)
 */
export default function EarningsFlashSummary({ ticker, guidance, isLoading = false }) {
  // YoY (当期売上の前年比) のみ quarterly-history から補完。dedupGet 化済のため
  // useEpsBeatStreak (limit=8 同 URL) と coalesce され追加の実 fetch は発生しない (設計 verdict)。
  const [latestQ, setLatestQ] = useState(null);
  // セグメント別売上 (Phase2、?flash_seg=1 opt-in): quarterly-history response 直下の segment_summary を保持。
  // history[0] でなく res 直下なので別 state (同一 fetch に相乗り = 追加 fetch なし)。
  const [segmentSummary, setSegmentSummary] = useState(null);
  useEffect(() => {
    setLatestQ(null); // ticker 切替時に他銘柄の残骸 YoY を出さない
    setSegmentSummary(null); // 同上 (他銘柄のセグメントを出さない)
    if (!ticker) return undefined;
    let cancelled = false;
    fetchQuarterlyHistory(ticker, 8).then((res) => {
      if (cancelled) return;
      const h = Array.isArray(res?.history) ? res.history[0] : null;
      if (h) setLatestQ(h);
      setSegmentSummary(res?.segment_summary ?? null);
    });
    return () => { cancelled = true; };
  }, [ticker]);

  // v200 (user 要望: 決算速報 note の「コンセンサス +9.3% に対し新ガイダンス +14〜17%」):
  // 会社 8-K ガイダンス込みの forward を lazy 取得。 ?with_guidance=1 は dedupGet 済 URL のため
  // ForwardOutlookSection の既存 lazy fetch と coalesce され実 fetch は増えない (金融条件「二重 fetch
  // しない」 適合)。 cold (SEC 5-15s) では行が後追い描画される progressive enhancement。
  const [lazyForward, setLazyForward] = useState(null);
  useEffect(() => {
    setLazyForward(null);
    if (!ticker) return undefined;
    let cancelled = false;
    fetchGuidanceSurprise(ticker)
      .then((d) => {
        if (!cancelled && d?.forward) setLazyForward(d.forward);
      })
      .catch(() => { /* graceful: consensus のみ表示 */ });
    return () => { cancelled = true; };
  }, [ticker]);

  // コンセンサス修正トレンド (user 要望「コンセンサス前回比 (上方/下方) 併記」、既存 backend `/api/analyst/consensus-drift`)。
  // §38: backend は direction (up/down/mixed/flat) の事実のみ、narration は CONSENSUS_DRIFT_JP 静的 dict。
  // sources.consensus_snapshots==='ok' の時だけ表示 (insufficient/empty=蓄積中は graceful 非表示、捏造しない)。
  const [consensusDrift, setConsensusDrift] = useState(null);
  useEffect(() => {
    setConsensusDrift(null);
    if (!ticker) return undefined;
    let cancelled = false;
    fetchConsensusDrift(ticker)
      .then((d) => {
        if (!cancelled && d?.sources?.consensus_snapshots === 'ok') setConsensusDrift(d.drift || null);
      })
      .catch(() => { /* graceful: 非表示 */ });
    return () => { cancelled = true; };
  }, [ticker]);

  // 決算ハイライト デザイン v2 再設計 (?flash_v2=1 opt-in、default OFF): EPS hero 1点 + 残り従属 + バッジ刷新。
  const v2 = isFlashV2Enabled();
  // v5.5 copy ボタン (card hover で出現): コピー完了 1.5s チェック表示。
  const [copied, setCopied] = useState(false);

  if (isLoading && !guidance) {
    return (
      <div data-testid={TESTID} data-state="loading" aria-busy="true" className="ds-flash-card" style={cardOuterStyle}>
        <div style={headerBandStyle}><span style={headerTitleStyle}>決算サマリー</span></div>
        <div style={bodyStyle}>
          {/* 5 行分 (EPS/売上/部門別/粗利率/来期) の skeleton で loaded 高 ≈ loading 高 (CLS 抑止) */}
          <div style={skeletonLineStyle(220)} />
          <div style={skeletonLineStyle(260)} />
          <div style={skeletonLineStyle(200)} />
          <div style={skeletonLineStyle(150)} />
          <div style={skeletonLineStyle(240)} />
        </div>
      </div>
    );
  }

  // ── 行の構築 (compound check: 揃っている行だけ出す。捏造・空枠なし) ──
  const rows = [];

  // v5.5 (user 要望「詳細はファンダ章の決算を見てほしい」): 決算セクション (今期 決算結果) へ smooth scroll。
  // instance 局所 = closest (gh-link / PriceLadder idiom)。grid click とヘッダーの「詳細」 リンクで共用。
  const scrollToEarnings = (e) => {
    const root = e?.currentTarget?.closest?.('.ds-judgment-detail') || document;
    // 決算カード (今期 決算結果 = GuidanceCard) を優先、無ければ figure (DiagramCard) に fallback。
    const target = root.querySelector('[data-testid="guidance-card-wrapper"]')
      || document.querySelector('[data-testid="guidance-card-wrapper"]')
      || root.querySelector('[data-testid="sticky-diagram-accordion"]');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // headline (EPS + 売上) の構築。v5 = 列揃え grid (重要3点を仕切り上に集約)、v4 以前 = 従来 FlashRow。
  const v5 = isFlashV5Enabled();
  const eps = guidance?.eps;
  const rev = guidance?.revenue;
  const epsHasEst = Number.isFinite(eps?.estimated);
  const revSurprise = fmtSurprisePct(rev?.surprise_pct);
  const revShowEst = revSurprise != null && Number.isFinite(rev?.estimated);
  const yoyStr = fmtYoyPct(latestQ?.revenue_yoy_pct);

  if (v5 && Number.isFinite(eps?.actual)) {
    // v5: EPS + 売上 を列揃え grid に (予想/結果/予実差/前年比 を縦に揃え 2 秒理解)。
    rows.push(
      <HeadlineGrid
        key="headline-grid"
        eps={{ estStr: epsHasEst ? fmtEps(eps.estimated) : null, actStr: fmtEps(eps.actual), surprisePct: eps.surprise_pct, yoyPct: latestQ?.eps_yoy_pct }}
        rev={Number.isFinite(rev?.actual) ? {
          estStr: revShowEst ? fmtMoney(rev.estimated) : null,
          actStr: fmtMoney(rev.actual),
          surprisePct: revShowEst ? rev.surprise_pct : null,
          yoyPct: latestQ?.revenue_yoy_pct,
        } : null}
        onDetailClick={scrollToEarnings}
      />
    );
  } else {
    // v4 以前: EPS 行 (estimated + actual 両方有限のみ。% は backend surprise_pct のみ、再計算禁止)
    if (Number.isFinite(eps?.actual)) {
      rows.push(
        <FlashRow key="eps" label={FLASH_LABELS.eps} testid={`${TESTID}-eps`} dividerAfter>
          <EstimateToActual
            hero
            estStr={epsHasEst ? fmtEps(eps.estimated) : null}
            actStr={fmtEps(eps.actual)}
            surpriseStr={epsHasEst ? fmtSurprisePct(eps.surprise_pct) : null}
            surpriseColor={surpriseColor(eps.surprise_pct)}
          />
        </FlashRow>
      );
    }
    // 売上行: backend ガード済 surprise_pct が null (銀行/与信 basis mismatch 抑止) なら予想側ごと出さず
    // 実績 + YoY のみ (偽サプライズの並置自体を避ける、金融必須条件)。
    if (Number.isFinite(rev?.actual)) {
      rows.push(
        <FlashRow key="revenue" label={FLASH_LABELS.revenue} testid={`${TESTID}-revenue`}>
          <EstimateToActual
            estStr={revShowEst ? fmtMoney(rev.estimated) : null}
            actStr={fmtMoney(rev.actual)}
            surpriseStr={revShowEst ? revSurprise : null}
            surpriseColor={surpriseColor(rev?.surprise_pct)}
          />
          {yoyStr != null && (
            <span style={{ fontSize: 12, fontWeight: 500, color: deltaColor(latestQ?.revenue_yoy_pct), whiteSpace: 'nowrap' }}>・{yoyStr}</span>
          )}
        </FlashRow>
      );
    }
  }

  // 下段 (部門別 + 粗利率) = LowerGrid データ (v5.6 文字壁解消)。FlashRow 自由流し → 列整列グリッド。
  // 部門別: 上位 2 件 + 「他N部門」(2秒理解、予想比は FMP segment consensus 未接続のため非表示=捏造回避)。
  // 粗利率: 当四半期の採算実値 (backend sector/妥当域 gate 済) + 前年同期差 ±pt (Δ=過去確定の方向)。
  const lowerSegs = (isSegmentEnabled() && segmentSummary?.segments?.length > 0) ? segmentSummary.segments : null;
  const lowerRestCount = lowerSegs ? lowerSegs.length - Math.min(2, lowerSegs.length) : 0;
  const lowerGmStr = isGrossMarginEnabled() ? fmtGrossMargin(latestQ?.gross_margin_pct) : null;
  const hasLower = (lowerSegs && lowerSegs.length > 0) || lowerGmStr != null;

  // 将来ゾーン (来期 + ガイダンスバッジ) = futureNodes。確定実績 (上段+下段) と分離し future-strip 帯に置く
  // (§38 の中立色 mandate を「将来は色が違う」 視覚言語として活かす、design review A案)。
  const futureNodes = [];

  // 来期行: lazy (会社 8-K guidance 込み、coalesce 済) があれば優先、無ければ prop の consensus のみ。
  // v200: 会社売上ガイダンス YoY レンジ (backend 計算済) があれば決算速報 note 形式の並置行
  // 「売上: コンセンサス +9.3% に対し会社ガイダンス +14.0〜17.0%」 を表示 (この時 単独 YoY は重複のため省略)。
  // 無ければ従来表示 (consensus + YoY + GUIDANCE_STATE_JP)。dict に無い state は自動非表示。
  const nq = lazyForward?.next_q || guidance?.forward?.next_q;
  const nfy = lazyForward?.next_fy || guidance?.forward?.next_fy;
  const nqEps = Number.isFinite(nq?.consensus_eps) ? fmtEps(nq.consensus_eps) : null;
  const nqRev = Number.isFinite(nq?.consensus_revenue) ? fmtMoney(nq.consensus_revenue) : null;
  if (nqEps != null || nqRev != null) {
    const yoyStr = fmtYoyPct(nq?.rev_yoy_pct);
    const revLine = fmtGuidanceRevLine(nq?.rev_yoy_pct, nq?.company_q_rev_yoy_low_pct, nq?.company_q_rev_yoy_high_pct);
    const gState = GUIDANCE_STATE_JP[nq?.guidance_vs_consensus_eps] || GUIDANCE_STATE_JP[nq?.guidance_vs_consensus_rev] || null;
    futureNodes.push(
      <FlashRow key="nextq" label={FLASH_LABELS.nextQ} testid={`${TESTID}-nextq`}>
        {nqEps != null && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{FLASH_TERMS.consensusEps}</span>
            <NumUnit str={nqEps} size={15} weight={600} color={'var(--text-primary)'} />
          </>
        )}
        {nqRev != null && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{nqEps != null ? `・${FLASH_TERMS.consensusRev}` : FLASH_TERMS.consensusRev}</span>
            <NumUnit str={nqRev} size={15} weight={600} color={'var(--text-primary)'} />
          </>
        )}
        {yoyStr != null && revLine == null && (
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>({yoyStr})</span>
        )}
        {/* v200 round2 (user 確定): 並置行は判定記号なし (FMP 現コンセンサス vs 発表時ガイダンスの
            時点ミックスで「下方」 に誤読される、SNOW 実例)。時点は文言で明示。 */}
        {revLine != null ? (
          <span data-testid={`${TESTID}-guidance-rev`} style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
            {revLine}
          </span>
        ) : gState && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            <span aria-hidden style={{ fontSize: 10 }}>{gState.sym}</span> {gState.label}
          </span>
        )}
      </FlashRow>
    );
  }

  // ガイダンス履歴基盤 Sprint 4 (§10 条件15、 ?guidance_pit=1 opt-in): 判定バッジ行 + 材料への導線。
  // 前回比 = 通期 (next_fy) — 修正判定の主戦場は四半期ごとに更新される通期ガイダンス
  // (四半期ガイダンスは期ごと新規発番で同一期の再修正が稀 = 金融 verdict)。表示語は
  // GUIDANCE_REVISION_JP dict (earningsFlashTemplates.js) のみ — 本 file に修正語を直書きしない。
  // 発表時比 = 来期 (next_q)。 scope ラベル (通期/来期) で 2 判定の帰属を明示 (混同防止、 ui verdict)。
  // available=false (蓄積不足) / stale (発表から 10 日超の snapshot) はバッジごと非表示 (捏造しない)。
  if (isGuidanceHistoryEnabled()) {
    const fyRev = nfy?.guidance_revision;
    const revState = fyRev?.available
      ? (GUIDANCE_REVISION_JP[fyRev.rev?.state] || GUIDANCE_REVISION_JP[fyRev.eps?.state] || null)
      : null;
    const nqPit = nq?.guidance_pit_consensus;
    const pitState = (nqPit?.available && !nqPit.stale)
      ? (GUIDANCE_PIT_CONSENSUS_JP[nqPit.rev] || GUIDANCE_PIT_CONSENSUS_JP[nqPit.eps] || null)
      : null;
    // コンセンサス修正トレンド (user 要望): consensusDrift (sources ok のみ state 化済) を eps/revenue 集約。
    const driftDir = consensusDrift ? aggregateConsensusDrift(consensusDrift.eps?.direction, consensusDrift.revenue?.direction) : null;
    const driftState = driftDir ? CONSENSUS_DRIFT_JP[driftDir] : null;
    if (revState || pitState || driftState) {
      futureNodes.push(
        <div
          key="gh-badges"
          data-testid={`${TESTID}-gh-badges`}
          style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', paddingLeft: 64 }}
        >
          {revState && <GuidanceBadge scope="通期" sym={revState.sym} label={revState.label} testid={`${TESTID}-badge-revision`} />}
          {pitState && <GuidanceBadge scope="来期" sym={pitState.sym} label={pitState.label} testid={`${TESTID}-badge-pit`} />}
          {/* consensus drift = アナリスト予想の直近引き上げ/引き下げ (中立、§38、label 自己完結のため scope なし) */}
          {driftState && <GuidanceBadge sym={driftState.sym} label={driftState.label} testid={`${TESTID}-badge-drift`} />}
          {/* 材料への導線 (§10 条件2: LLM 生成なしの (b) 案。 instance 局所 = closest、PriceLadder idiom) */}
          <span
            data-testid={`${TESTID}-gh-link`}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              const root = e.currentTarget.closest('.ds-judgment-detail') || document;
              root.querySelector('[data-testid="forward-outlook"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            style={{ fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
          >
            ↗ ガイダンス詳細へ
          </span>
        </div>
      );
    }
  }

  if (rows.length === 0) {
    // empty: 欠損を捏造しない。最小高で静かに非主張 (空枠/coming soon を出さない、マーケ条件。枠も付けない)
    return (
      <div data-testid={TESTID} data-state="empty" style={{ padding: 'var(--space-3, 12px) var(--space-4, 16px)', marginBottom: 'var(--space-4, 16px)' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{FLASH_TERMS.noData}</p>
      </div>
    );
  }

  // 期の帰属 caption (latestQ.fiscal_period があれば)。「いつの決算か」 の事実明示で
  // リアルタイム性の誤認を防ぐ (6体合議マーケ条件 3 の趣旨を fiscal 帰属で充足)。
  const period = typeof latestQ?.fiscal_period === 'string' && latestQ.fiscal_period ? latestQ.fiscal_period : null;

  // v5.5 copy (motion review 3-B): 表示中のサマリーを 1 click で Slack/X 共有できるテキストに整形。
  // 表示値 (backend ガード済の整形文字列) からのみ構築 — 再計算なし、§38 文言なし、出典付き。
  const handleCopy = () => {
    const lines = [`${ticker} 決算サマリー${period ? `（${period}）` : ''} - BeatScanner`];
    if (Number.isFinite(eps?.actual)) {
      const c = classifySurprise(eps.surprise_pct);
      let l = `EPS: ${epsHasEst ? `予想 ${fmtEps(eps.estimated)} → ` : ''}結果 ${fmtEps(eps.actual)}`;
      if (Number.isFinite(eps.surprise_pct)) l += `（予想比 ${barePct(eps.surprise_pct)}${c ? ` ${SURPRISE_VERDICT_JP[c]}` : ''}）`;
      lines.push(l);
    }
    if (Number.isFinite(rev?.actual)) {
      const c = classifySurprise(revShowEst ? rev.surprise_pct : null);
      let l = `売上高: ${revShowEst ? `予想 ${fmtMoney(rev.estimated)} → ` : ''}結果 ${fmtMoney(rev.actual)}`;
      if (revShowEst && Number.isFinite(rev.surprise_pct)) l += `（予想比 ${barePct(rev.surprise_pct)}${c ? ` ${SURPRISE_VERDICT_JP[c]}` : ''}）`;
      if (yoyStr != null) l += ` 前年比 ${yoyStr}`;
      lines.push(l);
    }
    const gm = fmtGrossMargin(latestQ?.gross_margin_pct);
    if (gm != null) lines.push(`粗利率: ${gm}`);
    navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div data-testid={TESTID} data-state="main" className="ds-flash-card" style={cardOuterStyle}>
      {/* ヘッダー帯 (v5.5 design 案A): 「決算サマリー」 を明記 — サマリーであり下に詳細があることを初見で宣言
          (user 相談への推奨実装)。期の帰属も同帯に常設 (時制誤認防止)。右に詳細導線 + copy (hover 出現)。 */}
      <div style={headerBandStyle}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={headerTitleStyle}>決算サマリー</span>
          {period && <span style={headerPeriodStyle}>直近四半期 {period}</span>}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            type="button"
            data-testid={`${TESTID}-detail-link`}
            onClick={scrollToEarnings}
            style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}
          >
            ↗ 詳細は決算セクションへ
          </button>
          <button
            type="button"
            className="ds-flash-copy"
            data-testid={`${TESTID}-copy`}
            onClick={handleCopy}
            aria-label="サマリーをコピー"
            title="サマリーをコピー"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, padding: 0, color: copied ? 'var(--color-gain)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {copied ? <Check size={13} strokeWidth={2} aria-hidden="true" /> : <Copy size={13} strokeWidth={2} aria-hidden="true" />}
          </button>
        </span>
      </div>
      {/* body = 確定実績 (上段 EPS/売上 grid + 下段 部門別/粗利率 LowerGrid)。クリックで決算詳細へ scroll。 */}
      <div style={bodyStyle}>
        {rows}
        {hasLower && <LowerGrid segs={lowerSegs} restCount={lowerRestCount} gmStr={lowerGmStr} gmPp={latestQ?.gross_margin_yoy_pp} />}
      </div>
      {/* future-strip = 将来ゾーン (来期コンセンサス + ガイダンス判定)。border-top + 極薄 tint + 全 neutral 色で
          確定実績と視覚分離 (§38 の中立色 mandate を「将来は色が違う」 視覚言語に、design review A案)。 */}
      {futureNodes.length > 0 && (
        <div
          data-testid={`${TESTID}-future-strip`}
          style={{
            borderTop: '1px solid var(--border)',
            background: 'color-mix(in oklab, var(--text-muted) 5%, transparent)',
            padding: 'var(--space-2, 8px) var(--space-4, 16px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1, 4px)',
          }}
        >
          {futureNodes}
        </div>
      )}
    </div>
  );
}
