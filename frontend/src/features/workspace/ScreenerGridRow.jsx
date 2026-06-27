/**
 * ScreenerGridRow.jsx — screener_v2 結果テーブル「決算の通信簿」行 (Sprint 3)
 *
 * SPEC §14 (mockup v12 が視覚正本)。**結果テーブル専用**の新 primitive。
 * 既存 ScreenerRow.jsx (HeroSection / legacy と共有・flex) には触れない (§14-D variant スコープ)。
 *
 * 設計 (SPEC §14-A/B):
 *   - verdict pip を行の主役 (ok=gold✓ / part=中立スレート◐ / bad=赤✕ / none=faint)。
 *   - 2段タイポ階層: 売上/EPS YoY=主(大)+結果チップ / 粗利・FCF=副(小 muted) / 来期=ガラス仕切り中立。
 *   - 来期2列=会社ガイダンス vs コンセンサス比 (§14-C ハイブリッド・§38 絶対中立=色なし)。
 *   - CSS は index.css の .screener-grid-* に集約。grid-template-columns は親 (--screener-cols) を継承。
 *   - a11y: glyph/pip に aria-label (色だけに依存しない・§14-E)。
 *
 * testid: screener-grid-row-{ticker}
 */

import CompanyLogo from '../../components/CompanyLogo.jsx';

// SPEC §11-A M1 / §13-C: tri_verdict ラベル (「利益警告」誤用回避で「予想未達」)。
export const TRI_VERDICT_JP = { ok: '三拍子 ✓', part: '一部未達', bad: '予想未達' };

// verdict pip (左の主役)。none = 判定不能 (rev/eps 両欠損)。
const PIP = {
  ok: { cls: 'ok', glyph: '✓' },
  part: { cls: 'part', glyph: '◐' },
  bad: { cls: 'bad', glyph: '✕' },
};
const PIP_NONE = { cls: 'none', glyph: '–' };

// beat/miss 結果チップ (過去確定実績=surpriseColor・§38射程外、Pane3 と一貫)。
const CHIP = {
  beat: { cls: 'beat', glyph: '↑', label: '予想を上回り (beat)' },
  miss: { cls: 'miss', glyph: '↓', label: '予想を下回り (miss)' },
  inline: { cls: 'inline', glyph: '−', label: 'ほぼ予想どおり (in-line)' },
};

// delta% (符号付き・前年比/ガイダンス比)
function fmtDelta(v) {
  if (v == null || Number.isNaN(v)) return null;
  const r = Math.round(v);
  return `${r > 0 ? '+' : ''}${r}%`;
}
// level% (符号なし・粗利率/FCF率)
function fmtLevel(v) {
  if (v == null || Number.isNaN(v)) return null;
  return `${Math.round(v)}%`;
}

// 主指標セル (数値 + 結果チップ)
function PrimaryCell({ yoy, beat, showChip = true }) {
  const txt = fmtDelta(yoy);
  if (txt == null) {
    return <span className="screener-grid-cell screener-grid-cell--pri is-empty"><span className="v">—</span></span>;
  }
  const chip = showChip && beat && CHIP[beat] ? CHIP[beat] : null;
  return (
    <span className="screener-grid-cell screener-grid-cell--pri">
      <span className="v">{txt}</span>
      {chip && (
        <span className={`screener-grid-chip is-${chip.cls}`} role="img" aria-label={chip.label} title={chip.label}>
          <span className="g">{chip.glyph}</span>
        </span>
      )}
    </span>
  );
}

// 副指標セル (粗利率/FCF率・水準=中立色)。startZone=収益の質ゾーン左 hairline。
function SecondaryCell({ value, startZone = false }) {
  const txt = fmtLevel(value);
  return (
    <span
      className={[
        'screener-grid-cell',
        'screener-grid-cell--sec',
        startZone ? 'is-qualstart' : '',
        txt == null ? 'is-empty' : '',
      ].filter(Boolean).join(' ')}
    >
      {txt == null ? '—' : txt}
    </span>
  );
}

// 将来セル (来期ガイダンス比・§38 絶対中立=色なし)。startZone=ガラス仕切り左 hairline。
function FutureCell({ value, startZone = false }) {
  const txt = fmtDelta(value);
  return (
    <span
      className={[
        'screener-grid-cell',
        'screener-grid-cell--fut',
        startZone ? 'is-fstart' : '',
        txt == null ? 'is-empty' : '',
      ].filter(Boolean).join(' ')}
    >
      {txt == null ? '—' : txt}
    </span>
  );
}

/**
 * ScreenerGridRow
 * @param {Object} earnings - 正規化済み決算速報フィールド
 *   { revYoY, revBeat, epsYoY, epsBeat, gm, fcf, nqRev, nqEps, tri }
 */
export default function ScreenerGridRow({
  ticker,
  name,
  lastReportDate = null,
  rsValue = null,
  earnings = {},
  mode = 'full',
  animIndex = 0,
  isSelected = false,
  isCheckboxChecked = false,
  showCheckbox = false,
  onSelect,
  onCheckbox,
}) {
  if (!ticker) {
    return (
      <div className="screener-grid-row screener-grid-row--error" data-testid="screener-grid-row-error" role="alert">
        <span className="screener-grid-error-text">銘柄データを取得できませんでした</span>
      </div>
    );
  }

  const { revYoY, revBeat, epsYoY, epsBeat, gm, fcf, nqRev, nqEps, tri } = earnings;
  const pip = PIP[tri] || PIP_NONE;            // §14-E: tri 未知/null も null guard で none へ
  const triLabel = TRI_VERDICT_JP[tri] || '判定中';
  const isWin = tri === 'ok';
  const rs = rsValue != null ? Math.round(rsValue) : null;

  const handleClick = () => onSelect?.(ticker);
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        'screener-grid-row',
        isWin ? 'is-win' : '',
        isSelected ? 'is-selected' : '',
      ].filter(Boolean).join(' ')}
      data-testid={`screener-grid-row-${ticker}`}
      data-mode={mode}
      style={{ animationDelay: `${animIndex * 45}ms` }}
      onClick={handleClick}
      onKeyDown={handleKey}
      aria-label={`${ticker} ${name || ''} 決算の総合: ${triLabel}。詳細を表示`}
    >
      {/* verdict pip (主役) */}
      <span className={`screener-grid-pip is-${pip.cls}`} role="img" aria-label={`決算の総合: ${triLabel}`}>
        {pip.glyph}
      </span>

      {/* 識別 (checkbox hover-reveal + ロゴ + ティッカー + 決算日·社名) */}
      <span className="screener-grid-lead">
        {showCheckbox && (
          <span className={['screener-grid-check', isCheckboxChecked ? 'is-on' : ''].filter(Boolean).join(' ')}>
            <input
              type="checkbox"
              checked={isCheckboxChecked}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { e.stopPropagation(); onCheckbox?.(ticker, e.target.checked); }}
              data-testid={`screener-grid-select-${ticker}`}
              aria-label={`${ticker} を選択`}
            />
          </span>
        )}
        <span className="screener-grid-logo"><CompanyLogo ticker={ticker} size={26} monoFallback /></span>
        <span className="screener-grid-idbody">
          <span className="screener-grid-tkr">{ticker}</span>
          <span className="screener-grid-meta">
            {lastReportDate && <span className="screener-grid-qd">決算 {lastReportDate}</span>}
            {lastReportDate && name && <span aria-hidden="true">·</span>}
            {name && <span className="screener-grid-nm">{name}</span>}
          </span>
        </span>
      </span>

      {mode === 'full' ? (
        <>
          <PrimaryCell yoy={revYoY} beat={revBeat} />
          <PrimaryCell yoy={epsYoY} beat={epsBeat} />
          <SecondaryCell value={gm} startZone />
          <SecondaryCell value={fcf} />
          <FutureCell value={nqRev} startZone />
          <FutureCell value={nqEps} />
          <span className={['screener-grid-rs', rs != null && rs >= 85 ? 'is-hi' : ''].filter(Boolean).join(' ')}>
            {rs == null ? '—' : rs}
          </span>
        </>
      ) : (
        <>
          <span className="screener-grid-vbwrap">
            <span className={`screener-grid-vb is-${pip.cls}`} role="img" aria-label={`決算の総合: ${triLabel}`}>
              {triLabel}
            </span>
          </span>
          <PrimaryCell yoy={revYoY} beat={revBeat} showChip={false} />
          <span className={['screener-grid-rs', rs != null && rs >= 85 ? 'is-hi' : ''].filter(Boolean).join(' ')}>
            {rs == null ? '—' : rs}
          </span>
        </>
      )}
    </div>
  );
}
