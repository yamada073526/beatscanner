import {
  VERDICT_TONE,
  VERDICT_PHASE_LABEL,
  VERDICT_PHASE_ICON,
  VERDICT_CAPTION,
} from '../../../constants/buyZoneVerdict.js';

/**
 * BuyZoneVerdictBar — §③「テクニカル・買い場」章 最上部の薄い verdict bar (2 秒 anchor)。
 *
 * 設計 SSOT: ../../../constants/buyZoneVerdict.js (3 体合議 + user gate 2026-06-30)。
 * 正本 mockup: docs/specs/mockups/pane3-full-v7.html (旧 pane3-technical-buyzone-v6.html) の .vbar。
 * 2026-07-02 user gate: 価格の font-size/weight を mockup 準拠 (18px/700) に強調。ただし mockup の
 *   ⏳ アイコン (watch) と confirm 状態の cyan グラデーションは 2026-06-30 決定により意図的に非採用のまま
 *   (§38「ブランドが推している＝買い」の暗黙断定回避)。詳細は下記コメント + buyZoneVerdict.js 参照。
 *
 * データは zero-fetch (props で受領):
 *   - state: cup_handle.state (親 JudgmentDetail の fetchTechnical から、追加 fetch なし)
 *   - price / changePct: detail?.price / detail?.changePct (L0 Hero と同 source・同整形)
 *
 * 色規律 (§38 / user gate): confirm に cyan/緑 を使わず neutral。color は過熱 (amber) の警告のみ。
 * changePct の緑赤は「日次変化＝事実」の彩色で L0 Hero と一致 (verdict ラベルの彩色とは別意味論)。
 *
 * @no-llm 静的辞書のみ。
 */

// tone → 視覚スタイル (CSS-in-JS、index.css は触らない = danger zone)。
// confirm = neutral 強調 (白文字 + strong border)、watch = secondary + faint border、caution = amber。
const TONE_STYLE = {
  watch: {
    borderLeft: 'var(--border)',
    stateColor: 'var(--text-secondary)',
    background: 'var(--bg-subtle)',
  },
  confirm: {
    borderLeft: 'var(--border-strong, var(--border))',
    stateColor: 'var(--text-primary)',
    background: 'var(--bg-subtle)',
  },
  caution: {
    borderLeft: 'var(--color-warning)',
    stateColor: 'var(--color-warning)',
    // 過熱だけ色を使う非対称設計: faint amber tint。raw hex 直書きせず color-mix。
    background: 'color-mix(in srgb, var(--color-warning) 5%, var(--bg-subtle))',
  },
};

// changePct の彩色 (Hero retColor と 1:1 mirror)。
const changeColor = (r) =>
  r > 0 ? 'var(--color-gain)' : r < 0 ? 'var(--color-loss)' : 'var(--text-muted)';

export default function BuyZoneVerdictBar({ state, price, changePct }) {
  const tone = state ? VERDICT_TONE[state] : undefined;
  const priceNum = price != null ? Number(price) : NaN;
  const changeNum = changePct != null ? Number(changePct) : NaN;
  const hasPrice = Number.isFinite(priceNum);
  const hasState = Boolean(tone);

  // state も price も無ければ何も出さない (空 bar を出さない)。
  if (!hasState && !hasPrice) return null;

  const ts = hasState ? TONE_STYLE[tone] : TONE_STYLE.watch;
  const phaseLabel = hasState ? VERDICT_PHASE_LABEL[tone] : '';
  const phaseIcon = hasState ? VERDICT_PHASE_ICON[tone] : '';
  const caption = state ? VERDICT_CAPTION[state] : '';

  return (
    <div
      data-testid="buyzone-verdict-bar"
      data-tone={hasState ? tone : 'none'}
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${ts.borderLeft}`,
        borderRadius: 'var(--radius-md, 12px)',
        background: ts.background,
        padding: '9px 12px',
      }}
    >
      {/* Row1: フェーズ語 + 価格 + 変化率 (2 秒 anchor) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', flexWrap: 'wrap' }}>
        {hasState && (
          <span
            data-testid="buyzone-verdict-phase"
            style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: ts.stateColor }}
          >
            {phaseIcon ? `${phaseIcon} ` : ''}{phaseLabel}
          </span>
        )}
        {hasPrice && (
          // v7 リッチ化 (2026-07-02 user gate): mockup .vbar .px (18px/700) に合わせ強調。
          <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
            ${priceNum.toFixed(2)}
          </span>
        )}
        {hasPrice && Number.isFinite(changeNum) && (
          <span style={{ fontSize: 12, fontWeight: 600, color: changeColor(changeNum) }}>
            {changeNum > 0 ? '+' : ''}{(changeNum * 100).toFixed(2)}%
          </span>
        )}
      </div>
      {/* Row2: state 別 短キャプション (橋渡し・muted) */}
      {caption && (
        <div
          data-testid="buyzone-verdict-caption"
          style={{ marginTop: 3, fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', lineHeight: 1.4 }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
