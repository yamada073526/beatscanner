/**
 * BuyHeadroomCompass — 案A「上昇余地 vs 過熱」状態コンパス (Phase1 S5, ?headroom=1)
 *
 * dogfood 主訴②「機関の買い上がりが分からず、上昇余地か高値づかみか判断できない」に §38-safe に答える:
 *   主軸 = 直近の節目 (pivot) からの距離を 4 ゾーン (ブレイク前 / 買い場圏 ≤+5% / 注意 +5〜10% / 過熱 >+10%)
 *          の水平バー位置で 2 秒スキャン。副軸 = A/D 出来高の質 (上昇引け優勢/劣勢)。
 *   詳しい見方は各 ⓘ (CompassInfoButton 共有) → 静的モーダル (buyHeadroomText.js, @no-llm)。
 *
 * @no-llm: backend 算出値 (technical.patterns.cup_handle.{pivot_distance_pct, ad_volume_ratio}) の整形のみ。
 *   判断語・最上級・売買推奨なし (§38/§5)。色は 過熱/注意=amber、買い場圏/ブレイク前=neutral (緑=「買い」暗示で
 *   §38 risk のため不使用、[[feedback_section38_buy_signal_boundary]]「価格セルは amber 固定」に倣う)。
 * 設計境界: 新規 glow host を作らない / semantic token のみ / module-level component / 全 render path に data-testid。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Compass, TriangleAlert, Activity } from 'lucide-react';
import { fetchTechnical, TECHNICAL_CANONICAL_PATTERNS } from '../../../../../api.js';
import CompassInfoButton from './CompassInfoButton.jsx';
import {
  classifyPivotZone, PIVOT_ZONE_LABEL, PIVOT_ZONE_SUB, PIVOT_ZONE_TONE,
  classifyAdVolume, AD_VOLUME_LABEL,
  BUY_HEADROOM_MODAL, BUY_HEADROOM_MODAL_META,
} from '../../../constants/buyHeadroomText.js';

const TESTID = 'buy-headroom-compass';

// tone → semantic token 色 (StateCompass SIGNAL_COLOR と同語彙)。緑 (good) は §38 のため当てない。
const TONE_COLOR = {
  warn: 'var(--color-warning)',
  neutral: 'var(--text-muted)',
};

// 水平バーの値域: -10% (節目下) 〜 +20% (過熱上方)。marker はこの範囲に clamp。
const BAR_MIN = -10;
const BAR_MAX = 20;
const BAR_SPAN = BAR_MAX - BAR_MIN; // 30

// 値 → バー上の位置 % (左 0% 〜 右 100%)。
function valueToPct(v) {
  const p = ((v - BAR_MIN) / BAR_SPAN) * 100;
  return Math.max(2, Math.min(98, p));
}

// 4 ゾーンの帯 (左→右)。width は値域比例 (買い場圏/注意が narrow = 「節目近辺の限られた範囲」を視覚化)。
//   ブレイク前 -10..0 (33.3%) / 買い場圏 0..5 (16.7%) / 注意 5..10 (16.7%) / 過熱 10..20 (33.3%)。
const ZONE_BANDS = [
  { key: 'pre_breakout', from: -10, to: 0, tone: 'neutral', fill: 8 },
  { key: 'buy_zone', from: 0, to: 5, tone: 'neutral', fill: 16 },
  { key: 'caution', from: 5, to: 10, tone: 'warn', fill: 15 },
  { key: 'overheated', from: 10, to: 20, tone: 'warn', fill: 28 },
];

// 数値境界 (節目=0% / +5% / +10%) は ⓘ モーダルで解説。バー下はゾーン名ラベルで「今どのゾーンか」を直接示す。

/**
 * @param {object} props
 * @param {string} props.selectedTicker
 * データは technical (pivot_distance_pct / ad_volume_ratio) 由来で result に依存しない。
 * mount gate は呼び出し側で `!detail?.error` を使う ([[feedback_judgmentdetail_result_gate]]:
 * 正常時も result=null になりうるため result では gate しない)。
 */
export default function BuyHeadroomCompass({ selectedTicker }) {
  const [technical, setTechnical] = useState(null);
  const [techLoading, setTechLoading] = useState(false);

  useEffect(() => {
    if (!selectedTicker) return undefined;
    let cancelled = false;
    setTechLoading(true);
    // technical endpoint は dedupGet coalesce 済 (StateCompass / prefetch と同一 URL) のため追加 fetch なし。
    fetchTechnical(selectedTicker, TECHNICAL_CANONICAL_PATTERNS)
      .then((t) => { if (!cancelled) setTechnical(t || null); })
      .catch(() => { if (!cancelled) setTechnical(null); })
      .finally(() => { if (!cancelled) setTechLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTicker]);

  const { pivotPct, zone, adRatio, adZone } = useMemo(() => {
    const cup = technical?.patterns?.cup_handle || null;
    const _pivotPct = Number.isFinite(cup?.pivot_distance_pct) ? cup.pivot_distance_pct : null;
    const _adRatio = Number.isFinite(cup?.ad_volume_ratio) ? cup.ad_volume_ratio : null;
    return {
      pivotPct: _pivotPct,
      zone: classifyPivotZone(_pivotPct),
      adRatio: _adRatio,
      adZone: classifyAdVolume(_adRatio),
    };
  }, [technical]);

  if (!selectedTicker) {
    return <div data-testid={TESTID} data-state="empty" aria-hidden="true" />;
  }

  const zoneColor = TONE_COLOR[PIVOT_ZONE_TONE[zone]] || TONE_COLOR.neutral;
  const zoneLabel = PIVOT_ZONE_LABEL[zone];
  const zoneSub = PIVOT_ZONE_SUB[zone];
  const hasPivot = pivotPct != null;
  const markerPct = hasPivot ? valueToPct(pivotPct) : null;
  const distText = hasPivot ? `${pivotPct >= 0 ? '+' : ''}${pivotPct.toFixed(1)}%` : null;

  const adLabel = AD_VOLUME_LABEL[adZone];
  const adColor = TONE_COLOR.neutral;

  return (
    <div data-testid={TESTID} data-state="main" style={wrapperStyle}>
      {/* 見出し: 小型 pill chip (StateCompass と同 idiom)。§38: 現在状態語「節目からの位置」(「上昇余地」断定は出さない) */}
      <div style={headingRowStyle}>
        <span style={headingChipStyle}>
          <Compass size={12} strokeWidth={2.2} color="var(--color-accent)" aria-hidden="true" />
          <span style={headingChipTextStyle}>節目からの位置</span>
          <CompassInfoButton
            modalKey="pivot_zone"
            ariaLabel="節目からの位置の見方"
            modalSource={BUY_HEADROOM_MODAL}
            metaSource={BUY_HEADROOM_MODAL_META}
          />
        </span>
      </div>

      {/* 主軸: 現在ゾーンの結論 (大ラベル + 距離値) */}
      <div style={verdictRowStyle}>
        <span style={signalDotStyle(zoneColor)}>
          {PIVOT_ZONE_TONE[zone] === 'warn'
            ? <TriangleAlert size={16} strokeWidth={2} color={zoneColor} aria-hidden="true" />
            : <Compass size={16} strokeWidth={2} color={zoneColor} aria-hidden="true" />}
        </span>
        <div style={verdictTextColStyle}>
          <div style={verdictValueRowStyle}>
            <span style={{ ...verdictValueStyle, color: zoneColor }}>
              {techLoading && !hasPivot ? '取得中…' : zoneLabel}
            </span>
            {distText && <span style={distChipStyle}>{distText}</span>}
          </div>
          <span style={verdictSubStyle}>{techLoading && !hasPivot ? '節目を確認中' : zoneSub}</span>
        </div>
      </div>

      {/* 水平ゾーンバー (図解): active zone を強調 (強い塗り + 上辺 accent + ゾーン名 bold) + マーカー針で
          「今どのゾーンか」を 2 秒判別。三角は track の overflow:hidden を避け barOuter 直下に置く。 */}
      <div style={barOuterStyle}>
        {markerPct != null && (
          <span
            data-testid={`${TESTID}-marker`}
            style={{ ...markerTriangleWrapStyle, left: `${markerPct}%` }}
            aria-hidden="true"
          >
            <span style={{ ...markerTriangleStyle, borderTopColor: zoneColor }} />
          </span>
        )}
        <div style={barTrackStyle}>
          {ZONE_BANDS.map((b) => {
            const width = ((b.to - b.from) / BAR_SPAN) * 100;
            const c = TONE_COLOR[b.tone];
            const isActive = b.key === zone;
            return (
              <div
                key={b.key}
                data-active={isActive ? 'true' : 'false'}
                style={{
                  width: `${width}%`,
                  background: isActive
                    ? `color-mix(in srgb, ${c} 48%, transparent)`
                    : `color-mix(in srgb, ${c} 6%, transparent)`,
                  borderRight: b.key !== 'overheated' ? '0.5px solid var(--border)' : 'none',
                  borderTop: `2px solid ${isActive ? c : 'transparent'}`,
                  transition: 'background var(--motion-fast, 0.15s) ease',
                }}
                aria-hidden="true"
              />
            );
          })}
          {/* マーカー針 (現在位置の縦線)。pivot 不在時は非表示 */}
          {markerPct != null && (
            <span style={{ ...markerLineStyle, left: `${markerPct}%`, background: zoneColor }} aria-hidden="true" />
          )}
        </div>
        {/* ゾーン名ラベル (active = bold + tone 色 / 他 = muted)。帯と同 width で整列し「今どのゾーンか」を直接明示 */}
        <div style={zoneLabelRowStyle} aria-hidden="true">
          {ZONE_BANDS.map((b) => {
            const width = ((b.to - b.from) / BAR_SPAN) * 100;
            const c = TONE_COLOR[b.tone];
            const isActive = b.key === zone;
            return (
              <span
                key={b.key}
                style={{
                  width: `${width}%`, textAlign: 'center', fontSize: 10,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? c : 'var(--text-muted)',
                  opacity: isActive ? 1 : 0.6,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 1px',
                }}
              >
                {PIVOT_ZONE_LABEL[b.key]}
              </span>
            );
          })}
        </div>
      </div>

      {/* 副軸: A/D 出来高の質 (上昇引け優勢/劣勢) */}
      <div style={subAxisRowStyle}>
        <span style={subAxisLabelWrapStyle}>
          <Activity size={13} strokeWidth={2} color="var(--text-muted)" aria-hidden="true" />
          <span style={subAxisLabelStyle}>出来高の質</span>
          <CompassInfoButton
            modalKey="ad_volume"
            ariaLabel="出来高の質の見方"
            modalSource={BUY_HEADROOM_MODAL}
            metaSource={BUY_HEADROOM_MODAL_META}
          />
        </span>
        <span style={{ ...subAxisValueStyle, color: adColor }}>
          {adLabel}
          {adRatio != null && <span style={subAxisRatioStyle}>{adRatio.toFixed(2)}</span>}
        </span>
      </div>

      {/* §38/景表法 免責近接 (StateCompass と同方針、最短・最も控えめ) */}
      <p style={shortDisclaimerStyle}>※ 売買を推奨するものではありません</p>
    </div>
  );
}

// --- styles (semantic CSS token のみ、raw hex / box-shadow 禁止) ---
const wrapperStyle = {
  display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)',
  marginBottom: 'var(--space-4, 16px)',
  padding: 'var(--space-4, 16px)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-md, 12px)',
  background: 'var(--bg-subtle)',
};
const headingRowStyle = { display: 'flex', alignItems: 'center' };
const headingChipStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1, 4px)',
  padding: '2px 8px 2px 7px', borderRadius: 999,
  background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
  border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
};
const headingChipTextStyle = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' };
const verdictRowStyle = { display: 'flex', alignItems: 'center', gap: 'var(--space-3, 12px)' };
const signalDotStyle = (color) => ({
  flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: `color-mix(in srgb, ${color} 12%, transparent)`,
});
const verdictTextColStyle = { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 };
const verdictValueRowStyle = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2, 8px)' };
const verdictValueStyle = { fontSize: 16, fontWeight: 700, lineHeight: 1.25 };
const distChipStyle = {
  fontSize: 12, fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--radius-sm, 6px)',
  border: '1px solid var(--border)', color: 'var(--text-secondary)', whiteSpace: 'nowrap',
};
const verdictSubStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', lineHeight: 1.4 };
// バー: relative 親 (marker 三角の絶対配置基準)。paddingTop = 三角マーカーの逃げ。
const barOuterStyle = { position: 'relative', paddingTop: 10 };
const barTrackStyle = {
  position: 'relative', display: 'flex', width: '100%', height: 14,
  borderRadius: 'var(--radius-sm, 6px)', overflow: 'hidden',
  border: '1px solid var(--border)',
};
// マーカー針: track 高さいっぱいの縦線 (overflow hidden 内なのでクリップされない)
const markerLineStyle = { position: 'absolute', top: 0, bottom: 0, width: 2, transform: 'translateX(-50%)', borderRadius: 1, zIndex: 1 };
// マーカー三角: track の上 (barOuter 直下に置き track の overflow hidden を回避)。下向き。
const markerTriangleWrapStyle = { position: 'absolute', top: 0, transform: 'translateX(-50%)', lineHeight: 0, zIndex: 2 };
const markerTriangleStyle = {
  display: 'block', width: 0, height: 0,
  borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
  borderTop: '8px solid var(--text-muted)',
};
// ゾーン名ラベル行 (帯と同 width で整列)
const zoneLabelRowStyle = { display: 'flex', width: '100%', marginTop: 5 };
const subAxisRowStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2, 8px)',
  paddingTop: 'var(--space-2, 8px)', borderTop: '1px solid var(--border)',
};
const subAxisLabelWrapStyle = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1, 4px)' };
const subAxisLabelStyle = { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' };
const subAxisValueStyle = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2, 8px)', fontSize: 13, fontWeight: 700 };
const subAxisRatioStyle = {
  fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm, 6px)',
  border: '1px solid var(--border)', color: 'var(--text-secondary)',
};
const shortDisclaimerStyle = { margin: 0, fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', lineHeight: 1.4, opacity: 0.85 };
