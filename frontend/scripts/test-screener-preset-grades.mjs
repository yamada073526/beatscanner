// Offline 検証 (egress policy で本番 curl / snap 不可のため): C案 (SPEC_2026-06-25)
// の exported 純関数 (itemPasses / buildActiveGrades / countPreset / PRESET_PREDICATES) を
// 合成 universe で検証。最重要は count==list (Trust Cliff C-2) の不変条件。
// 使い捨て: node scripts/test-screener-preset-grades.mjs
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '../src/components/CustomScreenerPanel.jsx');
const out = join(here, '../.visual/_csp-bundle.mjs');

// React 等を含めてバンドル (純関数のみ呼ぶので component は評価されない)。
await build({
  entryPoints: [src],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  jsx: 'automatic',
  logLevel: 'error',
  external: [],
});

const mod = await import(pathToFileURL(out).href);
const { itemPasses, buildActiveGrades, countPreset, PRESET_PREDICATES, topSectorsByRs } = mod;

let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };

// ─── 合成 universe (各 preset の境界を踏む銘柄を意図的に混在) ───────────────
// rs_percentile, eps_yoy_pct, eps_cagr_3y, roe を独立に振り、暗黙 grade の影響を可視化。
const items = [];
let id = 0;
const SECTORS = ['半導体', '金融', '通信', '公益'];
for (const rs of [60, 75, 85, 95]) {
  for (const eps of [10, 30]) {           // eps_yoy_pct (<25 / >=25)
    for (const cagr of [10, 30]) {         // eps_cagr_3y (<25 / >=25)
      for (const roe of [10, 30]) {        // roe (<25 / >=25)
        id++;
        const sec = SECTORS[id % SECTORS.length];
        items.push({
          ticker: `T${id}`, sector: sec, mcap_band: id % 2 ? 'mega' : 'mid',
          sector_rs_median: { '半導体': 14, '金融': 6, '通信': 4, '公益': 3 }[sec],
          rs_percentile: rs, eps_yoy_pct: eps, eps_cagr_3y: cagr, roe,
          volume_surge_pct: id % 3 === 0 ? 50 : (id % 3 === 1 ? 10 : null),
          inst_holders_qoq_pct: id % 4 === 0 ? 5 : (id % 4 === 1 ? -2 : null),
          funda_pass: id % 2 === 0,
          ocf_margin_pct: id % 2 === 0 ? 20 : 5,
          ocf_gt_netincome: id % 3 !== 0,
          is_sector_rs_leader: rs >= 85,
          latest_beat: id % 2 === 0 ? true : (id % 3 === 0 ? null : false),
          pivot_distance_pct: id % 5 === 0 ? 3 : null,
          is_new_52w_high: id % 5 === 0,
          cup_state: null, ad_volume_ratio: null,
        });
      }
    }
  }
}
console.log(`合成 items: ${items.length} 件\n`);

// ── 検証1: count==list parity (C-2 核) — countPreset と手動 itemPasses が一致 ──
for (const key of Object.keys(PRESET_PREDICATES)) {
  const cfg = PRESET_PREDICATES[key];
  const grades = buildActiveGrades('standard', {}, cfg.grades);
  let extra = { ...cfg.extra };
  if (key === 'hot_sector') extra = { ...cfg.extra, sectors: topSectorsByRs(items, cfg.sectorTopN ?? 5) };
  const listCount = items.filter((it) => itemPasses(it, grades, extra)).length;
  const tileCount = countPreset(items, key);
  ok(`count==list [${key}]`, tileCount === listCount, `tile=${tileCount} list=${listCount}`);
}

// ── 検証2: new_high_break が eps_yoy/eps_cagr/roe を暗黙適用しない (§0 fix) ──
const nhbGrades = buildActiveGrades('standard', {}, PRESET_PREDICATES.new_high_break.grades);
ok('new_high_break grades に eps_yoy 不在', nhbGrades.eps_yoy_pct === undefined);
ok('new_high_break grades に eps_cagr 不在', nhbGrades.eps_cagr_3y === undefined);
ok('new_high_break grades に roe 不在', nhbGrades.roe === undefined);
ok('new_high_break grades に rs_percentile 在', nhbGrades.rs_percentile != null, `=${nhbGrades.rs_percentile}`);

// ── 検証3: earnings_pass は従来通り全 core grade (回帰なし) ──
const epGrades = buildActiveGrades('standard', {}, PRESET_PREDICATES.earnings_pass.grades);
ok('earnings_pass grades = 全 core 4',
  ['eps_yoy_pct','eps_cagr_3y','roe','rs_percentile'].every((k) => epGrades[k] != null));

// ── 検証4: hidden grade 除去で new_high_break が旧実装より緩む (hero=0 改善方向) ──
const PRESET_CORE = ['eps_yoy_pct','eps_cagr_3y','roe','rs_percentile'];
const oldGrades = buildActiveGrades('standard', {}, PRESET_CORE);          // 旧: 全 core 暗黙適用
const newGrades = buildActiveGrades('standard', {}, PRESET_PREDICATES.new_high_break.grades);
const nhbExtra = { ...PRESET_PREDICATES.new_high_break.extra };
const oldN = items.filter((it) => itemPasses(it, oldGrades, nhbExtra)).length;
const newN = items.filter((it) => itemPasses(it, newGrades, nhbExtra)).length;
ok('new_high_break: 新 >= 旧 (暗黙 grade 除去で緩む)', newN >= oldN, `旧=${oldN} 新=${newN}`);

// ── 検証5: 表示 crow = 適用 grade 1:1 (grades ⊆ display) ──
const PRESET_DISPLAY = {
  earnings_pass:  ['eps_yoy_pct','eps_cagr_3y','ocf_margin_pct','ocf_gt_netincome','roe','rs_percentile','eps_3y_rising','rev_3y_rising','cfps_3y_rising'],
  new_high_break: ['latest_beat','buy_zone','new_high_52w','cup','volume_surge_pct','rs_percentile'],
  hot_sector:     ['funda_pass','rs_percentile'],
  sector_leader:  ['ocf_margin_pct','roe','rs_percentile','inst_holders_qoq_pct'],
};
for (const key of Object.keys(PRESET_PREDICATES)) {
  const g = PRESET_PREDICATES[key].grades || [];
  const disp = PRESET_DISPLAY[key];
  ok(`grades ⊆ display [${key}] (見えない条件ゼロ)`, g.every((k) => disp.includes(k)),
    `grades=${JSON.stringify(g)}`);
}

rmSync(out, { force: true });
console.log(`\n=== 結果: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
