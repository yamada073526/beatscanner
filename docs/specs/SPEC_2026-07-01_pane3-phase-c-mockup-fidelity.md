# SPEC 2026-07-01: ペイン3 mockup 忠実化 Phase C（実装計画 / Phase D 向け）

- **作成日**: 2026-07-01
- **正本 mockup**: `docs/specs/mockups/pane3-full-v5.html`（全体）+ `docs/specs/mockups/pane3-technical-buyzone-v6.html`（③テクニカル章のみ）
- **SSOT 監査台帳**: `docs/specs/AUDIT_pane3_2026-07-01.md` §「Phase C 決定事項」C1-C11（user 承認済・3体レビュー synthesis 反映）
- **本 SPEC の位置づけ**: Phase C の SPEC化 + Sprint分割（gate1 承認用）。**Phase D（実装）は別の新セッション・専用 branch**で着手する。本 SPEC は「何を作るか / なぜ / どの順序か」に集中し、「どう作るか」（技術詳細）は Phase D の実装者に委ねる。
- **実装規律（Phase D 厳守）**: 自分で実装（書きは委託しない）/ `origin/main` 基点の専用 branch（重い場合 worktree）/ 検証 = `cd frontend && npx vite build` + `npx vitest run` + design-system-check + §38 grep を **ground-truth** で（サブエージェント報告は main が独立裏取り）/ deploy = PR squash-merge 経由・**merge は user 承認 gate** / §38（未来・来期に色をつけない・緑BAN）/ 投資業界の色ルール（過去確定の上昇=緑・下落=赤・警告=amber・シアン=ブランド色で上昇に使わない）/ raw hex/shadow 直書き禁止（token 経由）/ **danger zone は触らない**（§6 参照）。

---

## 1. Context

- **user prompt**: 「ペイン3 mockup 忠実化 Phase C — 監査台帳 C1-C11 + Sprint分割指針を SPEC化（SPEC は main が執筆・書きは委託しない）」
- **なぜ今やるか**: Phase B（drift 監査）が全 4 ブロック（③テクニカル / ①決算 / L0判定 / ⑤その他）で完了し、全 drift を **F/M/N/P/I** で分類確定（`AUDIT_pane3_2026-07-01.md`、PR #151 draft）。各 drift の file:line は main が grep/curl で独立裏取り済（報告≠事実）。続く Phase C で user が全項目を承認 + 2点（アナリスト視点 / 期間別リターン）を 3体レビュー（金融Opus + funnel-cro + frontend/§38）にかけ、最終方針 C1-C11 を確定した。残るは本 SPEC化 → gate1 → Phase D 実装のみ。
- **期待される成果（5原則への貢献）**:
  - **原則① 読み手に負担をかけない（2秒理解）**: ⑤ collapsed summary を静的文字列から非LLM実績数値へ動的復元（C2）/ L0 を 3セル grid + RSゲージで一目化（C10）。
  - **原則② 毎日開きたくなる**: 「良い決算 N期連続」（C9）や期間別リターン 1W/1M/3M（C7）で注目シグナルを即時把握。
  - **原則⑤ 図解で認知コストを下げる**: ③テクニカルの買いゾーン状態を累進開示（C11）で「いつ買い場か」を視覚的に提示。
- **分類スキーム**（監査台帳より）: **F**=実装を mockup へ戻す（事故 drift）/ **M**=mockup が誤りで実装維持 / **N**=新規実装 / **P**=課金 gate 設計 / **I**=意図的保全。

## 2. ブランド世界観（Aman/Ritz-Carlton 級）への適合根拠

「最高級ホテルのロビーに入った瞬間の驚き・豪華さ・興奮・洗練さ」で言えば、現状のペイン3は「ロビーの調度（個々の component）は揃っているが、入口で迎える案内（collapsed summary）が無地の貼り紙のまま」状態。Phase C は ① collapsed summary を実績数値で語らせる（C2）= 入口で「ここに何があるか」を品よく示す **洗練さ** に効き、② gold 縁取り復活（C1）= L0/判定カードに一貫した格（**豪華さ**）を与え、③ 買いゾーン累進開示（C11）= 「今がその時」を静かに告げる **興奮** に効く。いずれも装飾の足し算でなく「2秒で伝わる情報密度」を上げる方向で、原則③「シンプルかつリッチ」を守る。

- ⚠️ gold 復活（C1）は v54-v59 で 6 セッション溶けた発光系に隣接する高リスク領域。memory `feedback_gold_accent_continuity`（gold は全 panel 一貫でないと noise）を Phase D 着手前に必読し、ブランド anchor（`feedback_brand_aspiration.md`）を破壊しないこと。**修正禁止 anchor へ新しい修飾語の追加はしない**。

## 3. Trust Cliff チェックリスト

LP 訴求文言と実装の整合（CLAUDE.md「Trust Cliff は最重要バグカテゴリ」）。本 Phase は LP 文言自体は変更しないが、課金 gate 表示と「取得できないデータ」の見せ方が Trust Cliff に直結する。

1. **「登録不要 / 3銘柄/日まで無料」との整合**: 本 Phase は無料/有料境界の判定ロジックを変えない。C2 の 8Q summary に追加する **Pro tag は「折りたたみ時点で Pro 要否が分かる」誠実化**であり、無料で見える範囲を狭めない（監査 c4: 既に panel 全体 `PremiumLock` でロック済、tag は予告に過ぎない）。
2. **アナリスト視点 gate（監査 a3）**: 伏せ字機能は実装済だが gate 説明が `title` 属性 tooltip のみ＝ touch/mobile で「なぜ伏せ字か / Premium で何が得られるか」が不可視 = Trust Cliff。**ただし C6 の決定は「gate 常時文言は追加しない」（決定E・3体中2体が不要）**。本 Phase では a3 の常時可視文言は **追加しない**（決定を覆さない）。将来 funnel-cro 観点で再判断する場合は別 SPEC。
3. **Insider 13F（監査 d3 / M）**: mockup の「FMP Ultimate で開放予定（restricted）」文言は **実装都合（現プラン制限）を露出する景表法§5 / Trust Cliff リスク文言**。実装は v115 で意図的に削除し SEC EDGAR 13F 導線のみ残す（`InsiderPanel.jsx:251-263`）。**Sprint 6 で統合 mockup 側を実装に合わせ、この文言を mockup から削除する**（mockup を直す=M）。
4. **市場の声 Pro gate（C4 / 監査 b3 / P）**: 既存 teaser UI（blur + CTA + `NonLoggedTeaserView`）は mockup の単純 gold 文言より高度。**既存維持**（3体レビューで妥当と確認済）。gold 明示文言は追加しない。

## 4. Hallucination Guard 適合

- **本 Phase は原則として LLM 呼び出しを含まない（no）**。
- **C2 summary 動的復元の数値は全て非LLM算出データ**（8Q「Beat回数 + 平均%」= `quarterly-history` の Python 集計 / Insider「買付件数 + 金額」= Form 4 集計 / ニュース「件数 + 鮮度」= API メタ）。frontend は backend 返却値を**表示するだけ**で再計算しない（single source of truth）。→ Hallucination Guard 4層のうち「数値物理層（Python）/ narration layer 分離」を遵守、`aggregator/*.py` への LLM SDK import は発生しない。
- **C3 市場の声 summary のみ LLM source 制約**（collapsed unmount・`feedback_accordion_collapsed_unmount`）で単純復元不可。本 Phase の default は **defer**。もし非LLM sentiment signal を設計する場合は、CLAUDE.md「新規 LLM endpoint は 4層全て通すか、通さない場合は静的 dictionary + sanitize layer のみ」に従い、**LLM に narration を生成させる近道は採らない**（Trust Cliff バグの温床）。→ 詳細は Sprint 3 参照。
- **C9 良い決算連続（PR #117）**: backend `quarterly-history` handler の `beat_streak` / `eps_yoy_acceleration` は **Python のみ（LLM 不使用）**で算出済（BAD-3 数値捏造防止）。frontend は相乗りで読むだけ。§38: 過去確定の事実の方向のみ、将来予測・買い/売り推奨は出さない。

## 5. スプリント分割（全 6 sprint・1 sprint = 1 機能）

> Phase D は重い（大ファイル `StockPriceChart.jsx` ~1907行・`JudgmentDetail.jsx` 1000+行）。各 sprint は独立 commit。**同一 file を複数 sprint で触る計画は §9 落とし穴1（sprint間 commit 必須）を厳守**。selector は data-testid 優先（§9 落とし穴2）。

### Sprint 1 — L0 低リスク frontend 局所（C10 + C7）
- **目的**: L0/Hero の事故 drift（F）を mockup へ戻し、期間別リターンを拡張。blast radius 最小・低リスクを先行。
- **内容**:
  - **C10 L0 F項目**（監査 L0 #3,4,6,7,8）:
    - 1w/1m チップに `Chip.jsx` primitive を適用（#3・primitive 適用漏れ・`Hero.jsx`）
    - WL 追加ボタンを価格行右端 inline → **右上**へ配置（#4・配置のみ・`Hero.jsx`）
    - 相場地合いサマリーを「1行 + バッジ」→ **3セル grid**（#6・**§38 文言は実装維持**・`L1SummaryBuckets.jsx`）
    - RS を「ラベルのみ」→ **数字 + ゲージバー**（#7・**RS 閾値ロジックは不変**・`L1SummaryBuckets.jsx`）
    - 最終更新「X分前」を L0 に追加（#8・CLAUDE.md「動的データに最終更新併記」/ epoch 自動判定 `input < 1e12 ? *1000 : input`・`Hero.jsx` or `L1SummaryBuckets.jsx`）
  - **C7 期間別リターン**（監査 ③ gap / 決定A）: L0(Hero) mini を **1W/1M → 1W/1M/3M に拡張**（`Hero.jsx:272-277` 局所）。データ既取得・perf 無影響・過去確定リターンゆえ §38 safe（投資業界色OK）。
    - **⚠️ §③ の8期間フルグリッドは折りたたみ維持**（2026-06-30 de-noise user gate を覆さない・10Y outlier を前面化しない）。本 sprint で §③ は触らない。
- **触るファイル**: `frontend/src/features/judgment/components/detail/Hero.jsx`、`sections/L1SummaryBuckets.jsx`、`components/ui/Chip.jsx`（適用のみ）。
  - ⚠️ **監査台帳の `sections/L0IdentityBand.jsx` は実在しない**（main が `find` で裏取り）。L0 識別バンドは `Hero.jsx`（ticker/sector pill/WL/期間別リターン/chip）+ `L1SummaryBuckets.jsx`（RS/相場地合い/判定サマリー）に分割実装されている（v4-impl SPEC Sprint 1 とも整合）。Phase D 着手時に各 F 項目の正確な render 元を最終特定すること。
- **呼ぶ skill**: `designing-workspace-ui`（design SSOT 経由）、`design-system-check`。
- **完了判定**: build + vitest pass / design-system-check 違反0（token 経由・raw hex/shadow なし）/ RS 閾値ロジック不変（grep で確認）/ §38 grep / post-deploy 本番 authed snap で「L0 3セル grid・chip枠・RSゲージ・WL右上・X分前・3M列」を目視。

### Sprint 2 — gold 縁取り復活（C1）【danger zone 単独 sprint】
- **目的**: L0 縁取り（監査 L0 #1）+ 判定カード縁取り（#5）を neutral → **gold 復活**（user 承認）。**単独 sprint・単独 commit**で blast radius を隔離。
- **⚠️ Phase D 着手前に必読**: memory `feedback_gold_accent_continuity`（gold は全 panel 一貫でないと noise）= **glow postmortem**。`docs/references/design_recipes.md §C-1〜C-4`（発光バグ教訓）。
- **内容**: L0 識別バンドの外枠（border=`var(--border)` neutral → gold token + shadow）+ 判定カード（候補 `VerdictHero.jsx`）を gold 縁取りへ。gold token は `docs/references/elevation_scale.md` の whitelist 経由（raw hex 禁止）。
- **触るファイル**: L0 band の外枠ラッパ（`Hero.jsx` or `JudgmentDetail.jsx` の L0 区域・**Phase D で特定**）、判定カード（`VerdictHero.jsx` 候補・Phase D で特定）。※監査の `L0IdentityBand.jsx` は phantom（Sprint 1 注記参照）。
- **danger zone**: **発光系（`.panel-card` / `.bs-panel` / `.surface-card`）は触らない**。`index.css` を触る前に design_recipes §C-1〜C-4 必読。入れ子 `surface-card` 禁止・`contain: paint` 禁止・compound `.X.is-arriving:hover` 4セット必須。
- **注記**: 監査 #1/#5 の agent 根拠 commit `a1f9c3e` は **git に存在せず捏造**。実装は git 証拠でなく **user 承認 + memory 原則**に基づき慎重に行う。
- **完了判定**: design-system-check 違反0（gold は whitelist token・raw hex/shadow なし）/ gold が L0 + 判定カードで**一貫**している（continuity 原則）/ 他 panel と不協和でないかを `vision-eval`（3 run mean）または **user 目視 gate**で確認。

### Sprint 3 — ⑤ summary 動的復元 + Pro tag primitive + In-line色（C2 + C5 + C3判断）
- **目的**: ⑤「その他」横断の summary 静的化 drift（F・4 fold）を **非LLMデータで動的復元**し、Pro tag primitive を拡張、In-line の色を是正。**§⑤ 最大の訴求回復**（監査総括）。
- **内容**:
  - **C2 summary 動的復元**（非LLM算出ゆえ復元可・監査 c1/d1/e1）:
    - 8Q: 「発表翌日の株価変化」→「Beat N回 平均+X.X%…」（`JudgmentDetail.jsx:967`）+ **Pro tag**
    - Insider: 「直近90日の売買」→「買付 N件 $X.XM」（`JudgmentDetail.jsx:987`）
    - ニュース: 「一次ソースへのリンク」→「最新N件・X時間前更新」（`ContextSection.jsx:44`）
  - **Pro tag primitive 拡張**: `primitives/AccordionSection.jsx` に pro-tag サポートを追加（現状 grep 0件）。collapsed summary に Pro indicator を出せるようにする（C2 8Q の前提）。
  - **C5 In-line の色**: amber → **neutral（灰）**（監査 c3 / M / user 承認）。`EarningsReactionPanel.jsx:18` の `VERDICT_COLOR['in-line'] = 'var(--color-warning)'` を中立 token（`--text-muted` 系）へ。色ルール「警告=amber」を中立事象（サプライズなし）に使わない。
  - **C3 市場の声 summary**（監査 b1）: LLM source 制約（collapsed unmount）で単純復元不可 → **default は defer**（Phase D で判断）。設計する場合のみ非LLM sentiment signal を別 sub-task 化（§4 の Hallucination Guard 制約を厳守・LLM narration 生成の近道は禁止）。
- **触るファイル**: `JudgmentDetail.jsx`、`ContextSection.jsx`、`EarningsReactionPanel.jsx`、`primitives/AccordionSection.jsx`、必要に応じ `InsiderPanel.jsx`。
- **⚠️ 注意**: `AccordionSection.jsx` は **primitive = 全 fold に影響** → 慎重に・回帰確認。`JudgmentDetail.jsx` は **Sprint 5 でも触る → sprint間 commit 必須**（§9 落とし穴1）。
- **呼ぶ skill**: `designing-workspace-ui`、`hallucination-guard`（C3 設計時のみ）、`design-system-check`。
- **完了判定**: build + vitest / design-system-check 違反0 / In-line が neutral（grep `VERDICT_COLOR`）/ §38 grep / 追加数値が既存 non-LLM データ由来（`aggregator/*.py` に LLM SDK import なしを grep）/ post-deploy snap で「4 summary の動的値・Pro tag・In-line 灰」を目視。

### Sprint 4 — ①決算 来期コンセンサス確認 + 良い決算連続（C8 + C9）
- **目的**: 来期コンセンサスの §38 安全性を確認し、良い決算連続回数を新規配線。
- **内容**:
  - **C8 来期コンセンサス**（監査 ①-2/3 / M）: mockup の緑は §38 違反 → **実装の色なしを維持**（触らない）。表示方法レイアウトのみ Phase D で再確認（F? = 確認のみ・確定すれば軽微修正）。
  - **C9 良い決算の連続回数**（監査 ①-4 / N）: **PR #117（OPEN draft）を merge + frontend 配線**。#117 は backend `quarterly-history` に `beat_streak`（EPS beat AND 売上 beat の連続期数）/ `eps_yoy_acceleration` を追加済 + `EarningsGrowthSpark.jsx` に summary chip 行（「良い決算 NQ連続」緑 / 「EPS成長 加速↗/減速↘」加速=緑・減速=amber）を実装済。→ Phase D で **#117 を先に merge** し、`cache_key v4` で旧 cache 失効 → 本番反映後に目視。
- **触るファイル**: ①決算 section component（来期コンセンサス表示・Phase D で特定）、`EarningsGrowthSpark.jsx`（#117 で配線済）、`backend/app/main.py` `quarterly-history` handler（#117）。
- **⚠️ 注意**: #117 は別 PR・別 base sha（`2442401`）→ Phase D で **rebase/merge 順序に注意**。§38: 来期/将来に色をつけない（緑BAN）。`beat_streak` の in-line は streak を切る（#117 設計・過大表示防止）。
- **完了判定**: #117 merge + 本番 cache_key bump 反映 / 来期コンセンサスが色なし維持（grep）/ §38 grep / post-deploy snap で「良い決算 NQ連続」chip + 来期コンセンサス無彩色を目視。

### Sprint 5 — ③テクニカル 買いゾーン累進開示（C11）【最大・§38 multi-review 対象】
- **目的**: 買いゾーン状態の累進開示 + 押し目・リスク 4 tiles。**§38 の核心 sprint**。
- **内容**（v6 mockup L274-278 由来）:
  - **累進開示**:
    - 未検出銘柄は「— 未検出（対象外）」表示（MSFT/GOOG/NVDA 非表示・cup scanner=0 と整合・正しい挙動）
    - 「ブレイク待ち → ブレイク確認」遷移で**初めて**「↓ 買値 −8% 損切り」+ ブレイク確認ゾーン（Pivot〜+5%）強調が出現
    - **§38 核心: ブレイク前に損切りラインを見せない**（「下落余地=買い場」の押し目買い誤読を独自プロトコルが否定）= state gate で表示制御
  - **押し目・リスク 4 tiles（要確認）**: 52週高値距離 / pivot距離 / ATR / 出来高トレンド（データは backend にあり: `pivot_distance_pct` / `ad_volume_ratio` 等）。UI 有無は **未確認 → Phase D 着手時に diff**。
  - **流用可（新規実装は累進開示 + 4 tiles のみ）**: pivot ライン（`StockPriceChart.jsx:172-211,552-586` ReferenceLine + tooltip 実装済）/ buy zone 帯（同 L586 `ReferenceArea`/`ReferenceDot` 派生 props 抽出済）/ データ（endpoint が `pivot{price,date}` + `pivot_distance_pct` + `box_support` + `ad_volume_ratio` 返却）/ 配置（`JudgmentDetail.jsx:818,833` でチャート + PriceLadder の 1ユニットに統合済）。
  - **buy zone 色**: v6 mockup は `#94a3b8`（neutral グレー）・緑不使用 → **§38 既に安全**。
- **触るファイル**: `StockPriceChart.jsx`（**~1907行・大ファイル**）、`JudgmentDetail.jsx`（PriceLadder 配置）、必要に応じ新規 RiskTiles component。
- **⚠️ 注意**: `StockPriceChart.jsx` は CLAUDE.md context 閾値超（800行超）→ **Generator は offset/limit Read / 全文取込み禁止**（崩壊防止）。`JudgmentDetail.jsx` は **Sprint 3 でも触る → sprint間 commit 必須**。primary selector は **data-testid**（§9 落とし穴2）。snap-*.mjs を新規作成する場合は §9 落とし穴3/4 + visual harness 4条件遵守。
- **呼ぶ skill**: `stock-chart` / `chart-tab`、`hallucination-guard`（§38）、`multi-review`（6体）。
- **完了判定**: build + vitest / §38 grep（損切りライン表示条件 = **ブレイク確認後のみの state gate**）/ 未検出銘柄（MSFT 等）で「対象外」表示・損切りライン非表示を確認 / **multi-review 6体合議**（§7 参照）/ post-deploy snap で「未検出銘柄（対象外）」と「cup-detected 銘柄（累進開示）」の両方を目視。

### Sprint 6 — 統合 mockup 作成 + M決定の mockup 側反映 + C4/C6 spec 確認
- **目的**: v5 のテクニカル章を v6 で差し替えた**単一正本 mockup**を作り、確定した M 項目を mockup 側に反映（実装は変えない = mockup を直す）。将来の fidelity 監査が単一正本を持てるようにする durable 成果物。
- **なぜ後半か**: M 決定（C5/C6/d3/C8）は監査台帳で既に確定済のため、Sprint 1-5 の実装は **監査台帳 + v5/v6** を直接参照すれば足りる。統合 mockup は実装後に「実装と一致した単一正本」へ収束させる位置づけ（handover「統合 mockup（Phase C 後半）」）。
- **内容**（mockup 側の編集のみ・deploy 無影響）:
  - **C5**: In-line を緑/amber → **灰**（実装の neutral と一致）
  - **C6**: アナリスト視点を `<details open>` → **closed**（折りたたみ維持・mockup を実装に合わせる=M / `f-sum` が目標$/n を常時表示し原則①充足 / **gate 常時文言は追加しない**＝決定E）
  - **d3**: Insider 13F「FMP Ultimate で開放予定」文言を **削除**（景表法§5・Trust Cliff・v115 実装に合わせる）
  - **C8**: 来期コンセンサスの緑 → **色なし**（実装維持）
  - **C4**: 市場の声 Pro gate を「単純 gold 文言」→ **既存 teaser UI（blur+CTA）の記述**へ（gold 文言不要・3体レビュー妥当確認済）
- **触るファイル**: `docs/specs/mockups/pane3-full-v5.html`（+ v6 統合 → 新 `pane3-full-v7.html` を正本化、または v5 を上書き）。
- **完了判定**: 統合 mockup が単一正本として上記 M 決定を反映 / 13F「FMP Ultimate」文言が mockup から消えている（grep）/ In-line 灰・アナリスト closed・来期色なしを目視 / `mockup-fidelity` skill で実装との 1:1 を再監査して drift 0。

## 6. 触ってはいけないファイル一覧（Phase D への禁止指示）

以下は本 Phase の **どの sprint でも触らない**（該当 sprint が隣接する場合は特に注意）:

- `backend/app/visualizer/prompt.py`（Hallucination Guard pre-commit Check 1）— 本 Phase は非該当
- `backend/app/aggregator/*.py` への LLM SDK import（pre-commit Check 3）— C2/C9 の数値は Python 既存集計、新規 import しない
- `backend/app/visualizer/prompt_negatives.py`（法務 anchor）— 非該当
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX`（typo 修正以外禁止）— 非該当
- `frontend/src/App.jsx` の **sticky 検索 div / `.sticky-search-band`**（8回試行錯誤の安定領域）— 触らない
- **発光系 `.panel-card` / `.bs-panel` / `.surface-card` 関連 CSS**（発光バグ高リスク）— **特に Sprint 2（gold）で隣接するが触らない**
- `frontend/src/index.css`（触る前に design_recipes §C-1〜C-4 必読・Sprint 2 で慎重に）
- `migrations/*.sql`（DB schema）/ `railway.toml` cron 定義 / `.claude/launch.json`（人間用）— 非該当
- `handover_*.md`（read-only reference）
- `docs/specs/AUDIT_pane3_2026-07-01.md`（**SSOT・read-only**。方針変更が要るなら user gate で台帳を更新）

> Sprint 5 の `StockPriceChart.jsx`（~1907行）は「触ってよいが**全文取込み禁止**」（offset/limit Read で部分参照・tool-call 崩壊防止）。

## 7. multi-review 必要性判定

CLAUDE.md「6体 vs 3体」3軸を本 Phase に適用:
1. **LLM 出力品質（景表法/金商法/hallucination）**: Phase 全体は LLM 不使用だが、**§38（金商法§38 断定的判断の提供禁止）が C11 で active**（損切りライン/将来表示の制御）。
2. **Trust Cliff（LP 訴求 vs 実装）**: C1 gold（brand 訴求）/ C4 市場の声 gate / a3 アナリスト gate で active。
3. **新 backend endpoint + RLS/認証境界 + cache 設計**: 新 endpoint なし（C9 は既存 `quarterly-history` 拡張・C11 は既存 `cup_handle` データ流用）→ inactive。

**判定（sprint 別）**:
- **Sprint 5（C11 ③テクニカル §38）= 6体合議必須**: 軸1（§38 将来/損切りライン表示制御）+ 軸2（誤読防止 Trust Cliff）の 2軸 active。reviewer = 金融Opus（§38）+ funnel-cro + frontend-architect/§38 を含む 6体（handover 明示の「§38 multi-review 対象」）。
- **Sprint 2（C1 gold 復活）= 3体 + user 目視 gate**: 軸2 のみ active だが danger zone（発光バグ再発）ゆえ ui-designer + frontend-architect + qa-dogfooder の 3体 + `vision-eval` / user 目視で continuity 確認。
- **Sprint 1 / 3 / 4 = 3体 or 不要**: frontend 局所 + 既存 schema 維持。design-system-check + post-deploy snap で代替可。設計判断が生じた場合のみ 3体（C3 設計時は funnel-cro + hallucination 観点）。
- **C4（市場の声 Pro gate 妥当性）= 確認済**（Phase B/C で 3体レビュー実施・既存維持で決着）。Sprint 6 では再レビュー不要。

## 8. 想定リスク + roll-back plan

| sprint | 失敗時に壊れるもの | roll-back |
|---|---|---|
| 1 | L0 レイアウト崩れ・RS 数値の閾値誤り | PR 単位で `git revert` → Railway 再 deploy。RS 閾値は不変なので算出は無傷 |
| 2 | **最高リスク**: gold 滲み・発光バグ再発（v54-v59 の溶け再来） | 単独 commit ゆえ即 revert 可。`design_recipes §C` 違反を design-system-check が機械検出。user 目視 gate で merge 前に止める |
| 3 | primitive `AccordionSection` 拡張で全 fold 回帰 / summary 数値の誤表示 | vitest + post-deploy snap で検出。primitive は後方互換で追加（既存挙動を default 維持） |
| 4 | #117 merge 起因の cache 不整合 / 来期に誤って色付与（§38 違反） | #117 は cache_key bump で旧 cache 自動失効。§38 grep で色付与を merge 前に検出 |
| 5 | **法務リスク**: ブレイク前に損切りライン露出（§38）/ 大ファイル編集で崩壊 | 6体合議 + §38 grep で state gate を検証。大ファイルは offset/limit Read。revert は PR 単位 |
| 6 | mockup（doc）のみ・deploy 無影響 | git revert（実害なし） |

- **全体 roll-back**: 各 sprint は独立 PR squash-merge → 問題は PR 単位で `git revert` + Railway 再 deploy（push で auto-deploy・`/health` の commit sha で確認）。
- **最優先で止めるべき**: Sprint 2（発光バグ）と Sprint 5（§38 法務）。両者は merge 前に user/6体 gate を必ず通す。

## 9. PGE 落とし穴 mitigation（pge-loop-debugger 連携・Phase D 厳守）

`pge-loop-debugger` の 4 落とし穴を本 Phase の Generator/Evaluator に inject:

1. **落とし穴1（sprint 間継承漏れ）**: `JudgmentDetail.jsx` は **Sprint 3（C2）と Sprint 5（C11）で触る**。`Hero.jsx` は Sprint 1（C7/C10）と Sprint 2（gold 外枠候補）で隣接。→ **同一 file を触る sprint 間は必ず commit してから次 sprint の worktree を切る**（main から fresh branch する `git worktree add` が前 sprint 変更を継承しないため）。
2. **落とし穴2（selector hallucination）**: C10/C11 で selector を扱う → **primary selector は `data-testid`**。snap で検証する箇所は production HTML を curl + grep で実在確認してから semi-trust。
3. **落とし穴3（ES module top-level return）**: Sprint 5 等で `frontend/scripts/snap-*.mjs` を新規作成する場合、**top-level（try 直下含む）`return` 禁止**（`async main()` でラップ）。Evaluator L1 で `node --check <path>` 必須。
4. **落とし穴4（infinite animation）**: snap script で `getAnimations().finish()` を呼ぶ箇所は **try/catch + iterations check でラップ**（無限 animation に `.finish()` で `InvalidStateError`）。
- snap-*.mjs は CLAUDE.md「Visual Diagnostic Harness Exception」4条件（`snap-*.mjs` 命名 / headless 固定 / 60秒以内 hard timeout + `finally close()` / 出力は `.visual/` のみ・HTTP server 起動なし）を全て満たす。

## 10. C1-C11 → Sprint トレーサビリティ

| # | 項目 | 分類 | 担当 sprint | 備考 |
|---|---|---|---|---|
| C1 | gold 縁取り復活 | 要 user gate→承認 | **Sprint 2** | danger zone 単独・glow postmortem 必読 |
| C2 | summary 動的復元（8Q/Insider/ニュース） | F | **Sprint 3** | 非LLM・Pro tag primitive 拡張含む |
| C3 | 市場の声 summary | F（制約） | **Sprint 3** | LLM 制約で default defer |
| C4 | 市場の声 Pro gate | P | **Sprint 6**（確認のみ） | 既存 teaser UI 維持・3体確認済 |
| C5 | In-line の色 | M | **Sprint 3**（impl）+ **Sprint 6**（mockup） | amber → 灰 |
| C6 | アナリスト視点 | M | **Sprint 6**（mockup） | 実装は no-op（折りたたみ維持・gate文言追加せず） |
| C7 | 期間別リターン | （拡張） | **Sprint 1** | 1W/1M → 1W/1M/3M（§③8期間は折りたたみ維持） |
| C8 | 来期コンセンサス | M | **Sprint 4**（確認）+ **Sprint 6**（mockup） | 色なし維持（§38） |
| C9 | 良い決算連続回数 | N | **Sprint 4** | PR #117 merge + 配線 |
| C10 | L0 F項目 | F | **Sprint 1** | chip枠/WL配置/3セル/RSゲージ/X分前 |
| C11 | ③テクニカル累進開示 | N | **Sprint 5** | §38 核心・6体 multi-review・最大 |

---

## 付記: gate1（user 承認）の選択肢

- **採用** → Phase D を新セッション・専用 branch で開始（推奨着手順 = Sprint 1 → 2 → 3 → 4 → 5 → 6。低リスク先行・danger zone/§38 は中盤で gate を厚く）。
- **修正指示** → 本 SPEC を更新（sprint 統合/分割・優先度変更等）。
- **中止** → SPEC を残置（将来再利用可）。

> 本 SPEC は `docs/specs/AUDIT_pane3_2026-07-01.md`（C1-C11 SSOT）から導出。方針の SSOT は監査台帳であり、本 SPEC と齟齬が出た場合は **台帳を優先**（台帳変更は user gate）。
