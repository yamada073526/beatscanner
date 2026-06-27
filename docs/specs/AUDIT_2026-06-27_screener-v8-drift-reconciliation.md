# AUDIT: スクリーナー mockup v8 ↔ 実装 drift 再監査 + reconciliation (2026-06-27)

> 正本: `docs/specs/mockups/screener-strategy-presets-v8.html`（preset/条件/season/sort/sector の操作UI）
> 対象スコープ: **v8 preset 操作UI のみ**（result-table の v10/v12 抜本再設計は別工程・本監査対象外）
> 前監査: `AUDIT_2026-06-25_mockup-cosmetic-drift.md`（事故 drift 10件 D-1〜D-10）/ `AUDIT_2026-06-25_screener-mockup-implementation-divergence.md`
> 手法: element-map 確定 → 4セクション並列 CSS/copy 実値 diff（sub-agent）→ main で ground-truth 裏取り triage

---

## 結論（サマリー）

**v8 preset 操作UI に残存する事故 drift は無い。** 前監査（2026-06-25）の事故 drift 10件は、その後の screener_v2 sprint で**適用済み**（ground-truth で確認）。再監査が検出した残差は、すべて **(a) 文書化済みの意図的変更 / (b) design-system token 駆動 / (c) embedded（狭幅ペイン）構造適応 / (d) sub-pixel 微差** のいずれかで、mockup へ戻すと regression になるか ROI が noise floor 以下。

| 種別 | 件数 | 対応 |
|---|---|---|
| 前監査 D-項目（事故 drift）| 10 | **全て解決済み**（下記 §1 で ground-truth 確認） |
| 意図的・文書化済み（保全）| 多数 | I（戻さない） |
| design-system token 駆動（保全）| 多数 | I（mockup は raw 値・実装は token、解決値ほぼ同一） |
| embedded 構造適応（保全）| 多数 | I（mockup=1180px フルページ / 実装=狭幅ペイン） |
| 新規 app-wide 技術 gap | 1 | **D（user gate）**: `--border-strong` 未定義（§3） |

---

## §1 前監査 D-項目の解決確認（ground-truth grep）

| 旧ID | 前監査の事故 drift | 現状（2026-06-27 実測）| 判定 |
|---|---|---|---|
| D-2 | customtag が neutral で埋没 | `index.css` `.screener-custom-tag` = `color: var(--color-gold-mid)` + gold 12% bg + gold 30% border。コメント「mockup v8 §.customtag 復元 ... (D-2)」明記 | ✅ 解決 |
| D-9 | live件数が text-secondary で埋没 | `.screener-refine-fh__live b` = `font-size:20px; font-weight:700; color:var(--color-gold-mid)` | ✅ 解決 |
| D-7 | disclaimer が微小テキストに埋没 | `CustomScreenerPanel.jsx:2683` `borderLeftColor: var(--color-warning)` 3px + 全文 + `data-testid="screener-disclaimer"` | ✅ 解決 |
| D-5 | 「精度」visual label 消失 | `index.css` `.screener-ctrl-lab` 定義あり（2箇所）| ✅ 解決 |
| D-4 | 「絞り込み条件」見出し消失 | `.screener-refine-fh` ヘッダに「絞り込み条件」ラベル存在 | ✅ 解決 |
| D-8 | sort select 消失 | `CustomScreenerPanel.jsx:2222` `data-testid="screener-sort-select"` + mockup 4択（+合致度順）| ✅ 解決（合致度順は意図的追加）|
| D-1/D-3/D-6/D-10 | h1/sub・lockbar radius・fhint・sector ヒント | v2 IA 再設計で ScreenerMaster へ統合 or 意図的撤去（前監査 I-5 系）| ✅ 解決/意図 |

---

## §2 再監査が検出した残差 = すべて保全（I）

検出 sub-agent は以下を「事故候補」と挙げたが、ground-truth 裏取りで**意図的/token駆動/構造適応**と確定。**戻さない**。

1. **gold-mid → gold-dark 置換**（Pro バッジ / lockbar strong / mseg button.on / seasonchip、計4箇所）
   → `index.css:13909` 明示コメント「mockup の raw gold-mid でなく**可読性優先**・color-mix で dark/light 両対応」。mockup は dark-only standalone、実装は light モードも要対応。戻すと light でコントラスト崩壊 = regression。[[feedback_gold_accent_continuity]]

2. **customtag padding `1px 7px` / font-weight `600`**（mockup `2px 8px` / `700`）
   → D-2 修正コメントが gold 色復元時に**意図的に compact 維持**。事故でない。

3. **motion duration 微差**（caret 250→220ms、body 開 350→360ms 閉 200→220ms、switch 200→180ms、easing ease-std→ease）
   → 実装は `--motion-base`/`--motion-slow` design-system token 駆動。10〜30ms 差は知覚閾値以下。

4. **density 圧縮**（lockbar gap/padding、secmaster padding 12→8、detail 20→16、legend mt 16→8、td 右 padding 20→16、th/td font 0.5px、chip.hot/customtag padding 1px）
   → mockup 1180px フルページ → 狭幅ワークスペースペインへの embedded 適応。コード内に「狭幅ペイン適応」コメント。

5. **構造適応**（preset top flex-direction column、strategy-bar bg-subtle、.md breakpoint 860→720、panel/ph restructure、secrow `<div>`→`<button>` a11y 改善）
   → embedded コンテキストの正当な適応 + a11y 上位互換。前監査 G-3/I-4/I-5 系。

6. **copy 変更（§38/honesty 駆動・保全）**
   - 「6条件PASS」→「5条件達成」（backend 実態の事実訂正）
   - 「好決算銘柄 Top3」→「決算5条件達成銘柄 N件」（件数の正直表示）
   - seasonchip「過去90日 / 2026 Q1」「5営業日」削除（断定回避・JSX コメントに honesty 理由）
   - group 見出し 成長性/収益の質/モメンタム → 品質/タイミング/需給（S3 再編・コメント明記）
   - 「新高値ブレイク」desc 変更（前監査 I-1・commit `3045faa` near_high 段階OR 整合）
   → いずれも hallucination-guard / 実装実態整合の意図的変更。戻すと Trust Cliff。

7. **accent tint 追加**（`.crow .th.state` background 10% / sort 合致度順追加）
   → 実装独自の機能追加・状態強調。accent 過剰追加は skill 上 user gate 対象だが、状態インジケータ/新 sort 機能として正当。

---

## §3 唯一の新規 actionable = `--border-strong` 未定義（app-wide・user gate）

- **事実**: `--border-strong` は `index.css` :root にも `design_system.md` §1 にも**未定義**（定義0件）。一方で `var(--border-strong, var(--border))` が**4箇所**で参照される: `index.css:7419` / `14037`（.screener-crow gate dashed）/ `14110` / `14988`（.screener-strategy-tile:hover border）。
- **影響**: 全て fallback の `--border` を解決 → mockup が意図する hover/gate の border 強調（mockup dark `rgba(255,255,255,.14)`）が**効いていない**。preset:hover は box-shadow/transform は効くが border-color が idle と同値。
- **性質**: screener 固有の事故でなく **app-wide な design-system token gap**（4箇所中2箇所は screener 外）。修正 = `design_system.md` §1 + `index.css` :root（light/dark 両方）への token 追加 = **SSOT 変更で blast radius 大**。
- **判断**: design-system SSOT 変更のため **user gate**。値案（要承認）: dark `rgba(255,255,255,.14)`（mockup 準拠）/ light `rgba(15,23,42,.14)` 相当。`design-system-check` skill 経由で適用。

---

## 検証規律

- element-map / render path: Explore agent（live: ScreenerMaster→StrategyPresetBar+CustomScreenerPanel→ScreenerRow/ScreenerGridTable→ScreenerGridRow / dead: ScreenerPane・ScreenerTable・ScreenerPanel）
- 4セクション drift: general-purpose sub-agent 並列（presets / refine+adv+lock / conds+season+sort / sector+table）
- triage 裏取り: main が grep で ground-truth（D-2/D-9/D-7/D-5/D-8 解決確認 + gold-dark 意図コメント + border-strong 未定義）。**sub-agent 報告を証拠にせず main 独立確認**。
