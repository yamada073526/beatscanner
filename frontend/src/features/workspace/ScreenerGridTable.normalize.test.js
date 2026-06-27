/**
 * ScreenerGridTable.normalize.test.js — Layer A SPEC §6 結線の純検査 (node env・no DOM)。
 *
 * normalizeItem は real backend item → 正規化 earnings へのマッピング純関数。
 * Sprint4 で guidanceSource(Layer A/B 判別) を結線したため、以下を回帰として固定:
 *   - guidance_source の '8k' / 欠落 → earnings.guidanceSource ('8k' / null)
 *   - 来期2列ハイブリッド: guidance_*_surprise_pct(Layer A) 優先 → next_q_*_yoy_pct(Layer B) fallback
 *   - 値欠落の null 保全 (0 と null を取り違えない)
 */
import { describe, it, expect } from 'vitest';
import { normalizeItem } from './ScreenerGridTable.jsx';

describe('normalizeItem — Layer A guidanceSource 結線 (§6)', () => {
  it("guidance_source='8k' → guidanceSource='8k' (Layer A)", () => {
    const r = normalizeItem({ ticker: 'AGX', guidance_source: '8k' });
    expect(r.earnings.guidanceSource).toBe('8k');
  });

  it('guidance_source 欠落 → guidanceSource=null (Layer B)', () => {
    const r = normalizeItem({ ticker: 'VRT' });
    expect(r.earnings.guidanceSource).toBeNull();
  });

  it('guidance_source=null を明示 → null 保全', () => {
    const r = normalizeItem({ ticker: 'FTI', guidance_source: null });
    expect(r.earnings.guidanceSource).toBeNull();
  });
});

describe('normalizeItem — 来期2列ハイブリッド優先 (§14-C)', () => {
  it('guidance(Layer A) があれば guidance を採用 (next_q を無視)', () => {
    const r = normalizeItem({
      ticker: 'TRGP',
      guidance_rev_surprise_pct: 3,
      guidance_eps_surprise_pct: 2,
      next_q_rev_yoy_pct: 99,
      next_q_eps_yoy_pct: 88,
      guidance_source: '8k',
    });
    expect(r.earnings.nqRev).toBe(3);
    expect(r.earnings.nqEps).toBe(2);
  });

  it('guidance 欠落なら next_q(Layer B) へ fallback', () => {
    const r = normalizeItem({
      ticker: 'BABA',
      next_q_rev_yoy_pct: 1,
      next_q_eps_yoy_pct: 5,
    });
    expect(r.earnings.nqRev).toBe(1);
    expect(r.earnings.nqEps).toBe(5);
    expect(r.earnings.guidanceSource).toBeNull();
  });

  it('guidance rev のみ・eps は ADR 非算出(null) → rev は guidance / eps は fallback も無く null', () => {
    const r = normalizeItem({
      ticker: 'TSM',
      guidance_rev_surprise_pct: 4,
      guidance_eps_surprise_pct: null,
      next_q_eps_yoy_pct: null,
      guidance_source: '8k',
    });
    expect(r.earnings.nqRev).toBe(4);
    expect(r.earnings.nqEps).toBeNull();
    expect(r.earnings.guidanceSource).toBe('8k');
  });

  it('両層とも欠落 → null', () => {
    const r = normalizeItem({ ticker: 'X' });
    expect(r.earnings.nqRev).toBeNull();
    expect(r.earnings.nqEps).toBeNull();
  });

  it('値 0 を null と取り違えない (?? 連鎖の落とし穴回帰)', () => {
    const r = normalizeItem({
      ticker: 'Z',
      guidance_rev_surprise_pct: 0,
      next_q_rev_yoy_pct: 50,
      guidance_source: '8k',
    });
    expect(r.earnings.nqRev).toBe(0);
  });
});
