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
