import React, { useMemo } from 'react';

/**
 * TtmValuationPanel — 直近 4 四半期合算 (TTM) バリュエーション指標を
 * 3×2 chip grid で表示する primitive。
 *
 * design anchor:
 *   - design_system.md §1 (color token: --text-primary / --text-muted / --space-*)
 *   - design_recipes.md §C-9 (欠損は em-dash、 raw hex 禁止)
 *   - feedback_chart_overlay_safety.md (Number.isFinite guard)
 *   - ReturnGrid.jsx (SectionLabel + frameless prop + ds-stat / ds-stat__value grammar 踏襲)
 *   - SPEC Sprint 2: 「割安」「割高」等の judgment 文言 禁止 (景表法 §5 / 金商法 §38)
 *
 * props:
 *   ticker           {string}   銘柄コード (display only)
 *   valuationExtras  {object}   親 component から渡される fetch 済み data
 *                               (自分で fetch しない — race condition + 重複 fetch 防止)
 *   frameless        {boolean}  true = border / background なし (default: true)
 *   sectionLabel     {string}   セクションヘッダ文字列 (default: 'TTM バリュエーション')
 *
 * mount: Sprint 3 (JudgmentDetail) で ReturnGrid 直後に挿入予定。
 *        本 sprint は primitive 定義のみ。
 *
 * SPEC 遵守:
 *   - LLM 経路ゼロ (静的 dictionary label + sub-text のみ)
 *   - judgment 文言 (「割安」「割高」「適正」「強気」) UI に一切出さない
 *   - 「機関投資家向け」文字列 UI に出さない
 *   - valuationExtras が null / data 欠損 → 全 section 非表示 (Trust Cliff 防止)
 */

// ─────────────────────────────────────────────
// フォーマットヘルパー (Number.isFinite guard 付き)
// feedback_chart_overlay_safety.md 準拠
// ─────────────────────────────────────────────

/**
 * 大型 USD 絶対値を $X.XB / $X.XXT 形式に変換。
 *   < 1e6    → $X (そのまま整数)
 *   1e6-1e9  → $X.XM
 *   1e9-1e12 → $X.XB
 *   ≥ 1e12   → $X.XXT
 * NaN / null / Infinity → '—'
 */
function _formatLargeUsd(v) {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

/**
 * 0.0–1.0 比率を XX.XX% に変換 (0.621 → 62.1%)。
 * digits: 小数点以下桁数 (default 2)
 * NaN / null / Infinity → '—'
 */
function _formatPct(v, digits = 2) {
  if (!Number.isFinite(v)) return '—';
  // 0.0–1.0 レンジ判定: abs < 1.5 なら ×100 化 (0.05–0.99 は明らかに 0-1 表記)
  // 既に % 値 (例: 62.1 など) で渡されるケースも考慮して > 1.5 の場合そのまま使う
  const pct = Math.abs(v) <= 1.5 ? v * 100 : v;
  return `${pct.toFixed(digits)}%`;
}

/**
 * EV/EBITDA multiple を "XX.Xx" 形式で変換 (52.8 → 52.8x)。
 * NaN / null / Infinity → '—'
 */
function _formatMultiple(v) {
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(1)}x`;
}

/**
 * USD per share (EPS など) を "$X.XX" 形式で変換。
 * NaN / null / Infinity → '—'
 */
function _formatUsdPerShare(v) {
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
}

/**
 * 比率 (D/E など) を "X.XX" 形式で変換 (単位なし)。
 * NaN / null / Infinity → '—'
 */
function _formatRatio(v) {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(2);
}

// ─────────────────────────────────────────────
// Metric 定義 (静的 dictionary — Hallucination Guard 準拠)
// label / sub は全て静的日本語 string (LLM 不要)
// ─────────────────────────────────────────────

/**
 * @param {object} d  valuationExtras (Sprint 1 で追加された field 群)
 * @returns {Array}   chip 定義リスト
 */
function buildMetrics(d) {
  return [
    {
      key: 'ttmRevenue',
      label: 'TTM 売上高',
      value: _formatLargeUsd(d.ttmRevenue),
      sub: '直近 4Q 合算',
    },
    {
      key: 'ttmEps',
      label: 'TTM EPS',
      value: _formatUsdPerShare(d.ttmEps),
      sub: '直近 4Q 合算',
    },
    {
      key: 'ttmOperatingMargin',
      label: 'TTM 営業利益率',
      value: _formatPct(d.ttmOperatingMargin, 2),
      sub: '営業利益 / 売上高',
    },
    {
      key: 'fcfYield',
      label: 'FCF Yield',
      value: _formatPct(d.fcfYield, 2),
      sub: 'FCF / 時価総額',
    },
    {
      key: 'enterpriseValue',
      label: '企業価値 (EV)',
      value: _formatLargeUsd(d.enterpriseValue),
      sub: '総価値',
    },
    {
      key: 'evToEbitda',
      label: 'EV/EBITDA',
      value: _formatMultiple(d.evToEbitda),
      sub: '企業価値 / EBITDA',
    },
  ];
}

// ─────────────────────────────────────────────
// SectionLabel (ReturnGrid と同 grammar)
// ─────────────────────────────────────────────

function SectionLabel({ main, sub }) {
  if (!main) return null;
  return (
    <div style={{ marginBottom: 'var(--space-2, 8px)' }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--text-primary)',
          textTransform: 'uppercase',
        }}
      >
        {main}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MetricChip — 1 つの metric cell
// ds-stat / ds-stat__value / ds-stat__label / ds-stat__hint を流用しつつ、
// 数値 font-size を 20px に override (KpiStrip 36px より 1 tier 低い hierarchy)
// ─────────────────────────────────────────────

function MetricChip({ label, value, sub }) {
  const isMissing = value === '—';

  return (
    <div
      className="ds-stat"
      style={{
        opacity: isMissing ? 0.5 : 1,
        minWidth: 0, // grid auto-fit でオーバーフロー防止
        alignItems: 'flex-start', // ReturnGrid との差別化: left-align (3 col 広め)
      }}
    >
      {/* label: 12px muted uppercase (ds-stat__label から inherit するが
          text-align: center を left に override) */}
      <div
        className="ds-stat__label"
        style={{ textAlign: 'left', letterSpacing: '0.04em' }}
      >
        {label}
      </div>

      {/* value: 20px fw700 tabular-nums (ds-stat__value の 36px を 20px に縮小)
          SPEC: value 20px fw700 — KpiStrip (36px) と ReturnGrid (22px) の中間階層 */}
      <div
        className="ds-stat__value"
        style={{
          fontSize: 20,
          textAlign: 'left',
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
          marginTop: 'var(--space-1, 4px)',
        }}
      >
        {value}
      </div>

      {/* sub-text: 11px muted opacity 0.75
          全 chip 同一高さ確保のため全 chip に sub を配置 (SPEC: 高さ均一) */}
      <div
        className="ds-stat__hint"
        style={{
          fontSize: 11,
          opacity: 0.75,
          textAlign: 'left',
        }}
      >
        {sub}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 「最終更新 X 時間前」 計算ユーティリティ
// CLAUDE.md 「動的データには最終更新 X 分前を併記」 ルール遵守
// epoch 秒 / ms 自動判定: input < 1e12 ? input * 1000 : input
// ─────────────────────────────────────────────

function _relativeTime(fetchedAt) {
  if (!Number.isFinite(fetchedAt)) return null;
  const ms = fetchedAt < 1e12 ? fetchedAt * 1000 : fetchedAt;
  const diffMin = Math.floor((Date.now() - ms) / 60000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin} 分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 時間前`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} 日前`;
}

// ─────────────────────────────────────────────
// TtmValuationPanel (default export)
// ─────────────────────────────────────────────

export default function TtmValuationPanel({
  ticker,
  valuationExtras,
  frameless = true,
  sectionLabel = 'TTM バリュエーション',
}) {
  // Trust Cliff 防止: data がない場合は section 非表示
  if (!valuationExtras || !valuationExtras.data) return null;

  const d = valuationExtras.data;
  const metrics = useMemo(() => buildMetrics(d), [d]);

  const relTime = _relativeTime(valuationExtras.fetched_at);

  return (
    <div
      data-testid="ttm-valuation-panel"
      className={frameless ? '' : 'ds-card-frameless'}
      style={{
        padding: frameless ? 0 : 'var(--space-4, 16px)',
        minHeight: 80, // CLS envelope (feedback_cls_envelope_pattern.md)
      }}
    >
      {/* SectionLabel: "TTM バリュエーション" + sub-text */}
      <SectionLabel
        main={sectionLabel}
        sub="直近 4 四半期合算、 数値のみ表示"
      />

      {/* 3×2 metric grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-4, 16px)',
        }}
      >
        {metrics.map((m) => (
          <MetricChip
            key={m.key}
            label={m.label}
            value={m.value}
            sub={m.sub}
          />
        ))}
      </div>

      {/* footer: 出典 + 最終更新 (CLAUDE.md「動的データには最終更新を併記」) */}
      {relTime && (
        <div
          style={{
            marginTop: 'var(--space-3, 12px)',
            fontSize: 11,
            color: 'var(--text-muted)',
            opacity: 0.7,
          }}
        >
          出典: FMP TTM data ・ 最終更新 {relTime}
        </div>
      )}
    </div>
  );
}
