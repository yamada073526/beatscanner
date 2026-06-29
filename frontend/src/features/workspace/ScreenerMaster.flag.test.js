// screener_v2 feature flag 判定 (resolveScreenerV2) の revert 安全性契約を固定する。
//   C-16 で default ON にした後も「旧 screener へ確実に戻せる」ことが本番リリースの安全網。
//   URL param 優先 → localStorage 永続 の順序 + kill switch 3 系統 (?screener_v2=0 / ?screener_legacy=1 /
//   localStorage screener_v2='0') を機械的に保証する ([[feedback_feature_flag_dual_mode]])。
import { describe, it, expect } from 'vitest';
import { resolveScreenerV2 } from './ScreenerMaster.jsx';

describe('resolveScreenerV2 — flag 判定 + revert 安全性', () => {
  it('default (param 無し・localStorage 無し) は true (C-16 昇格済・default ON)', () => {
    expect(resolveScreenerV2()).toBe(true);
    expect(resolveScreenerV2({ search: '', ls: null })).toBe(true);
  });

  it('?screener_v2=1 で opt-in (true)', () => {
    expect(resolveScreenerV2({ search: '?screener_v2=1' })).toBe(true);
  });

  it('?screener_v2=0 で明示 OFF (kill switch #1)', () => {
    expect(resolveScreenerV2({ search: '?screener_v2=0' })).toBe(false);
  });

  it('?screener_legacy=1 で旧 screener へ強制 revert (kill switch #2)', () => {
    expect(resolveScreenerV2({ search: '?screener_legacy=1' })).toBe(false);
  });

  it("localStorage='1' で永続 opt-in (true)", () => {
    expect(resolveScreenerV2({ search: '', ls: '1' })).toBe(true);
  });

  it("localStorage='0' で永続 kill (kill switch #3)", () => {
    expect(resolveScreenerV2({ search: '', ls: '0' })).toBe(false);
  });

  // ── 優先順位: URL param は localStorage を必ず上書きする ──
  it('?screener_v2=1 は localStorage=0 を上書き (URL 優先 → true)', () => {
    expect(resolveScreenerV2({ search: '?screener_v2=1', ls: '0' })).toBe(true);
  });

  it('?screener_v2=0 は localStorage=1 を上書き (URL 優先 → false)', () => {
    expect(resolveScreenerV2({ search: '?screener_v2=0', ls: '1' })).toBe(false);
  });

  it('?screener_legacy=1 は localStorage=1 (永続 opt-in) を上書きして revert (false)', () => {
    expect(resolveScreenerV2({ search: '?screener_legacy=1', ls: '1' })).toBe(false);
  });

  // ── C-16 昇格済 (default ON) 下の revert 回帰: 末尾 default=true でも下記 kill switch が依然 false ──
  //    param/ls 単体で判定が確定する = 昇格しても revert が壊れないことを機械固定。
  it('default ON 下: kill switch 群が独立して効く (param 単体で判定が確定する)', () => {
    // param が判定を確定させるため、末尾 default の値に依存しない (= 昇格しても revert は壊れない)
    expect(resolveScreenerV2({ search: '?screener_v2=0', ls: null })).toBe(false);
    expect(resolveScreenerV2({ search: '?screener_legacy=1', ls: null })).toBe(false);
    expect(resolveScreenerV2({ search: '', ls: '0' })).toBe(false);
  });
});
