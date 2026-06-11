/**
 * EtfExposurePanel — 個別銘柄が主要 US ETF にどれだけ組み入れられているかを表示 (v202 dogfood feature)。
 *
 * @no-llm: backend /api/etf-exposure (FMP etf/asset-exposure を主要 ETF allowlist で curation 済) を
 *   読むだけの静的整形。LLM 不使用、frontend 再計算なし (weight は backend 値そのまま)。
 *
 * 表示意味: weight_pct = 「その ETF に占める当該銘柄の比率 %」(= ETF の中でどれだけの比重か)。
 * §38/§5: 過去・現在の事実 (組入比率) のみ。将来予測・最上級・判断語なし。出典 (FMP) 明記。
 * Trust Cliff: etfs が空 (非該当 / 取得失敗) なら panel ごと非表示 (空枠・coming soon を出さない)。
 *
 * 設計境界: 新規 glow host を作らない (wrapper は class なし div + semantic token)。
 * module-level component。loading/empty/main 全 render path に data-testid。raw hex / 発光系クラスなし。
 *
 * ?etf_exposure=1 opt-in (default OFF)。本番採用 (default ON) と配置は user 判断待ち (prototype)。
 */
import React, { useEffect, useState } from 'react';
import { fetchEtfExposure } from '../../../../api.js';

const TESTID = 'etf-exposure-panel';

// dogfood opt-in: ?etf_exposure=1 (URL 一時) or localStorage (永続)、default OFF (feedback_feature_flag_dual_mode)。
export function isEtfExposureEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('etf_exposure');
    if (urlParam === '1') return true;
    if (urlParam === '0') return false;
    return window.localStorage?.getItem('etf_exposure') === '1';
  } catch {
    return false;
  }
}

function fmtWeight(v) {
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}

export default function EtfExposurePanel({ ticker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setData(null);
    setLoading(true);
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

  // loading: 静かな skeleton (CLS envelope)。ただし非該当銘柄は最終的に非表示になるため最小高に留める。
  if (loading) {
    return (
      <div data-testid={TESTID} data-state="loading" aria-busy="true" style={{ ...wrapStyle, minHeight: 0 }} />
    );
  }
  // empty: 非該当 (主要 ETF に未組入 / 取得失敗) は panel ごと非表示 (Trust Cliff、空枠を出さない)。
  if (etfs.length === 0) {
    return <div data-testid={TESTID} data-state="empty" style={{ display: 'none' }} />;
  }

  return (
    <div data-testid={TESTID} data-state="main" style={wrapStyle}>
      <div style={{ marginBottom: 'var(--space-3, 12px)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
          主要 ETF への組入
        </div>
        <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', opacity: 0.75, marginTop: 2 }}>
          各 ETF に占める当該銘柄の比率
        </div>
      </div>

      {/* 軽インデント + gold left accent (TtmValuationPanel と同 idiom、 elevation whitelist の gold)。 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2, 8px)',
          paddingLeft: 'var(--space-3, 12px)',
          borderLeft: '2px solid color-mix(in srgb, var(--color-gold) 30%, transparent)',
        }}
      >
        {etfs.map((e) => (
          <div
            key={e.symbol}
            data-testid={`${TESTID}-row`}
            style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', alignItems: 'baseline', gap: 'var(--space-3, 12px)' }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>{e.symbol}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', justifySelf: 'end', letterSpacing: '-0.01em' }}>{fmtWeight(e.weight_pct)}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'var(--space-3, 12px)', fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>
        出典: {data?.source || 'FMP'}
      </div>
    </div>
  );
}

const wrapStyle = {
  minHeight: 60, // CLS envelope (feedback_cls_envelope_pattern)
  padding: 0,
  marginTop: 'var(--space-4, 16px)',
};
