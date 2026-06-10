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
import { fetchQuarterlyHistory, fetchGuidanceSurprise } from '../../../../../api.js';
import { fmtMoney, fmtEps, GUIDANCE_STATE_JP } from '../../../../../components/ForwardOutlookSection.jsx';
import {
  FLASH_LABELS,
  FLASH_TERMS,
  fmtSurprisePct,
  fmtYoyPct,
  fmtGrossMargin,
  fmtGuidanceRevLine,
  GUIDANCE_REVISION_JP,
  GUIDANCE_PIT_CONSENSUS_JP,
} from '../../../constants/earningsFlashTemplates.js';

const TESTID = 'earnings-flash-summary';

// ガイダンス履歴基盤 Sprint 4 (6体合議 §10 条件9): 判定バッジは default OFF、
// ?guidance_pit=1 / localStorage 'guidance_pit'='1' で opt-in → user dogfood 後に default ON 昇格。
function isGuidanceHistoryEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('guidance_pit');
    if (urlParam === '1') return true;
    if (urlParam === '0') return false;
    return window.localStorage?.getItem('guidance_pit') === '1';
  } catch {
    return false;
  }
}

// 決算ハイライト Phase2 (四半期グロスマージン): ?flash_gm=1 / localStorage 'flash_gm'='1' で opt-in。
// default OFF (本番挙動不変)。粗利率は DiagramCard(推移図)/ProfileCard(年次) に既出のため、
// 「章冒頭の当四半期実値」 の追加価値を user dogfood で確認後 default ON 昇格 (isGuidanceHistoryEnabled と同パターン)。
// ※ セグメント別売上行は既存 2 箇所 (DiagramCard SegmentBar / ProfileCard SegmentSection、 同一四半期粒度) と
//   重複するため本 Phase では追加せず、 集約 vs アンカー導線の設計判断を保留 (6体合議 マーケ verdict)。
function isGrossMarginEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('flash_gm');
    if (urlParam === '1') return true;
    if (urlParam === '0') return false;
    return window.localStorage?.getItem('flash_gm') === '1';
  } catch {
    return false;
  }
}

// 判定バッジ (10px neutral、色なし — §38。サイズで前方視界の主役 19px と階層差別化、ui verdict)
function GuidanceBadge({ scope, sym, label, testid }) {
  return (
    <span
      data-testid={testid}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 4,
        fontSize: 10,
        fontWeight: 500,
        color: 'var(--text-secondary)',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      {scope && <span style={{ color: 'var(--text-muted)' }}>{scope}</span>}
      <span aria-hidden>{sym}</span>
      {label}
    </span>
  );
}

// ── 行プリミティブ (module-level、ノーラベル直出しブロックの 1 行) ──
// typography (6体合議 ui-designer 案): label 11px/500/secondary/uppercase、数値 tabular-nums、
// 予想 = muted (過去情報)、結果 = primary 15px/700 (主役)、→ = muted (中立の橋渡し、色なし)。
function FlashRow({ label, children, testid }) {
  return (
    <div
      data-testid={testid}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--space-3, 12px)',
        flexWrap: 'wrap',
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
function EstimateToActual({ estStr, actStr, surpriseStr }) {
  return (
    <>
      {estStr != null && (
        <>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{FLASH_TERMS.estimate}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{estStr}</span>
          <span aria-hidden style={{ fontSize: 13, color: 'var(--text-muted)' }}>→</span>
        </>
      )}
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{actStr}</span>
      {/* 予実差 % は中立色 (緑/赤を塗らない、§38 保守側 + 色は 5 条件カードに集中) */}
      {surpriseStr != null && (
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>({surpriseStr})</span>
      )}
    </>
  );
}

const containerStyle = {
  // CLS envelope: 3 行分の概算高 (feedback_cls_envelope_pattern)。main/loading 共通で章の伸縮を抑止
  minHeight: 96,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2, 8px)',
  padding: 'var(--space-3, 12px) var(--space-4, 16px)',
  borderLeft: '2px solid var(--border)',
  marginBottom: 'var(--space-4, 16px)',
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
  useEffect(() => {
    setLatestQ(null); // ticker 切替時に他銘柄の残骸 YoY を出さない
    if (!ticker) return undefined;
    let cancelled = false;
    fetchQuarterlyHistory(ticker, 8).then((res) => {
      if (cancelled) return;
      const h = Array.isArray(res?.history) ? res.history[0] : null;
      if (h) setLatestQ(h);
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

  if (isLoading && !guidance) {
    return (
      <div data-testid={TESTID} data-state="loading" aria-busy="true" style={containerStyle}>
        <div style={skeletonLineStyle(220)} />
        <div style={skeletonLineStyle(260)} />
        <div style={skeletonLineStyle(180)} />
      </div>
    );
  }

  // ── 行の構築 (compound check: 揃っている行だけ出す。捏造・空枠なし) ──
  const rows = [];

  // EPS 行: estimated + actual が両方有限のときのみ。% は backend surprise_pct のみ (再計算禁止)
  const eps = guidance?.eps;
  if (Number.isFinite(eps?.actual)) {
    const hasEst = Number.isFinite(eps?.estimated);
    rows.push(
      <FlashRow key="eps" label={FLASH_LABELS.eps} testid={`${TESTID}-eps`}>
        <EstimateToActual
          estStr={hasEst ? fmtEps(eps.estimated) : null}
          actStr={fmtEps(eps.actual)}
          surpriseStr={hasEst ? fmtSurprisePct(eps.surprise_pct) : null}
        />
      </FlashRow>
    );
  }

  // 売上行: backend ガード済 surprise_pct が null (銀行/与信 basis mismatch 抑止) なら
  // 予想側ごと出さず実績 + YoY のみ (偽サプライズの並置自体を避ける、金融必須条件)。
  const rev = guidance?.revenue;
  if (Number.isFinite(rev?.actual)) {
    const revSurprise = fmtSurprisePct(rev?.surprise_pct);
    const showEst = revSurprise != null && Number.isFinite(rev?.estimated);
    const yoyStr = fmtYoyPct(latestQ?.revenue_yoy_pct);
    rows.push(
      <FlashRow key="revenue" label={FLASH_LABELS.revenue} testid={`${TESTID}-revenue`}>
        <EstimateToActual
          estStr={showEst ? fmtMoney(rev.estimated) : null}
          actStr={fmtMoney(rev.actual)}
          surpriseStr={showEst ? revSurprise : null}
        />
        {yoyStr != null && (
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>・{yoyStr}</span>
        )}
      </FlashRow>
    );
  }

  // 粗利率行 (Phase2、?flash_gm=1 opt-in): 当四半期の採算実値。backend で sector/妥当域 gate 済を読むだけ
  // (frontend 再計算禁止)。判断語なし・色なし中立 (§38/§5、5 条件カードに色エネルギー集中)。
  // EPS/売上の後・来期の前 = 決算速報 note 順 (EPS → 売上 → 粗利率 → 来期)。section 上部の「直近四半期」
  // caption が期を明示するため row 内の四半期表記は省略 (DiagramCard 推移図 / ProfileCard 年次 と粒度差別化)。
  if (isGrossMarginEnabled()) {
    const gmStr = fmtGrossMargin(latestQ?.gross_margin_pct);
    if (gmStr != null) {
      rows.push(
        <FlashRow key="grossmargin" label={FLASH_LABELS.grossMargin} testid={`${TESTID}-gross-margin`}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{gmStr}</span>
        </FlashRow>
      );
    }
  }

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
    rows.push(
      <FlashRow key="nextq" label={FLASH_LABELS.nextQ} testid={`${TESTID}-nextq`}>
        {nqEps != null && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{FLASH_TERMS.consensusEps}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{nqEps}</span>
          </>
        )}
        {nqRev != null && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{nqEps != null ? `・${FLASH_TERMS.consensusRev}` : FLASH_TERMS.consensusRev}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{nqRev}</span>
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
    if (revState || pitState) {
      rows.push(
        <div
          key="gh-badges"
          data-testid={`${TESTID}-gh-badges`}
          style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', paddingLeft: 64 }}
        >
          {revState && <GuidanceBadge scope="通期" sym={revState.sym} label={revState.label} testid={`${TESTID}-badge-revision`} />}
          {pitState && <GuidanceBadge scope="来期" sym={pitState.sym} label={pitState.label} testid={`${TESTID}-badge-pit`} />}
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
    // empty: 欠損を捏造しない。最小高で静かに非主張 (空枠/coming soon を出さない、マーケ条件)
    return (
      <div data-testid={TESTID} data-state="empty" style={{ ...containerStyle, minHeight: 0 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{FLASH_TERMS.noData}</p>
      </div>
    );
  }

  // 期の帰属 caption (latestQ.fiscal_period があれば)。「いつの決算か」 の事実明示で
  // リアルタイム性の誤認を防ぐ (6体合議マーケ条件 3 の趣旨を fiscal 帰属で充足)。
  const period = typeof latestQ?.fiscal_period === 'string' && latestQ.fiscal_period ? latestQ.fiscal_period : null;

  return (
    <div data-testid={TESTID} data-state="main" style={containerStyle}>
      {period && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          直近四半期 {period}
        </div>
      )}
      {rows}
    </div>
  );
}
