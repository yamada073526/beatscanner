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

describe('quarterLabel', () => {
  it('fiscal_period 優先、なければ date 先頭 7 桁、両方なければ空文字', () => {
    expect(quarterLabel({ fiscal_period: 'Q1 2025', date: '2025-01-01' })).toBe('Q1 2025');
    expect(quarterLabel({ date: '2025-06-30' })).toBe('2025-06');
    expect(quarterLabel({})).toBe('');
  });
});
