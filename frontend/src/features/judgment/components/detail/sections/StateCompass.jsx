/**
 * StateCompass — Pane3 冒頭の「状態コンパス」 (D2 累進開示・第2手、?pane3_compass=1)
 *
 * 初心者の「で、買いですか?」に §38-safe に答える: 決算 / 会社 / 価格 の3つの事実を
 * 「信号機デザイン」で2秒スキャンできるように提示 (色と形で polarity → 文字は最小)。
 * 詳しい見方は各セルの ⓘ (CompassInfoButton 共有) → モーダル。
 *
 * @no-llm: backend 計算済値の整形のみ。判断語・最上級・売買推奨なし (§38/§5)。
 * 価格セルの色は amber 固定 (緑=「買い」暗示で §38 risk、金融 opus verdict)。
 * 設計境界: 新規 glow host を作らない / semantic token のみ / module-level component /
 *   全 render path に data-testid。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Layers, Crosshair, Info } from 'lucide-react';
import { fetchTechnical, TECHNICAL_CANONICAL_PATTERNS } from '../../../../../api.js';
import { classifySurprise, SURPRISE_VERDICT_JP, fmtSurprisePct } from '../../../constants/earningsFlashTemplates.js';
import { classifyBuyZone, BUY_ZONE_LABEL_JP } from '../../../../../lib/buyZoneLabels.js';
import CompassInfoButton from './CompassInfoButton.jsx';

const TESTID = 'state-compass';

// 信号 → semantic token 色 (投資業界色ルール: gain=緑/loss=赤/warning=amber/neutral=muted)
const SIGNAL_COLOR = {
  good: 'var(--color-gain)',
  warn: 'var(--color-warning)',
  bad: 'var(--color-loss)',
  neutral: 'var(--text-muted)',
};

// 決算セル: 予想比サプライズ (±3% 分類) を信号化
function earningsCell(guidance) {
  const pct = guidance?.eps?.surprise_pct;
  const cls = classifySurprise(pct); // 'beat'|'inline'|'miss'|null
  if (!cls) {
    return { signal: 'neutral', Icon: Minus, value: '判定待ち', badge: null, sub: '決算発表前' };
  }
  const map = {
    beat: { signal: 'good', Icon: TrendingUp, value: '予想より良かった' },
    inline: { signal: 'warn', Icon: Minus, value: 'ほぼ予想どおり' },
    miss: { signal: 'bad', Icon: TrendingDown, value: '予想を下回った' },
  };
  const m = map[cls];
  return { signal: m.signal, Icon: m.Icon, value: m.value, badge: SURPRISE_VERDICT_JP[cls], sub: fmtSurprisePct(pct) };
}

// 会社セル: 5条件 N/5 (連続量、ドットゲージ)
function companyCell(result) {
  const passed = result?.passedCount;
  const total = Number.isFinite(result?.totalCount) ? result.totalCount : 5;
  if (!Number.isFinite(passed)) {
    return { signal: 'neutral', Icon: Layers, score: null, total, value: '—', sub: 'データなし' };
  }
  const signal = passed >= 4 ? 'good' : passed >= 2 ? 'warn' : 'bad';
  return { signal, Icon: Layers, score: passed, total, value: `${passed} / ${total}`, sub: '独自5条件' };
}

// N/5 ドットゲージ
function DotGauge({ score, total, color }) {
  return (
    <span style={gaugeRowStyle} aria-label={`${total}条件中${score}つ達成`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ ...gaugeDotStyle, background: i < score ? color : 'var(--border)' }} />
      ))}
    </span>
  );
}

export default function StateCompass({ selectedTicker, result, guidance }) {
  const [technical, setTechnical] = useState(null);
  const [techLoading, setTechLoading] = useState(false);

  useEffect(() => {
    if (!selectedTicker) return undefined;
    let cancelled = false;
    setTechLoading(true);
    fetchTechnical(selectedTicker, TECHNICAL_CANONICAL_PATTERNS)
      .then((t) => { if (!cancelled) setTechnical(t || null); })
      .catch(() => { if (!cancelled) setTechnical(null); })
      .finally(() => { if (!cancelled) setTechLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTicker]);

  const priceCell = useMemo(() => {
    const state = technical?.patterns?.cup_handle?.state || null;
    const zone = classifyBuyZone(state);
    if (zone === 'unknown') {
      return { signal: 'neutral', Icon: Crosshair, value: techLoading ? '取得中…' : '判定なし', sub: '参考水準' };
    }
    // user 確定: 価格は amber 固定 (中立・注目。緑=「買い」暗示で §38 risk)
    return { signal: 'warn', Icon: Crosshair, value: BUY_ZONE_LABEL_JP[zone] || '—', sub: '参考水準' };
  }, [technical, techLoading]);

  if (!result) {
    return <div data-testid={TESTID} data-state="empty" aria-hidden="true" />;
  }

  const cells = [
    { key: 'earnings', label: '決算の出来', ...earningsCell(guidance) },
    { key: 'company', label: '会社の地力', ...companyCell(result) },
    { key: 'price', label: '今の価格', ...priceCell },
  ];

  return (
    <div data-testid={TESTID} data-state="main" style={wrapperStyle}>
      <div style={headingStyle}>今の状態 — 3つの事実</div>
      <div style={cellsRowStyle}>
        {cells.map((c) => {
          const color = SIGNAL_COLOR[c.signal];
          const Icon = c.Icon;
          return (
            <div key={c.key} data-testid={`${TESTID}-${c.key}`} style={cellStyle}>
              <span style={{ ...signalDotStyle, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                {Icon && <Icon size={18} strokeWidth={2} color={color} aria-hidden="true" />}
              </span>
              <div style={cellTextColStyle}>
                <div style={cellLabelRowStyle}>
                  <span style={cellLabelStyle}>{c.label}</span>
                  <CompassInfoButton modalKey={c.key} ariaLabel={`${c.label}の見方`} />
                </div>
                <div style={cellValueRowStyle}>
                  <span style={{ ...cellValueStyle, color }}>{c.value}</span>
                  {c.badge && <span style={{ ...badgeStyle, color, borderColor: `color-mix(in srgb, ${color} 35%, var(--border))` }}>{c.badge}</span>}
                  {Number.isFinite(c.score) && <DotGauge score={c.score} total={c.total} color={color} />}
                </div>
                {c.sub && <span style={cellSubStyle}>{c.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {/* §38 短免責は近接1行で残す (景表法の打ち消し表示要件)。詳細は各 ⓘ モーダル。 */}
      <p style={shortDisclaimerStyle}>※ 当社は特定銘柄の売買を推奨しません。各 <Info size={11} style={{ display: 'inline', verticalAlign: '-1px' }} aria-hidden="true" /> に詳しい見方があります。</p>
    </div>
  );
}

// --- styles (semantic CSS token のみ、raw hex / box-shadow 禁止) ---
const wrapperStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)', marginBottom: 'var(--space-4, 16px)' };
const headingStyle = { fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-primary)' };
const cellsRowStyle = { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4, 16px)' };
const cellStyle = { flex: '1 1 200px', minWidth: 0, display: 'flex', gap: 'var(--space-3, 12px)', alignItems: 'flex-start' };
const signalDotStyle = { flexShrink: 0, width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const cellTextColStyle = { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-1, 4px)' };
const cellLabelRowStyle = { display: 'flex', alignItems: 'center', gap: 'var(--space-1, 4px)' };
const cellLabelStyle = { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' };
const cellValueRowStyle = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2, 8px)' };
const cellValueStyle = { fontSize: 15, fontWeight: 700, lineHeight: 1.25 };
const badgeStyle = { fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border)', whiteSpace: 'nowrap' };
const gaugeRowStyle = { display: 'inline-flex', alignItems: 'center', gap: 5 };
const gaugeDotStyle = { width: 9, height: 9, borderRadius: '50%', display: 'inline-block' };
const cellSubStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', lineHeight: 1.4 };
const shortDisclaimerStyle = { margin: 0, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', lineHeight: 1.5 };
