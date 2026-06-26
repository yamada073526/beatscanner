# AUDIT 2026-06-27: screener「旬のセクター」master-detail × mockup v8 忠実度

> Phase C Sprint 4（SPEC_2026-06-27 §5）の mockup-fidelity 最終検証。
> 正本 mockup: `docs/specs/mockups/screener-strategy-presets-v8.html`（`renderSectorMaster` L338 / `renderSectorDetail` L339・preset p3「旬のセクター」L254-257）
> 対象実装: `frontend/src/components/CustomScreenerPanel.jsx`（`buildSectorSummary` / `sectorTone` / `sectorTagJp` / `fmtSr` + master/detail JSX）/ `frontend/src/index.css`（`.screener-sec*`）

## element-map

| mockup selector | impl selector | role |
|---|---|---|
| `.secrow .bar` | `.screener-secrow__bar[data-tone]` | tone 色バー |
| `.secrow .sn` + `.chip.hot` | `.screener-secrow__name` + `.screener-secrow__chip` | セクター名 + 主戦場 chip |
| `.secrow .tg` | `.screener-secrow__tag` | 相対力 tag |
| `.secrow .sr` | `.screener-secrow__sr[data-tone]` | 対 SPY 超過 RS |
| `.legend` | `.screener-seclegend` | 3値色 凡例 |
| `.detail .top3 .h` | `.screener-secdetail__h` | detail 見出し |
| `.detail .row .chip.pass` | `Chip(5条件達成)` | 合否 chip |

## D-1〜D-7 解消台帳（行 prefix: F=fixed / I=intentional 保全 / X=excluded）

| ID | 項目 | 状態 | 根拠 |
|---|---|---|---|
| **F** D-1 | 色分け 3 値化（劣後=赤） | 解消（#37） | `sectorTone`: hot=`--color-warning`/up=`--color-gain`/neg=`--color-loss`。凡例 3 項目。mockup `col` 三項と一致 |
| **F** D-2 | RS 符号付き表示 | 解消（#39） | `fmtSr`（`+15`/`-1`/`0`）。snap で +15〜−15 を DOM 確認 |
| **F** D-3 | tag 意味的ラベル化 | 解消（#39） | `sectorTagJp`（相対力 トップ/上位/横ばい/劣後）。「N 銘柄が合致」消失を snap 確認 |
| **F** D-4 | detail 見出し文言 | 解消（#39） | 「合致銘柄」→「決算5条件達成銘柄」+ 件数退避 |
| **I** D-5 | detail chip | 保全 | mockup `6条件PASS` は古い。実装 `5条件達成` が正（SPEC §10.1 U-5 確定） |
| **F** D-6 | master 母集団=市場俯瞰 | 解消（#37） | `buildSectorSummary` が全 universe を sector 集約（劣後含む 11 セクター）。snap 確認 |
| **F** D-7 | stock-list 経路撤去・一本化 | 解消（#39） | 別経路は #37 で既に master-detail へ一本化済（撤去対象の実行コード無し）。集計を `buildSectorSummary` 純関数へ抽出し正規 view を明確化。`sectorFilter=top5` は件数 SSOT 機構として保全 |

## 意図的 deviation（mockup と異なるが SPEC 確定・戻さない）

| 差分 | mockup v8 | 実装 | anchor |
|---|---|---|---|
| RS 桁 | `+14.2`（小数1桁） | `+15`（整数） | SPEC §10.1 **U-4**=符号付き整数・単位無印（現行 `Math.round` 維持・パッと見優先） |
| hot tag | `相対力 上位・改善中` | `相対力 トップ` | **§38**: 「改善中」は sector RS スナップショットに時系列差分が無く trend 主張を裏取り不能。検証可能な事実ラベルに限定（[[feedback_section38_buy_signal_boundary]]） |
| 中間 tag | `改善方向` / `やや劣後` | `横ばい` / `劣後` に集約 | SPEC §10.1 **U-1**「色は 3 値固定・認知コスト最小化」+ §38（改善方向=trend）。tag は 4 値（トップ/上位/横ばい/劣後）に簡素化 |
| detail 見出し | `好決算銘柄 Top3` | `決算5条件達成銘柄 N件` | **U-5**（「好」の優良誤認=景表法§5 回避）+ **U-2**（件数を master 行から detail へ clear label 退避・Trust Cliff 回避） |
| detail chip | `6条件PASS` | `5条件達成` | **D-5**（実装が正・mockup が古い） |

## 検証（ground truth）

- `npm run build` PASS / `npm run test:unit` **16/16**（隠れフィルタ invariant 9 + 表示純関数 3 + 集計不変 4）
- `design-system-check`: raw hex / `!important` / box-shadow / 発光系・sticky いずれも未触（新規 CSS は token のみ）
- ESLint no-unused-vars clean / grep「Phase A 暫定 stock-list」「置換予定」消失
- file://dist snap（Premium 注入 + /api PROD proxy・実データ 06-26）: 11 セクター俯瞰で符号 RS + 意味的 tag + detail 件数を DOM 確認。「横ばい」(公益 +3) は mockup「+3.0 横ばい」と一致。`buildSectorSummary` 純関数抽出後も同一描画（無回帰）

## 結論

事故 drift **ゼロ**。残差分はすべて SPEC §10.1（U-1/U-4/U-5）・§38・D-5 で確定済の意図的 deviation。Phase C「旬のセクター」master-detail は本実装完了。
