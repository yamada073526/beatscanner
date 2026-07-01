/**
 * foldSummaries.test.js — v313 Sprint S3 (C2) collapsed summary 純関数の回帰検査。
 *
 * 固定したい契約:
 *   - Beat/Miss 0 件 (データなし・API失敗) は null → 呼び出し側の静的文言 fallback を維持
 *   - Insider は type='P' (買付) のみ集計、 90日超・非買付 (S/A/D等) は除外
 *   - 金額フォーマットは $1.2M / $350.0K のような桁区切りショート表記
 */
import { describe, it, expect } from 'vitest';
import { formatEarningsReactionSummary, formatInsiderSummary } from './foldSummaries.js';

describe('formatEarningsReactionSummary', () => {
  it('null / undefined summary は null', () => {
    expect(formatEarningsReactionSummary(null)).toBeNull();
    expect(formatEarningsReactionSummary(undefined)).toBeNull();
  });

  it('beat/miss 両方 0 件は null (mockup 動的復元なし → 静的文言 fallback)', () => {
    expect(formatEarningsReactionSummary({ beat_count: 0, miss_count: 0 })).toBeNull();
  });

  it('Beat のみ: 符号付き% + 回数', () => {
    expect(
      formatEarningsReactionSummary({ beat_count: 6, avg_beat_return_pct: 5.14, miss_count: 0 })
    ).toBe('Beat 6回 平均+5.1%');
  });

  it('Beat + Miss 混在: mockup 準拠の "・" 区切り、Miss は符号そのまま(負値)', () => {
    expect(
      formatEarningsReactionSummary({
        beat_count: 6,
        avg_beat_return_pct: 5.14,
        miss_count: 1,
        avg_miss_return_pct: -7.02,
      })
    ).toBe('Beat 6回 平均+5.1% ・ Miss 1回 平均-7.0%');
  });

  it('非数値の平均% は em dash', () => {
    expect(
      formatEarningsReactionSummary({ beat_count: 2, avg_beat_return_pct: null, miss_count: 0 })
    ).toBe('Beat 2回 平均—');
  });
});

describe('formatInsiderSummary', () => {
  const NOW = new Date('2026-07-01T00:00:00Z').getTime();

  it('空配列 / 非配列は null', () => {
    expect(formatInsiderSummary([], NOW)).toBeNull();
    expect(formatInsiderSummary(null, NOW)).toBeNull();
  });

  it('買付(type=P)のみ集計し、売却(S)・RSU受領(A)は除外', () => {
    const form4 = [
      { date: '2026-06-15', type: 'P', value: 1_200_000 },
      { date: '2026-06-10', type: 'S', value: 900_000 },
      { date: '2026-06-01', type: 'A', value: 300_000 },
    ];
    expect(formatInsiderSummary(form4, NOW)).toBe('直近90日 買付1件 $1.2M');
  });

  it('90日超の買付は除外 (期間外)', () => {
    const form4 = [
      { date: '2026-01-01', type: 'P', value: 5_000_000 }, // 90日超前
    ];
    expect(formatInsiderSummary(form4, NOW)).toBeNull();
  });

  it('複数買付は件数+金額合算、 $1M 未満は $Kレンジ表記', () => {
    const form4 = [
      { date: '2026-06-20', type: 'P', value: 200_000 },
      { date: '2026-06-25', type: 'P', value: 150_000 },
    ];
    expect(formatInsiderSummary(form4, NOW)).toBe('直近90日 買付2件 $350.0K');
  });

  it('買付 0 件 (S/D のみ) は null', () => {
    const form4 = [{ date: '2026-06-20', type: 'D', value: 500_000 }];
    expect(formatInsiderSummary(form4, NOW)).toBeNull();
  });
});
