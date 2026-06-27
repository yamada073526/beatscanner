/**
 * L1SummaryBuckets — v6 IA 再構成: 判定サマリー層（L1）
 *
 * @no-llm: このコンポーネントは backend 計算済値の静的テンプレート整形専用。LLM API 呼び出し禁止。
 *
 * 配置: StateCompass の代替として v6 flag ON 時のみ表示（v5 経路では StateCompass が残置）。
 * 内容: 決算3点 named buckets（EPS/売上/ガイダンス clickable → drill）
 *       + 連続ビート mini + RS mini + 状態 N/5 dot+ⓘ
 *
 * §38-safe 語彙厳守:
 *   - ガイダンス「維持」= neutral 色（amber は引き下げ時のみ）
 *   - 来期コンセンサス YoY は色なし
 *   - 状態は dot 色 + safe ラベル + ⓘ のみ（行動指示は一切出さない）
 *   - 評価語でなく数値のみ（+4.2% 等）
 *
 * Trust Cliff ガード:
 *   - per-source compound: sources.X==='ok' && data.X
 *   - 欠落時 — fallback（捏造数値を出さない）
 *   - セクター地位 / DSO は S3 送り＝Sprint 1 では非表示
 *
 * bucket click → smoothScrollToSelector('#earnings', {offset: 72})
 *   native #id は内側スクロールで無効 → smoothScrollToSelector 必須
 *   fold 時は fold auto-open してから scroll（detailRoot 経由）
 *
 * design danger zone: 発光系 CSS 不触。新規 glow host 作成禁止。
 *   wrapper は token-level spacing のみ（design_recipes §C-1〜C-4 遵守）。
 *
 * testid: loading / errored / empty / main の全 render path に付与（feedback_testid_all_render_paths）。
 *
 * Sprint 1 DoD: 地合い行は S2 送り（useFtdMap import は次 sprint）。
 */
import { useEpsBeatStreak } from '../useEpsBeatStreak.js';
import { smoothScrollToElement } from '../../../../../lib/smoothScroll.js';
import { useFtdMap, ftdRegime, ftdToneColor } from '../../../../workspace/ftd.js';

const TESTID = 'l1-summary-buckets';

// ------- 色トークン（§38-safe 基準） --------
// ガイダンス別 §38-safe 色マッピング。
// §38: 引き上げ/維持は neutral（緑=行動誘引色を避ける・既存 EarningsFlashSummary の
// ガイダンス中立流儀と一致）。amber は引き下げ (down/below) 時のみ。
// 方向は GUIDANCE_SAFE_LABEL の「引き上げ/引き下げ/維持」ラベルで伝える（色でなく語）。
function guidanceColor(state) {
  if (!state) return 'var(--text-primary)';
  const s = String(state).toLowerCase();
  if (s === 'down' || s === 'below') return 'var(--color-warning, #f59e0b)';
  return 'var(--text-primary)'; // 引き上げ / 維持 / 横ばい = neutral
}

// サプライズ比%の色（§38: 予実差 = 過去確定事実のみ色付け可）
function surpriseColor(pct) {
  if (!Number.isFinite(pct)) return 'var(--text-primary)';
  if (pct >= 3) return 'var(--color-gain, #34ef81)';
  if (pct <= -3) return 'var(--color-loss, #f87171)';
  return 'var(--color-warning, #f59e0b)';
}

// 数値フォーマット：符号付き%
function fmtPct(pct) {
  if (!Number.isFinite(pct)) return null;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

// EPS 短縮表示
function fmtEpsShort(val) {
  if (!Number.isFinite(val)) return null;
  return `$${val.toFixed(2)}`;
}

// 売上 短縮表示（B/M）
function fmtRevShort(val) {
  if (!Number.isFinite(val)) return null;
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toFixed(0)}`;
}

// ガイダンス状態の §38-safe ラベル
const GUIDANCE_SAFE_LABEL = {
  up: '引き上げ',
  above: '引き上げ',
  down: '引き下げ',
  below: '引き下げ',
  flat: '維持',
  maintained: '維持',
  'in-line': '維持',
  unknown: null,
};

function guidanceSafeLabel(state) {
  if (!state) return null;
  return GUIDANCE_SAFE_LABEL[String(state).toLowerCase()] ?? null;
}

// 状態 N/5 の dot 色
function dotColor(passedCount, totalCount) {
  if (!Number.isFinite(passedCount) || !Number.isFinite(totalCount) || totalCount === 0) return 'var(--text-muted)';
  const ratio = passedCount / totalCount;
  if (ratio >= 0.8) return 'var(--color-gain, #34ef81)';
  if (ratio >= 0.4) return 'var(--color-warning, #f59e0b)';
  return 'var(--color-loss, #f87171)';
}

// ------- スタイル定数 --------
const cardStyle = {
  background: 'var(--bg-card, #1e2433)',
  border: '1px solid var(--border-strong, rgba(255,255,255,0.14))',
  borderRadius: 'var(--radius-md, 14px)',
  padding: 'var(--space-6, 24px)',
  display: 'grid',
  gap: 'var(--space-4, 16px)',
};

const headStyle = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
};

const titleStyle = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-secondary)',
};

const stateStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
};

const bucketsStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 'var(--space-3, 12px)',
};

const bucketBaseStyle = {
  background: 'var(--bg-future, #121a28)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 'var(--radius-sm, 9px)',
  padding: '13px 14px',
  cursor: 'pointer',
  display: 'grid',
  gap: 5,
  position: 'relative',
  textDecoration: 'none',
  color: 'inherit',
  transition: 'border-color 0.15s',
};

const bLabelStyle = {
  fontSize: 11.5,
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const bMainStyle = {
  fontSize: 19,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
};

const bSubStyle = {
  fontSize: 11.5,
  color: 'var(--text-secondary)',
};

const bDrillStyle = {
  position: 'absolute',
  top: 11,
  right: 11,
  fontSize: 11,
  color: 'var(--text-muted)',
};

const miniRowStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--space-3, 12px)',
};

const miniStyle = {
  background: 'var(--bg-subtle, #1e2a3a)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm, 9px)',
  padding: '11px 14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  textDecoration: 'none',
  color: 'inherit',
  transition: 'border-color 0.15s',
};

const skeletonStyle = (w = 120) => ({
  height: 14,
  width: w,
  borderRadius: 4,
  background: 'var(--bg-muted, #243447)',
  animation: 'shimmer 1.5s infinite',
});

// -------- メインコンポーネント --------
/**
 * @param {object} props
 * @param {string} props.ticker
 * @param {object|null} props.guidance - /api/guidance/{ticker}/basic の result
 * @param {boolean} [props.isLoading]
 * @param {object|null} props.result - 5条件 result（passedCount / totalCount）
 * @param {object|null} props.technicalRs - technicalRs（universe_percentile / rs_vs_spy_pct）
 * @param {HTMLElement|null} [props.detailRoot] - smoothScroll の起点（.ds-judgment-detail）
 * @param {function} [props.onScrollToEarnings] - bucket click → earnings セクションへ scroll
 * @param {function} [props.onScrollToTechnical] - RS mini click → テクニカルセクションへ scroll
 * @param {boolean} [props.isNonEquity] - 非 equity 時は決算3点 / RS を非表示
 */
export default function L1SummaryBuckets({
  ticker,
  guidance,
  isLoading = false,
  result = null,
  technicalRs = null,
  detailRoot = null,
  onScrollToEarnings,
  onScrollToTechnical,
  isNonEquity = false,
}) {
  const { streak, hasData: streakHasData, loading: streakLoading } = useEpsBeatStreak(ticker, 8);

  // -------- 前提: 地合い（市場局面 / Follow-Through Day）--------
  // KB 最上流（O'Neil M = Market Direction / じっちゃま地合い）: 個別銘柄評価の「前提」。
  // §38: 機械判定であり相場予測でない（regime.disclaimer を ⓘ 併記）。
  // fetch は api.js dedupGet で重複吸収（screener banner と 1 本化）。
  const { ftdMap, loading: ftdLoading } = useFtdMap();
  const regime = ftdLoading ? null : ftdRegime(ftdMap);
  const showRegime = regime && regime.status !== 'none';

  // -------- scroll helpers --------
  const scrollToEarnings = (e) => {
    e?.preventDefault();
    if (onScrollToEarnings) { onScrollToEarnings(); return; }
    const root = detailRoot || e?.currentTarget?.closest?.('.ds-judgment-detail') || document;
    // v6: #v6-earnings セクション → fallback: fundamentals-earnings-section
    const target = root.querySelector('[data-testid="v6-earnings-section"]')
      || root.querySelector('[data-testid="fundamentals-earnings-section"]')
      || root.querySelector('[data-testid="guidance-card-wrapper"]');
    smoothScrollToElement(target, { offset: 72 });
  };

  const scrollToTechnical = (e) => {
    e?.preventDefault();
    if (onScrollToTechnical) { onScrollToTechnical(); return; }
    const root = detailRoot || e?.currentTarget?.closest?.('.ds-judgment-detail') || document;
    const target = root.querySelector('[data-testid="v6-technical-section"]')
      || root.querySelector('[data-testid="pane3-technical-chapter"]');
    smoothScrollToElement(target, { offset: 72 });
  };

  // -------- loading state --------
  if (isLoading && !guidance) {
    return (
      <div data-testid={TESTID} data-state="loading" aria-busy="true" style={cardStyle}>
        <div style={headStyle}>
          <span style={titleStyle}>判定サマリー</span>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={skeletonStyle(200)} />
          <div style={skeletonStyle(280)} />
          <div style={skeletonStyle(160)} />
        </div>
      </div>
    );
  }

  // -------- no data state --------
  if (!guidance && !isLoading) {
    return (
      <div data-testid={TESTID} data-state="empty" style={cardStyle}>
        <div style={headStyle}>
          <span style={titleStyle}>判定サマリー</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          決算データを取得中です…
        </div>
      </div>
    );
  }

  // -------- data extraction (compound check) --------
  const eps = guidance?.eps;
  const rev = guidance?.revenue;
  const fwd = guidance?.forward?.next_q;
  const guidanceState = fwd?.guidance_vs_consensus_eps || fwd?.guidance_vs_consensus_rev;

  const epsActual = Number.isFinite(eps?.actual) ? eps.actual : null;
  const epsEstimated = Number.isFinite(eps?.estimated) ? eps.estimated : null;
  const epsSurprisePct = Number.isFinite(eps?.surprise_pct) ? eps.surprise_pct : null;

  const revActual = Number.isFinite(rev?.actual) ? rev.actual : null;
  const revEstimated = Number.isFinite(rev?.estimated) ? rev.estimated : null;
  const revSurprisePct = Number.isFinite(rev?.surprise_pct) ? rev.surprise_pct : null;

  // ガイダンス §38-safe ラベル（S1: セクター地位は S3、地合いは S2）
  const gLabel = guidanceSafeLabel(guidanceState);
  const gColor = guidanceColor(guidanceState);

  // 状態 N/5
  const passedCount = result?.passedCount ?? null;
  const totalCount = result?.totalCount ?? null;
  const hasState = Number.isFinite(passedCount) && Number.isFinite(totalCount);

  // RS
  const rsUniv = technicalRs?.universe_percentile;
  const rsHasUniv = Number.isFinite(rsUniv);
  const rsVsSpy = technicalRs?.rs_vs_spy_pct;
  const rsHasSpy = Number.isFinite(rsVsSpy) && !technicalRs?.spy_unavailable;
  const rsDisplay = rsHasUniv
    ? String(rsUniv)
    : rsHasSpy
    ? `${rsVsSpy > 0 ? '+' : ''}${rsVsSpy.toFixed(1)}%`
    : '—';
  const rsLabel = rsHasUniv ? 'RS Rating' : rsHasSpy ? `RS 対SPY` : 'RS Rating';
  const rsScale = rsHasUniv ? '· 目安 80+ で強い' : '';

  // -------- main render --------
  return (
    <div data-testid={TESTID} data-state="main" style={cardStyle}>
      {/* ヘッダー: タイトル + 状態 N/5 */}
      <div style={headStyle}>
        <div style={titleStyle}>判定サマリー</div>
        {hasState && (
          <div style={stateStyle}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                display: 'inline-block',
                background: dotColor(passedCount, totalCount),
              }}
              aria-hidden="true"
            />
            <span style={{ color: 'var(--text-secondary)' }}>
              条件充足 <strong>{passedCount} / {totalCount}</strong>
            </span>
            <span
              style={{ color: 'var(--text-muted)', cursor: 'help', fontSize: 12 }}
              title={`ファンダ${totalCount}条件のうち${passedCount}条件が充足（状態の根拠は詳細セクションを参照）`}
            >
              ⓘ
            </span>
          </div>
        )}
      </div>

      {/* 前提・地合い行（市場局面 / Follow-Through Day）— KB 最上流。§38: 機械判定・相場予測でない（ⓘ）。
          regime.status==='none'（判定不能 / breadth 不足）は誤表示回避のため非表示。 */}
      {showRegime && (
        <div
          data-testid={`${TESTID}-regime`}
          data-regime-status={regime.status}
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-2, 8px)',
            padding: 'var(--space-2, 8px) var(--space-3, 12px)',
            borderRadius: 'var(--radius-md, 12px)',
            border: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
          }}
        >
          <span
            aria-hidden="true"
            style={{ width: 8, height: 8, borderRadius: '50%', background: ftdToneColor(regime.tone), flexShrink: 0 }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em', flexShrink: 0 }}>前提・地合い</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: ftdToneColor(regime.tone), whiteSpace: 'nowrap', flexShrink: 0 }}>
            {regime.label}
          </span>
          {regime.detail && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: '1 1 200px', minWidth: 0 }}>
              {regime.detail}
            </span>
          )}
          <span
            aria-label={regime.disclaimer}
            title={regime.disclaimer}
            style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'help', flexShrink: 0 }}
          >
            ⓘ
          </span>
        </div>
      )}

      {/* 決算3点 named buckets（非 equity 時は全て非表示） */}
      {!isNonEquity && (
        <div style={bucketsStyle} data-testid={`${TESTID}-buckets`}>
          {/* EPS bucket */}
          <button
            type="button"
            onClick={scrollToEarnings}
            style={{ ...bucketBaseStyle, textAlign: 'left' }}
            data-testid={`${TESTID}-bucket-eps`}
            aria-label="EPS詳細へ移動"
          >
            <span style={bDrillStyle}>詳細 ↓</span>
            <span style={bLabelStyle}>
              <span style={{ color: 'var(--color-warning, #fbbf24)', fontSize: 11 }}>★</span>
              EPS（対コンセンサス）
            </span>
            {epsActual != null ? (
              <>
                <span style={{ ...bMainStyle, color: epsSurprisePct != null ? surpriseColor(epsSurprisePct) : 'var(--text-primary)' }}>
                  {epsSurprisePct != null ? fmtPct(epsSurprisePct) : fmtEpsShort(epsActual)}
                </span>
                <span style={bSubStyle}>
                  {fmtEpsShort(epsActual)}
                  {epsEstimated != null ? ` ／ 予想 ${fmtEpsShort(epsEstimated)}` : ''}
                </span>
              </>
            ) : (
              <span style={{ ...bMainStyle, color: 'var(--text-muted)' }}>—</span>
            )}
          </button>

          {/* 売上 bucket */}
          <button
            type="button"
            onClick={scrollToEarnings}
            style={{ ...bucketBaseStyle, textAlign: 'left' }}
            data-testid={`${TESTID}-bucket-revenue`}
            aria-label="売上詳細へ移動"
          >
            <span style={bDrillStyle}>詳細 ↓</span>
            <span style={bLabelStyle}>
              <span style={{ color: 'var(--color-warning, #fbbf24)', fontSize: 11 }}>★</span>
              売上（対コンセンサス）
            </span>
            {revActual != null ? (
              <>
                <span style={{ ...bMainStyle, color: revSurprisePct != null ? surpriseColor(revSurprisePct) : 'var(--text-primary)' }}>
                  {revSurprisePct != null ? fmtPct(revSurprisePct) : fmtRevShort(revActual)}
                </span>
                <span style={bSubStyle}>
                  {fmtRevShort(revActual)}
                  {revEstimated != null ? ` ／ 予想 ${fmtRevShort(revEstimated)}` : ''}
                </span>
              </>
            ) : (
              <span style={{ ...bMainStyle, color: 'var(--text-muted)' }}>—</span>
            )}
          </button>

          {/* ガイダンス bucket（§38: 維持 = neutral 色） */}
          <button
            type="button"
            onClick={scrollToEarnings}
            style={{ ...bucketBaseStyle, textAlign: 'left' }}
            data-testid={`${TESTID}-bucket-guidance`}
            aria-label="ガイダンス詳細へ移動"
          >
            <span style={bDrillStyle}>詳細 ↓</span>
            <span style={bLabelStyle}>
              <span style={{ color: 'var(--color-warning, #fbbf24)', fontSize: 11 }}>★</span>
              ガイダンス（来期）
            </span>
            {gLabel != null ? (
              <>
                <span style={{ ...bMainStyle, color: gColor }}>
                  {gLabel}
                </span>
                <span style={bSubStyle}>
                  {guidanceState === 'up' || guidanceState === 'above'
                    ? 'コンセンサス比 上回り'
                    : guidanceState === 'down' || guidanceState === 'below'
                    ? 'コンセンサス比 下回り'
                    : 'コンセンサス比 ほぼ同水準'}
                </span>
              </>
            ) : (
              <span style={{ ...bMainStyle, color: 'var(--text-muted)' }}>—</span>
            )}
          </button>
        </div>
      )}

      {/* ミニ: 連続ビート + RS（非 equity 時は非表示） */}
      {!isNonEquity && (
        <div style={miniRowStyle} data-testid={`${TESTID}-mini-row`}>
          {/* 連続ビート mini */}
          <button
            type="button"
            onClick={scrollToEarnings}
            style={miniStyle}
            data-testid={`${TESTID}-mini-streak`}
            aria-label="連続ビート詳細へ移動"
          >
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>連続ビート</span>
            {streakLoading ? (
              <span style={skeletonStyle(48)} />
            ) : streakHasData ? (
              <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {streak}
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>Q 連続</span>
              </span>
            ) : (
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-muted)' }}>—</span>
            )}
          </button>

          {/* RS mini */}
          <button
            type="button"
            onClick={scrollToTechnical}
            style={miniStyle}
            data-testid={`${TESTID}-mini-rs`}
            aria-label="RSテクニカル詳細へ移動"
          >
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rsLabel}</span>
            <span>
              <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {rsDisplay}
              </span>
              {rsScale && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> {rsScale}</span>
              )}
            </span>
          </button>
        </div>
      )}

      {/* 非 equity 時のメッセージ */}
      {isNonEquity && (
        <div
          data-testid={`${TESTID}-non-equity`}
          style={{ fontSize: 13, color: 'var(--text-muted)', padding: '4px 0' }}
        >
          指数・先物・為替は決算3点・RS の対象外です
        </div>
      )}

      {/* citation footer（§5 Trust Cliff: SEC/FMP 出典） */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        出典: SEC / FMP（数値）· 取得日: 本日
      </div>
    </div>
  );
}
