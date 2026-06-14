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
import { TrendingUp, TrendingDown, Minus, Layers, Crosshair, Compass } from 'lucide-react';
import { fetchTechnical, TECHNICAL_CANONICAL_PATTERNS } from '../../../../../api.js';
import { classifySurprise, fmtSurprisePct } from '../../../constants/earningsFlashTemplates.js';
import { classifyBuyZone } from '../../../../../lib/buyZoneLabels.js';
import { COMPASS_EARNINGS_LABEL, COMPASS_PRICE_LABEL } from '../../../constants/stateCompassText.js';
import CompassInfoButton from './CompassInfoButton.jsx';

const TESTID = 'state-compass';

// 2026-06-14 user feedback: 各カードをクリックで対応セクションへスクロール (原則4: 1クリック減)。
//   決算→ファンダの決算 / 地力→ファンダの5条件 / 価格→テクニカルのチャート。
//   instance 局所 = closest('.ds-judgment-detail') (EarningsFlash の scrollToEarnings と同 idiom)。
const CELL_SCROLL_TARGET = {
  earnings: '[data-testid="fundamentals-earnings-section"]',
  company: '[data-testid="five-conditions-card-wrapper"]',
  price: '#sec-chart',
};
const CELL_SCROLL_LABEL = {
  earnings: 'クリックで決算セクションへ',
  company: 'クリックで 5 条件セクションへ',
  price: 'クリックでチャートへ',
};
function scrollToCellSection(e, key) {
  const sel = CELL_SCROLL_TARGET[key];
  if (!sel) return;
  const root = e.currentTarget.closest('.ds-judgment-detail') || document;
  (root.querySelector(sel) || document.querySelector(sel))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 信号 → semantic token 色 (投資業界色ルール: gain=緑/loss=赤/warning=amber/neutral=muted)
const SIGNAL_COLOR = {
  good: 'var(--color-gain)',
  warn: 'var(--color-warning)',
  bad: 'var(--color-loss)',
  neutral: 'var(--text-muted)',
};

// 決算セル: 予想比サプライズ (±3% 分類) を信号化。
// 2026-06-14: 簡潔化 (user) — value を短語 (COMPASS_EARNINGS_LABEL) に、Beat/Miss バッジは撤去
// (value + 色アイコン + sub「予想比 ↑X%」で polarity 重複のため)。
function earningsCell(guidance) {
  const pct = guidance?.eps?.surprise_pct;
  const cls = classifySurprise(pct); // 'beat'|'inline'|'miss'|null
  if (!cls) {
    return { signal: 'neutral', Icon: Minus, value: '判定待ち', sub: '決算発表前' };
  }
  const map = {
    beat: { signal: 'good', Icon: TrendingUp },
    inline: { signal: 'warn', Icon: Minus },
    miss: { signal: 'bad', Icon: TrendingDown },
  };
  const m = map[cls];
  return { signal: m.signal, Icon: m.Icon, value: COMPASS_EARNINGS_LABEL[cls], sub: fmtSurprisePct(pct) };
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

/**
 * @param {object} props
 * @param {string} props.selectedTicker
 * @param {object} props.result
 * @param {object} props.guidance
 * @param {boolean} [props.embedded=false] - true で VerdictHero と 1 枚の発光カードに統合する mode
 *   (上に hairline 継ぎ目 + Hero 本文と揃う左右 padding、外側 marginBottom なし)。2026-06-14。
 */
export default function StateCompass({ selectedTicker, result, guidance, embedded = false }) {
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
    // user 確定: 価格は amber 固定 (中立・注目。緑=「買い」暗示で §38 risk)。
    // 2026-06-14: 局面名を短語 (COMPASS_PRICE_LABEL) に簡潔化。フルラベルは BuyZoneCard 詳細用に維持。
    return { signal: 'warn', Icon: Crosshair, value: COMPASS_PRICE_LABEL[zone] || '—', sub: '参考水準' };
  }, [technical, techLoading]);

  if (!result) {
    return <div data-testid={TESTID} data-state="empty" aria-hidden="true" />;
  }

  // 2026-06-14 user feedback: ラベルを短縮 (決算の出来→決算 / 会社の地力→地力 / 今の価格→価格)。
  const cells = [
    { key: 'earnings', label: '決算', ...earningsCell(guidance) },
    { key: 'company', label: '地力', ...companyCell(result) },
    { key: 'price', label: '価格', ...priceCell },
  ];

  return (
    <div data-testid={TESTID} data-state="main" style={embedded ? wrapperEmbeddedStyle : wrapperStyle}>
      {/* 2026-06-14 user feedback + ui-designer review: 見出しを小型 pill chip に降格し、コンテンツ(3カード)を
          主役化。名称は「今の状態」→「3つの目線」(3カード構成=決算/地力/価格 を 2 秒で連想、§38-safe)。 */}
      <div style={headingRowStyle}>
        <span style={headingChipStyle}>
          <Compass size={12} strokeWidth={2.2} color="var(--color-accent)" aria-hidden="true" />
          <span style={headingChipTextStyle}>3つの指標</span>
        </span>
      </div>
      <div style={cellsRowStyle}>
        {cells.map((c) => {
          const color = SIGNAL_COLOR[c.signal];
          const Icon = c.Icon;
          return (
            <div
              key={c.key}
              data-testid={`${TESTID}-${c.key}`}
              className="compass-cell"
              role="button"
              tabIndex={0}
              title={CELL_SCROLL_LABEL[c.key]}
              onClick={(e) => scrollToCellSection(e, c.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollToCellSection(e, c.key); } }}
            >
              <span style={{ ...signalDotStyle, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                {Icon && <Icon size={16} strokeWidth={2} color={color} aria-hidden="true" />}
              </span>
              <div style={cellTextColStyle}>
                <div style={cellLabelRowStyle}>
                  <span style={cellLabelStyle}>{c.label}</span>
                  <CompassInfoButton modalKey={c.key} ariaLabel={`${c.label}の見方`} />
                </div>
                <div style={cellValueRowStyle}>
                  {/* 2026-06-14 user feedback: 地力のランプ(DotGauge=記号)を「N / 5」 テキストより左へ。
                      2 秒スキャンでランプが先に目に入り、テキストは補足になる。 */}
                  {Number.isFinite(c.score) && <DotGauge score={c.score} total={c.total} color={color} />}
                  <span style={{ ...cellValueStyle, color }}>{c.value}</span>
                  {c.badge && <span style={{ ...badgeStyle, color, borderColor: `color-mix(in srgb, ${color} 35%, var(--border))` }}>{c.badge}</span>}
                </div>
                {c.sub && <span style={cellSubStyle}>{c.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {/* §38/景表法: 打ち消し表示は「近接性」 が要件のため、 ⓘ モーダル内だけでなくセクション近接に残す
          (memory feedback_section38_buy_signal_boundary「免責近接」)。 user の「気になる」 を受け、 文言を最短化 +
          視覚的に最も控えめ (10px/muted) にして主張を弱める。完全削除はコンプラ risk のため不可。 */}
      <p style={shortDisclaimerStyle}>※ 売買を推奨するものではありません</p>
    </div>
  );
}

// --- styles (semantic CSS token のみ、raw hex / box-shadow 禁止) ---
const wrapperStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)', marginBottom: 'var(--space-4, 16px)' };
// embedded: VerdictHero と 1 枚の発光カードに統合 (上 hairline 継ぎ目 + Hero 本文と揃う左右 padding)。
// 左右は Hero 内部 padding (--space-8=32px) と一致させ、縦のラインを揃える。marginBottom なし (card 内最終要素)。
const wrapperEmbeddedStyle = {
  display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)',
  borderTop: '1px solid var(--border)',
  padding: 'var(--space-5, 20px) var(--space-8, 32px) var(--space-7, 28px)',
};
// 見出し: 小型 pill chip (ui-designer review: コンテンツ主役化のため見出しを目立たせない)。
const headingRowStyle = { display: 'flex', alignItems: 'center' };
const headingChipStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1, 4px)',
  padding: '2px 10px 2px 7px', borderRadius: 999,
  background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
  border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
};
const headingChipTextStyle = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' };
// 密度向上 (user: スペースが狭い) — cell 最小幅 200→160px で 3-up が narrow pane でも収まる。
const cellsRowStyle = { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3, 12px)' };
// card-in-card のスタイルは index.css の .compass-cell に移管 (clickable hover/active/focus を inline では
// 表現できないため)。⚠️ glow host (.panel-card/.bs-panel/.surface-card) では「ない」 plain div なので
// 入れ子 surface-card 違反なし (design_recipes §C-1)、is-arriving 非対象で compound 4-set 不要。
const signalDotStyle = { flexShrink: 0, width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const cellTextColStyle = { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-1, 4px)' };
const cellLabelRowStyle = { display: 'flex', alignItems: 'center', gap: 'var(--space-1, 4px)' };
const cellLabelStyle = { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' };
const cellValueRowStyle = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2, 8px)' };
const cellValueStyle = { fontSize: 15, fontWeight: 700, lineHeight: 1.25 };
const badgeStyle = { fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border)', whiteSpace: 'nowrap' };
const gaugeRowStyle = { display: 'inline-flex', alignItems: 'center', gap: 5 };
const gaugeDotStyle = { width: 9, height: 9, borderRadius: '50%', display: 'inline-block' };
const cellSubStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', lineHeight: 1.4 };
const shortDisclaimerStyle = { margin: 0, fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', lineHeight: 1.4, opacity: 0.85 };
