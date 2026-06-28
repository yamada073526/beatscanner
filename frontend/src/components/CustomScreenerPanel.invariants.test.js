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

  it('preset key 集合は正本5 preset (Sprint3 で quiet_quality 追加・以後の意図せぬ増減を検知)', () => {
    // Sprint1+2 は facet/cond のみ追加 (preset 不変=4) だったが、Sprint3 で quiet_quality を 1 件追加。
    //   本アサーションは「正本の preset 集合」を固定し、意図しない preset の増減を機械検知する。
    expect(Object.keys(PRESET_PREDICATES).sort()).toEqual(
      ['earnings_pass', 'hot_sector', 'new_high_break', 'quiet_quality', 'sector_leader'].sort(),
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

  it('PRESET_DISPLAY_CONDS.quiet_quality = 述語適用5軸と 1:1 (隠れフィルタなし)', () => {
    // 上の hidden-filter invariant が自動走査するが、5軸の明示固定で回帰を二重ガード。
    expect(PRESET_DISPLAY_CONDS.quiet_quality.sort()).toEqual(
      ['inst_qoq_calm', 'ocf_margin_pct', 'roe', 'rs_percentile', 'volume_quiet'].sort(),
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
