// 隠れフィルタ防止の機械検査 (4 体合議 2026-06-25 提案・AUDIT §「4 体合議結果」)。
//
// 背景: screener の各 preset は PRESET_PREDICATES (件数 SSOT) で複数条件を AND 適用するが、
//   絞り込み panel (①crow パネル) に表示する条件は PRESET_DISPLAY_CONDS (表示専用) が別管理。両者がズレると
//   「①に出ないのに list を削る条件」= 隠れフィルタ = Trust Cliff (景表法 §5 優良誤認 risk)。
//   実例: hot_sector の 4 grade は①にも②適用バー (screener-applied-bar) にも出ず削っていた = 真の Trust Cliff。
//   sector_leader (PR #29) も同型。earnings_pass の funda_pass は②適用バーには出ていたが①に欠けていた
//   (厳密な隠れフィルタではないが本 test の保守的方針で①にも可視化)。本 test はこれらの回帰を機械的に防ぐ。
// ※不変条件は「適用条件は①crow パネルに全て出す」保守的ルール (案A)。flag は②適用バーにも出るが、
//   ①への結合のみで成立し②実装に依存しないため単純・堅牢 (frontend-architect review 2026-06-26)。
//
// 不変条件: 各 preset で「述語適用される全 cond key」⊆「PRESET_DISPLAY_CONDS の表示 key」。
//   適用 = grades キー (grade 条件) ∪ extra の真フラグ→cond key (binary/flag 条件)。
//   次元フィルタ (sectors/mcapBands/sectorTopN/cupState) は crow で表示しないため対象外。
import { describe, it, expect } from 'vitest';
import {
  PRESET_PREDICATES,
  PRESET_DISPLAY_CONDS,
  PRESET_GATE_CONDS,
  PRESET_CONDS,
  CROW_LAYOUT,
  itemPasses,
  buildActiveGrades,
  presetPrecisionLevels,
  sectorTone,
  sectorTagJp,
  fmtSr,
  buildSectorSummary,
} from './CustomScreenerPanel.jsx';

// extra フラグ → cond key の写像を PRESET_CONDS から構築 (cond.flag を持つ binary/flag cond が SSOT)。
const FLAG_TO_KEY = Object.fromEntries(
  PRESET_CONDS.filter((c) => c.flag).map((c) => [c.flag, c.key]),
);

// extra のうち「条件フラグ」でないキー (次元フィルタ・件数 SSOT だが crow 非表示) は隠れフィルタ対象外。
const NON_COND_EXTRA = new Set(['sectors', 'mcapBands', 'sectorTopN', 'cupState']);

// 各 preset の「述語適用される cond key 集合」= grades キー ∪ (extra の真フラグ→cond key)。
// ※ 検査範囲の前提: 条件適用は `grades` と `extra` の 2 機構に限る (itemPasses の SSOT)。
//   `sectorTopN` のような extra 外の top-level dimensional field (上位 N セクター絞り) は crow 条件でなく
//   preset 名/seasonchip で示す次元フィルタのため検査対象外。新たに条件を効かせる機構を grades/extra の外に
//   追加する場合は、本 test も拡張しないと隠れフィルタを取りこぼす (qa review 2026-06-26 指摘)。
function appliedCondKeys(presetKey) {
  const cfg = PRESET_PREDICATES[presetKey];
  const keys = new Set(Object.keys(cfg.grades || {}));
  for (const [flag, val] of Object.entries(cfg.extra || {})) {
    if (NON_COND_EXTRA.has(flag)) continue;
    if (val !== true) continue; // false/未設定フラグは適用外
    const k = FLAG_TO_KEY[flag];
    if (!k) {
      throw new Error(
        `extra フラグ "${flag}" (preset ${presetKey}) が PRESET_CONDS の cond.flag に未登録。` +
          ' 新フラグは PRESET_CONDS に cond.flag を定義するか NON_COND_EXTRA に追加すること。',
      );
    }
    keys.add(k);
  }
  return keys;
}

const COND_KEYS = new Set(PRESET_CONDS.map((c) => c.key));
const RENDERABLE_KEYS = new Set(CROW_LAYOUT.flatMap((g) => g.keys));

describe('screener hidden-filter invariant (隠れフィルタ禁止・Trust Cliff)', () => {
  for (const presetKey of Object.keys(PRESET_PREDICATES)) {
    it(`${presetKey}: 述語適用される全条件が PRESET_DISPLAY_CONDS に表示される (隠れフィルタなし)`, () => {
      const display = new Set(PRESET_DISPLAY_CONDS[presetKey] || []);
      const applied = appliedCondKeys(presetKey);
      const hidden = [...applied].filter((k) => !display.has(k));
      expect(
        hidden,
        `preset "${presetKey}" で述語適用されるが DISPLAY_CONDS 非表示 = 隠れフィルタ: [${hidden.join(', ')}]`,
      ).toEqual([]);
    });

    it(`${presetKey}: gate (必須) 条件は PRESET_DISPLAY_CONDS に含まれる (南京錠で可視化)`, () => {
      const display = new Set(PRESET_DISPLAY_CONDS[presetKey] || []);
      const gates = PRESET_GATE_CONDS[presetKey] || [];
      const missing = gates.filter((k) => !display.has(k));
      expect(missing, `gate 条件が DISPLAY_CONDS 欠落: [${missing.join(', ')}]`).toEqual([]);
    });
  }

  it('PRESET_DISPLAY_CONDS の全 key は有効な cond key かつ CROW_LAYOUT で描画可能', () => {
    const bad = [];
    for (const [presetKey, keys] of Object.entries(PRESET_DISPLAY_CONDS)) {
      for (const k of keys) {
        if (!COND_KEYS.has(k)) bad.push(`${presetKey}/${k} (PRESET_CONDS 未登録)`);
        else if (!RENDERABLE_KEYS.has(k)) bad.push(`${presetKey}/${k} (CROW_LAYOUT 未登録=描画不可)`);
      }
    }
    expect(bad, `無効/描画不可な DISPLAY_CONDS key: [${bad.join(', ')}]`).toEqual([]);
  });
});

// ── Phase C Sprint 2: セクター master の tone/tag/RS 表示の純関数 (SPEC_2026-06-27 §5・U-1/U-4) ──
describe('sector master display purity (Phase C Sprint 2・§38 事実記述)', () => {
  it('sectorTone: U-1 の 3 値 (主戦場/上位/劣後) を境界で正しく返す', () => {
    expect(sectorTone(14, 0)).toBe('hot');   // 最上位かつ正 = 主戦場
    expect(sectorTone(14, 2)).toBe('up');    // 正だが最上位でない = 上位
    expect(sectorTone(0, 0)).toBe('up');     // 対 SPY 同等 (sr=0) は最上位でも up (劣後でない)
    expect(sectorTone(3, 0)).toBe('hot');    // 最上位かつ sr>0 (小幅でも) = 主戦場
    expect(sectorTone(-1, 0)).toBe('neg');   // 負は最上位でも劣後 (色優先=赤)
    expect(sectorTone(-5, 4)).toBe('neg');
  });

  it('sectorTagJp: 静的・§38 事実記述ラベルを tone/中立帯に沿って返す (将来予測語なし)', () => {
    expect(sectorTagJp(14, 0)).toBe('相対力 トップ'); // 最上位
    expect(sectorTagJp(8, 1)).toBe('相対力 上位');    // 上位 (NEUTRAL=5 以上)
    expect(sectorTagJp(3, 1)).toBe('横ばい');         // 0<=sr<5 = 横ばい (色は up 緑のまま nuance)
    expect(sectorTagJp(0, 2)).toBe('横ばい');         // 対 SPY 同等
    expect(sectorTagJp(-2, 3)).toBe('劣後');          // 対 SPY 劣後
    // §38: 「改善中」「これから上がる」等の trend/将来予測語を一切含まない (事実記述のみ)。
    for (const [sr, rank] of [[14, 0], [8, 1], [3, 1], [0, 2], [-2, 3]]) {
      const tag = sectorTagJp(sr, rank);
      expect(tag).not.toMatch(/改善|上がる|買い|今後|これから|見込/);
    }
  });

  it('fmtSr: U-4 符号付き整数・単位無印 (+14 / -1 / 0)', () => {
    expect(fmtSr(14)).toBe('+14');
    expect(fmtSr(14.6)).toBe('+15'); // 整数丸め
    expect(fmtSr(-1)).toBe('-1');
    expect(fmtSr(0)).toBe('0');      // ゼロは無符号
    expect(fmtSr(null)).toBe('0');   // 欠損は 0 扱い (NaN を出さない)
    expect(fmtSr(undefined)).toBe('0');
  });
});

// ── Phase C Sprint 3: 「旬のセクター」master-detail 集計の純関数 + C-2 件数不変 ──
describe('buildSectorSummary count integrity (Phase C Sprint 3・C-2 不変)', () => {
  it('master 全行 count の総和 == (sector を持つ) filteredItems 数 (count==list 担保)', () => {
    // sector を持つ filteredItem は厳密に 1 bucket に入る → 総和 = filteredItems.length。
    const allItems = [
      { sector: 'Technology', sector_rs_median: 10 },
      { sector: 'Energy', sector_rs_median: 5 },
      { sector: 'Financials', sector_rs_median: -3 },
    ];
    const filtered = [
      { sector: 'Technology', ticker: 'AAA', rs_percentile: 90 },
      { sector: 'Technology', ticker: 'BBB', rs_percentile: 80 },
      { sector: 'Energy', ticker: 'CCC', rs_percentile: 70 },
      { sector: 'Energy', ticker: 'DDD', rs_percentile: 60 },
      { sector: 'Energy', ticker: 'EEE', rs_percentile: 50 }, // top3 超 → count に算入・top3 から溢れ
    ];
    const sum = buildSectorSummary(allItems, filtered).reduce((a, s) => a + s.count, 0);
    expect(sum).toBe(filtered.length); // 5 == 5
  });

  it('master = 全 universe セクター俯瞰 (劣後/好決算0 も残す) で sr 降順', () => {
    const allItems = [
      { sector: 'Technology', sector_rs_median: 10 },
      { sector: 'Financials', sector_rs_median: -3 }, // 好決算 0 = 劣後でも master に残る (U-2(b))
    ];
    const filtered = [{ sector: 'Technology', ticker: 'AAA', rs_percentile: 90 }];
    const res = buildSectorSummary(allItems, filtered);
    expect(res.map((s) => s.sn)).toEqual(['Technology', 'Financials']); // sr 降順
    expect(res[1].count).toBe(0);   // 劣後セクターは count 0 で残る
    expect(res[1].top3).toEqual([]);
  });

  it('top3 は rs_percentile 降順で最大 3 件・count はあふれを含む', () => {
    const allItems = [{ sector: 'Energy', sector_rs_median: 5 }];
    const filtered = [
      { sector: 'Energy', ticker: 'A', rs_percentile: 10 },
      { sector: 'Energy', ticker: 'B', rs_percentile: 90 },
      { sector: 'Energy', ticker: 'C', rs_percentile: 50 },
      { sector: 'Energy', ticker: 'D', rs_percentile: 70 },
    ];
    const [row] = buildSectorSummary(allItems, filtered);
    expect(row.count).toBe(4);
    expect(row.top3.map((x) => x.ticker)).toEqual(['B', 'D', 'C']); // 90,70,50
  });

  it('no-data fallback: allItems 空/null は空配列', () => {
    expect(buildSectorSummary([], [{ sector: 'X', ticker: 'Y' }])).toEqual([]);
    expect(buildSectorSummary(null, null)).toEqual([]);
  });
});

// ── 逆張り「静かな優良株」中核軸B (SPEC_2026-06-28 screener-quiet-quality-rs Sprint 1) ──
// 新述語型 cmp:'lte' (上限型 facet) と中核2軸 (RS≥ × 出来高静か≤) を機械検証。
//   件数 SSOT 規律: 既存 preset を 1 件も動かさず新 key (volume_quiet) の追加のみ。
//   count==list 整合は count も list も itemPasses 同一関数を通すことで構造保証 (Trust Cliff C-2)。
describe('quiet-quality screener Sprint 1: volume_quiet (cmp lte) 述語 + 中核2軸', () => {
  const volumeQuiet = PRESET_CONDS.find((c) => c.key === 'volume_quiet');

  it('volume_quiet cond が PRESET_CONDS に grade 型 (cmp:lte) で登録されている', () => {
    expect(volumeQuiet).toBeTruthy();
    expect(volumeQuiet.kind).toBe('grade');
    expect(volumeQuiet.facet?.cmp).toBe('lte');
    expect(volumeQuiet.facet?.field).toBe('volume_surge_pct'); // field は ≥ 型と共有・別 key
    // grades は SPEC §9 実データ較正値 (緩≤50 / 標≤20 / 厳≤0)。
    expect(volumeQuiet.facet.grades).toEqual({ loose: 50, standard: 20, strict: 0 });
  });

  it('上限型 (≤) 判定: 標準=≤20 で境界・超過・null を honest に扱う', () => {
    expect(volumeQuiet.pass({ volume_surge_pct: 10 }, 'standard')).toBe(true);    // ≤20 合致
    expect(volumeQuiet.pass({ volume_surge_pct: 20 }, 'standard')).toBe(true);    // 境界 =20 は合致
    expect(volumeQuiet.pass({ volume_surge_pct: 21 }, 'standard')).toBe(false);   // >20 除外
    expect(volumeQuiet.pass({ volume_surge_pct: -30 }, 'standard')).toBe(true);   // 出来高細り=より静か
    expect(volumeQuiet.pass({ volume_surge_pct: null }, 'standard')).toBe(false); // null=AND除外(honest)
    expect(volumeQuiet.pass({}, 'standard')).toBe(false);                         // 欠損=除外
  });

  it('厳=≤0 / 緩=≤50 が段階的に締まる (strict ⊂ standard ⊂ loose)', () => {
    expect(volumeQuiet.pass({ volume_surge_pct: 0 }, 'strict')).toBe(true);   // ≤0
    expect(volumeQuiet.pass({ volume_surge_pct: 5 }, 'strict')).toBe(false);  // >0 除外
    expect(volumeQuiet.pass({ volume_surge_pct: 45 }, 'loose')).toBe(true);   // ≤50
    expect(volumeQuiet.pass({ volume_surge_pct: 55 }, 'loose')).toBe(false);  // >50 除外
  });

  it('中核2軸 (RS≥70 × 出来高静か≤20) を itemPasses が AND で結線・count==list', () => {
    const items = [
      { ticker: 'A', rs_percentile: 80, volume_surge_pct: 10 },   // RS高 × 静か = 合致
      { ticker: 'B', rs_percentile: 80, volume_surge_pct: 35 },   // 出来高急増 = 除外
      { ticker: 'C', rs_percentile: 60, volume_surge_pct: 10 },   // RS不足 = 除外
      { ticker: 'D', rs_percentile: 90, volume_surge_pct: null }, // volume欠損 = honest除外
    ];
    // RS loose=70 (≥) × 出来高静か standard=≤20。count(list) は同一 itemPasses 経由。
    const activeGrades = { rs_percentile: 'loose', volume_quiet: 'standard' };
    const passed = items.filter((it) => itemPasses(it, activeGrades, {}));
    expect(passed.map((i) => i.ticker)).toEqual(['A']); // count==1 かつ list==['A']
  });

  it('preset key 集合は正本6 preset (S4 で market_leading 追加・以後の意図せぬ増減を検知)', () => {
    // Sprint3 で quiet_quality、S4 (2026-06-28) で market_leading を追加し正本=6 preset。
    //   本アサーションは「正本の preset 集合」を固定し、意図しない preset の増減を機械検知する。
    expect(Object.keys(PRESET_PREDICATES).sort()).toEqual(
      ['earnings_pass', 'hot_sector', 'market_leading', 'new_high_break', 'quiet_quality', 'sector_leader'].sort(),
    );
  });
});

// ── Sprint 2: accumulation vs crowding の文脈依存 gating (SPEC §5 Sprint2 / §9 重要発見) ──
// inst_qoq_calm (上限型 cmp:lte) で euphoric crowding (機関殺到) を除外。既存 ≥型 inst_holders_qoq_pct は無改変。
describe('quiet-quality screener Sprint 2: inst_qoq_calm (anti-crowding gating)', () => {
  const calm = PRESET_CONDS.find((c) => c.key === 'inst_qoq_calm');
  const instUp = PRESET_CONDS.find((c) => c.key === 'inst_holders_qoq_pct');

  it('inst_qoq_calm cond が grade 型 (cmp:lte) で登録・既存 ≥型と field 共有別 key', () => {
    expect(calm).toBeTruthy();
    expect(calm.kind).toBe('grade');
    expect(calm.facet?.cmp).toBe('lte');
    expect(calm.facet?.field).toBe('inst_holders_qoq_pct');
    expect(calm.facet.grades).toEqual({ loose: 30, standard: 20, strict: 10 });
    // 既存 ≥型 inst_holders_qoq_pct は無改変 (cmp なし・grades そのまま)。
    expect(instUp.facet?.cmp).toBeUndefined();
    expect(instUp.facet.grades).toEqual({ loose: 0, standard: 3, strict: 5 });
  });

  it('上限型 (≤) で機関殺到を除外: 標=≤20 で SNDK型(+60.8)を弾き穏当増は通す', () => {
    expect(calm.pass({ inst_holders_qoq_pct: 60.8 }, 'standard')).toBe(false); // 殺到=除外
    expect(calm.pass({ inst_holders_qoq_pct: 20 }, 'standard')).toBe(true);    // 境界
    expect(calm.pass({ inst_holders_qoq_pct: 7 }, 'standard')).toBe(true);     // 穏当増=通す
    expect(calm.pass({ inst_holders_qoq_pct: -5 }, 'standard')).toBe(true);    // 機関微減も通す(殺到でない)
    expect(calm.pass({ inst_holders_qoq_pct: null }, 'standard')).toBe(false); // null=AND除外(honest)
    expect(calm.pass({ inst_holders_qoq_pct: 5 }, 'strict')).toBe(true);       // ≤10
    expect(calm.pass({ inst_holders_qoq_pct: 15 }, 'strict')).toBe(false);     // >10 除外
  });

  it('gating の有無で件数が意味のある差 (before/after・SNDK型が除外される)', () => {
    const items = [
      { ticker: 'CALM', rs_percentile: 80, volume_surge_pct: 10, inst_holders_qoq_pct: 7 },   // 静か×穏当増 = 残る
      { ticker: 'RUSH', rs_percentile: 99, volume_surge_pct: 16, inst_holders_qoq_pct: 60.8 },// SNDK型 機関殺到 = gate で除外
    ];
    const baseGrades = { rs_percentile: 'loose', volume_quiet: 'standard' };     // Sprint1 中核2軸のみ
    const gatedGrades = { ...baseGrades, inst_qoq_calm: 'standard' };            // +Sprint2 gating
    const before = items.filter((it) => itemPasses(it, baseGrades, {}));
    const after = items.filter((it) => itemPasses(it, gatedGrades, {}));
    expect(before.map((i) => i.ticker)).toEqual(['CALM', 'RUSH']); // gating なし=両方
    expect(after.map((i) => i.ticker)).toEqual(['CALM']);          // gating あり=殺到除外 (意味ある差)
  });
});

// ── Sprint 3: quiet_quality preset (screener_v2) — 5軸結線 + 件数 SSOT + 隠れフィルタなし ──
// thesis 型マッピング (件数 gate1 確定 2026-06-28 = Option A・緩48/標28/厳11):
//   RS / ROE は床固定 (loose)、出来高静か / 機関殺到なし は精度連動 (auto)、CF創出力 は緩loose/標厳standard。
//   標準 = RS≥70 × vol≤20 × inst≤20 × CF≥15 × ROE≥17 = universe 2552 で 28 件 (本番 ground-truth)。
describe('quiet-quality screener Sprint 3: quiet_quality preset (5軸・thesis型マッピング)', () => {
  it('PRESET_PREDICATES.quiet_quality が 5軸 grade + gate なし (extra 空) で登録', () => {
    const cfg = PRESET_PREDICATES.quiet_quality;
    expect(cfg).toBeTruthy();
    expect(Object.keys(cfg.grades).sort()).toEqual(
      ['inst_qoq_calm', 'ocf_margin_pct', 'roe', 'rs_percentile', 'volume_quiet'].sort(),
    );
    expect(cfg.extra).toEqual({}); // gate / 次元フィルタなし
    // thesis 型: RS/ROE は床固定 (loose 文字列)、中核2軸は auto、CF は段階別。
    expect(cfg.grades.rs_percentile).toBe('loose');
    expect(cfg.grades.roe).toBe('loose');
    expect(cfg.grades.volume_quiet).toBe('auto');
    expect(cfg.grades.inst_qoq_calm).toBe('auto');
    expect(cfg.grades.ocf_margin_pct).toEqual({ loose: 'loose', standard: 'standard', strict: 'standard' });
  });

  it('buildActiveGrades: 精度3段で正しい level map を生成 (RS/ROE床固定・中核2軸が逓減)', () => {
    expect(buildActiveGrades('quiet_quality', 'loose', {})).toEqual({
      rs_percentile: 'loose', volume_quiet: 'loose', inst_qoq_calm: 'loose', ocf_margin_pct: 'loose', roe: 'loose',
    });
    expect(buildActiveGrades('quiet_quality', 'standard', {})).toEqual({
      rs_percentile: 'loose', volume_quiet: 'standard', inst_qoq_calm: 'standard', ocf_margin_pct: 'standard', roe: 'loose',
    });
    expect(buildActiveGrades('quiet_quality', 'strict', {})).toEqual({
      rs_percentile: 'loose', volume_quiet: 'strict', inst_qoq_calm: 'strict', ocf_margin_pct: 'standard', roe: 'loose',
    });
  });

  it('5軸 AND を itemPasses が標準精度で正しく結線 (RS≥70 × vol≤20 × inst≤20 × CF≥15 × ROE≥17)', () => {
    const g = buildActiveGrades('quiet_quality', 'standard', {});
    const items = [
      { ticker: 'OK',    rs_percentile: 72, volume_surge_pct: 8,  inst_holders_qoq_pct: 5,  ocf_margin_pct: 22, roe: 19 }, // 全軸合致
      { ticker: 'LOWRS', rs_percentile: 65, volume_surge_pct: 8,  inst_holders_qoq_pct: 5,  ocf_margin_pct: 22, roe: 19 }, // RS<70 除外
      { ticker: 'LOUD',  rs_percentile: 80, volume_surge_pct: 40, inst_holders_qoq_pct: 5,  ocf_margin_pct: 22, roe: 19 }, // 出来高急増 除外
      { ticker: 'RUSH',  rs_percentile: 90, volume_surge_pct: 8,  inst_holders_qoq_pct: 55, ocf_margin_pct: 22, roe: 19 }, // 機関殺到 除外
      { ticker: 'LOWCF', rs_percentile: 80, volume_surge_pct: 8,  inst_holders_qoq_pct: 5,  ocf_margin_pct: 10, roe: 19 }, // CF<15 除外
      { ticker: 'LOWROE',rs_percentile: 80, volume_surge_pct: 8,  inst_holders_qoq_pct: 5,  ocf_margin_pct: 22, roe: 12 }, // ROE<17 除外
      { ticker: 'NULLCF',rs_percentile: 80, volume_surge_pct: 8,  inst_holders_qoq_pct: 5,  ocf_margin_pct: null, roe: 19 }, // CF欠損=honest除外
    ];
    const passed = items.filter((it) => itemPasses(it, g, {}));
    expect(passed.map((i) => i.ticker)).toEqual(['OK']); // count==1 かつ list==['OK']
  });

  it('PRESET_DISPLAY_CONDS.quiet_quality = 述語適用5軸 + uptrend/overheat_excl opt-in override (隠れフィルタなし)', () => {
    // 述語適用5軸は上の hidden-filter invariant が自動走査。uptrend (A軸)/overheat_excl (B軸・2026-07-02) は
    //   default OFF の opt-in override (PRESET_PREDICATES 非登録) で display には載るが未適用時は AND 不参加
    //   = applied ⊆ display を壊さない (cold-start 安全・ゼロ回帰)。
    expect(PRESET_DISPLAY_CONDS.quiet_quality.sort()).toEqual(
      ['inst_qoq_calm', 'ocf_margin_pct', 'overheat_excl', 'roe', 'rs_percentile', 'uptrend', 'volume_quiet'].sort(),
    );
  });

  it('volume_quiet / inst_qoq_calm が CROW_LAYOUT に登録済 (DISPLAY_CONDS が描画可能)', () => {
    const renderable = new Set(CROW_LAYOUT.flatMap((g) => g.keys));
    expect(renderable.has('volume_quiet')).toBe(true);   // タイミング群
    expect(renderable.has('inst_qoq_calm')).toBe(true);  // 需給群
  });

  it('既存4 preset の grades は無改変 (quiet_quality 追加が他 preset の件数 SSOT を動かさない)', () => {
    expect(PRESET_PREDICATES.earnings_pass.grades).toEqual({ eps_yoy_pct: 'auto', roe: 'auto', rs_percentile: 'auto', ocf_margin_pct: 'auto' });
    expect(PRESET_PREDICATES.hot_sector.grades).toEqual({ eps_yoy_pct: 'auto', eps_cagr_3y: 'auto', roe: 'auto', rs_percentile: 'auto' });
    // new_high_break / sector_leader は object 段階マッピングをそのまま固定。
    expect(PRESET_PREDICATES.new_high_break.grades.rs_percentile).toEqual({ loose: 'standard', standard: 'standard', strict: 'strict' });
    expect(PRESET_PREDICATES.sector_leader.grades.inst_holders_qoq_pct).toBe('loose');
  });
});

// ── 上昇トレンドフィルタ (A軸) — pv50/sl50 compound facet + quiet_quality opt-in override + 件数 SSOT ──
// SPEC_2026-07-02 screener-uptrend-filter。「静かな強さ」の落ちるナイフ/下降トレンド汚染 (PBR 等) を除外。
//   4段: 緩 pv50≥−8 / 標 pv50≥−3 / 厳 pv50≥0∧sl50≥−2 / 最厳 pv50≥0∧sl50≥+1。null=AND除外 (honest)。
//   default OFF (PRESET_PREDICATES 非登録) = cold-start 安全・ゼロ回帰。ON は override 経由で activeGrades に算入。
describe('uptrend filter (A軸): pv50/sl50 compound + quiet_quality/market_leading opt-in override', () => {
  const UP = PRESET_CONDS.find((c) => c.key === 'uptrend');

  it('uptrend cond が grade 型で PRESET_CONDS に登録・grades と annotMap が確定値', () => {
    expect(UP).toBeTruthy();
    expect(UP.kind).toBe('grade');
    expect(UP.facet.field).toBe('pv50');
    expect(UP.facet.grades).toEqual({ loose: -8, standard: -3, strict: 0, severe: 0 });
    // 厳/最厳は pv50 閾値が同値 (0) のため annotMap で sl50 gate の差を明示 (mseg 重複表示回避)。
    expect(UP.facet.annotMap.strict).not.toBe(UP.facet.annotMap.severe);
  });

  it('default OFF: PRESET_PREDICATES.quiet_quality に uptrend が無い (cold-start 安全・ゼロ回帰)', () => {
    expect(Object.keys(PRESET_PREDICATES.quiet_quality.grades)).not.toContain('uptrend');
    // override 未指定なら activeGrades に uptrend が出ない = 既存 quiet_quality 挙動と完全一致。
    expect(buildActiveGrades('quiet_quality', 'standard', {})).not.toHaveProperty('uptrend');
  });

  it('compound pass: pv50 下限 + 厳/最厳の sl50 gate + null 除外を honest に判定', () => {
    const p = (pv50, sl50, lvl) => UP.pass({ pv50, sl50 }, lvl);
    // 緩 pv50≥−8 (sl50 無関係)
    expect(p(-8, -99, 'loose')).toBe(true);
    expect(p(-8.1, 5, 'loose')).toBe(false);
    // 標 pv50≥−3
    expect(p(-3, -99, 'standard')).toBe(true);
    expect(p(-3.1, 5, 'standard')).toBe(false);
    // 厳 pv50≥0 ∧ sl50≥−2
    expect(p(0, -2, 'strict')).toBe(true);
    expect(p(0, -2.1, 'strict')).toBe(false);   // sl50 gate で除外
    expect(p(-0.1, 5, 'strict')).toBe(false);   // pv50 gate で除外
    // 最厳 pv50≥0 ∧ sl50≥+1
    expect(p(1, 1, 'severe')).toBe(true);
    expect(p(1, 0.9, 'severe')).toBe(false);
    // null = AND 除外 (測定外・nightly scan 前/履歴不足)
    expect(p(null, 5, 'loose')).toBe(false);
    expect(UP.pass({ pv50: 5, sl50: null }, 'strict')).toBe(false); // 厳で sl50 null → 除外
  });

  it('count==list: quiet_quality[標準] base + uptrend override 各段で単調逓減・list=count', () => {
    // core 5軸を全通過させ pv50/sl50 のみ変える fixture (uptrend の切り分けを純粋化)。
    const core = { rs_percentile: 80, volume_surge_pct: 8, inst_holders_qoq_pct: 5, ocf_margin_pct: 22, roe: 19 };
    const items = [
      { ticker: 'STRONG',   ...core, pv50: 5,    sl50: 3  }, // 全段通過
      { ticker: 'FLAT',     ...core, pv50: 1,    sl50: -1 }, // 緩/標/厳○・最厳✗(sl50<1)
      { ticker: 'MILDDOWN', ...core, pv50: -3,   sl50: -5 }, // 緩/標○・厳✗(pv50<0)
      { ticker: 'EDGE8',    ...core, pv50: -8,   sl50: -3 }, // 緩○・標✗(pv50<-3)
      { ticker: 'KNIFE',    ...core, pv50: -10,  sl50: -8 }, // PBR型・全段✗
      { ticker: 'NULLPV',   ...core, pv50: null, sl50: null }, // 測定外・全段✗
    ];
    const expected = {
      loose:    ['STRONG', 'FLAT', 'MILDDOWN', 'EDGE8'],
      standard: ['STRONG', 'FLAT', 'MILDDOWN'],
      strict:   ['STRONG', 'FLAT'],
      severe:   ['STRONG'],
    };
    let prevLen = items.length; // OFF (uptrend 未適用) = 全 6 件
    const offGrades = buildActiveGrades('quiet_quality', 'standard', {});
    expect(items.filter((it) => itemPasses(it, offGrades, {})).length).toBe(6);
    for (const lvl of ['loose', 'standard', 'strict', 'severe']) {
      const g = buildActiveGrades('quiet_quality', 'standard', { uptrend: lvl });
      const list = items.filter((it) => itemPasses(it, g, {}));
      const count = list.length; // count も list も同一 itemPasses 経由 = 構造的に count==list
      expect(list.map((i) => i.ticker).sort()).toEqual(expected[lvl].sort());
      expect(count).toBe(expected[lvl].length);
      expect(count).toBeLessThanOrEqual(prevLen); // 単調逓減 (severe ⊆ strict ⊆ standard ⊆ loose ⊆ OFF)
      prevLen = count;
    }
  });

  it('uptrend が CROW_LAYOUT に登録済 (DISPLAY_CONDS.quiet_quality/market_leading が描画可能)', () => {
    const renderable = new Set(CROW_LAYOUT.flatMap((g) => g.keys));
    expect(renderable.has('uptrend')).toBe(true);
  });

  // ── market_leading への再利用 (2026-07-02 追記・user 指摘) ──
  // rs_mid_band (RS中位帯) / vs_spy (6ヶ月対SPY超過) はトレーリング指標のため、数ヶ月前に急騰しその後
  //   下降トレンドに転じた銘柄でも 6ヶ月窓の超過リターンはプラスのまま残り得る (quiet_quality の RS
  //   高止まりと同型リスク)。同じ uptrend facet を market_leading にも opt-in override として再利用する。
  it('default OFF: PRESET_PREDICATES.market_leading に uptrend が無い (cold-start 安全・ゼロ回帰)', () => {
    expect(Object.keys(PRESET_PREDICATES.market_leading.grades)).not.toContain('uptrend');
    expect(buildActiveGrades('market_leading', 'standard', {})).not.toHaveProperty('uptrend');
  });

  it('count==list: market_leading の6条件母集団 + uptrend override 各段で単調逓減・list=count', () => {
    // market_leading の6条件 (rs_mid_band/vs_spy/ocf_margin_pct/roe_lenient/eps_yoy_mid + beatOnly gate)
    // を全通過させ pv50/sl50 のみ変える fixture (uptrend の切り分けを純粋化)。
    const core = {
      rs_percentile: 60, rs_vs_spy_pct: 10, ocf_margin_pct: 12, roe: 15, eps_yoy_pct: 12, latest_beat: true,
    };
    const items = [
      { ticker: 'STRONG',   ...core, pv50: 5,    sl50: 3  }, // 全段通過
      { ticker: 'FLAT',     ...core, pv50: 1,    sl50: -1 }, // 緩/標/厳○・最厳✗(sl50<1)
      { ticker: 'MILDDOWN', ...core, pv50: -3,   sl50: -5 }, // 緩/標○・厳✗(pv50<0)
      { ticker: 'KNIFE',    ...core, pv50: -10,  sl50: -8 }, // 落ちるナイフ・全段✗
      { ticker: 'NULLPV',   ...core, pv50: null, sl50: null }, // 測定外・全段✗
    ];
    const expected = {
      loose: ['STRONG', 'FLAT', 'MILDDOWN'], standard: ['STRONG', 'FLAT', 'MILDDOWN'],
      strict: ['STRONG', 'FLAT'], severe: ['STRONG'],
    };
    const offGrades = buildActiveGrades('market_leading', 'standard', {});
    expect(items.filter((it) => itemPasses(it, offGrades, { beatOnly: true })).length).toBe(5); // OFF=全件
    let prevLen = items.length;
    for (const lvl of ['loose', 'standard', 'strict', 'severe']) {
      const g = buildActiveGrades('market_leading', 'standard', { uptrend: lvl });
      const list = items.filter((it) => itemPasses(it, g, { beatOnly: true }));
      expect(list.map((i) => i.ticker).sort()).toEqual(expected[lvl].sort());
      expect(list.length).toBeLessThanOrEqual(prevLen); // 単調逓減
      prevLen = list.length;
    }
  });
});

// ── 過熱除外フィルタ (B軸) — dd60/runup60 compound facet + quiet_quality/market_leading opt-in override ──
// SPEC_2026-07-02_screener-overheat-exclusion-b-axis.md。Sprint 1 実データ較正 (2026-07-02, 本番118銘柄)
// で確定した4段階閾値グリッド: 除外条件 = dd60 < X かつ runup60 >= Y。
//   緩 dd60<-20&&ru>=140 / 標準 dd60<-16&&ru>=140 / 厳 dd60<-14&&ru>=140(known cohort全捕捉) / 最厳 dd60<-12&&ru>=80。
// default OFF (PRESET_PREDICATES 非登録) = cold-start 安全・ゼロ回帰。null (dd60/runup60 測定外) = AND 除外 (honest)。
describe('overheat exclusion filter (B軸): dd60/runup60 compound + quiet_quality/market_leading opt-in override', () => {
  const OE = PRESET_CONDS.find((c) => c.key === 'overheat_excl');

  it('overheat_excl cond が grade 型で PRESET_CONDS に登録・grades(dd60閾値) と annotMap が確定値', () => {
    expect(OE).toBeTruthy();
    expect(OE.kind).toBe('grade');
    expect(OE.facet.field).toBe('dd60');
    expect(OE.facet.grades).toEqual({ loose: -20, standard: -16, strict: -14, severe: -12 });
  });

  it('default OFF: PRESET_PREDICATES.{quiet_quality,market_leading} に overheat_excl が無い (cold-start 安全・ゼロ回帰)', () => {
    expect(Object.keys(PRESET_PREDICATES.quiet_quality.grades)).not.toContain('overheat_excl');
    expect(Object.keys(PRESET_PREDICATES.market_leading.grades)).not.toContain('overheat_excl');
    expect(buildActiveGrades('quiet_quality', 'standard', {})).not.toHaveProperty('overheat_excl');
    expect(buildActiveGrades('market_leading', 'standard', {})).not.toHaveProperty('overheat_excl');
  });

  it('compound pass: dd60/runup60 の AND 除外 + null 除外を honest に判定 (Sprint 1 較正済み閾値)', () => {
    const p = (dd60, runup60, lvl) => OE.pass({ dd60, runup60 }, lvl);
    // 緩 dd60<-20 かつ runup60>=140
    expect(p(-20.1, 140, 'loose')).toBe(false);  // 除外 (両方満たす)
    expect(p(-19.9, 140, 'loose')).toBe(true);   // dd60 が閾値未満まで届かず温存
    expect(p(-20.1, 139.9, 'loose')).toBe(true); // runup60 が閾値未満で温存
    // 標準 dd60<-16 かつ runup60>=140
    expect(p(-16.1, 140, 'standard')).toBe(false);
    // 厳 dd60<-14 かつ runup60>=140 (known B-cohort 全捕捉の閾値)
    expect(p(-14.94, 277.12, 'strict')).toBe(false); // MU 実測値
    expect(p(-21.86, 159.99, 'strict')).toBe(false); // STRL 実測値
    expect(p(-16.35, 201.86, 'strict')).toBe(false); // STX 実測値
    expect(p(-19.81, 196.51, 'strict')).toBe(false); // WDC 実測値
    // 最厳 dd60<-12 かつ runup60>=80
    expect(p(-12.1, 80, 'severe')).toBe(false);
    // 健全な深い調整 (急騰なし) は runup60 条件で温存される (APA 型: dd深いがrunup低い)
    expect(p(-25.81, 72.39, 'strict')).toBe(true);  // APA 実測値相当・厳でも温存
    // 健全な強い株 (まだ崩れていない) は dd60 条件で温存される (ALAB 型: runup巨大だがdd浅い)
    expect(p(-10.8, 312.34, 'strict')).toBe(true);  // ALAB 実測値相当・厳でも温存
    // null = AND 除外 (測定外・honest、A軸と同じ規約)
    expect(p(null, 200, 'loose')).toBe(false);
    expect(p(-20, null, 'loose')).toBe(false);
  });

  it('count==list: quiet_quality[標準]相当の母集団 + overheat_excl override 各段で単調逓減・list=count', () => {
    const core = { rs_percentile: 80, volume_surge_pct: 8, inst_holders_qoq_pct: 5, ocf_margin_pct: 22, roe: 19 };
    const items = [
      { ticker: 'HEALTHY',  ...core, dd60: -2,    runup60: 15  },  // 健全・全段温存
      { ticker: 'APA_TYPE', ...core, dd60: -25.8, runup60: 72.4 }, // 深い調整だが急騰なし・全段温存
      { ticker: 'ALAB_TYPE',...core, dd60: -10.8, runup60: 312.3}, // 巨大急騰だがまだ崩れず・全段温存
      { ticker: 'MU',       ...core, dd60: -14.94,runup60: 277.1}, // known cohort・厳/最厳で除外
      { ticker: 'STRL',     ...core, dd60: -21.86,runup60: 160.0}, // known cohort・緩から除外
      { ticker: 'NULLDATA', ...core, dd60: null,  runup60: null }, // 測定外・全段除外(honest)
    ];
    const expected = {
      loose:    ['HEALTHY', 'APA_TYPE', 'ALAB_TYPE', 'MU'],
      standard: ['HEALTHY', 'APA_TYPE', 'ALAB_TYPE', 'MU'],
      strict:   ['HEALTHY', 'APA_TYPE', 'ALAB_TYPE'],
      severe:   ['HEALTHY', 'APA_TYPE', 'ALAB_TYPE'],
    };
    const offGrades = buildActiveGrades('quiet_quality', 'standard', {});
    expect(items.filter((it) => itemPasses(it, offGrades, {})).length).toBe(6); // OFF = 全件 (NULLDATA含む・非適用)
    let prevLen = items.length;
    for (const lvl of ['loose', 'standard', 'strict', 'severe']) {
      const g = buildActiveGrades('quiet_quality', 'standard', { overheat_excl: lvl });
      const list = items.filter((it) => itemPasses(it, g, {}));
      expect(list.map((i) => i.ticker).sort()).toEqual(expected[lvl].sort());
      expect(list.length).toBeLessThanOrEqual(prevLen); // 単調逓減
      prevLen = list.length;
    }
  });

  it('count==list: market_leading[標準]相当の母集団でも同様に override 適用可能', () => {
    const core = {
      rs_percentile: 60, rs_vs_spy_pct: 10, ocf_margin_pct: 12, roe: 15, eps_yoy_pct: 12, latest_beat: true,
    };
    const items = [
      { ticker: 'HEALTHY', ...core, dd60: -2,     runup60: 15   },
      { ticker: 'MU',      ...core, dd60: -14.94, runup60: 277.1 },
    ];
    const offGrades = buildActiveGrades('market_leading', 'standard', {});
    expect(items.filter((it) => itemPasses(it, offGrades, { beatOnly: true })).length).toBe(2); // OFF = 全件
    const strictGrades = buildActiveGrades('market_leading', 'standard', { overheat_excl: 'strict' });
    const strictList = items.filter((it) => itemPasses(it, strictGrades, { beatOnly: true }));
    expect(strictList.map((i) => i.ticker)).toEqual(['HEALTHY']);
  });

  it('overheat_excl が CROW_LAYOUT に登録済 (DISPLAY_CONDS.quiet_quality/market_leading が描画可能)', () => {
    const renderable = new Set(CROW_LAYOUT.flatMap((g) => g.keys));
    expect(renderable.has('overheat_excl')).toBe(true);
  });
});

// ── S4: market_leading preset (screener_v2) — 4段精度 + 範囲帯/null許容 + 件数 SSOT + 隠れフィルタなし ──
// 本番 universe 2553 で実測 (≥規約): 緩75 / 標59 / 厳38 / 最厳28。全段 DAL/MAR/HLT 包含・H/KYIV 除外。
//   rs_mid_band/vs_spy は 2段定義 (緩/標) を auto+clamp で 4段に展開 (厳・最厳は standard 寄り)。
//   roe_lenient/eps_yoy_mid は object マッピングで段階逓減。最厳の絞りレバー = roe_lenient≥20 (severe='strict')。
describe('market-leading screener S4: market_leading preset (4段精度・範囲帯/null許容)', () => {
  it('PRESET_PREDICATES.market_leading が 5軸 grade + beatOnly gate で登録', () => {
    const cfg = PRESET_PREDICATES.market_leading;
    expect(cfg).toBeTruthy();
    expect(Object.keys(cfg.grades).sort()).toEqual(
      ['eps_yoy_mid', 'ocf_margin_pct', 'roe_lenient', 'rs_mid_band', 'vs_spy'].sort(),
    );
    expect(cfg.extra).toEqual({ beatOnly: true }); // 直近決算ビート gate
  });

  it('精度4段 (緩/標/厳/最厳)。market_leading のみ severe を持つ (他 preset / custom は3段)', () => {
    expect(presetPrecisionLevels('market_leading')).toEqual(['loose', 'standard', 'strict', 'severe']);
    expect(presetPrecisionLevels('earnings_pass')).toEqual(['loose', 'standard', 'strict']);
    expect(presetPrecisionLevels(null)).toEqual(['loose', 'standard', 'strict']);
  });

  it('buildActiveGrades: 4段で正しい level map (rs/vs_spy は clamp で標準寄り・roe/eps が逓減)', () => {
    expect(buildActiveGrades('market_leading', 'loose', {})).toEqual({
      rs_mid_band: 'loose', vs_spy: 'loose', ocf_margin_pct: 'loose', roe_lenient: 'loose', eps_yoy_mid: 'loose',
    });
    expect(buildActiveGrades('market_leading', 'standard', {})).toEqual({
      rs_mid_band: 'standard', vs_spy: 'standard', ocf_margin_pct: 'loose', roe_lenient: 'loose', eps_yoy_mid: 'loose',
    });
    expect(buildActiveGrades('market_leading', 'strict', {})).toEqual({
      rs_mid_band: 'standard', vs_spy: 'standard', ocf_margin_pct: 'loose', roe_lenient: 'standard', eps_yoy_mid: 'standard',
    });
    expect(buildActiveGrades('market_leading', 'severe', {})).toEqual({
      rs_mid_band: 'standard', vs_spy: 'standard', ocf_margin_pct: 'loose', roe_lenient: 'strict', eps_yoy_mid: 'standard',
    });
  });

  it('rs_mid_band: 範囲 [下限, 75]。上限超過/下限未満/null を除外 (隠れ上限を pass で適用)', () => {
    const c = PRESET_CONDS.find((x) => x.key === 'rs_mid_band');
    expect(c.facet.bandMax).toBe(75);
    expect(c.pass({ rs_percentile: 55 }, 'standard')).toBe(true);  // 下限境界
    expect(c.pass({ rs_percentile: 75 }, 'standard')).toBe(true);  // 上限境界
    expect(c.pass({ rs_percentile: 76 }, 'standard')).toBe(false); // 上限超過=除外 (高RS完成株)
    expect(c.pass({ rs_percentile: 54 }, 'standard')).toBe(false); // 下限未満=除外
    expect(c.pass({ rs_percentile: 45 }, 'loose')).toBe(true);     // 緩は下限45
    expect(c.pass({ rs_percentile: 44 }, 'loose')).toBe(false);
    expect(c.pass({ rs_percentile: null }, 'standard')).toBe(false); // null=AND除外(honest)
  });

  it('roe_lenient: null 許容 (株主資本マイナス=MAR/HLT 救済)・値ありは ≥ 閾値', () => {
    // cond.pass は facet の grade level (loose=10/standard=15/strict=20) を受ける。
    //   preset 精度→level は buildActiveGrades が解決 (標準精度→'loose'=10 / 最厳→'strict'=20)。
    const c = PRESET_CONDS.find((x) => x.key === 'roe_lenient');
    expect(c.facet.grades).toEqual({ loose: 10, standard: 15, strict: 20 });
    expect(c.pass({ roe: null }, 'loose')).toBe(true);  // null=許容 (AND除外しない)
    expect(c.pass({ roe: 10 }, 'loose')).toBe(true);    // ≥10 (loose level=標準精度)
    expect(c.pass({ roe: 9 }, 'loose')).toBe(false);    // <10 除外
    expect(c.pass({ roe: 20 }, 'strict')).toBe(true);   // strict level=20 (最厳精度)
    expect(c.pass({ roe: 19 }, 'strict')).toBe(false);  // <20 除外
    expect(c.pass({ roe: null }, 'strict')).toBe(true); // 最厳でも null は許容 (MAR/HLT 残存)
  });

  it('6軸 AND を itemPasses が標準精度で正しく結線 (MAR型 合致・各軸欠落で除外)', () => {
    const g = buildActiveGrades('market_leading', 'standard', {});
    const extra = PRESET_PREDICATES.market_leading.extra; // { beatOnly: true }
    const base = { rs_percentile: 64, rs_vs_spy_pct: 14, ocf_margin_pct: 13, roe: null, eps_yoy_pct: 17, latest_beat: true };
    const items = [
      { ticker: 'OK',     ...base },                       // 全軸合致 (MAR型: roe null 許容)
      { ticker: 'HIRS',   ...base, rs_percentile: 80 },    // RS>75 (高RS完成株) 除外
      { ticker: 'LORS',   ...base, rs_percentile: 50 },    // RS<55 除外
      { ticker: 'LOSPY',  ...base, rs_vs_spy_pct: 5 },     // vsSPY<8 除外
      { ticker: 'LOCF',   ...base, ocf_margin_pct: 8 },    // ocf<10 除外
      { ticker: 'LOEPS',  ...base, eps_yoy_pct: 5 },       // eps<10 除外
      { ticker: 'MISS',   ...base, latest_beat: false },   // 決算ミス=gate除外
      { ticker: 'NOEPS',  ...base, eps_yoy_pct: null },    // eps null=AND除外(honest)
    ];
    const passed = items.filter((it) => itemPasses(it, g, extra));
    expect(passed.map((i) => i.ticker)).toEqual(['OK']); // count==1 かつ list==['OK']
  });

  it('PRESET_DISPLAY_CONDS.market_leading = 述語適用6条件 + uptrend/overheat_excl opt-in override (隠れフィルタなし)', () => {
    // uptrend (A軸)/overheat_excl (B軸・2026-07-02 追記): quiet_quality と同じ opt-in override
    //   (default OFF・PRESET_PREDICATES 非登録) のため applied ⊆ display を壊さない。
    expect(PRESET_DISPLAY_CONDS.market_leading.sort()).toEqual(
      ['rs_mid_band', 'vs_spy', 'ocf_margin_pct', 'roe_lenient', 'eps_yoy_mid', 'latest_beat', 'uptrend', 'overheat_excl'].sort(),
    );
  });

  it('新 facet が CROW_LAYOUT に登録済 (DISPLAY_CONDS が描画可能)', () => {
    const renderable = new Set(CROW_LAYOUT.flatMap((g) => g.keys));
    for (const k of ['rs_mid_band', 'vs_spy', 'roe_lenient', 'eps_yoy_mid']) {
      expect(renderable.has(k), `${k} が CROW_LAYOUT 未登録`).toBe(true);
    }
  });

  it('既存5 preset の grades は無改変 (market_leading 追加が他 preset の件数 SSOT を動かさない)', () => {
    expect(PRESET_PREDICATES.earnings_pass.grades).toEqual({ eps_yoy_pct: 'auto', roe: 'auto', rs_percentile: 'auto', ocf_margin_pct: 'auto' });
    expect(PRESET_PREDICATES.quiet_quality.grades.rs_percentile).toBe('loose');
    expect(PRESET_PREDICATES.new_high_break.grades.rs_percentile).toEqual({ loose: 'standard', standard: 'standard', strict: 'strict' });
    expect(PRESET_PREDICATES.sector_leader.grades.inst_holders_qoq_pct).toBe('loose');
  });
});
