# じっちゃま実践 ⇄ codified手法 差分台帳 (Divergence Ledger)

> **目的**: じっちゃま(広瀬隆雄氏)の実際の投資判断基準と、BeatScanner が codified(明文化・実装)した判断ロジックを 1 対 1 で突き合わせ、**一致 / 矛盾 / 未収録** に分類する living ledger。矛盾・未収録ごとに「BeatScanner をじっちゃま側へ再較正する案」を P/D 併記で提示し、**user 承認後に実装**する。
>
> **核心原則 (memory固定)**: 本アプリは**じっちゃまプロトコル**。O'Neil(CAN-SLIM) とじっちゃまが食い違う所では **じっちゃまを正**として再較正する (O'Neil = 参照、じっちゃま = 北極星)。現 SPEC の閾値の多くは O'Neil anchor なので、本台帳で見直す前提。
>
> SSOT memory: [`project_jijima_oneil_divergence.md`](../../../.claude/projects/-Users-yamadadaiki-Projects-beatscanner/memory/project_jijima_oneil_divergence.md) / 関連 SPEC: [`SPEC_2026-06-18_screener-pane2-3-redesign_draft.md`](../specs/SPEC_2026-06-18_screener-pane2-3-redesign_draft.md) / 原典: [`canslim_oneill_rules.md`](canslim_oneill_rules.md)

---

## データ源 (2026-06-20 抽出)

| 側 | ソース | 抽出方法 |
|---|---|---|
| じっちゃま実践 | `investment-knowledge-base` repo (268ソース = ライブ142本 + 記事126件、`knowledge_base/derived/kb_snapshot.json`、protocol 1,558 / insight 7,060 / claim 1,814) | sub-agent 構造化抽出 |
| codified (docs) | `SPEC_2026-06-18 §②2.3 蛇口カタログ A-G` / `canslim_oneill_rules.md §1-7` / `jijima_protocol.md` | sub-agent 抽出 |
| codified (実装) | `backend/app/main.py` (`_detect_cup_handle` / `_detect_horizontal_support` / `_detect_breakout` / `/api/scanner/*`) / `backend/app/judgment.py` | sub-agent grep (file:line) |

---

## 分類の凡例

| 記号 | 分類 | 意味 |
|---|---|---|
| ✅ | **一致** | じっちゃま実践と codified が整合 (意図的な厳格化を含む) |
| 🟡 | **矛盾(軽)** | 食い違うが、検出主因でない / S2 等の別 workstream に委譲 / 確認待ち |
| 🔴 | **矛盾(重)** | 実害が確認済 (signal 非検出など)。再較正の筆頭 |
| ⚪ | **未収録** | 片側にしか記録がない (じっちゃま独自 or BeatScanner独自 or O'Neil数値のみ) |

§38 注意: 本台帳の再較正案はすべて「事実 (価格・タッチ回数・上昇率・条件合致度) の表現」に留め、「買い」断定・将来予測・最上級を足さない。UI には「じっちゃま」個人名を出さない (内部資料の本ファイルは表記可)。

---

## 差分エントリ (初版 9 件)

### 🔴 D1 — カップのベース前急騰要件 【Q1 第1号・再較正の筆頭】

| 項目 | 内容 |
|---|---|
| **判断軸** | cup-with-handle のベース形成前に、どれだけの事前上昇 (prior uptrend) を要求するか |
| **じっちゃま実践** | **要求の記録が一切ない**。cup は「最も信頼できる唯一のテクニカルシグナル」(`axiom-cup-with-handle-supreme`) としつつ、形状・深さ・事前上昇の数値定義を持たない (「紅茶カップ」=比喩)。UBS のような *gradual riser* を「カップ完成・取っ手形成中＝買い」と判断 (2026-06-18 ライブ, `transcripts/structured/lives/2026-06-18_structured.md`) |
| **codified現状** | `prior_gain ≥ 20% / 90日窓` を要求。左縁 (left_rim) の90営業日前比 (`(prior_end_close - prior_start_close)/prior_start_close < 0.20` → `_reject("no_prior_uptrend")`)。[main.py:13452-13462](backend/app/main.py:13452)、params [13299-13300](backend/app/main.py:13299)。由来 = O'Neil §7.2「形成前に上昇トレンド + RS 30%上昇」。⚠️ docstring [13310](backend/app/main.py:13310) は「60営業日で≥30%」と **stale**（実コードは 20%/90d） |
| **分類** | 🔴 **矛盾(重)** — この 20%/90d gate は **O'Neil 由来であってじっちゃま由来でない** |
| **実害** | 本番 `/api/technical/UBS` で cup 候補17件すべてが `no_prior_uptrend` で reject → cup / breakout / 買いゾーンを一切非表示。UBSは7ヶ月で約+60%だが90日窓では<20%。**gradual riser 型 (大型欧州銀ADR等) が系統的に漏れる**。**2026-06-20 live 再確認**: `patterns.cup_handle.reject_stats = {no_prior_uptrend: 17, handle_pullback_negative: 1}` 継続 |
| **再較正案** | `prior_uptrend` 判定を **OR 条件化**: ①既存 `+20%/90d` (O'Neil 急騰型) **OR** ②*gradual-riser 型* (長期窓で純増 + 上昇MA上 — 例: 150-180日窓で +15%以上 かつ 150/200DMA が上向き)。**完全撤去はしない** (横ばい/下降ベースの誤検出回避)。②の具体閾値は実装時に実データで較正 |
| **P (メリット)** | じっちゃま実践に忠実 / UBS型を拾える / cup signal の機会回収 |
| **D (デメリット・リスク)** | false positive risk (閾値次第で signal 件数が膨張) → **6体合議 + 変更前後の全universe件数 curl 比較が必須** / Trust Cliff (本番 signal 変動) |
| **status** | ✅ **default ON に promote 済 (v228, 2026-06-20)** — 3体合議 (金融§38 + frontend/dev + qa-dogfooder) verdict 反映後 user「フル」承認で普及。<br>**実装履歴**: ①`6f089aa` gradual-riser path 実装 (flag default OFF) ②`cf7d897` frontend dogfood 配線 ③**v228 promote**: backend `get_technical(cup_gradual=True)` default ON + frontend `getCupGradualFlag()` default true + `api.js` 常に `&cup_gradual=0/1` 明示送信 (kill-switch `?cup_gradual=0` を確実化)。<br>**v228 4必須条件 (合議)**: (1) **sustained guard 補強** — 旧「窓中間点1点 ≤ prior_end」は先行スパイク後横ばいを除外できない死角があり (金融指摘)、**窓3分割で各区画 median 単調増 (m1<m2<m3)** に置換し round-trip/V字/スパイク後横ばいを構造排除。(2) §38 ラベル「過延伸」明示 (`stateCompassText.js` '高値圏'→'高値圏(過延伸)'、`ScreenerPane` '高値圏突破'→'高値圏突破(過延伸)')。(3) Pane3 extended chip に **pivot 乖離率を常時 inline 表示** (hover 依存を脱する)。(4) extended chip `tone="muted"`→`tone="warning"` (amber) で clean cup と視覚区別。<br>**検証**: 旧 flag ON で UBS `detected=true`・`breakout_extended`・pivot $47.41 (現値+7%超過)。普及後の本番 curl 件数確認は deploy 後実施。<br>**後続 workstream (3体一致・promote の blocker でない)**: nightly `_scan_one` は `allow_gradual_riser` 未配線 = screener cup/breakout DB は空 (total_count=0) のまま。screener 反映 + extended の amber 視覚区切りは別セッション。per-ticker Pane3 は live で即反映。 |

### 🔴/✅ D9 — 順張り・抵抗線ブレイク → 支持転換 【Q1 quick win】

| 項目 | 内容 |
|---|---|
| **判断軸** | 過去高値 (抵抗線) を上抜けたら買い、抵抗線が支持線に変わる、という順張り思想の signal 化 |
| **じっちゃま実践** | 中核思想。「安値でなく前回高値を超えた時点で入る」(`axiom-buy-on-breakout`) / 「レジスタンスを上に切ると新規買いが一斉に入り、その後サポートに変わる」(`axiom-resistance-becomes-support`) / 新波動の起点 = 究極の防御ライン (`axiom-breakout-base-ultimate-defense`) |
| **codified現状** | breakout 検出 [main.py:13105](backend/app/main.py:13105) と box_support 検出 [main.py:12815](backend/app/main.py:12815) は実装済。UBS は `box_support $46.37` (6 touch) + 新高値 $50.80 → `role=resistance_turned_support` を**既に内部検出済** |
| **分類** | ✅ **一致** (思想は完全一致) — ただし UBS で UI に surface されていなければ事実が埋もれている |
| **実害** | UBS の `resistance_turned_support` が現在 Pane3 UI に surface されているか要確認。されていなければ、じっちゃま思想と一致する「抵抗線ブレイク」の事実が表示されず、D1 とあわせて UBS が「何も signal が出ない銘柄」に見える |
| **再較正案** | Phase 2 Q1-1 で `box_support` の `role=resistance_turned_support` を**事実として surface** (「旧抵抗 $46.37 を6回タッチ→上抜け、現在 $50.80」)。narration は**静的 dict 一択** (LLM不使用、sell zone 静的dict 踏襲) |
| **P** | データは既に検出済 → 低 blast radius の quick win / UBS に即出せる / §38 安全 (事実のみ) |
| **D** | 「買い」と読まれないラベリングの慎重さが必要 (§38) |
| **status** | ✅ **実装済・追加実装不要** — [BuyZoneCard.jsx:75-79](frontend/src/components/BuyZoneCard.jsx:75) で `role=resistance_turned_support` かつ `touch_count≥5` を既に surface (chart の「支持線目安」帯 / PriceLadder も)。2026-05-30 v130 P1 #10 で「ほぼ全銘柄表示」を防ぐため意図的に絞り込み済。**2026-06-20 live 確認**: UBS は現在 `role=in_zone`（新高値 $50.80 から band $45.68–47.07 に押し戻し）のため非表示＝**正常**。band 上抜け時（touch 6）は既存コードで自動 surface。**→ UBS を「買い候補」に見せるには D1（cup 検出）が本丸** |

### 🟡 D2 — RS (相対強度) の位置づけ

| 項目 | 内容 |
|---|---|
| **判断軸** | RS をハードゲートにするか、複数指標の1つとして扱うか / 閾値 |
| **じっちゃま実践** | RS = 70 が市場平均、80 で「アウトパフォーム」、90 で最強 (`axiom-relative-strength-objective`)。ただし「RS という単一指標だけに注目するのは意味がない」「オニールは20のチェックポイントを見る」(`meta-oneil-multifactor`)。RS=26 の保有は「モメンタム重視」と矛盾と批判 (`human-nature-momentum-contradiction`) |
| **codified現状** | screener の RS≥70 はハードゲート (SPEC §D「RS<70 と弱気相場は段階無関係に禁止」)。`/api/scanner/rs` は `min_percentile=80`。**cup 検出ロジックには RS gate が無い** [main.py:13282](backend/app/main.py:13282) |
| **分類** | 🟡 **矛盾(軽・nuance)** |
| **実害** | cup 検出は RS 無関係なので **UBS 非検出の主因ではない** (UBS の RS65 は gate 原因でない)。ただし screener の RS≥70 floor が UBS型 (RS 中位) を候補から隠す可能性 |
| **再較正案** | 当面**据え置き** (RS≥70 floor は O'Neil・じっちゃま両整合)。「RS70未満でも他条件が強い銘柄」を screener で完全排除すべきかは **S2 preset 設計時に再検討** |
| **status** | **観察** (即時アクションなし、S2 で再検討) |

### 🟡 D3 — 営業CFマージン 緩い10% vs じっちゃま15%

| 項目 | 内容 |
|---|---|
| **判断軸** | 営業CFマージンの床値 |
| **じっちゃま実践** | **15〜35%死守**(「安産型ナイス・バディの法則」`axiom-nice-body-law`)。CFPS が右肩上がり / CFPS > EPS / CFPS÷SPS ≥15% (`sector-operating-cashflow-analysis-checklist`) |
| **codified現状** | `judgment.py` のファンダ5条件①は **≥15%** [judgment.py:188](backend/app/judgment.py:188)。一方 SPEC §A の preset は 緩い10% / 標準15% / 厳しい20% |
| **分類** | 🟡 **矛盾(軽)** — じっちゃまが厳しい側。SPEC 緩い10% は O'Neil 寄りの緩和で食い違う |
| **実害** | なし(現状の判定は judgment.py 15%)。SPEC の緩い10% を採用するか否かが S2 preset 較正と直結 |
| **再較正案** | S2 で緩い=10% 採用か 15%据え置きかを**実データ件数で判断** (SPEC ⑥-1 gate)。じっちゃま忠実 = 15%、件数確保優先 = 10%。**CFPS>EPS (条件⑤) は緩いでも死守**は既に SPEC で確定 |
| **status** | **S2 workstream に委譲** (本台帳は記録のみ) |

### 🟡 D4 — 損切りの杓子定規さ

| 項目 | 内容 |
|---|---|
| **判断軸** | 固定%損切りを断定するか、ボラティリティで柔軟にするか |
| **じっちゃま実践** | ▲8%ルールは資金温存のため(`meta-stop-loss-preserve-capital`)だが、「『高値から何%下押し』を杓子定規に当てはめる方法は好まない。ボラタイルな銘柄は平気で1日-5%動く」(`meta-stoploss-not-mechanical-percentage`) |
| **codified現状** | sell zone narration は静的 dict (§38、memory `feedback_sell_zone_static_dict`)。現状の損切り表示が固定%を断定していないか要確認 |
| **分類** | 🟡 **矛盾(軽・確認待ち)** |
| **実害** | もしアプリが固定%損切りを断定表示していれば、じっちゃまの「柔軟」思想と乖離 (§38 的にも「損切り%断定」はグレー) |
| **再較正案** | 現状の sell zone 表示が固定%を断定していないか確認。断定していれば「目安」+「ボラティリティで前後する」注記に緩和 |
| **status** | **確認待ち** (現状仕様の確認が先。既に静的dictで事実表現なら低優先) |

### ⚪ D5 — 年間EPS成長の床値

| 項目 | 内容 |
|---|---|
| **判断軸** | 年間EPS成長率の床値 |
| **じっちゃま実践** | **明示記録なし**(四半期 C は「+18〜20%」と言及するが、年間EPSの具体床値なし) |
| **codified現状** | SPEC §B2 緩い = 3年連続増 + 年率≥10%床 (**BeatScanner独自**) / O'Neil原典 +25% |
| **分類** | ⚪ **未収録** (BeatScanner独自の緩和、「2銘柄問題」対策) |
| **実害** | なし (既 documented divergence) |
| **再較正案** | **現状維持**。じっちゃまが年間EPSを明示しない以上、O'Neil + 独自床で妥当 |
| **status** | **据え置き** (記録のみ) |

### ✅ D6 — ブレイク確定の出来高

| 項目 | 内容 |
|---|---|
| **判断軸** | ブレイク確定に要求する出来高倍率 |
| **じっちゃま実践** | +40〜50% (定性、`axiom-oneill-10-rules-momentum` ⑨「出来高を伴って上がる銘柄」) |
| **codified現状** | confirmed = 50日平均 ×1.5 / soft = ×1.3 (`_detect_breakout` [main.py:13105](backend/app/main.py:13105))。cup ブレイクは ×1.40 |
| **分類** | ✅ **一致** (意図的に厳しめ、breakout session 実データ検証で採用済) |
| **status** | **据え置き** |

### ⚪ D7 — カップ深さ・取っ手の数値

| 項目 | 内容 |
|---|---|
| **判断軸** | cup 深さ・取っ手プルバックの数値定義 |
| **じっちゃま実践** | **定性のみ** (「紅茶カップ」、数値定義なし) |
| **codified現状** | depth 12〜33% / handle pullback ≤12% / cup 7〜65週 (O'Neil §7.2 由来、[main.py:13282](backend/app/main.py:13282)) |
| **分類** | ⚪ **未収録** (じっちゃま定性 / O'Neil数値) |
| **実害** | なし |
| **再較正案** | **O'Neil数値を継続でOK** (じっちゃまが数値を否定していない。形状判定の物差しとして妥当) |
| **status** | **据え置き** |

### ⚪ D8 — PER>50 / 高配当の警告

| 項目 | 内容 |
|---|---|
| **判断軸** | 過熱・危険シグナルの提示 |
| **じっちゃま実践** | PER>50倍は「半分や1/3になるリスク」(`axiom-per-avoids-big-mistakes`) / 配当利回り>6%は危険、>8%は「1年以内に倒産覚悟」(`axiom-high-yield-trap`) |
| **codified現状** | **アプリ未実装** |
| **分類** | ⚪ **未収録** (じっちゃま独自・アプリ欠落) |
| **実害** | なし(現状)。将来「過熱/危険 signal」として価値あり |
| **再較正案** | 将来 backlog。PER>50「過熱注意」/ 配当>6%「警告」を**事実 + 閾値注記**で表示 (§38: 断定でなく事実)。低優先 |
| **status** | **backlog** (将来検討) |

### ✅ D10 — RS 計算の劣化表示（2026-06-20 live 発見 → 同日修正 deploy 済）

| 項目 | 内容 |
|---|---|
| **判断軸** | RS (相対強度) の表示精度 — じっちゃまは RS を重視 ([[D2]]) するので誤表示は実践と乖離 |
| **じっちゃま実践** | RS は重要指標。「下位1%」と「上位」は買い判断を真逆にする |
| **codified現状** | (発見時) 本番 `/api/technical/UBS` の `patterns.rs` = `{self_percentile: 0, ranking_label: "下位 1%", rs_vs_spy_pct: null, universe_percentile: 60}`。UBS は自己高値圏にも関わらず「下位1%」。**※当時の「`rs_vs_spy_pct=null` は SPY 相対計算の失敗を示唆」という仮説は誤り** — 真因は ticker 側 NaN (下記 status)。`spy_unavailable=false` が SPY は取れていた証左 |
| **分類** | ✅ **解決済 (旧🔴矛盾(重)・Trust Cliff)** — 強い銘柄に「下位1%」を表示していた |
| **実害** | じっちゃまが強い買い候補とする UBS に「下位1%」相当の誤った API 値。※frontend は Number.isFinite ガード済 (Sprint B 2026-06-17) で UI には未表示だったが、backend 生 JSON の誤値 + 健全 universe_percentile=60 の巻き添え非表示が実害だった |
| **status** | ✅ **修正 deploy 済 (2026-06-20, commit 65f06c3)**。root cause = Railway IP の yfinance が ADR/欧州銀 (UBS/DB/BCS/HSBC/BBVA) の直近 bar を `NaN` close で返し、`_compute_rs` の `_ratio` が `c_past <= 0` ガードを NaN にすり抜けられ `rs_now=NaN` → JSON で `rs_vs_spy_pct=null`・`rank=0` → `self_percentile=0` →「下位1%」(SMA末尾null・cup_state=nullも同根)。修正 = ① `get_technical` で `hist.dropna(subset=["Close"])` 入口除去（正常値に復旧）② `_compute_rs/_ratio` に `math.isfinite` 安全網（万一の NaN を None suppress、cron_rs_scan にも波及）。本番検証で UBS `{+9.5%, self=49, 中位, univ=60}` 復旧・HSBC/BBVA も復旧・全銘柄「下位1%」消滅。詳細 memory `feedback_rs_nan_propagation_guard.md` |

---

## 優先度サマリー (再較正の着手順)

| 優先 | エントリ | アクション | review |
|---|---|---|---|
| ✅ 済 | **D9** | box_support surface は**既に実装済**（2026-06-20 live 確認）。追加実装不要 | — |
| ✅ 済 | **D1** | cup gradual-riser path を default ON に promote 済 (v228)。sustained guard 補強 (median 単調増) + §38ラベル/乖離率/tone。後続=nightly配線 (screener) | **3体合議 + user承認** |
| 確認 | D4 | 現状の損切り表示が固定%を断定していないか確認 | — |
| ✅ 済 | **D10** | RS 計算劣化（NaN 伝播）修正 deploy 済 (65f06c3)・本番 UBS/HSBC/BBVA 復旧確認 | — |
| 委譲 | D3 | S2 preset 較正 (緩いCFマージン 10% vs 15%) | S2 workstream |
| 観察 | D2 | RS floor は S2 preset 設計時に再検討 | S2 workstream |
| 据え置き | D5 / D6 / D7 | 変更不要 (記録のみ) | — |
| backlog | D8 | PER>50 / 高配当 警告 signal (将来) | — |

---

## status 凡例・運用

- **提案**: 再較正案を提示済、user 承認待ち
- **観察 / 確認待ち**: 即時アクションなし or 現状仕様の確認が先
- **委譲**: 別 workstream (S2 等) で扱う
- **据え置き**: 変更不要 (一致 or 妥当な未収録)
- **backlog**: 将来検討
- **実装済**: 再較正を実装・deploy 済 (commit hash を併記)

本台帳は living document。新たな乖離が見つかったら D10, D11... を追記する。コーパス側に未収録だった判断基準 (利確の具体%、売上成長率の具体値、ガイダンスミス許容範囲、セクター優劣の RS 基準、IPO 買い基準、gradual-riser の定量定義 等) は、じっちゃまの追加発言・記事で補完され次第エントリ化する。
