# handover v317 — スクリーナー上昇トレンドフィルタ 設計確定（2026-07-02）

> 本セッションは **screener workstream**（pane3 とは別軸）。設計打ち合わせがゴールで、実装は次セッション。
> 設計は memory `project_screener_condition_expansion.md` #13 にも保存済（ただし memory はローカル専用 = 出先PC不可視のため、本 handover に自己完結で要点を残す）。

## 🎯 本セッションの主成果：スクリーナー「上昇トレンドフィルタ」の設計確定

### 問題
「静かな強さ」(quiet_quality) プリセットに PBR(ペトロブラス)等が混入。真因 = **RS高止まり**。PBR は原油高(イラン戦争)で急騰→終戦で反落中だが、RS=80・出来高surge-31.5(急騰の出来高が沈静化)・機関QoQ静か・OCF/ROE良 で quiet_quality の全条件を通過してしまう（＝post-spike falling knife が"静かな強さ"に化ける）。market_leading はRS帯45-75上限で PBR(80) は元々除外され混入せず。

### 実データで判明：汚染は2種類（本番universe 2026-07-02・28銘柄分解）
- **A = 落ちるナイフ/下降トレンド**（PBR/NBR/CF/FTI + 石油タンカー株 APA/EOG/FRO/DHT/LPG/INSW/TDW/VAL）: 株価が**下向き50DMAの下**。
- **B = 過熱の急反落**（MU/WDC/STX/STRL = じっちゃま「バブってる」ストレージ勢）: 上向き50DMAの上だが高値から-18〜42%。
- **user 決定: 「A はフィルタ、B は別軸で」** — 上昇トレンドフィルタは A だけ狙い、B（過熱）は既存「買い場圏 pivot+5%上限」の別軸で対応。

### 確定設計（A専用 = 下降トレンド軸のみ）
- **signal**: `pv50`(価格の50DMA乖離%) + `sl50`(50DMA傾き・21営業日)。**高値からの下落率(dd60)は使わない**（それはB=過熱軸の指標で、健全な強い株の一時調整まで巻き込むため）。
- **4段階トグル**: 緩=pv50≥-8% / 標準=pv50≥-3% / 厳=pv50≥0かつsl50≥-2% / 最厳=pv50≥0かつsl50≥+1%。
- **実測件数**（quiet_quality[標準]28件）: 緩→残25 / 標準→残21 / 厳→残18 / 最厳→残18。PBR全段除外。B勢(MU/WDC/STX)は意図通り残留。quiet_quality[緩]98件では標準で石油タンカーコホート丸ごと21件除外（PBR単体を超えた一般化を実証）。
- **KB根拠**（Opus精査・trading.md）: 「価格≥50DMA/ブレイクpivot」必須AND（じっちゃま6/26 AAPL/NVDA を pivot割れで実切り・:77904）/ 50DMA+トレンドライン重視(:76411) / オニール最高値-12〜15%超で売り(:3254)。
- **RS床は「じっちゃま 65→70」に更新**（:68975「RS70=市場平均」/:77892「70切る銘柄にロクなのない」）。
- **バリュー指標(PER/PBR/配当)はコード化禁止**: じっちゃまは絶対閾値ゼロ(:77988方向性のみ)→指標表示+user gate のみ（Trust Cliff回避）。
- **グラウンドトゥルース**: 2026-06-28 じっちゃまライブ診断14銘柄で候補指標を突合（買いSBUX/ABBV/LLY/SNA/V/JNJ 全通過、PBR/SPGI/CTVA/NVDA 除外）。

### 実装の入口（次セッション）
- **backend**: nightly RS scan (`cron_rs_scan` main.py:18045付近) が既に価格履歴を fetch 済 → `_compute_sma`(既存) で pv50/sl50 を追加算出し `rs_ratings` 等にカラム追加（新規migration 1-2列）。universe endpoint (`/api/scanner/universe` main.py:21203) に露出。
- **frontend**: `customScreenerModel.js` に新 facet 追加（quiet_quality の PRESET_PREDICATES に組込 or 独立facet）。§38中立ラベル・件数SSOT(count==list invariant)厳守。
- **推奨フロー**: `/planner` で SPEC 起票（gate1 で閾値 user 承認）→ 実装 → build+vitest+本番件数 before/after → PR。

## 📋 本セッションのその他の完了事項（screener とは別）
- **v310 残タスク**: ①memory昇格 `feedback_screener_megacap_rs_exclusion.md`（mega-cap欠落=RS<80仕様）②nightly megacap-coverage-snapshot 初運用チェックを **scheduled-tasks で 2026-07-02 12:47 JST に自動実行予約**（前回 CronCreate は session-only で消えた反省）。
- **未追跡64ファイル**（SPEC/mockup/snap-*.mjs）を branch `claude/pane3-phase-d-handover-v316`(062a9d9) に commit+push 済。陳腐化 handover 7件削除。
- **PR #117 close**（内容はマージ済 #165 に移行済）。

## ⚠️ entanglement（厳守）
- 本 handover は隔離 worktree の専用 branch `claude/handover-2026-07-02-screener-uptrend`（origin/main=8f43fb6 ベース）に書いた。
- **共有 working dir は別セッションが `claude/sprint4c-s1-guidance-verdict` で作業中**（`backend/app/main.py` に未commit WIP + `docs/specs/SPEC_2026-07-02_guidance-third-point-forward.md`）。**触らない**。
- pane3 も別セッション並行。`git add -A` 禁止 / push はブランチ明示。

## 次セッション用プロンプト（コピペ用）
```
/fetch-handover 起動（対象 handover_2026-07-02_v317_screener-uptrend-filter.md）

最優先: スクリーナー「上昇トレンドフィルタ」の実装。
  1. /planner で SPEC 起票（A専用設計: pv50+sl50 の4段階、閾値は gate1 で承認）
     - 設計詳細は本 handover「確定設計」節 + memory project_screener_condition_expansion.md #13
  2. backend: nightly RS scan に pv50/sl50 追加算出 → universe endpoint 露出（migration 1-2列）
  3. frontend: customScreenerModel.js に facet 追加（§38中立・件数SSOT厳守）
  4. 別軸B（過熱除外の強化: 連続+10%/日、pivot+5-10%上限）は別 backlog

厳守事項:
- 検証 = build + vitest + py_compile + 本番件数 before/after が ground-truth
- deploy は PR → user承認 → merge。git add -A 禁止 / 並行セッションの WIP に触らない
- danger zone: 発光系/gold accent/sticky検索バー/index.css
- RS床は じっちゃま70（65は撤回済）/ バリュー指標はコード化禁止（表示+gate のみ）

【在席状況】（在席で gate都度確認 ／ 不在で default自律 のどちらか記入）
```
