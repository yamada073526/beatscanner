# B-2 「.crow 統一」実装 READY スペック（context 圧縮耐久版）

作成: 2026-06-23 autopilot セッション。context 過重で tool-call 崩壊の初発兆候 → 計画を耐久化。
**このファイル + handover v256 + 既存コードだけで B-2 を完遂できる**。コード調査は完了済み。残るは Edit 3 + CSS 1 + 検証。

## 調査済みの確定事実（再調査不要）

### token（index.css・確認済）
- 存在する: `--space-1`=4 / `--space-2`=8 / `--space-3`=12 / `--space-4`=16 / `--radius-sm`=8 / `--radius-pill`=9999 / `--color-gold`=#d4af37 / `--color-accent`=#38bdf8 / `--bg-subtle` / `--bg-muted` / `--border` / `--text-primary` / `--text-secondary` / `--text-muted`
- **存在しない**: `--s2` / `--ease-std` / `--gold-mid` / `--border-strong` → 使わない。代わりに `--space-2` / 素 `ease` / `--color-gold` / accent tint は `color-mix(in srgb, var(--color-accent) 32%, transparent)`（raw rgba 禁止）

### CustomScreenerPanel.jsx 確定行番号（精度スライド着地後・1960行）
- import: 行1 `import React, { useMemo, useState, useRef, useImperativeHandle, forwardRef } from 'react';` → `React.Fragment` 利用可
- `FUNDA_FACETS`(76-83): eps_yoy_pct(quality,delta,grades loose20/std25/strict50/severe100) / eps_cagr_3y(quality,delta,std25/strict50) / roe(quality,水準,loose17/std25/strict50) / rs_percentile(**timing**,水準,loose70/std80/strict90) / volume_surge_pct(**timing**,delta,loose25/std40/strict50) / inst_holders_qoq_pct(demand,delta,loose0/std3/strict5)。**全 facet に standard 段あり**
- binary facet定義: OCF_MARGIN_FACET(119) labelShort'CF創出力' / OCF_GT_NI_FACET(135) / BUY_ZONE_FACET(152) / NEW_HIGH_52W_FACET(168) / AD_VOLUME_FACET(186)。各 `.label` `.tooltip` 保有
- `PRESET_CONDS`(214-238) export / `COND_MAP`(239) / `BINARY_CONDS`(241)。**触らない（物理層）**
- `PRESET_CORE_KEYS`(86) = `['eps_yoy_pct','eps_cagr_3y','roe','rs_percentile']`
- `GRADE_LABELS_SHORT`(89) = {loose:'緩',standard:'標',strict:'厳',severe:'最厳'}
- `facetLevels(facet)`(93) / `clampLevel(facet,level)`(98) / `gradeAnnot(facet,lvl)`(108 → '+25%' or '≥80')
- `FACET_SHORT_LABEL`(257-268・末尾は ad_volume:'出来高の質' で閉じ、sector_leader 無し)
- `buildActiveGrades(preset,overrides)`(302) / `itemPasses`(321) **触らない**
- component 内 state: `preset`(435) `overrides`(436) `setOverrides` / `fundaPassOnly`(447) `ocfMarginOnly`(449) `ocfGtNiOnly`(451) `buyZoneOnly`(453) `newHigh52wOnly`(455) `adVolumeOnly`(457) `sectorLeaderOnly`(459)、各 setter あり
- `activeGrades`(564 useMemo) / `advLocked`(566) / `setAdvLockNudge` / `trackEvent`
- `renderGradeRow`(807-850) / `renderSectorBlock`(853-879) / `renderMcapBlock`(880-907) — component 内アロー関数
- refine summary(1090-1124) → 寄与件数「5条件達成(+N)」表示。維持
- 「詳細」トグルボタン(1128-1142) — この手前(1126付近)に「該当 N 銘柄」追加
- detail panel(1149-1155) → `screenerV2 ?`(1156) 分岐
- **編集対象本体: screenerV2 パス 1161-1379**
  - adv toggle bar(1165-1189) → 維持
  - 【品質】(1192-1270): binary chips funda_pass/ocf_margin/ocf_gt_ni(1197-1238) + adv-rows{gate badges(1244-1259)+renderGradeRow quality(1261)}(1240-1263) + freshness注記(1264-1268)
  - 【タイミング】(1273-1316): binary buy_zone(1279-1293)/new_high_52w(1295-1309) + adv-rows renderGradeRow timing(1312)
  - 【需給】(1319-1347): binary ad_volume(1326-1340) + adv-rows renderGradeRow demand(1343)
  - 【絞り込み】見出し(1350-1354) + renderSectorBlock(1355)+renderMcapBlock(1356)
  - lockbar(1360-1378)
- legacy パス(1380-1428) **触らない**
- locked chip(1432-1443) `!screenerV2` gate → screenerV2 では非表示（現状仕様・B-3でlock crow化）
- strategy note(1446-1452) screenerV2 のみ → 維持

### universe binary 表示条件（現状ロジック・renderCrow で踏襲）
- funda_pass: `universe.freshness?.funda_pass`
- ocf_margin: `universe.freshness?.ocf_margin`
- ocf_gt_ni: `universe.freshness?.ocf_gt_netincome`
- buy_zone: `universe.freshness?.pivot_distance && !locked_facets.includes('pivot_distance')`
- new_high_52w: `universe.freshness?.breakout && !locked_facets.includes('breakout')`
- ad_volume: `universe.freshness?.ad_volume && !locked_facets.includes('ad_volume')`

## 実装手順（Edit 5 個 + CSS 1 個）

### Edit 1: module scope メタ追加（FACET_SHORT_LABEL の `};`(268) 直後、`// ─── 合否理由 静的dict` の前）
```js
// ─── Phase B-2: .crow 統一レンダラ用メタ (mockup v8 忠実化) ───────────────────────
// binary 条件を mockup の .crow (トグル + ラベル + 値チップ) として描画する表示メタ。
// PRESET_CONDS の pass ロジックは不変 — 表示の可否と中身のみ (§6 物理隔離)。
//   label/th(閾値型のみ・bool は null)/freshness(未取得→非表示)/locked(Premium→非表示・B-3でlock crow化)
const CROW_BINARY_META = {
  funda_pass:       { label: '最新決算で5条件達成', th: null,     freshness: 'funda_pass' },
  ocf_margin_pct:   { label: 'キャッシュ創出力',     th: '≥15%',   freshness: 'ocf_margin',       tooltip: OCF_MARGIN_FACET.tooltip },
  ocf_gt_netincome: { label: '営業CF>純利益',        th: null,     freshness: 'ocf_gt_netincome', tooltip: OCF_GT_NI_FACET.tooltip },
  buy_zone:         { label: '買い場圏',             th: '0〜+5%', freshness: 'pivot_distance',   locked: 'pivot_distance', tooltip: BUY_ZONE_FACET.tooltip },
  new_high_52w:     { label: '52週高値を更新',        th: null,     freshness: 'breakout',         locked: 'breakout',       tooltip: NEW_HIGH_52W_FACET.tooltip },
  ad_volume:        { label: '出来高の質',           th: '>1',     freshness: 'ad_volume',        locked: 'ad_volume',       tooltip: AD_VOLUME_FACET.tooltip },
};
const CROW_LAYOUT = [
  { group: '品質',       sub: '利益・キャッシュの質', keys: ['funda_pass', 'ocf_margin_pct', 'ocf_gt_netincome', 'eps_yoy_pct', 'eps_cagr_3y', 'roe'] },
  { group: 'タイミング', sub: '値動き・勢い',         keys: ['buy_zone', 'new_high_52w', 'rs_percentile', 'volume_surge_pct'] },
  { group: '需給',       sub: '機関の動き',           keys: ['ad_volume', 'inst_holders_qoq_pct'] },
];
```

### Edit 2: renderCrow ヘルパー追加（renderMcapBlock の閉じ `));`(907) の直後、`return (`(909) の前）
```jsx
  // ── Phase B-2: 全条件を mockup の .crow (トグル + ラベル + 値チップ) へ統一 ──
  // grade も binary も同じ 1 行形状で 2 列グリッドに揃える。mseg/gate南京錠/Premium lock crow は B-3。
  // 数値ロジック(itemPasses)は経由せず表示のみ。off→on の grade 復帰は overrides 操作で行う。
  const renderCrow = (cond) => {
    if (!cond) return null;
    if (cond.kind === 'grade') {
      const facet = cond.facet;
      const activeLvl = activeGrades[cond.key];           // undefined = off
      const on = activeLvl != null;
      const isCore = PRESET_CORE_KEYS.includes(cond.key);
      const dispLvl = on ? activeLvl : (isCore ? clampLevel(facet, preset) : clampLevel(facet, 'standard'));
      const toggle = () => {
        if (advLocked) { setAdvLockNudge(true); trackEvent('screener_adv_locked_click', { facet: cond.key }); return; }
        if (on) setOverrides((prev) => ({ ...prev, [cond.key]: 'off' }));
        else if (isCore) setOverrides((prev) => { const n = { ...prev }; delete n[cond.key]; return n; });
        else setOverrides((prev) => ({ ...prev, [cond.key]: 'standard' }));
      };
      return (
        <div key={cond.key} className={`screener-crow${on ? ' is-on' : ' is-off'}`} data-testid="screener-cond-row" data-cond={cond.key}>
          <button type="button" role="switch" aria-checked={on} className="screener-crow__sw" onClick={toggle} aria-label={`${facet.label} を${on ? '外す' : '加える'}`} />
          <span className="screener-crow__lbl">{facet.label}</span>
          <span className="screener-crow__th">{GRADE_LABELS_SHORT[dispLvl]} {gradeAnnot(facet, dispLvl)}</span>
        </div>
      );
    }
    const meta = CROW_BINARY_META[cond.key];
    if (!meta) return null;
    if (!universe?.freshness?.[meta.freshness]) return null;
    if (meta.locked && (universe?.locked_facets || []).includes(meta.locked)) return null;
    const binBindings = {
      funda_pass: [fundaPassOnly, setFundaPassOnly],
      ocf_margin_pct: [ocfMarginOnly, setOcfMarginOnly],
      ocf_gt_netincome: [ocfGtNiOnly, setOcfGtNiOnly],
      buy_zone: [buyZoneOnly, setBuyZoneOnly],
      new_high_52w: [newHigh52wOnly, setNewHigh52wOnly],
      ad_volume: [adVolumeOnly, setAdVolumeOnly],
    };
    const [val, setter] = binBindings[cond.key] || [];
    if (!setter) return null;
    return (
      <div key={cond.key} className={`screener-crow${val ? ' is-on' : ' is-off'}`} data-testid="screener-cond-row" data-cond={cond.key} title={meta.tooltip || undefined}>
        <button type="button" role="switch" aria-checked={!!val} className="screener-crow__sw" onClick={() => setter((v) => !v)} aria-label={`${meta.label} を${val ? '外す' : '加える'}`} />
        <span className="screener-crow__lbl">{meta.label}</span>
        {meta.th && <span className="screener-crow__th">{meta.th}</span>}
      </div>
    );
  };
```

### Edit 3: refine ヘッダーに「該当 N 銘柄」追加（「詳細」ボタン手前・1126付近の summary `</span>` の後、`<button ... screener-detail-toggle`の前）
mockup の flive 相当。`.crow` から件数を落とす代償の集約件数。filteredItems.length は既存。
```jsx
            <span className="ml-auto shrink-0 text-xs text-[var(--text-secondary)]" data-testid="screener-live-count">
              該当 <b className="text-sm font-bold text-[var(--color-gold)] tabular-nums">{filteredItems.length}</b> 銘柄
            </span>
```
※ ただし既存「詳細」ボタンが `ml-auto` を持つ場合は競合。実装時に「詳細」ボタンの `ml-auto` を外し、この live-count に `ml-auto` を移す。要確認(1128-1129)。

### Edit 4: screenerV2 パス本体(1161-1379)を .screener-conds 構造へ置換
新構造（adv toggle bar は維持して、その後を置換）:
```jsx
                  {/* adv toggle bar = 現状維持(1165-1189) */}

                  {/* .screener-conds: 全条件を .crow で 2 列グリッド */}
                  <div className="screener-conds" data-testid="screener-conds">
                    {CROW_LAYOUT.map((grp) => {
                      const rows = grp.keys.map((k) => renderCrow(COND_MAP[k])).filter(Boolean);
                      if (rows.length === 0) return null;
                      return (
                        <React.Fragment key={grp.group}>
                          <div className="screener-grouphd">{grp.group}<span className="screener-grouphd__sub">{grp.sub}</span></div>
                          {rows}
                        </React.Fragment>
                      );
                    })}
                    {(sectorOptions.length > 0 || mcapOptions.length > 0) && (
                      <React.Fragment key="filter">
                        <div className="screener-grouphd">絞り込み<span className="screener-grouphd__sub">セクター・規模</span></div>
                        <div className="screener-conds__full">{renderSectorBlock()}</div>
                        <div className="screener-conds__full">{renderMcapBlock()}</div>
                      </React.Fragment>
                    )}
                  </div>

                  {/* 必須ゲート: B-2 現状維持(adv ON 時)。.crow 南京錠化は B-3。中身は旧 gate badge そのまま */}
                  {advOpen && (universe.freshness?.ocf_margin || universe.freshness?.funda_pass) && (
                    <div className="screener-gate-list mt-3" role="list" aria-label="必須ゲート (変更不可)">
                      <span className="screener-gate-badge" role="listitem" data-testid="screener-gate-ocf_margin" aria-label="営業CFマージン 15%以上（戦略の絶対条件・変更不可）">
                        <Lock size={11} strokeWidth={2} aria-hidden /> 営業CFマージン ≥15%・必須
                      </span>
                      <span className="screener-gate-badge" role="listitem" data-testid="screener-gate-ocf_gt_netincome" aria-label="CFPSがEPSを上回る粉飾防止条件（戦略の絶対条件・変更不可）">
                        <Lock size={11} strokeWidth={2} aria-hidden /> CFPS&gt;EPS・必須
                      </span>
                    </div>
                  )}

                  {/* lockbar = 現状維持(1360-1378) */}
```
**重要**: 旧 binary chips / 旧 adv-rows / 旧 category 見出し / 旧【絞り込み】見出し は全削除。adv toggle bar(1165-1189) と lockbar(1360-1378) は残す。freshness 注記(1264-1268)は削除（該当 N 銘柄で代替・or 残すか実装時判断）。

### Edit 5(CSS): index.css 精度スライド `.screener-precision-seg` 一式の直後に追記
```css
/* ── B-2: .crow 統一 (mockup v8 .conds/.grouphd/.crow 準拠) ──
   発光禁止(§6): tinted bg + border のみ。トグル on のシアンはブランド色(上昇の意味ではない)。
   §38: 値チップ th に polarity 色を付けない。easing は素 ease (--ease-std 不在)。 */
.screener-conds {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  align-items: start;
}
.screener-conds__full { grid-column: 1 / -1; }
@media (max-width: 520px) { .screener-conds { grid-template-columns: 1fr; } }
.screener-grouphd {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-2) 0 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .04em;
  color: var(--text-muted);
}
.screener-grouphd::after { content: ""; flex: 1; height: 1px; background: var(--border); }
.screener-grouphd__sub { font-weight: 400; font-size: 10px; letter-spacing: normal; color: var(--text-muted); }
.screener-crow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: opacity .2s, background .2s, border-color .2s;
  flex-wrap: wrap;
}
.screener-crow.is-off { opacity: .42; }
.screener-crow__sw {
  width: 34px; height: 20px; flex: none;
  position: relative;
  border: 0; padding: 0;
  border-radius: var(--radius-pill);
  background: var(--bg-muted);
  cursor: pointer;
  transition: background .18s;
}
.screener-crow__sw::after {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: transform .18s, background .18s;
}
.screener-crow.is-on .screener-crow__sw { background: color-mix(in srgb, var(--color-accent) 32%, transparent); }
.screener-crow.is-on .screener-crow__sw::after { transform: translateX(14px); background: var(--color-accent); }
.screener-crow__sw:focus-visible { outline: 2px solid var(--color-gold); outline-offset: 2px; }
.screener-crow__lbl { flex: 1; min-width: 100px; font-size: 12px; color: var(--text-secondary); }
.screener-crow__th {
  font-size: 11px; font-weight: 700;
  color: var(--text-primary);
  background: var(--bg-muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 3px 9px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .screener-crow, .screener-crow__sw, .screener-crow__sw::after { transition: none; }
}
```

## 検証 DoD
1. `cd frontend && npm run build` 通過
2. design-system-check skill（raw hex/!important/発光バグ・color-mix(accent) 許容確認）
3. snap-screener-*.mjs で screener_v2 ON 視覚確認（Free/Pro。本番 or file://dist）。`?screener_v2=1` 等の flag 確認
4. legacy(flag OFF)不変確認: `grep` で 1380-1428 が無改変
5. **git diff を user に提示 → 承認 → 単一 commit**（明示 path `git add CustomScreenerPanel.jsx index.css`）。**autopilot 中は commit しない・朝の承認待ち**

## 注意/未決
- Edit 3 の ml-auto 競合（既存「詳細」ボタンが ml-auto 保持）→ live-count に ml-auto 移譲、詳細ボタンから外す。実装時 1128-1142 を再確認
- freshness 注記(1264-1268)の去就: 「該当 N 銘柄」live count で代替できるなら削除可、保守的に残すなら【品質】末尾。実装時判断（mockup には注記なし→削除寄り）
- gate badge を .crow の外(adv ON)に残すのは handover 行80「B-2現状維持」厳守のため。冗長感は B-3 で .crow 南京錠化により解消
- §38: 全ラベル/値チップは事実語・状態語のみ（「買い場圏」OK・「買い」NG）。polarity 色なし。確認済
