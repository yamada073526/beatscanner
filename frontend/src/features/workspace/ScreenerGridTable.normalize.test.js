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
import {
  normalizeItem, presetWin, buildGroupRuns, withGroupDividers, PRESET_COLUMNS, PRESET_GROUP_META,
} from './ScreenerGridTable.jsx';

// 簡素モード相当 (core 列のみ) を作るヘルパ。
const core = (preset) => PRESET_COLUMNS[preset].filter((c) => c.core);

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

describe('presetWin — gold 標榜 (別格) 判定 (SPEC_2026-06-29 A1・本番 universe 較正)', () => {
  it('sector_leader: セクター首位 かつ ROE>=17 → win', () => {
    expect(presetWin({ is_sector_rs_leader: true, roe: 31 }, 'sector_leader')).toBe(true);
  });
  it('sector_leader: 首位だが ROE<17 かつ CF<25 → 非win', () => {
    expect(presetWin({ is_sector_rs_leader: true, roe: 5, ocf_margin_pct: 7 }, 'sector_leader')).toBe(false);
  });
  it('sector_leader: 首位 かつ CF創出力>=25 (ROE 欠落) → win (OR 条件)', () => {
    expect(presetWin({ is_sector_rs_leader: true, roe: null, ocf_margin_pct: 36 }, 'sector_leader')).toBe(true);
  });
  it('sector_leader: 首位でない → 非win (高 ROE でも)', () => {
    expect(presetWin({ is_sector_rs_leader: false, roe: 50 }, 'sector_leader')).toBe(false);
  });

  it('market_leading: 対SPY>=20 かつ 直近ビート → win', () => {
    expect(presetWin({ rs_vs_spy_pct: 24, latest_beat: true }, 'market_leading')).toBe(true);
  });
  it('market_leading: 対SPY<20 → 非win', () => {
    expect(presetWin({ rs_vs_spy_pct: 12, latest_beat: true }, 'market_leading')).toBe(false);
  });
  it('market_leading: ビート無し → 非win', () => {
    expect(presetWin({ rs_vs_spy_pct: 30, latest_beat: false }, 'market_leading')).toBe(false);
  });

  it('quiet_quality: RS>=80 かつ 出来高静か(<=0) かつ 機関未殺到(<=0) → win', () => {
    expect(presetWin({ rs_percentile: 85, volume_surge_pct: -10, inst_holders_qoq_pct: -2 }, 'quiet_quality')).toBe(true);
  });
  it('quiet_quality: 出来高急増(>0) → 非win', () => {
    expect(presetWin({ rs_percentile: 90, volume_surge_pct: 30, inst_holders_qoq_pct: -2 }, 'quiet_quality')).toBe(false);
  });
  it('quiet_quality: 機関データ欠落 → 非win (欠落は標榜しない・honest)', () => {
    expect(presetWin({ rs_percentile: 90, volume_surge_pct: -5, inst_holders_qoq_pct: null }, 'quiet_quality')).toBe(false);
  });

  it('new_high_break: 52週高値更新 かつ 出来高+50%超 → win', () => {
    expect(presetWin({ is_new_52w_high: true, volume_surge_pct: 62 }, 'new_high_break')).toBe(true);
  });
  it('new_high_break: 高値更新だが出来高<50% → 非win', () => {
    expect(presetWin({ is_new_52w_high: true, volume_surge_pct: 30 }, 'new_high_break')).toBe(false);
  });
  it('new_high_break: is_new_52w_high が masked(null) → 非win (free fetch)', () => {
    expect(presetWin({ is_new_52w_high: null, volume_surge_pct: 80 }, 'new_high_break')).toBe(false);
  });

  it('未知 preset / null item → 非win (guard)', () => {
    expect(presetWin({ rs_percentile: 99 }, 'earnings_pass')).toBe(false);
    expect(presetWin(null, 'sector_leader')).toBe(false);
  });
});

// ── A2 カテゴリ仕切り (mockup v14 B案) ───────────────────────────────────────
describe('buildGroupRuns — カテゴリ run/span 算出 (詳細モード)', () => {
  const runShape = (r) => r.map((g) => [g.key, g.span, g.kind, g.label]);

  it('new_high_break: 勢い2 | 決算実績2(zone) | rs1', () => {
    expect(runShape(buildGroupRuns(PRESET_COLUMNS.new_high_break, 'new_high_break'))).toEqual([
      ['momentum', 2, 'plain', '勢い'],
      ['result', 2, 'zone', '決算実績'],
      ['rs', 1, 'plain', ''],
    ]);
  });
  it('sector_leader: 順位1 | 収益の質2(zone) | 需給1(zone) | rs1', () => {
    expect(runShape(buildGroupRuns(PRESET_COLUMNS.sector_leader, 'sector_leader'))).toEqual([
      ['rank', 1, 'plain', ''],
      ['quality', 2, 'zone', '収益の質'],
      ['demand', 1, 'zone', '需給'],
      ['rs', 1, 'plain', ''],
    ]);
  });
  it('quiet_quality: rs1 | 需給(静か)2(zone) | 収益の質2(zone)', () => {
    expect(runShape(buildGroupRuns(PRESET_COLUMNS.quiet_quality, 'quiet_quality'))).toEqual([
      ['rs', 1, 'plain', ''],
      ['demand', 2, 'zone', '需給(静か)'],
      ['quality', 2, 'zone', '収益の質'],
    ]);
  });
  it('market_leading: 相対力2 | 収益の質2(zone) | 決算実績2(zone)', () => {
    expect(runShape(buildGroupRuns(PRESET_COLUMNS.market_leading, 'market_leading'))).toEqual([
      ['relstr', 2, 'plain', '相対力'],
      ['quality', 2, 'zone', '収益の質'],
      ['result', 2, 'zone', '決算実績'],
    ]);
  });
  it('span 合計 = 列数 (全 preset)', () => {
    Object.keys(PRESET_COLUMNS).forEach((p) => {
      const total = buildGroupRuns(PRESET_COLUMNS[p], p).reduce((s, g) => s + g.span, 0);
      expect(total).toBe(PRESET_COLUMNS[p].length);
    });
  });
});

describe('buildGroupRuns — 簡素モード (core 間引きで run 再計算)', () => {
  it('new_high_break(core=[nearHigh,vol,rs]): 勢い2 | rs1 (決算実績 group は消える)', () => {
    const runs = buildGroupRuns(core('new_high_break'), 'new_high_break');
    expect(runs.map((g) => [g.key, g.span])).toEqual([['momentum', 2], ['rs', 1]]);
  });
  it('quiet_quality(core=[rs,vol,inst]): rs1 | 需給2 (収益の質 group は消える)', () => {
    const runs = buildGroupRuns(core('quiet_quality'), 'quiet_quality');
    expect(runs.map((g) => [g.key, g.span])).toEqual([['rs', 1], ['demand', 2]]);
  });
});

describe('withGroupDividers — dstart は zone group の先頭のみ・fut は 4 preset で常に false', () => {
  const dstartIds = (cols, p) => withGroupDividers(cols, p).filter((c) => c.dstart).map((c) => c.id);

  it('new_high_break: 決算実績 先頭 eps に dstart', () => {
    expect(dstartIds(PRESET_COLUMNS.new_high_break, 'new_high_break')).toEqual(['eps']);
  });
  it('sector_leader: 収益の質 先頭 ocf と 需給 先頭 inst に dstart', () => {
    expect(dstartIds(PRESET_COLUMNS.sector_leader, 'sector_leader')).toEqual(['ocf', 'inst']);
  });
  it('quiet_quality: 需給 先頭 vol と 収益の質 先頭 ocf に dstart', () => {
    expect(dstartIds(PRESET_COLUMNS.quiet_quality, 'quiet_quality')).toEqual(['vol', 'ocf']);
  });
  it('market_leading: 収益の質 先頭 ocf と 決算実績 先頭 eps に dstart', () => {
    expect(dstartIds(PRESET_COLUMNS.market_leading, 'market_leading')).toEqual(['ocf', 'eps']);
  });
  it('plain group の先頭・group 継続列には dstart を付けない', () => {
    const aug = withGroupDividers(PRESET_COLUMNS.sector_leader, 'sector_leader');
    expect(aug.find((c) => c.id === 'leader').dstart).toBe(false); // 先頭 plain
    expect(aug.find((c) => c.id === 'roe').dstart).toBe(false);    // quality 継続
    expect(aug.find((c) => c.id === 'rs').dstart).toBe(false);     // 末尾 plain
  });
  it('4 preset には来期列が無いため fut は全列 false (B案=glass は earnings_pass 据え置き)', () => {
    Object.keys(PRESET_COLUMNS).forEach((p) => {
      withGroupDividers(PRESET_COLUMNS[p], p).forEach((c) => expect(c.fut).toBe(false));
    });
  });
  it('簡素モードで zone group が消えれば dstart も消える (new_high_break core)', () => {
    expect(dstartIds(core('new_high_break'), 'new_high_break')).toEqual([]);
  });
});

describe('PRESET_GROUP_META 整合 — 全 group key が META に定義され kind が妥当', () => {
  it('各 preset の列 group は META に存在し kind は plain/zone/future', () => {
    Object.keys(PRESET_COLUMNS).forEach((p) => {
      const meta = PRESET_GROUP_META[p];
      expect(meta).toBeTruthy();
      PRESET_COLUMNS[p].forEach((c) => {
        expect(meta[c.group]).toBeTruthy();
        expect(['plain', 'zone', 'future']).toContain(meta[c.group].kind);
      });
    });
  });
});
