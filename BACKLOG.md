# BeatScanner 計画資産 棚卸し台帳 (Plan Inventory)

> **目的**: Claude が memory / handover に積み上げた「これから作る／変える」構想 36 件を、大貴さんが
> 一望して取捨選択するための**単一台帳**。これを唯一の計画 SSOT とし、取捨選択後は各 memory の計画部分を
> ここへ集約 → memory 側は技術知見のみ残す（＝ドキュメントをネットで減らす）。
>
> **凡例**
> - 状態: ✅ 実装済(本番 live) / 🟡 部分実装(着地 + 残あり) / ⬜ 未着手(構想のみ)
> - 出所: 🧑 user 起点の証拠あり / 🤖 user 明示の痕跡なし(handover / subagent / Claude 起点)
> - 判定: 大貴さんが記入 → `残` 続ける / `打` 打ち切り・削除 / `保` 保留 / `？` 要議論
>
> 作成 2026-06-13。出所証拠は memory 各ファイル本文から逐語抽出（Claude は残す/捨てるを判定していない）。

---

## ✅ 判定結果 (2026-06-14 大貴さん walkthrough) — 本サマリーが判定の SSOT

> A/B/C を1項目ずつ取捨選択 + 新規 D1-D3 を追加。**重要な構造変化: Pane 4・5 は封印**（関連項目が moot 化）。

### 残 (やる)
- **記事自動配信(KB連携)軸**: A1 記事生成(→B15) / A2 トピック発見(→B15 WS1) / A3 KB連携 / B15 記事配信 WS2-3 — KB に過去 note/じっちゃまライブを構造化登録中、目標=じっちゃま note 級の自動配信
- **高額プラン差別化軸**: A9 ¥9,800 tier(AIチャット) / B1 CAN-SLIM(EPS厳選基準25/50/100%+ボックスレンジもみ合い提案) / B3 FMP transcript LLM+未活用情報 / B4 FMP未活用情報 / B13 Stripe checkout
- **テクニカル/Pane3軸**: B7 Pane3図解redesign(⚡優先UP・Fable5相談) / B10 テクニカルpillar2 Phase4(縮尺タブ含む) / B12 CCコールtranscript
- **配信(管)軸**: A8 プラン変更UI+決算メール配信登録/解除設定 / D1 ガイダンス修正3面表示(planner SPEC化決定)
- **個人化軸**: B9 個人化backtest+レコメンド(B5と一体設計)
- **release軸**: B11 特商法表記+funnel計測
- **新規**: D2 Pane3冒頭 verdict(Beat/Miss)+AI要約の撤去/再設計(grill-me) / D3 プットコールレシオ実装(じっちゃま/オニール重視)

### 保 (保留)
- B5 ポートフォリオ改善(買値登録→チャートに損切り-8%表示/履歴の見やすさ/機能不足) — サブエージェントレビュー希望
- B6 Pane3欠落ブロック — どのコンテンツか要提示してから判断
- B14 Next.js移行 — 記事タブ着手近接時に再判断(スマホ/iOS目標とは別路線=PWA/RN)
- C7 指数数(6→18) — 議論。指数より put/call ratio を優先(→D3)

### 打 (やめる/既に完了・封印)
- A4 ホーム個人化 / A5 旧Home復活 / A6 チャートhybrid(✅実装済・全ユーザ解放) / A7 業績1段化(✅現UIで解決) / A10 100点メタ文書(ただし「今何点→点数UPに何が要る」の質問法は今後も使う) / A11 Pane4デザイン(封印) / A12 和訳トグル統一(封印)
- B2 LINE配信(ROI不明、ユーザ拡大後) / B8 Pane4/5 redesign(封印) / B16 Pane4 roadmap(封印)
- memory: migration_v61_to_v62 削除済 / article_generator+hot_topic を news_distribution に統合・削除済

### 完了確定 (確認のみ)
- C1-C5 OK(完了確定) / C6 guidance_history 残す(D1の土台) / C8 pane3_load_perf 残す

### 🎯 浮かび上がった3つの太い塊
1. **記事自動配信 (KB連携)** = A1/A2/A3/B15/B3 — 北極星「管=配信」の本丸、KB登録 active
2. **高額プラン差別化** = A9/B1/B3/B4/B13 — 「月5万でも安い」の根拠 (AIチャット/厳選screener/FMP未活用/Stripe)
3. **Pane3・テクニカル・ポートフォリオ 再設計** = B5/B7/B10(縮尺)/D2/D3 — ⚡ Fable5 デザイン相談で着手

### 🔴 最優先・時間制約あり: Fable5 デザイン相談
B7(Pane3図解の方向性: 初心者向け会社概要 vs 上級者向け) / B10 縮尺タブ(存在感が薄い) / B5 ポートフォリオ改善 / D2(Pane3冒頭 verdict 再考) を Fable5 サブエージェントで精査 (user: Fable5 封印ニュース前に相談希望)。

---

## A. 未着手・構想のみ（取捨選択の主対象・12 件）

| # | 構想 (memory) | 一言 | 出所の証拠 | 判定 |
|---|---|---|---|---|
| A1 | article_generator | AI 分析記事を 3-role で自動生成 | 🧑「広瀬隆雄氏が note に書くような記事を AI で」(2026-05-12 相談) | |
| A2 | hot_topic_discovery | SEC/RSS/Reddit を多段 AI でホットトピック発見 | 🧑 2026-05-12 user 相談で構想化 | |
| A3 | kb_integration | 投資 KB を 5 テーブル sync・記事配信連携 | 🧑 相談 + 「名前封印 user 決定」+ WS3 gate1 採用 | |
| A4 | home_personalization | ホームを「自分専用の朝刊」に個人化 | 🧑 2026-05-10 再提起 +「実装時グリルミーで詰めたい」 | |
| A5 | workspace_home_revival | 旧 SPA Home 3 section を workspace に復活 | 🧑 相談 +「今じゃなくてもいい」 | |
| A6 | chart_hybrid_design | 折れ線 default + Premium ローソク足 toggle | 🧑「Premium 限定で玄人欲も満たせる、ベスト」採択 | |
| A7 | earnings_history_grouped_redesign | 過去業績 3 段 → grouped bars 1 段化 | 🧑「3 段が見づらい、1 段化してほしい」+ 採択 | |
| A8 | logout_plan_management_ui | ログアウト + プラン表示/変更 UI + pricing | 🧑 v138.5 dogfood で発見、priority 低 | |
| A9 | signature_tier_10k_strategy | ¥9,800 最上位 tier「Co-Pilot 自動執行」 | 🧑「月1万以上の tier を正当化したい」+ user 承認 | |
| A10 | 100point_roadmap | 全体 100 点満点評価 + 改善優先順(メタ文書) | 🧑「現状何点 / 100 点には何が必要か」質問 | |
| A11 | pane4_design_backlog | Pane4 の窮屈さ・カラフル過多 + 初回ロード feedback | 🧑「2 件の違和感を報告。良い案が思い浮かばない」 | |
| A12 | pane3_pane4_ui_unification | 和訳トグル UI 統一 + Pane3 パネル枠廃止 | 🤖「user が指摘」の一文のみ(明示承認なし) | |

---

## B. 部分実装・残あり（継続 or 完了を判断・16 件）

| # | 構想 (memory) | 着地済 | 残 | 出所 | 判定 |
|---|---|---|---|---|---|
| B1 | canslim_screener_expansion | Phase3 S1-S5b 本番検証済 | S5b 採否待ち / Phase4 | 🧑 発表会 FB + user 確定 | |
| B2 | cup_handle_design | Phase1+2 着地 | Phase2.6(LINE/inbox)未 | 🧑「最優先 user 要望 2026-05-17」 | |
| B3 | fmp_ultimate_deferred | Ultimate 契約 + Phase2 図解 | Phase3 transcript LLM | 🧑「release 前に課金開始」確定 | |
| B4 | fmp_ultimate_roadmap | 13F/議員/インサイダー/bulk live | ④ETF 保有未 / global | 🧑「高額なのでフル活用したい」明示 | |
| B5 | pane3_abstraction_consensus | Phase0-2 着地 | Phase3-7 未 | 🧑「portfolio も Pane3 で」提案 | |
| B6 | pane3_completion_backlog | Phase1 完了 | Phase2-4(5-8 人日) | 🧑 スクショ比較で欠落発覚 | |
| B7 | pane3_visual_explainer_redesign | Phase3-5.5 着地 | Phase6 (OGP+SEO) 未 | 🧑「完成度アップ + 競合マネ不可」要望 | |
| B8 | pane45_redesign | P1-2 着地(migration 適用) | P3-7 未 | 🧑「現状 Pane4/5 破棄 OK」+ 4 体 verdict 同意 | |
| B9 | personalization_backlog | per-ticker P/L MVP 完了 | バックテスト/レコメンド未 | 🧑 dogfood 2026-05-16 提案 | |
| B10 | pillar2_technical_redesign | Sprint1+4+5+6 着地 | Phase4-A/B/C user gate3 待ち | 🧑「テクニカルを pillar 2 昇格」戦略相談 | |
| B11 | pre_release_feature_review | GA4+Clarity live | 特商法表記 / funnel 計測残 | 🧑 verdict user 承認済(YouTube 起点) | |
| B12 | quarterly_3conditions | 条件3 + 来期着地 | CC transcript LLM (Phase3) | 🤖「D3 6 体合議」のみ(user 明示なし) | |
| B13 | tier_pro_premium_restructure | Phase1-2 着地 | Phase3 Stripe checkout 未 | 🧑 dogfood bug 起点 + user 判断 | |
| B14 | migration_v61_to_v62 | workspace 化着地 | Next.js 移行は延期(STALE) | 🧑 方針転換決断(2026-05-10) | |
| B15 | news_article_distribution_roadmap | Phase0/WS1 着地(保留) | WS2-3 残 | 🧑 2026-06-05 相談 + §38 合意 | |
| B16 | pane4_roadmap_round16 | §C 4 件本番反映 | 残 12 件 | 🤖 5 体並列レビュー起点(user 明示なし) | |

---

## C. 実装済・完了確定（確認のみ・8 件／取捨選択不要）

| # | 構想 (memory) | 状態 | 出所 | 残メモ |
|---|---|---|---|---|
| C1 | backtest_phase1_design | ✅ backtest live | 🧑 dogfood「実績証明が必要」提案 | Phase2.2 まで着地 |
| C2 | chapter_summary_jitchama_style | ✅ default ON live | 🧑 dogfood 指定 + 承認 | 残: 真のガイダンス修正判定(user 要望) |
| C3 | forward_visibility | ✅ live | 🧑 dogfood + user 判断 | カウントアップ未解決のみ |
| C4 | competitor_nav_breadcrumb | ✅ ほぼ live | 🧑 dogfood 起点 | 残: accordion 復元 DEFER |
| C5 | cup_handle_phase2 | ✅ nightly scan + mail live | 🧑 要望 Top3 | — |
| C6 | guidance_history_foundation | ✅ Sprint1-4 live | 🤖 user 質問あり・設計承認記述なし | — |
| C7 | indices_tier2_v2 | ✅ 6→18 実装済 | 🤖 user 起点なし(3 体レビュー判断) | — |
| C8 | pane3_load_perf | ✅ 完了確定 | 🤖 メイン施策 user 起点なし(handover 由来) | — |

---

## 要確認: user 承認の記憶なく本番で動いている疑い（🤖 かつ実装済）

- C6 guidance_history_foundation / C7 indices_tier2_v2 / C8 pane3_load_perf / B12 quarterly_3conditions / B16 pane4_roadmap_round16
- → 「これは頼んだ覚えがある／ない」を大貴さんが確認。「ない」なら、機能として残す価値があるか別途判断。

---

## 集計

| グループ | 件数 | 🧑 user 起点 | 🤖 明示なし |
|---|---|---|---|
| A 未着手 | 12 | 11 | 1 |
| B 部分実装 | 16 | 14 | 2 |
| C 実装済 | 8 | 5 | 3 |
| **計** | **36** | **30** | **6** |

---

## D. 2026-06-14 セッション追加 (新規構想・取捨選択対象)

| # | 構想 | 一言 | 出所 | 判定 |
|---|---|---|---|---|
| D1 | guidance_revision_3surfaces | 会社の来期ガイダンス修正(raised/lowered/maintained)を **章サマリー速報・来期見通し・決算メールの3面に構造化表示**。データ源 classify_guidance_revision は既存。§38注意=会社のガイダンス修正(上方/下方修正)とアナリスト consensus drift(引き上げ/引き下げ)を語彙で峻別 | 🧑 2026-06-14「今後の株価を占う重要情報」 | (A) planner SPEC化 決定 |
| D2 | pane3_verdict_legacy_review | Pane3冒頭の **Beat/Miss + AI要約 の撤去/再設計** を検討。5条件のみ時代の遺産で、速報/テクニカル追加後は binary verdict が不自然(現 Beat 2銘柄のみ=gate過厳)。撤去するなら最上部に何を置くか(速報Beat/Miss? 5条件N/5? 総合)をセット設計。brand/§38/UX 重判断 | 🧑 2026-06-14 dogfood気づき | 残・要 grill-me/Fable5 |
| D3 | put_call_ratio | **プットコールレシオ**を実装。じっちゃま・オニールが重視する市場センチメント指標。C7(指数拡張)より優先。配置(Pane2世界市場? 個別?)とdata源(FMP/CBOE)は着手時設計 | 🧑 2026-06-14「指数より put/call を実装したい」 | 残 |
