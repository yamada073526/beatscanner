/**
 * L3QualityFold.derive.test.js — §② 品質指標の §38 / Trust Cliff 純検査 (node env・no DOM)。
 *
 * Sprint 4b の数値ロジック (LLM 不使用・backend actual 同士の算術) を回帰として固定:
 *   - op_cf_margin は ratio(0–1) → ×100 で % 化 (QuarterlyHistoryTable と同スケール)
 *   - OCF÷純利益 = 営業CFPS ÷ EPS、EPS≤0 の四半期は比率を捏造せず null (Trust Cliff)
 *   - quarterly-history は新しい順 → 古→新へ整列 (株価チャートと同方向)
 *   - §38-safe 閾値ラベル dict (ocfMargin / ROE / 粗利率YoY / 系列傾向 / EPS CAGR) の境界
 */
import { describe, it, expect } from 'vitest';
import {
  deriveQualityFromHistory,
  deriveEvalContinuity,
  ocfMarginLabel,
  roeLevelLabel,
  grossMarginYoyChip,
  seriesTrendChip,
  epsCagrDotTone,
  quarterLabel,
} from './L3QualityFold.jsx';

// newest-first (history[0] = 最新) の代表的な quarterly-history。
const HISTORY = [
  { fiscal_period: 'Q4 2025', date: '2025-09-30', op_cf_margin: 0.198, gross_margin_pct: 75.0, gross_margin_yoy_pp: 2.1, cfps_actual: 2.30, eps_actual: 2.00, cfps_gt_eps: true },
  { fiscal_period: 'Q3 2025', date: '2025-06-30', op_cf_margin: 0.191, gross_margin_pct: 74.7, gross_margin_yoy_pp: 1.8, cfps_actual: 2.10, eps_actual: 2.20, cfps_gt_eps: false },
  { fiscal_period: 'Q2 2025', date: '2025-03-31', op_cf_margin: 0.184, gross_margin_pct: 74.5, gross_margin_yoy_pp: 1.5, cfps_actual: 1.50, eps_actual: 0, cfps_gt_eps: null },
];

describe('deriveQualityFromHistory', () => {
  const d = deriveQualityFromHistory(HISTORY);

  it('op_cf_margin を ratio→% (×100) に変換する', () => {
    expect(d.ocfMarginSeries[2]).toBeCloseTo(19.8, 5); // 最新 (0.198×100)
    expect(d.ocfMarginSeries[0]).toBeCloseTo(18.4, 5); // 最古 (0.184×100)
  });

  it('系列を新しい順→古→新 (直近=右) へ整列する', () => {
    expect(d.qhLabels).toEqual(['Q2 2025', 'Q3 2025', 'Q4 2025']);
    expect(d.grossMarginSeries).toEqual([74.5, 74.7, 75.0]);
  });

  it('OCF÷純利益 = 営業CFPS÷EPS、EPS≤0 は捏造せず null (Trust Cliff)', () => {
    expect(d.ocfNiSeries[0]).toBeNull();              // 古い順先頭 = EPS 0 の Q2
    expect(d.ocfNiSeries[1]).toBeCloseTo(0.9545, 3);  // 2.10 / 2.20
    expect(d.ocfNiSeries[2]).toBeCloseTo(1.15, 5);    // 2.30 / 2.00
    expect(d.ocfNiLatest).toBeCloseTo(1.15, 5);
  });

  it('最新 (history[0]) から粗利率・cfHealth を取る', () => {
    expect(d.gmLatest).toBe(75.0);
    expect(d.gmYoyPp).toBe(2.1);
    expect(d.cfHealth).toBe(true);
  });

  it('EPS が負の四半期も比率 null', () => {
    const neg = deriveQualityFromHistory([{ cfps_actual: 1.0, eps_actual: -0.5 }]);
    expect(neg.ocfNiSeries[0]).toBeNull();
    expect(neg.ocfNiLatest).toBeNull();
  });

  it('空 / 非配列入力で安全な空系列を返す', () => {
    for (const empty of [[], null, undefined]) {
      const e = deriveQualityFromHistory(empty);
      expect(e.ocfMarginSeries).toEqual([]);
      expect(e.grossMarginSeries).toEqual([]);
      expect(e.ocfNiSeries).toEqual([]);
      expect(e.gmLatest).toBeNull();
      expect(e.ocfNiLatest).toBeNull();
      expect(e.cfHealth).toBeNull();
    }
  });

  it('欠落フィールドは系列で null に落ちる', () => {
    const partial = deriveQualityFromHistory([{ gross_margin_pct: 60 }]);
    expect(partial.ocfMarginSeries).toEqual([null]);
    expect(partial.grossMarginSeries).toEqual([60]);
    expect(partial.ocfNiSeries).toEqual([null]);
  });
});

describe('§38-safe 閾値ラベル dict', () => {
  it('ocfMarginLabel の境界 (15–35% 理想帯)', () => {
    expect(ocfMarginLabel(40)).toBe('高水準');
    expect(ocfMarginLabel(20)).toBe('良好');
    expect(ocfMarginLabel(8)).toBe('標準');
    expect(ocfMarginLabel(2)).toBe('低水準');
    expect(ocfMarginLabel(NaN)).toBeNull();
  });

  it('roeLevelLabel (O\'Neil 基準 17%)', () => {
    expect(roeLevelLabel(20)).toEqual({ label: '高水準', tone: 'gain' });
    expect(roeLevelLabel(12)).toEqual({ label: '良好', tone: 'gain' });
    expect(roeLevelLabel(5)).toEqual({ label: '標準', tone: 'muted' });
    expect(roeLevelLabel(-3)).toEqual({ label: '低水準', tone: 'warning' });
    expect(roeLevelLabel(NaN)).toBeNull();
  });

  it('grossMarginYoyChip は符号付き pp + 方向 tone', () => {
    expect(grossMarginYoyChip(2.1)).toEqual({ label: '+2.1pp YoY', tone: 'gain' });
    expect(grossMarginYoyChip(-1.0)).toEqual({ label: '-1.0pp YoY', tone: 'warning' });
    expect(grossMarginYoyChip(0.2)).toEqual({ label: '+0.2pp YoY', tone: 'muted' });
    expect(grossMarginYoyChip(null)).toBeNull();
  });

  it('seriesTrendChip は最古→最新の差で拡大/横ばい/縮小', () => {
    expect(seriesTrendChip([15, 16, 17, 19.8]).tone).toBe('gain');
    expect(seriesTrendChip([19.8, 18, 17, 15]).tone).toBe('warning');
    expect(seriesTrendChip([18.0, 18.2, 18.1]).tone).toBe('muted');
    expect(seriesTrendChip([null, 18])).toBeNull(); // 有値 2 未満 → null
  });

  it('epsCagrDotTone (KB 高成長閾値)', () => {
    expect(epsCagrDotTone(30)).toBe('gain');
    expect(epsCagrDotTone(5)).toBe('muted');
    expect(epsCagrDotTone(-2)).toBe('loss');
    expect(epsCagrDotTone(NaN)).toBe('muted');
  });
});

describe('deriveEvalContinuity (5条件 充足の推移・§② 継続性 signal)', () => {
  // newest-first (period_end DESC)。[c1,c2,c3,c4,c5]。
  // cond1=8/8(stable) cond4=6/8(=0.75 stable境界) cond2=2/8(=0.25 neck境界) cond3=0/8(neck) cond5=4/8(中立)。
  const row = (period_end, c) => ({
    period_end,
    evaluation_date: period_end,
    cond1_passed: c[0], cond2_passed: c[1], cond3_passed: c[2], cond4_passed: c[3], cond5_passed: c[4],
    passed_count: c.filter(Boolean).length,
  });
  const EVAL = [
    row('2025-12-31', [true, true, false, true, true]),   // newest, passed=4
    row('2025-09-30', [true, true, false, true, true]),   // 4
    row('2025-06-30', [true, false, false, true, false]), // 2
    row('2025-03-31', [true, false, false, true, false]), // 2
    row('2024-12-31', [true, false, false, true, true]),  // 3
    row('2024-09-30', [true, false, false, true, true]),  // 3
    row('2024-06-30', [true, false, false, false, false]),// 1
    row('2024-03-31', [true, false, false, false, false]),// oldest, 1
  ];
  const d = deriveEvalContinuity(EVAL);

  it('空 / 非配列入力で null', () => {
    for (const empty of [[], null, undefined]) expect(deriveEvalContinuity(empty)).toBeNull();
  });

  it('passed_count 系列を古→新 (直近=右) に整列する', () => {
    expect(d.passedCountSeries).toEqual([1, 1, 3, 3, 2, 2, 4, 4]);
    expect(d.quarters).toBe(8);
  });

  it('period ラベルは古→新の YYYY-MM', () => {
    expect(d.periodLabels[0]).toBe('2024-03');
    expect(d.periodLabels[7]).toBe('2025-12');
  });

  it('latestPassed は rows[0] (最新) の充足数', () => {
    expect(d.latestPassed).toBe(4);
  });

  it('条件別 matrix・passes・rate を算出 (cond1=8/8, cond3=0/8)', () => {
    const c1 = d.conditions.find((c) => c.key === 'cond1_passed');
    const c3 = d.conditions.find((c) => c.key === 'cond3_passed');
    expect(c1.passes).toBe(8);
    expect(c1.total).toBe(8);
    expect(c1.rate).toBe(1);
    expect(c1.latest).toBe(true);
    expect(c3.passes).toBe(0);
    expect(c3.rate).toBe(0);
    expect(c1.cells).toHaveLength(8);
  });

  it('安定クリア = rate≥0.75 かつ ≥4Q、継続ネック = rate≤0.25 (境界含む)', () => {
    expect(d.stable.map((c) => c.num)).toEqual(['①', '④']); // 8/8, 6/8(=0.75)
    expect(d.neck.map((c) => c.num)).toEqual(['②', '③']);   // 2/8(=0.25), 0/8
  });

  it('4Q 未満は stable/neck に含めない (過大主張回避)', () => {
    const short = deriveEvalContinuity([
      row('2025-12-31', [true, true, true, true, true]),
      row('2025-09-30', [true, true, true, true, true]),
      row('2025-06-30', [true, true, true, true, true]),
    ]);
    expect(short.stable).toEqual([]);
    expect(short.neck).toEqual([]);
    expect(short.quarters).toBe(3);
  });

  it('非 boolean の cond セルは finite から除外 (null 安全)', () => {
    const partial = deriveEvalContinuity([
      { period_end: '2025-12-31', cond1_passed: true, cond2_passed: null, passed_count: 1 },
    ]);
    const c1 = partial.conditions.find((c) => c.key === 'cond1_passed');
    const c2 = partial.conditions.find((c) => c.key === 'cond2_passed');
    expect(c1.cells).toEqual([true]);
    expect(c2.total).toBe(0);
    expect(c2.rate).toBeNull();
  });

  it('qh を渡すと発表月 (evaluation_date↔date) 一致期に実数値 metric を結合', () => {
    const QH = [
      { date: '2025-12-20', op_cf_margin: 0.20, eps_actual: 1.5, cfps_actual: 1.8, revenue_actual: 35.1e9 },
      { date: '2025-09-18', op_cf_margin: 0.18, eps_actual: 1.2, cfps_actual: 1.4, revenue_actual: 30e9 },
    ];
    const dq = deriveEvalContinuity(EVAL, QH);
    const c1 = dq.conditions.find((c) => c.key === 'cond1_passed');
    const c4 = dq.conditions.find((c) => c.key === 'cond4_passed');
    // asc は古→新: index 7=2025-12 (最新), 6=2025-09
    expect(c1.metrics[7]).toBe('CFマージン 20.0%');
    expect(c4.metrics[7]).toBe('売上 $35.1B');
    expect(c1.metrics[6]).toBe('CFマージン 18.0%');
    expect(c1.metrics[0]).toBeNull(); // qh に無い月 (2024-03) は捏造せず null
  });

  it('qh 未指定なら metrics は全 null (実数値なし・誠実フォールバック)', () => {
    const c1 = d.conditions.find((c) => c.key === 'cond1_passed');
    expect(c1.metrics.every((m) => m === null)).toBe(true);
  });
});

describe('quarterLabel', () => {
  it('fiscal_period 優先、なければ date 先頭 7 桁、両方なければ空文字', () => {
    expect(quarterLabel({ fiscal_period: 'Q1 2025', date: '2025-01-01' })).toBe('Q1 2025');
    expect(quarterLabel({ date: '2025-06-30' })).toBe('2025-06');
    expect(quarterLabel({})).toBe('');
  });
});
