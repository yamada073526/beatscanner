/**
 * EarningsThreePoint — v6 L2「決算3点」の mockup 忠実 lean 表示。
 *
 * 正本 mockup `docs/specs/mockups/pane3-detail-v1.html` の `.earn-grid` (3 列: EPS / 売上 /
 * ガイダンス) + `.future-strip` (来期コンセンサス YoY) を素直に再現する。
 *
 * 背景 (2026-06-28 mockup 忠実化・user gate「mockup の素の3列に簡素化」):
 *   旧 v6 L2 は EarningsFlashSummary (1025行) を mount し、部門別 / 粗利率 / ヘッダー帯 /
 *   コピーボタン / count-up で密度が mockup の 3-4 倍だった。user 判断で「素の3列」へ簡素化。
 *   ※ EarningsFlashSummary 自体は L1SummaryBuckets / CompletenessRollupBadge / ForwardOutlookSection
 *     で引き続き使用するため削除しない。本 component は v6 L2 専用の軽量版。
 *
 * 数値整合 (Trust Cliff 防止): L1SummaryBuckets と同一 source (`guidance.eps/.revenue` +
 *   `guidance.forward.next_q`) + 同一整形 (fmtEpsShort / fmtRevShort / fmtPct) を使い、
 *   L1 buckets と L2 detail で数値がズレないようにする。fetch は親 (guidance prop) 流用で重複ゼロ。
 *
 * §38 / 景表法 §5:
 *   - サプライズ色 = ±3% verdict (surpriseColor)。+1.8% 等の僅差は中立 (naive 正=緑 は過剰 signal)。
 *   - ガイダンス「維持」= neutral (amber は引き下げ時のみ・GUIDANCE_SAFE_LABEL は語で方向)。
 *   - 来期コンセンサス YoY = 色なし (中立)・将来予測の断定回避。
 *   - 行動指示 (買い/売り) を一切出さない。欠損は「—」 honest fallback (捏造しない)。
 *
 * 設計境界: 新規 glow host を作らない (発光は 5 条件カードのみ)・raw hex 禁止・
 *   loading/errored/empty/main 全 render path に data-testid。
 */
const TESTID = 'earnings-three-point';

// ±3% verdict (EarningsFlashSummary の surpriseColor と同流儀・§38)
function surpriseColor(pct) {
  if (!Number.isFinite(pct)) return 'var(--text-primary)';
  if (pct >= 3) return 'var(--color-gain)';
  if (pct <= -3) return 'var(--color-loss)';
  return 'var(--text-secondary)'; // 予想並み = neutral
}

function fmtPct(pct) {
  if (!Number.isFinite(pct)) return null;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function fmtEpsShort(val) {
  if (!Number.isFinite(val)) return '—';
  return `$${val.toFixed(2)}`;
}

function fmtRevShort(val) {
  if (!Number.isFinite(val)) return '—';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toFixed(0)}`;
}

// §38: 引き上げ/維持は neutral（語で方向を伝える）。amber は引き下げ時のみ。
const GUIDANCE_SAFE_LABEL = {
  up: '引き上げ', above: '引き上げ',
  down: '引き下げ', below: '引き下げ',
  flat: '維持', maintained: '維持', 'in-line': '維持',
};
function guidanceSafeLabel(state) {
  if (!state) return null;
  return GUIDANCE_SAFE_LABEL[state] || null;
}
function guidanceColor(state) {
  if (state === 'down' || state === 'below') return 'var(--color-warning)';
  return 'var(--text-primary)'; // 引き上げ / 維持 = neutral
}

const cellLabelStyle = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 };
const cellValStyle = { fontSize: 21, fontWeight: 700, fontVariantNumeric: 'tabular-nums' };
const cellSubStyle = { fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, fontVariantNumeric: 'tabular-nums' };

/**
 * @param {object} props
 * @param {object|null} props.guidance - { eps:{actual,estimated,surprise_pct}, revenue:{...}, forward:{next_q:{...}} }
 * @param {boolean} [props.isLoading]
 */
export default function EarningsThreePoint({ guidance, isLoading = false }) {
  // loading
  if (isLoading && !guidance) {
    return (
      <div data-testid={TESTID} data-state="loading" aria-busy="true"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3, 12px)' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ height: 64, borderRadius: 'var(--radius-sm, 9px)', background: 'var(--bg-subtle)' }} />
        ))}
      </div>
    );
  }

  const eps = guidance?.eps;
  const rev = guidance?.revenue;
  const fwd = guidance?.forward?.next_q;

  const epsActual = Number.isFinite(eps?.actual) ? eps.actual : null;
  const epsEst = Number.isFinite(eps?.estimated) ? eps.estimated : null;
  const epsSurprise = Number.isFinite(eps?.surprise_pct) ? eps.surprise_pct : null;

  const revActual = Number.isFinite(rev?.actual) ? rev.actual : null;
  const revEst = Number.isFinite(rev?.estimated) ? rev.estimated : null;
  const revSurprise = Number.isFinite(rev?.surprise_pct) ? rev.surprise_pct : null;

  const gState = fwd?.guidance_vs_consensus_eps || fwd?.guidance_vs_consensus_rev;
  const gLabel = guidanceSafeLabel(gState);

  // empty: EPS も売上も無い = データ未取得 (捏造しない)
  if (epsActual == null && revActual == null) {
    return (
      <div data-testid={TESTID} data-state="empty"
        style={{ fontSize: 13, color: 'var(--text-muted)', padding: 'var(--space-3, 12px) 0' }}>
        —（決算データ取得待ち）
      </div>
    );
  }

  // future-strip 来期 YoY (色なし・中立・§38)
  const revYoy = Number.isFinite(fwd?.rev_yoy_pct) ? fwd.rev_yoy_pct : null;
  const epsYoy = Number.isFinite(fwd?.eps_yoy_pct) ? fwd.eps_yoy_pct : null;
  const showFuture = revYoy != null || epsYoy != null;

  return (
    <div data-testid={TESTID} data-state="main" style={{ display: 'grid', gap: 'var(--space-4, 16px)' }}>
      {/* mockup .earn-grid: 3 列 (EPS / 売上 / ガイダンス) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3, 12px)' }}>
        {/* EPS */}
        <div style={{ padding: '14px 4px' }}>
          <div style={cellLabelStyle}>EPS</div>
          <div style={{ ...cellValStyle, color: surpriseColor(epsSurprise) }}>{fmtEpsShort(epsActual)}</div>
          <div style={cellSubStyle}>
            {epsEst != null ? `予想 ${fmtEpsShort(epsEst)}` : '予想 —'}
            {epsSurprise != null && (
              <> · <span style={{ color: surpriseColor(epsSurprise) }}>{fmtPct(epsSurprise)}</span></>
            )}
          </div>
        </div>
        {/* 売上 */}
        <div style={{ padding: '14px 4px' }}>
          <div style={cellLabelStyle}>売上</div>
          <div style={{ ...cellValStyle, color: surpriseColor(revSurprise) }}>{fmtRevShort(revActual)}</div>
          <div style={cellSubStyle}>
            {revEst != null ? `予想 ${fmtRevShort(revEst)}` : '予想 —'}
            {revSurprise != null && (
              <> · <span style={{ color: surpriseColor(revSurprise) }}>{fmtPct(revSurprise)}</span></>
            )}
          </div>
        </div>
        {/* ガイダンス（来期）— §38: 維持 = neutral */}
        <div style={{ padding: '14px 4px' }}>
          <div style={cellLabelStyle}>ガイダンス（来期）</div>
          <div style={{ ...cellValStyle, fontSize: 18, color: gLabel ? guidanceColor(gState) : 'var(--text-muted)' }}>
            {gLabel || '—'}
          </div>
          <div style={cellSubStyle}>
            {gLabel ? 'コンセンサス比' : '開示なし'}
          </div>
        </div>
      </div>

      {/* mockup .future-strip: 来期コンセンサス YoY (色なし・中立) */}
      {showFuture && (
        <div style={{
          background: 'var(--bg-future, var(--bg-subtle))', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm, 9px)', padding: '13px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3, 12px)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>来期コンセンサス（YoY）</span>
          <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
            {revYoy != null && <>売上 {fmtPct(revYoy)}</>}
            {revYoy != null && epsYoy != null && ' · '}
            {epsYoy != null && <>EPS {fmtPct(epsYoy)}</>}
          </span>
        </div>
      )}

      {/* 出典 footer (Trust Cliff・citation required) */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>出典: SEC / FMP（数値）</div>
    </div>
  );
}
