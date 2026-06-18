# SPEC: スクリーナー Pane 2 + Pane 3 セット再設計（蛇口モデル）

> **status**: draft **v2**（6体合議反映済・実装前 user 最終 gate 待ち）
> **作成**: 2026-06-18 / **v2 更新**: 2026-06-18（6体合議 6/6 条件付賛成 → 必須条件・tier・mobile を反映）
> **scope**: スクリーナータブのみ（Pane2 = `CustomScreenerPanel` / Pane3 = `ScreenerPane` + 詳細 `JudgmentDetail`）。**frontend / IA 中心、backend は再利用**（ライブ件数の facet のみ例外、後述 ⑧）。
> **SSOT**: memory `project_screener_fundamental_threshold_grading.md` / `docs/references/canslim_oneill_rules.md §7`（原典・頁つき）/ `docs/references/jijima_protocol.md` / `backend/app/judgment.py`（ファンダ5条件）
> **調査根拠**: deep-research ×2（①キュレーション型ホーム IA、②master-detail / モバイル畳み / 段階閾値 UI）＋ 原典PDF抽出 ×3（オニール CAN-SLIM / チャートパターン / じっちゃまプロトコル）＋ 6体合議
> **北極星**: ブランド世界観（高級ホテル級）＋ 5原則（特に #1 負担減 / #2 毎日開きたい / #4 人力の代替）

---

## 0. JTBD（第一の job-to-be-done）

> **毎朝の「米国株ユニバース見回り」を肩代わりする ── ユーザーが選んだ強度のファンダ条件（厳しさを調整可能）を満たす銘柄の中から、今チャートが仕掛かっている数銘柄（RS / カップ / ブレイク / リテスト）を探し出し、"今日見るべき少数" を 2 秒で提示する。**

- LP 訴求は「**見回りの肩代わり（探す手間ゼロ）**」まで。「**届く（push）**」は Signature(¥10k) まで約束しない（マーケ体: 混同すると Trust Cliff）。

---

## ① 現状の問題仮説（コード根拠）

| # | 仮説 | 根拠（file:line） |
|---|---|---|
| 1 | スクリーナー Pane3 に **7セクションが等価な縦スタック**で並び優先順位が消失 | `ScreenerPane.jsx:934-1143` |
| 2 | Pane2(Explorer) と Pane3(Hero) が**両方「結果リスト」に見え役割逆転** | `Workspace.jsx:983-1025` |
| 3 | ファンダは **5条件固定の二値**で「本日2銘柄」→ 厳しさ調整不能、モメンタム相場で機会損失 | `judgment.py:185-252` |
| 4 | Pane2 は chip を押さないと RS/Cup が出ず（`activeFilter` 初期 null）操作多・情報少 | `CustomScreenerPanel.jsx:1360,1459` |
| 5 | セクション毎に列構成・表示形式が不揃いで視線起点が定まらない | `ScreenerPane.jsx:939,430` |

**実データ検証で判明（2026-06-18）**: 現行 `/api/custom-screener` は **movers×S&P500 の15候補のみ**を live judge（本日 PASS=GOOGL/AMZN の2銘柄）。フルユニバース(~2451)を走査していない＝「2銘柄」の主因の一つ。→ **再設計はフルユニバース走査前提**（蛇口の件数はこの母数で出す）。

**核心**: 問題はキュレーション方針でなく、セクションの量・階層・2ペイン役割設計。

---

## ② 新IA案

### 2.1 統合モデル（承認済）
**Pane2(master/左)のダイヤルが候補ユニバースを絞る → Pane3(detail/右)がその中の「ファンダ×テクニカル交差」を見せる。** 選択時は右だけ in-place で `JudgmentDetail` に切替、左の調整状態・スクロール位置は保持（master-detail canonical: Stock Rover / PatternFly / M3 / Microsoft / Android で収束）。

### 2.2 開示モデル（user 確定: プリセット先出し＋詳細展開）
- 既定（毎日2秒）= `緩い / 標準 / 厳しい` segmented control 1つで全蛇口を一括設定。
- 上級者 = 「詳細条件」を**「ファンダ(A-C)」「テクニカル(D-G)」の2タブ**に分割（UI体: 7群一気は Miller's Law 超過）し、各タブ内 accordion で個別 on/off ＋段階。
- スライダー不使用（Baymard 4要件）。段階は segmented control / grade chip。

**蛇口 state 構造（設計体・必須）**: `{ preset: 'loose'|'standard'|'strict', overrides: { [key]: level } }` を SSOT にし、**実効値は `overrides[key] ?? PRESET_TABLE[preset][key]` で derive**（実効値を state に焼かない）。「カスタム」判定 = `Object.keys(overrides).length > 0`。プリセット再選択 = `overrides={}` リセット。S2 で確定し S3/S4 が乗る。

### 2.3 蛇口カタログ（緩い / 標準 / 厳しい・出典）

> 段階値は `canslim_oneill_rules.md §7`（オニール原典）＋ `judgment.py`（じっちゃま）に厳格準拠。**RS<70 と弱気相場(M) は段階に関係なく禁止のハードゲート**。
> **§38（金融体・必須）**: 段階は「**条件を絞り込む度合い**」という事実表現。UI ラベルに「最良/本命/プレミアム条件」を**出さない**（景表法 §5 優良誤認回避）。

**A. ファンダ「収益の質」**（じっちゃま・連続性ゲート）

| 蛇口 | off | 緩い | 標準 | 厳しい | 出典 |
|---|---|---|---|---|---|
| 営業CFマージン | ✓ | ≥10%※ | ≥15% | ≥20% | 条件① |
| 利益の連続性（EPS/CFPS/売上） | ✓ | 直近YoY正 | 3期連続増加 | 3期連続＋加速 | 条件②③④ |
| 会計の健全性（CFPS>EPS） | ✓ | **on**（金融体: 緩いでも死守） | on | on | 条件⑤ |

**B. ファンダ「成長の大きさ」**（オニール C/A）

| 蛇口 | off | 緩い | 標準 | 厳しい | 出典 |
|---|---|---|---|---|---|
| 当四半期EPS成長(YoY) | ✓ | **+20%**（原典実スクリーン値、+18 から修正） | +25% | +50〜100% | C (p.179-197) |
| 年間EPS成長 | ✓ | **3年連続増＋年率≥10%**（年率床追加） | +25%/年 | +50%/年 | A (p.197-210) |
| ROE | ✓ | ≥17% | ≥17% | ≥25% | C/A |
| 売上成長(YoY) | ✓ | +10% | +20% | +25% | C補足 / じっちゃま売上 |

**C. ファンダ「サプライズ・ガイダンス」**（じっちゃま 四半期3+1）

| 蛇口 | off | 緩い | 標準 | 厳しい | 出典 |
|---|---|---|---|---|---|
| EPS Beat | ✓ | on | on | on | 四半期条件1 |
| 売上 Beat（**銀行・ADRガード経由値で判定**） | ✓ | — | on | on | 条件2 + revenue_basis / adr_guards |
| 来期コンセンサスYoY | ✓ | — | on | on（**色なし・▲▼のみ §38**） | forward_visibility |
| ガイダンス上方修正 | ✓ | — | raised+maintained | raised のみ | guidance_history |

**D. テクニカル「相対強度」**（オニール L・既存4段）

| 蛇口 | off | 緩い | 標準 | 厳しい | 出典 |
|---|---|---|---|---|---|
| RS Rating | ✓ | **≥70（床・70未満禁止）** | ≥80 | ≥90 | L (p.235-243) |

**E. テクニカル「土台・型」**（オニール chart patterns・新規 段階蛇口）

| 蛇口 | off | 緩い | 標準 | 厳しい | 出典 |
|---|---|---|---|---|---|
| カップ・ウィズ・ハンドル | ✓ | カップ形成中 | 取っ手形成中 | ブレイク確定 | §7.2（3段階） |
| ダブルボトム | ✓ | — | on | on | §7.2 |
| 平底（フラットベース） | ✓ | — | on（調整10-15%・5週+） | on | §7.2 |

**F. テクニカル「ブレイク・出来高」**（オニール N+S・既存4段。緩い soft 1.3x / 標準 confirmed 1.5x は既存 breakout tier に整合＝O'Neil +40-50% を内包）

| 蛇口 | off | 緩い | 標準 | 厳しい | 出典 |
|---|---|---|---|---|---|
| 新高値ブレイク | ✓ | soft(1.3x) | confirmed(1.5x) | confirmed＋52週高値 | breakout_signal |
| ブレイク後の位置 | ✓ | +10%(extended) | ピボット+5%以内 | +5%以内 | N（買い5-10%以内） |
| リテスト接近 | ✓ | shallow(30-50%) | deep(≥50%) | deep | resistance_retest |

**G. 市場ゲート（オニール M）— per-stock でなく全体文脈**

| 蛇口 | off | 緩い | 標準 | 厳しい | 出典 |
|---|---|---|---|---|---|
| 地合いフィルタ | ✓ | 指数が50日線上 | フォロースルー確認 | 主要3指数強気 | M (p.260-312) |

> ※CFマージン緩い ≥10% は「質 vs 件数」のトレードオフ。**実データ検証で質ゲート形骸化が出れば 15% 据え置きに戻す**（⑥-1 gate）。M ゲートは**件数フィルタに限定**し「買い時でない」等の文言を出さない（金融体）。

### 2.4 プリセット profile
- **緩い** = 連続性を緩め（3期→直近YoY正）＋ C/A 成長率を床値（EPS+20% / 年率10%）＋ **RS≥70 床・CFPS>EPS は維持**。→ 2銘柄問題の解（質を保ち裾野拡大）。
- **標準** = じっちゃま5条件＋オニール標準（EPS+25% / RS80 / confirmed breakout）。
- **厳しい** = 連続性 AND 大きさ AND RS90。
- UI 表記は「緩い/標準/厳しい」のみ（「最良」を出さない・§38）。

### 2.5 Pane2（master/左）レイアウト
1. 強度 segmented control `緩い / 標準 / 厳しい`、**ライブ件数は active pill にインライン**（`標準 (43)`、UI体: 件数チラツキ回避）
2. 「標準の中身」を read-only chip で透明化（**最大3個＋「…+N」**）
3. 「詳細条件」展開 → **ファンダ(A-C) / テクニカル(D-G) の2タブ** → 各タブ accordion（個別 on/off＋段階、プリセット逸脱は「カスタム」表示）
4. 銘柄リスト（**選択中項目に視覚マーカー必須**＝重複リスト化回避、DoD化）

### 2.6 Pane3（detail/右）レイアウト
- **Layer 0 今日のヘッドライン**: 交差の筆頭 1-3 銘柄＋「最終更新 X分前」＋**差分 NEW バッジ／件数前日比**（マーケ体: リテンション・Signature布石）
- **Layer 1 3チャンク**（icon[lucide]＋section label 16px で階層化）: ①勢い ②仕掛かり ③ブレイク。各 top 3-5 ＋「すべて見る(N)」
- **「すべて見る」= Pane2 の filter を自動書き換え**（UI体: 右→左の逆流回避を明記。例: ②「すべて見る」→ Pane2 が `カップ+リテスト` に絞り即更新）
- **0件フォールバック必須**（マーケ体: 「本日は条件合致なし。RS上位だけ表示」）。空画面はリテンション最大の敵。
- 銘柄選択で右ペイン全体を `JudgmentDetail` に in-place 切替

---

## ③ 現7セクション → 新IA 移行マッピング

| 現セクション | 新IA |
|---|---|
| 01 RS+ブレイク+Cup交差 | Pane3 Layer0 ヘッドライン |
| 02 RS急上昇 | Pane3 チャンク①勢い |
| 03 新規Cup-Handle | Pane3 チャンク②仕掛かり |
| 04 相対強度ランキング | チャンク①「すべて見る」/ Pane2 蛇口D |
| 05 今後の決算×RS | チャンク①付帯 / 詳細条件 |
| 06 リテスト接近 | チャンク②仕掛かり / Pane2 蛇口F |
| 07 新高値ブレイク | チャンク③ブレイク / Pane2 蛇口F |
| （Pane2）ファンダ5条件固定 | Pane2 蛇口 group A/B/C（段階化） |

---

## ④ Premium / §38（tier=マーケ案で精緻化・user 確定）

### tier 境界（プリセットは全 tier 操作可、tier は「蛇口の種類」で切る）
> 原則: **自由（強度プリセット）は無料で配り、希少シグナルで課金**。「見えない疎外感」でなく「見えるが触れない飢餓感」で CVR を駆動。

| Tier | 操作可能な蛇口 | gate の出し方 |
|---|---|---|
| **Free** | 強度プリセット全段（緩/標/厳）／ファンダ group A・B 全段／RS screener(D) 全段／cup 件数表示 | **件数・種類は無料表示、銘柄名のみ blur** |
| **Pro** | ＋ group C（サプライズ・ガイダンス）／8Q／図解／cup Phase1／リテスト soft | 件数＋top1 visible、残り blur |
| **Premium** | ＋ group E チャートパターン新規／group F breakout confirmed・retest deep／cup Phase2／segment | **backend 物理除去**（leak 厳禁） |

- **ヒーロー(Layer0)が毎日全ロックされない設計**（マーケ体: #2 が死ぬ）。ブレイク全件ロックは「本日 7 銘柄が新高値ブレイク（出来高1.5x）— Premium で銘柄名を解放」のように**件数・種類・数字は事実として無料表示**（§38 セーフ）。
- gate は **ぼかし＋chip 1行**（モーダル禁止）。breakout/retest は backend 物理除去を維持（frontend blur 非依存）。

### §38（買い断定・将来予測 NG・事実のみ）
- 蛇口グレード＝事実の度合いのみ。UI に「最良/本命」禁止。各 Pane3 header「条件合致一覧であり、推奨ではありません」。
- 色: 上げ緑 / 下げ赤 / 警告 amber / cyan はブランド色。来期 YoY は色なし・▲▼。
- M ゲートは件数フィルタに限定、「買い時でない」文言を出さない。
- **LLM 不使用**（静的辞書 + Python 計算）。

---

## ⑤ モバイル（user 確定: 別SPEC 切出し・IA だけ mobile-aware）

- **現状 `useWorkspaceLayout` は 768px 未満で classic SPA に強制フォールバック**（workspace に到達しない、設計体）。よって **mobile 実装は本 SPEC scope 外**。
- 本 SPEC は **IA を mobile-aware に保つ**（単一カラム drill-down 前提・fold 内先頭=ヘッドライン・bottom sheet 不採用[NN/g]）が、**実装は別SPEC**（`project_mobile_app_goal`「PC版 release 後に mobile 着手」と整合）。
- S6 は本 scope から外し、PC版 workspace（S1-S5/S7）の完成を優先。

---

## ⑥ 残論点（実装前 gate / 後続で詰める）

1. **緩い preset の質 vs 件数 — ✅ 実データ検証済（2026-06-18）**: RS≥70 母数 ≈735 / RS≥80=483 / RS≥90=236（universe 2451）。`緩い`（RS≥70 × eps_yoy≥20% × eps_cagr≥10%）≈ **55銘柄**、CF条件追加で ~28-38。→ **8-12件は達成可能、むしろ超過**。
   - **プリセット件数の再較正が必要**（S2）: 緩い=潤沢(~30-55・探索用) / 標準=絞込(~8-15) / 厳しい=elite(~2-5)。実データ目安: RS80床＋eps_yoy20%＋eps_cagr10% で ~8-15。マーケ「緩い8-12」は実際は**標準レンジ**に近い。
   - 質ゲート: RS≥70 単独で 700+ のため、ファンダ AND（eps_yoy≥20% AND eps_cagr≥10%）が絞り込みに必須。
2. **ライブ件数アーキ**: ファンダ=`screener_fundamentals` の `count=exact` で高速。**RS/cup/breakout/retest は別テーブル**＝跨ぎ集合積が必要。解 = **(a) 事前計算キャッシュ（プリセット別件数を nightly/15min cache）or (b) 専用 facet endpoint（server-side intersect）**。「新規 endpoint 不可」の**明示例外**（⑧）。`AbortController`＋300ms debounce＋前回値保持（0件 flash 防止）。
   - **⚠️ 実データ判明（2026-06-18）**: `screener_fundamentals` は CAN-SLIM 6条件（eps_yoy/eps_cagr/roe/near_high/buyback/volume_surge）のみフルユニバース精算済。**じっちゃま CF系条件（営業CFマージン/CFPS>EPS/売上・EPS連続性）は DB 外**（現状 `custom-screener` が15候補を live FMP 計算）。→ 緩いダイヤルをフルユニバースで効かせるには **(i) CF系を nightly で `screener_fundamentals` に精算追加（backend）or (ii) 緩いは精算済6条件主体で構成** を S2 で確定。CFマージン条件追加時は `revenue_basis_mismatch` の sector_guard 対応必須（ROE は銀行/カード系を既に NULL 保護済）。
3. **銀行・ADRガード継承**: 売上 Beat 蛇口は `compare_unreliable`/利息収入比ガード経由値で判定、FX 換算前 reporter 通貨での成長率評価禁止。DoD で JPM/COF/BABA 偽合格を検証。
4. **judgment.py の扱い**: 蛇口段階化を「`judgment.py` を threshold 引数化」か「`screener_fundamentals` の段階パラメータ呼び出し」か S2 着手前に確定（backend 再利用方針と整合、judgment.py 肥大化回避）。
5. **蛇口 tier の最終線引き**: ④の表で確定済（funnel-cro）。実装時に Free 蛇口が全て動くこと（LP「調整自在」の Trust Cliff 回避）。

---

## ⑦ 移行 Phase 案（sprint・各独立リリース可能・S2→S3→S4 は commit gate）

> **sprint 間 commit gate（PGE体・必須）**: S2/S3/S4 は同一 state ツリーを拡張するため、各 sprint 完了で main consolidate（commit+push）してから次 worktree を切る（worktree 非累積対策）。

| Sprint | 内容 | backend | 規模 |
|---|---|---|---|
| **S1 ✅着地** | Pane3 チャンク化（7→3＋ヘッドライン＋top3-5＋すべて見る＋0件フォールバック）。commit 6adea4e deploy済・authed headless 視覚検証OK(2026-06-18、各chunk top5+showall/0件fallback動作・JSエラー0)。05決算×RSは後続へ(state残置) | 既存 | S |
| S2 | Pane2 強度プリセット＋ライブ件数（**実データ gate ⑥-1 を先行**） | facet cache/endpoint（⑥-2） | M+ |
| S3 | 詳細条件 2タブ accordion（group A-C ファンダ個別） | 既存拡張 | M |
| S4 | テクニカル蛇口（group D-F、既存 RS/cup/breakout/retest を toggle 化） | 既存再利用 | M |
| S5 | チャートパターン新規（group E: 平底/ダブルボトム等） | backend 検出追加 | L |
| S7 | M 市場ゲート連動（Pane1 / FtdRegimeBanner） | 既存 | S |

- **S5 は optional**（蛇口 E off でも S1-S4/S7 が成立する設計）。新規 nightly 検出は「SPEC 数式を実データで再現検証」必須。
- S6（mobile 実装）は別SPEC。

---

## ⑧ backend 再利用方針

- 既存再利用: `/api/scanner/rs` `/retest` `/breakout` `/canslim` `/cup-handle` `/movers` ＋ `screener_fundamentals` ＋ `judgment.py`。蛇口 D-F の段階は既存 query param（`min_percentile`/`min_vmult`/`include_soft` 等）を動的に渡すだけ。
- **明示例外**: ライブ件数の facet（事前計算キャッシュ or 専用 facet endpoint）。LLM 非経由・静的集計のため pre-commit hook（aggregator LLM import 禁止）・cost 規律に抵触しない。
- チャートパターン新規（S5）のみ backend 検出追加。

---

## ⑨ DoD（受け入れ基準・機械検証手段つき）

- [ ] **緩いで本日 8-12件・標準 3-6件**（実データ curl、⑥-1 を S2 実装前 gate）＋ **0件フォールバック動作**
- [ ] 2秒で「今日の注目」が掴める → **vision-eval 具体 spec**: `snap-*.mjs --check "今日の注目3銘柄がfold内に収まり銘柄名・シグナル文字が読める" --selector "[data-testid='screener-headline']"`、3 run mean、baseline=現ScreenerPane、pass≥既定スコア
- [ ] **ライブ件数 == filter predicate**（`feedback_facet_filter_count_integrity`、console.assert/jest で `count===list.length`）
- [ ] §38 leak 無（`blocklist.js` ＋ bundle grep `買い時|今が好機|必ず上がる|最良`）
- [ ] Premium leak 無（非Premium token で `/api/scanner/breakout` curl → `items:[]` 物理除去）
- [ ] **銀行・ADR 偽合格 無**（JPM/COF/BABA を売上Beat蛇口で curl 検証）
- [ ] master-detail 選択マーカーあり（`data-testid='screener-row-selected'` を bundle grep）
- [ ] design SSOT 準拠（`design-system-check` / raw hex・shadow 無し）

---

## ⑩ 触ると危険（実装時・Generator 申し送り）

- 発光系（.panel-card / .bs-panel / .surface-card）/ sticky 検索バー は design_recipes.md §C 必読。accordion open 時は `min-height` envelope で CLS 吸収（`feedback_cls_envelope_pattern`）。
- **並行セッション衝突**: `CustomScreenerPanel.jsx` / `main.py` は CAN-SLIM 領域と衝突。**`git add` は明示 path（`-A` 禁止）、stage 前に `git status` で混入確認**（`feedback_parallel_session_commit_entanglement`）。
- **`JudgmentDetail` 二重 mount パス**（`!isV5` と `v5`、新規 section は両方に置く）。`DetailStack` は home path のみ配線＝screener で keep-mount するなら配線追加（blast radius）。S1 で keep-mount vs 毎回再 fetch を明示決定。
- **LazyMotion scope 罠**（Provider 外で opacity:0 固着）。Pane3 チャンクに framer-motion 追加時に注意。
- breakout/retest を frontend blur だけにコピーすると bo_confirmed leak（backend 物理除去維持）。
- chip primitive の役割分離（segmented control は `variant="segment"` か別出し、`zone=normal` 混濁回避）。
- aggregator/ への LLM import 禁止（pre-commit hook）。

---

## ⑪ 6体合議 結果（2026-06-18・記録）

**判定: 6/6 条件付賛成（反対ゼロ）**。蛇口モデル・master-detail・段階開示・2銘柄解消の方向を全員支持。

| 体 | model | 主要必須条件（→ 本 v2 で反映済） |
|---|---|---|
| UI/UX | sonnet | 詳細条件2タブ分割 / すべて見る→Pane2書換 / 件数 active pill inline / read-only chip max3 |
| Web設計 | opus | ライブ件数=跨ぎ集合積（最大risk）/ state `{preset,overrides}` derive / 768px前提再確認 |
| Web開発 | sonnet | S1→S2→S3独立順 / breakout物理除去維持 / 明示path commit |
| 金融 | opus | 原典忠実化(C+20/A年率床/CFPS>EPS死守) / 銀行・ADRガード継承 / §5「最良」禁止 |
| Anthropic | sonnet | DoD機械検証(vision-eval spec) / 実データ先行 / commit gate / judgment.py扱い |
| マーケ | opus | tier=プリセット全tier化 / 件数・種類無料・銘柄名blur / 差分NEWバッジ / 件数目標8-12+0件fallback |

**user 確定の2分岐**: tier=マーケ案で精緻化（④）／ mobile=別SPEC 切出し・IA だけ mobile-aware（⑤）。

**未決（後続）**: ⑥ 残論点（⑥-1 緩い件数の実データ検証＝S2 実装前 gate が最優先）。

---

## ⑫ S2 着手ブリーフ（2026-06-18 user 確定・新セッション実装用）

> **進め方（user 確定）**: S2 は **新セッションで実装**（context-safety、CLAUDE.md「機能着地直後は新セッション」）。本 SPEC + memory `project_screener_fundamental_threshold_grading` が完全 handoff。新セッションで「S2 実装」と言えば着手可。
> **S1 状況**: ✅ deploy 済（commit 6adea4e）。Pane3 = ヘッドライン+3チャンク。FtdRegimeBanner は Pane2 に集約済（Pane3 から撤去、commit e7c473b）。

### S2-1: CF条件の扱い = **6条件先行（user 確定）**
- ダイヤルは **`screener_fundamentals` 精算済6条件 + `rs_ratings` の RS** で構成（backend 精算追加なし・即着手可）:
  - eps_yoy(C) / eps_cagr(A 年率) / roe(C·A) / near_high(N 52週高値接近) / volume_surge(S) / buyback(S) + RS percentile(L)
- **じっちゃまCF系条件（CFマージン/CFPS>EPS/連続性）は後続sprint**で nightly batch に精算追加（⑥-2 option i）。S2 では扱わない。

### S2-2: プリセット→閾値マッピング（⑥-1実データ anchor・新セッションで curl 再較正）
| preset | 条件 | 実測件数目安 |
|---|---|---|
| 緩い | RS≥70 AND eps_yoy≥20% AND eps_cagr≥10% | ≈55 |
| 標準 | RS≥80 AND eps_yoy≥25% AND eps_cagr≥15%（要curl較正） | 8-15狙い |
| 厳しい | RS≥90 AND eps_yoy≥50% AND eps_cagr≥25% | 2-5 |
- 着手時 **DoD gate**: 各 preset の実件数を `/api/scanner/canslim` 系 curl で確認し標準を 8-15 に較正してから UI 固定（resistance_retest 教訓＝SPEC数式を実データで再現）。

### S2-3: 実装スコープ（S2のみ。詳細条件 accordion は S3）
- **Pane2 = `CustomScreenerPanel.jsx`** を改修:
  - 上部: FtdRegimeBanner（既存・地合い文脈）→ 下に **強度 segmented control「緩い/標準/厳しい」**（Chip/ChipGroup idiom、active=accent）
  - **ライブ件数「該当 N 銘柄」を active pill インライン**（例 `標準 (12)`、UI体verdict・チラツキ回避、`AbortController`+300ms debounce+前回値保持で0件flash防止）
  - read-only chip で標準の中身を透明化（max3 + 「…+N」）
  - 銘柄リスト（**選択中に視覚マーカー必須**＝重複リスト化回避、既存 Chip pressed idiom 流用）
- **backend ライブ件数 facet**: 既存 `/api/scanner/canslim`（condition+min_pct で count 返却）を確認 → 複数条件 AND + RS join の facet count を `screener_fundamentals`(count=exact) + `rs_ratings` で。新規 endpoint 可（「新規endpoint不可」の明示例外＝⑧）。LLM非経由・static集計で pre-commit hook/cost 規律 OK。`feedback_facet_filter_count_integrity`: count==predicate を厳守。

### S2-4: 規律・注意
- **`CustomScreenerPanel.jsx` は並行 CAN-SLIM セッション領域** → 着手前 `git status` で並行変更確認、**明示path commit**（`-A`禁止）、stage前に混入確認（`feedback_parallel_session_commit_entanglement`）。
- 発光系/sticky検索バー/chip primitive/§38（件数=事実・買い断定なし・「最良」表記禁止）/Premium gate（ぼかし+chip1行）を維持。
- sprint間commit gate: S2着地→main consolidate→S3 worktree。
- read-first: `CustomScreenerPanel.jsx`（activeFilter enum / FilterPillarSection / run系fetch）/ `main.py` の /api/scanner/canslim（grep）/ `rs_ratings`・`screener_fundamentals` schema。

---

## Appendix: Generator 向け read-first（実装前に読む）

- `frontend/src/features/workspace/ScreenerPane.jsx`（現7セクション・HeroSection 流用元）
- `frontend/src/components/CustomScreenerPanel.jsx`（現 Pane2・activeFilter enum・FilterPillarSection）
- `frontend/src/features/workspace/Workspace.jsx:983-1140`（master-detail 配線・DetailStack）
- `frontend/src/features/workspace/DetailStack.jsx`（keep-mount visibility:hidden パターン）
- `backend/app/main.py` の `/api/scanner/*`（grep で endpoint・param 確認、全文読まない）
- `backend/app/judgment.py:185-252`（ファンダ5条件しきい値）
- `docs/references/canslim_oneill_rules.md §7`（蛇口段階値の原典）
