/**
 * EtfExposurePanel — 個別銘柄が主要 US ETF にどれだけ組み入れられているかを表示 (v202→v203 強化版)。
 *
 * @no-llm: backend /api/etf-exposure (FMP asset-exposure を主要 ETF allowlist で curation、
 *   rank=holdings 順位 / perf_1y_pct=過去1年リターン を enrich 済) を読むだけの静的整形。
 *   LLM 不使用、frontend 再計算なし。
 *
 * v203 (2026-06-12 user feedback「内容が寂しい・淡白」+ design review 反映):
 *   - ProfileCard 内へ移設 (競合チップと同じ「補足情報の島」 idiom = border + bg-subtle)
 *   - 行 = [ETF ticker][名称][組入比率+mini gold bar][組入順位][1Y リターン]。行クリックで
 *     その ETF の分析へ navigate (onNavigateTicker、競合チップと同 handler、原則4)
 *   - 組入比率 1 位の行を gold 6% tint で spotlight (focal point)
 *   - 上位 3 本常時 + 残りは折りたたみ (grid-rows transition、ForwardOutlook sec toggle と同 idiom)
 *   - default ON (?etf_exposure=0 が kill switch、user 承認 2026-06-12)
 *
 * §38/§5: 組入比率・順位・過去リターンは確定した事実のみ。リターンの緑/赤は過去実績の符号化 (OK)。
 * 将来予測・推奨語なし。出典 + 「過去実績であり将来の成果を示すものではない」 免責を明記。
 * Trust Cliff: etfs が空 (非該当/失敗) なら panel ごと非表示 (空枠を出さない)。
 * 設計境界: 発光系 class 不使用 (素 div + token のみ)。module-level component。
 * loading/empty/main 全 render path に data-testid。
 */
import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { fetchEtfExposure } from '../../../../api.js';
import CompanyLogo from '../../../../components/CompanyLogo.jsx';

const TESTID = 'etf-exposure-panel';

// default ON (2026-06-12 user 承認)。?etf_exposure=0 (URL 一時) / localStorage '0' (永続) が kill switch。
export function isEtfExposureEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('etf_exposure');
    if (urlParam === '0') return false;
    if (urlParam === '1') return true;
    return window.localStorage?.getItem('etf_exposure') !== '0';
  } catch {
    return true;
  }
}

const ALWAYS_VISIBLE = 3; // 常時表示は上位 3 本 (user 指定 3-5 の下限 = 最小ノイズ)、残りは折りたたみ

function fmtWeight(v) {
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}
// 1Y リターン: 方向 ↑↓ + 絶対値 (記号 SSOT)。過去実績のため gain/loss 色 OK (§38 射程外)。
function fmtPerf(v) {
  if (!Number.isFinite(v)) return null;
  const sym = v > 0 ? '↑' : v < 0 ? '↓' : '';
  return `${sym}${Math.abs(v).toFixed(1)}%`;
}
function perfColor(v) {
  if (!Number.isFinite(v) || v === 0) return 'var(--text-secondary)';
  return v > 0 ? 'var(--color-gain)' : 'var(--color-loss)';
}

// 1 行 (行全体クリックで ETF の分析へ。spotlight = 組入比率 1 位の gold 6% tint)
function EtfRow({ etf, maxWeight, spotlight, onNavigateTicker }) {
  const [hover, setHover] = useState(false);
  const perfStr = fmtPerf(etf.perf_1y_pct);
  const barPct = Number.isFinite(etf.weight_pct) && maxWeight > 0
    ? Math.max(4, Math.round((etf.weight_pct / maxWeight) * 100))
    : 0;
  const clickable = typeof onNavigateTicker === 'function';
  return (
    <div
      data-testid={`${TESTID}-row`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onNavigateTicker(etf.symbol) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigateTicker(etf.symbol); } } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={clickable ? `${etf.symbol} の分析を表示` : undefined}
      title={clickable ? `${etf.symbol} の分析を表示` : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: '72px minmax(0,1fr) 76px 84px 64px',
        alignItems: 'center',
        columnGap: 'var(--space-3, 12px)',
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm, 8px)',
        cursor: clickable ? 'pointer' : 'default',
        background: hover
          ? 'var(--bg-hover, var(--bg-card))'
          : spotlight
            ? 'color-mix(in srgb, var(--color-gold) 6%, transparent)'
            : 'transparent',
        transition: 'background var(--motion-fast, 160ms) ease',
      }}
    >
      {/* ETF ticker (ロゴ + bold、競合チップと同じ「クリックで分析へ」 affordance) */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <CompanyLogo ticker={etf.symbol} size={16} variant="badge" />
        <span style={{ fontSize: 13, fontWeight: 700, color: hover ? 'var(--color-accent)' : 'var(--text-primary)', letterSpacing: '0.02em', transition: 'color var(--motion-fast, 160ms) ease' }}>
          {etf.symbol}
        </span>
      </span>
      {/* 名称 (muted、読まなくていい補足) */}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{etf.name}</span>
      {/* 組入比率 + mini gold bar (max 正規化で差が読まずに伝わる) */}
      <span style={{ justifySelf: 'end', textAlign: 'right', width: '100%' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtWeight(etf.weight_pct)}</span>
        <span aria-hidden style={{ display: 'block', height: 3, marginTop: 3, borderRadius: 2, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${barPct}%`, marginLeft: 'auto', borderRadius: 2, background: 'color-mix(in srgb, var(--color-gold) 55%, transparent)' }} />
        </span>
      </span>
      {/* 組入順位 (構成銘柄中 何位か — 「この銘柄が ETF の顔か」 を即伝える focal) */}
      <span style={{ justifySelf: 'end', fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {Number.isFinite(etf.rank) ? (
          <>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>第{etf.rank}位</span>
            {Number.isFinite(etf.holdings_count) && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>/{etf.holdings_count}</span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </span>
      {/* 1Y リターン (過去実績 = 緑/赤 OK) */}
      <span style={{ justifySelf: 'end', fontSize: 12, fontWeight: 600, color: perfColor(etf.perf_1y_pct), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {perfStr || <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>—</span>}
      </span>
    </div>
  );
}

export default function EtfExposurePanel({ ticker, onNavigateTicker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setData(null);
    setLoading(true);
    setShowAll(false);
    if (!ticker) return undefined;
    let cancelled = false;
    fetchEtfExposure(ticker)
      .then((d) => {
        if (!cancelled) { setData(d || null); setLoading(false); }
      })
      .catch(() => { if (!cancelled) { setData(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ticker]);

  const etfs = Array.isArray(data?.etfs) ? data.etfs : [];

  if (loading) {
    return <div data-testid={TESTID} data-state="loading" aria-busy="true" style={{ minHeight: 0 }} />;
  }
  // 非該当 (主要 ETF に未組入 / 取得失敗) は panel ごと非表示 (Trust Cliff、空枠を出さない)。
  if (etfs.length === 0) {
    return <div data-testid={TESTID} data-state="empty" style={{ display: 'none' }} />;
  }

  const maxWeight = etfs[0]?.weight_pct || 0; // backend が weight 降順
  const head = etfs.slice(0, ALWAYS_VISIBLE);
  const rest = etfs.slice(ALWAYS_VISIBLE);

  const colHead = (txt, span = {}) => (
    <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', justifySelf: 'end', ...span }}>{txt}</span>
  );

  return (
    // 競合チップと同じ「補足情報の島」 idiom (border + bg-subtle、発光系不使用)
    <div
      data-testid={TESTID}
      data-state="main"
      style={{
        marginTop: 'var(--space-4, 16px)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 12px)',
        padding: 'var(--space-3, 12px)',
        background: 'var(--bg-subtle)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-2, 8px)',
        }}
      >
        主要 ETF への組入
      </div>

      {/* 列見出し (組入比率 / 順位 / 1Y のみ — ticker/名称は自明) */}
      <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0,1fr) 76px 84px 64px', columnGap: 'var(--space-3, 12px)', padding: '0 8px', marginBottom: 2 }}>
        <span /><span />
        {colHead('組入比率')}
        {colHead('組入順位')}
        {colHead('1Y')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {head.map((e, i) => (
          <EtfRow key={e.symbol} etf={e} maxWeight={maxWeight} spotlight={i === 0} onNavigateTicker={onNavigateTicker} />
        ))}
      </div>

      {/* 残り (折りたたみ、grid-rows transition = ForwardOutlook sec toggle idiom) */}
      {rest.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateRows: showAll ? '1fr' : '0fr', transition: 'grid-template-rows 0.28s var(--ws-ease-standard, cubic-bezier(0.22, 1, 0.36, 1))' }}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
                {rest.map((e) => (
                  <EtfRow key={e.symbol} etf={e} maxWeight={maxWeight} spotlight={false} onNavigateTicker={onNavigateTicker} />
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid={`${TESTID}-toggle`}
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 'var(--space-2, 8px)',
              padding: '2px 8px 2px 4px',
              fontSize: 11,
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <ChevronRight size={12} strokeWidth={2} aria-hidden="true" style={{ transition: 'transform 0.28s var(--ws-ease-standard, cubic-bezier(0.22, 1, 0.36, 1))', transform: showAll ? 'rotate(90deg)' : 'rotate(0deg)' }} />
            {showAll ? '折りたたむ' : `他 ${rest.length} 本を表示`}
          </button>
        </>
      )}

      <div style={{ marginTop: 'var(--space-2, 8px)', fontSize: 9, color: 'var(--text-muted)', opacity: 0.75, lineHeight: 1.5 }}>
        出典: {data?.source || 'FMP'} ・ 組入比率 = 各 ETF に占める当該銘柄の比率。1Y は過去 1 年の騰落率 (過去実績であり将来の成果を示すものではありません)
      </div>
    </div>
  );
}
