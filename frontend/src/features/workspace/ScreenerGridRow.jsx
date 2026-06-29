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

import { useState, useRef, useEffect } from 'react';
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

// delta% (符号付き・前年比/ガイダンス比)。unit は preset 列で 'pt'(対SPY超過) 等に切替。
function fmtDelta(v, unit = '%') {
  if (v == null || Number.isNaN(v)) return null;
  const r = Math.round(v);
  return `${r > 0 ? '+' : ''}${r}${unit}`;
}
// level% (符号なし・粗利率/FCF率)。unit は preset 列で切替可能。
function fmtLevel(v, unit = '%') {
  if (v == null || Number.isNaN(v)) return null;
  return `${Math.round(v)}${unit}`;
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
// source==='8k' (Layer A) のみ値前に dot(●・--text-secondary・gold厳禁)+tooltip。
// それ以外 (Layer B) は無印。§38: 色で区別せず dot 字形で区別・「買いシグナル」表記禁止。
function FutureCell({ value, startZone = false, source = null }) {
  const txt = fmtDelta(value);
  const empty = txt == null;
  const isLayerA = source === '8k';
  // 空セル「—」: ADR 非算出/ガイダンス未取得を a11y で明記 (Layer B「無印」との混同防止・§6)。
  const title = empty
    ? '来期見通しデータなし(当社の予測ではありません)'
    : isLayerA
      ? '会社が来期ガイダンスを開示。発表直前のアナリスト予想との差を算出(当社の予測・推奨ではありません)'
      : undefined;
  const ariaLabel = empty
    ? '来期見通しデータなし'
    : isLayerA
      ? `${txt}(会社ガイダンスとアナリスト予想の比)`
      : `${txt}(来期コンセンサスYoY)`;
  return (
    <span
      className={[
        'screener-grid-cell',
        'screener-grid-cell--fut',
        startZone ? 'is-fstart' : '',
        empty ? 'is-empty' : '',
      ].filter(Boolean).join(' ')}
      title={title}
      aria-label={ariaLabel}
    >
      {!empty && isLayerA && <span className="screener-grid-fdot" aria-hidden="true" />}
      <span className="v">{empty ? '—' : txt}</span>
    </span>
  );
}

// ─── per-preset 根拠カラム用 cell (4 preset: new_high_break / sector_leader /
//     quiet_quality / market_leading)。§38: 数値はすべて観測事実の転記=色 polarity なし。
//     beat/miss chip (latest_beat) のみ過去確定実績として surpriseColor (§38 射程外・Pane3 と一貫)。

// 汎用数値セル (中立・色なし)。tier 'pri'=text-primary 強調 (--pri の .v 流用) / 'sec'=muted 副次。
function MetricCell({ text, label, tier = 'pri' }) {
  const empty = text == null;
  if (tier === 'sec') {
    return (
      <span
        className={['screener-grid-cell', 'screener-grid-cell--sec', empty ? 'is-empty' : ''].filter(Boolean).join(' ')}
        aria-label={label}
      >
        {empty ? '—' : text}
      </span>
    );
  }
  return (
    <span
      className={['screener-grid-cell', 'screener-grid-cell--pri', empty ? 'is-empty' : ''].filter(Boolean).join(' ')}
      aria-label={label}
    >
      <span className="v">{empty ? '—' : text}</span>
    </span>
  );
}

// 直近決算ビート単独セル (latest_beat: true=beat / false=miss / null=—)。過去確定=surpriseColor。
function VerdictChipCell({ beat, label }) {
  const key = beat === true ? 'beat' : beat === false ? 'miss' : null;
  const chip = key ? CHIP[key] : null;
  return (
    <span
      className={['screener-grid-cell', chip ? '' : 'is-empty'].filter(Boolean).join(' ')}
      aria-label={label ? `${label}: ${chip ? chip.label : 'データなし'}` : undefined}
    >
      {chip ? (
        <span className={`screener-grid-chip is-${chip.cls}`} role="img" aria-label={chip.label} title={chip.label}>
          <span className="g">{chip.glyph}</span>
        </span>
      ) : (
        <span className="screener-grid-cell--sec" style={{ color: 'var(--text-muted)' }}>—</span>
      )}
    </span>
  );
}

// セクター内リーダー badge (is_sector_rs_leader)。§38: 「上位」=相対力順位の事実描写・中立色。
function LeaderBadgeCell({ isLeader, label }) {
  return (
    <span
      className="screener-grid-cell"
      aria-label={label ? `${label}: ${isLeader === true ? '該当(上位)' : '非該当'}` : undefined}
    >
      {isLeader === true ? (
        <span className="screener-grid-lead-badge" title="所属セクター内で相対力 (RS) が上位3位以内">上位</span>
      ) : (
        <span style={{ color: 'var(--text-muted)' }}>—</span>
      )}
    </span>
  );
}

// preset 列 1 セルを kind に応じて描画。metrics = normalizeMetrics(item)・rsValue は別 prop。
function PresetCell({ col, metrics, rsValue }) {
  if (col.kind === 'rs') {
    const rs = rsValue != null ? Math.round(rsValue) : null;
    return (
      <span
        className={['screener-grid-rs', rs != null && rs >= 85 ? 'is-hi' : ''].filter(Boolean).join(' ')}
        aria-label={`${col.label || 'RS'}: ${rs == null ? 'データなし' : rs}`}
      >
        {rs == null ? '—' : rs}
      </span>
    );
  }
  const v = metrics?.[col.metricKey];
  if (col.kind === 'verdict') return <VerdictChipCell beat={v} label={col.label} />;
  if (col.kind === 'leader') return <LeaderBadgeCell isLeader={v} label={col.label} />;
  const text = col.kind === 'delta' ? fmtDelta(v, col.unit) : fmtLevel(v, col.unit);
  return (
    <MetricCell
      text={text}
      tier={col.tier}
      label={col.label ? `${col.label}: ${text ?? 'データなし'}` : undefined}
    />
  );
}

/**
 * ScreenerGridRow
 * @param {Object} earnings - 正規化済み決算速報フィールド
 *   { revYoY, revBeat, epsYoY, epsBeat, gm, fcf, nqRev, nqEps, tri, guidanceSource }
 * @param {Array}  columns - per-preset 列 spec (指定時は column-driven 描画・earnings 列を無視)
 * @param {Object} metrics - per-preset 列が参照する正規化メトリクス (columns 指定時のみ)
 */
export default function ScreenerGridRow({
  ticker,
  name,
  lastReportDate = null,
  rsValue = null,
  earnings = {},
  columns = null,
  metrics = null,
  win = false,
  mode = 'full',
  animIndex = 0,
  isSelected = false,
  isCheckboxChecked = false,
  showCheckbox = false,
  onSelect,
  onCheckbox,
}) {
  // stagger: ロード時一括でなく「行がビューに入った時」に滑り込ませる (IntersectionObserver)。
  const rowRef = useRef(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setRevealed(true); return undefined; }
    const reduce = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setRevealed(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setRevealed(true); io.disconnect(); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -32px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!ticker) {
    return (
      <div className="screener-grid-row screener-grid-row--error" data-testid="screener-grid-row-error" role="alert">
        <span className="screener-grid-error-text">銘柄データを取得できませんでした</span>
      </div>
    );
  }

  const { revYoY, revBeat, epsYoY, epsBeat, gm, fcf, nqRev, nqEps, tri, guidanceSource = null } = earnings;
  const pip = PIP[tri] || PIP_NONE;            // §14-E: tri 未知/null も null guard で none へ
  const triLabel = TRI_VERDICT_JP[tri] || '判定中';
  const isWin = tri === 'ok';
  const rs = rsValue != null ? Math.round(rsValue) : null;

  const handleClick = () => onSelect?.(ticker);
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); }
  };

  // 識別セル (checkbox hover-reveal + ロゴ + ティッカー + 決算日·社名) — earnings / column-driven で共有。
  const leadCell = (
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
        <span className="screener-grid-tkr">
          {ticker}
          {/* gold 標榜 ★ は column-driven 経路のみ (earnings 経路は左 pip ✓ が別格を担う)。SPEC A1。 */}
          {win && columns ? (
            <span className="screener-grid-winstar" role="img" aria-label="この戦略の条件を特に強く満たす（買い推奨ではありません）" title="この戦略の条件を特に強く満たす（買い推奨ではありません）">★</span>
          ) : null}
        </span>
        <span className="screener-grid-meta">
          {lastReportDate && <span className="screener-grid-qd">決算 {lastReportDate}</span>}
          {lastReportDate && name && <span aria-hidden="true">·</span>}
          {name && <span className="screener-grid-nm">{name}</span>}
        </span>
      </span>
    </span>
  );

  // ── column-driven 描画 (4 preset: 根拠カラム) ──────────────────────────────
  // pip(決算 verdict)列は持たず lead + 根拠列のみ。grid tracks は親 --screener-cols に一致。
  if (columns) {
    return (
      <div
        ref={rowRef}
        role="button"
        tabIndex={0}
        className={['screener-grid-row', revealed ? 'is-in' : '', win ? 'is-win' : '', isSelected ? 'is-selected' : ''].filter(Boolean).join(' ')}
        data-testid={`screener-grid-row-${ticker}`}
        data-mode={mode}
        style={{ '--reveal-delay': `${(animIndex % 8) * 45}ms` }}
        onClick={handleClick}
        onKeyDown={handleKey}
        aria-label={`${ticker} ${name || ''} 詳細を表示`}
      >
        {leadCell}
        {columns.map((col) => (
          <PresetCell key={col.id} col={col} metrics={metrics} rsValue={rsValue} />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      className={[
        'screener-grid-row',
        revealed ? 'is-in' : '',
        isWin ? 'is-win' : '',
        isSelected ? 'is-selected' : '',
      ].filter(Boolean).join(' ')}
      data-testid={`screener-grid-row-${ticker}`}
      data-mode={mode}
      /* reveal stagger のみに delay (--reveal-delay は opacity/transform 限定・hover 背景には波及しない)。
         ビュー内バッチごと 0..7 段 modulo (グローバル index 比例だと下方行が長時間待つため)。 */
      style={{ '--reveal-delay': `${(animIndex % 8) * 45}ms` }}
      onClick={handleClick}
      onKeyDown={handleKey}
      aria-label={`${ticker} ${name || ''} 決算の総合: ${triLabel}。詳細を表示`}
    >
      {/* verdict pip (主役) */}
      <span className={`screener-grid-pip is-${pip.cls}`} role="img" aria-label={`決算の総合: ${triLabel}`}>
        {pip.glyph}
      </span>

      {/* 識別 (checkbox hover-reveal + ロゴ + ティッカー + 決算日·社名) */}
      {leadCell}

      {mode === 'full' ? (
        <>
          <PrimaryCell yoy={revYoY} beat={revBeat} />
          <PrimaryCell yoy={epsYoY} beat={epsBeat} />
          <SecondaryCell value={gm} startZone />
          <SecondaryCell value={fcf} />
          <FutureCell value={nqRev} startZone source={guidanceSource} />
          <FutureCell value={nqEps} source={guidanceSource} />
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
