import { describe, it, expect } from 'vitest';
import { classifyBuyZone } from '../../../lib/buyZoneLabels.js';
import {
  VERDICT_TONE,
  VERDICT_CAPTION,
  VERDICT_PHASE_LABEL,
} from './buyZoneVerdict.js';

/**
 * v305 回帰防止: backend main.py が cup_handle.state に返す「実値」と、
 * verdict bar が引く VERDICT_TONE の「キー」の不一致を機械検知する。
 *
 * 背景バグ: JudgmentDetail が raw cup_handle.state (formation/breakout_confirmed...) を
 * classifyBuyZone で正規化せず VERDICT_TONE に直渡し → 全銘柄でキー undefined →
 * verdict bar の state ピルが無言で消えていた (vitest 130 passed でもすり抜けた)。
 * 修正は classifyBuyZone を噛ませる配線。この test がその契約を固定する。
 */

// backend main.py が cup_handle.state に実際に代入する値 → 期待 verdict tone。
const BACKEND_STATE_TO_TONE = {
  formation: 'watch',
  breakout_pending: 'watch',
  breakout_confirmed: 'confirm',
  breakout_extended: 'caution',
  cup_completing: 'watch',
  pullback_to_support: 'watch',
  resistance_retest: 'watch',
};

describe('buyZoneVerdict: backend state → classifyBuyZone → VERDICT_TONE 連携', () => {
  for (const [raw, tone] of Object.entries(BACKEND_STATE_TO_TONE)) {
    it(`cup_handle.state="${raw}" → tone=${tone}`, () => {
      expect(VERDICT_TONE[classifyBuyZone(raw)]).toBe(tone);
    });
  }

  it('SPY 弱市場 (formation_market_weak) / null / 未知 state は安全 degrade (tone なし)', () => {
    expect(classifyBuyZone('formation_market_weak')).toBe('unknown');
    expect(classifyBuyZone(null)).toBe('unknown');
    expect(VERDICT_TONE.unknown).toBeUndefined();
  });

  it('classifyBuyZone の全 cup_handle 出力に tone と caption が揃う (無言消失防止)', () => {
    const zones = [
      'cup_pivot',
      'breakout_support',
      'breakout_extended',
      'cup_completing',
      'pullback_to_support',
      'resistance_retest',
    ];
    for (const z of zones) {
      expect(VERDICT_TONE[z], `VERDICT_TONE[${z}]`).toBeDefined();
      expect(VERDICT_CAPTION[z], `VERDICT_CAPTION[${z}]`).toBeDefined();
    }
  });

  it('§38: confirm のフェーズ語は事実記述で買い指示を含まない', () => {
    expect(VERDICT_PHASE_LABEL.confirm).toBe('ブレイク確認済');
    expect(VERDICT_PHASE_LABEL.confirm).not.toMatch(/買|今が|エントリー|チャンス|好機/);
  });
});
