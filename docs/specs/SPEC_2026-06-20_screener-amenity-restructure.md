# SPEC 2026-06-20: スクリーナー構造再設計 — 「構造で aman 69→85+」(Amenity Restructure)

> 起票: autopilot session (就寝中自律 PDCA、2026-06-20 深夜)
> 前提: master-detail 一本化 (`SPEC_2026-06-20_screener-master-detail.md` Sprint 1-6) は**着地済**。本 SPEC はその上に「構造で Aman 級の高揚感を載せる」**磨きフェーズ**。
> backlog SSOT: `memory/project_screener_tab_redesign.md`「次 = screener タブ再設計 (構造)」
> 関連: [[feedback_polish_iteration_roi_decay]] (小幅 polish の天井 aman 69 = 構造再設計の good timing) / [[glow_elevation_postmortem]] (shadow ゼロ堅持) / [[feedback_minimalism_over_additive]] (asymmetry=1個主役化)

---

## 0. TL;DR (朝の判断用)

- **問題**: screener master は機能完成 (Sprint 1-6) だが vision-eval aman **69/100** で「上質なダッシュボードに留まる」。user 主訴「各要素の重みが分からずどこを見たらいいかパッと見で分からない」が残存。
- **根本原因 (baseline 視覚診断で特定)**: ①master-detail の detail 未選択時、**右の主役面積 ~60% が空プレースホルダ** (`Workspace.jsx:1140-1161`)。②中央 master カラムが狭い (~280px) のに全要素を縦詰め (breathing room ゼロ)。③視線の入口が曖昧 (TOP3/件数/preset chip が同格)。④3カラムで主役の master が最も狭い矛盾。
- **解の核 (3入力収束)**: **新規発明でなく「既に screener 内にある豪華さの再配置」**。ScreenerPane の HeroSection (L字 gold frame + featured 主役化 + stagger + ランク circle + CountUpStat、**全て発光ゼロで実装済**) を master-detail の正しい場所、特に **Pane3 idle = 主役面積** に sledgehammer hero として配置する。
- **判断してほしいこと**: 下記**案 A / B / C のどれを本線にするか** (§4 推奨は案B、案A は即 ship 可能な第一歩として夜間に prototype 実装済 = `?screener_v2=1` で実物を確認できる)。

---

## 1. 3入力の収束 (確信度: 高)

| 入力 | 手法 | 結論 |
|---|---|---|
| **外部模範** | deep-research (106 agent / 検証済13 claim / 一次資料) | ヒエラルキーは影でなく「周辺コントラスト + サイズ3段(big max2) + 余白=attention装置」で作れる (NN/g 3-0)。密度は value÷(時間×空間) + Gestalt grouping = データ削らず proximity 分節で知覚密度↓ (Matt Ström-Awn 3-0)。entry point = sledgehammer stat を hero に front-load (Pudding/Stripe 2-1) |
| **内部模範** | Sonnet sub-agent (BeatScanner 成功面分析) | Pane3 JudgmentDetail (VerdictHero+Hero+ChapterSection) と ScreenerPane HeroSection が**発光ゼロで Aman 級**を達成済。移植可能な構造原理7個 (入場階層/L字gold/stagger/asymmetry/ローマ数字章扉/NumUnit数値主役/設計された沈黙の空状態) |
| **baseline** | authed snap PNG 3枚 (本番 screener_v2) | 上記「根本原因」4点を視覚で確定 |

**重要 caveat (deep-research の adversarial verification より、設計に反映)**:
- 「装飾ゼロ」は厳密には誤り = ヒエラルキーは**視覚プロパティの意図的操作**。制約は「影なし」であって「視覚プロパティなし」ではない (border/tint/scale/grouping は使う)。
- editorial sledgehammer は linear essay 前提。screener は persistent random-access table = **直接適用でなく analogy** (過度に editorial 化しない)。
- eye-tracking は designer 意図 ≠ 実注視が乖離しうる → **snap-*.mjs + Haiku vision で読み順を検証** (DoD)。
- big elements (サイズ突出) は**最大2個に限定** (scarcity、濫用で階層崩壊)。

---

## 2. 設計の確定ポイント (案によらず共通・5原理)

1. **Pane3 idle を sledgehammer hero 化**: 「今日の筆頭」(leaderCwh 上位 = 5条件×RS×cup の交差) を front-load。featured (Crown gold + padding↑) + L字 gold frame + stagger + ランク circle + CountUpStat を流用。**追加 fetch ゼロ** (`_heroCache` module-level 共有 or api.js dedupGet)。§38: 軸明示「合致度/RS」、色は事実状態のみ、断定なし。
2. **サイズ scarcity**: 最注目1銘柄の主要指標 (合致度 or RS) だけ 1-2 段大きく。残りは weight 3段 (900/700/400)。big は最大2要素。
3. **余白の交互律 (詰め→抜き→詰め)**: 重要 section 前後に 64px 章扉余白 (`--space-16`)、通常行は密。「周囲に余白が多い要素 = group として注意を集める」(NN/g)。
4. **意味グループ proximity 分節**: 銘柄行の多指標を「ファンダ / テクニカル / 機関」に余白でクラスタリング (データ削らず perceived density ↓)。
5. **読み順固定 + 検証**: hero verdict → 5条件 chip → 銘柄 list → 二次操作 (filter/sort) を recessed に。snap+Haiku で意図通りか検証。

---

## 3. 案 A / B / C (blast radius 順)

### 案A — Pane3 idle hero 化のみ (小・即 ship 可能)

- **やること**: `Workspace.jsx:1140-1161` の `screener-detail-empty` を「今日の筆頭 Preview Hero」に差し替え。leaderCwh 上位3 (featured/L字gold/stagger/ランクcircle/CountUpStat) + 今週決算数行 + 「← 左から選ぶと詳細」導線。
- **触るファイル**: `Workspace.jsx` (idle 分岐のみ) + 新規 `ScreenerIdleHero.jsx` (ScreenerPane の HeroSection / ftd 部品を流用)。**master(ScreenerMaster)・共有 row は不触**。
- **効果**: 「右が空虚」解消 = 最大の構造問題を最小リスクで。sledgehammer hero。**+5-8点** 試算。
- **リスク**: 低。screener_v2 限定 (default OFF = 一般 user 不可視)、`?screener_legacy=1` で退避可、新規発光なし。L1138 が回避した「ScreenerPane 二重表示の冗長」は、Pane2=操作リスト / Pane3 idle=閲覧 hero と**役割分離**で回避。
- **5原則**: 2 (毎日開きたくなる=右が充実) / 3 (シンプルかつリッチ) / 5 (図解=hero で視覚的)。

### 案B — 案A + master breathing room + ChapterSection 視線収束 + 意味グループ分節 (中・推奨本線)

- **やること**: 案A +
  - ScreenerMaster に padding `--space-8` (32px) / section gap `--space-16` (64px) で breathing room (NN/g 余白=attention)。
  - ChapterSection ローマ数字「I. 今日の筆頭」で視線を主役1個に収束 (内部 ChapterSection を `headerOnly` で wrap)。
  - 銘柄行の多指標を意味グループに proximity clustering。
- **触るファイル**: 案A + `ScreenerMaster.jsx` + `ScreenerPane.jsx`/`CustomScreenerPanel.jsx` の row module + `index.css`。⚠️ **共有部品 (ScreenerPane/CustomScreenerPanel) は legacy/一般 user に即反映** → screener_v2 scope に閉じる設計が要る。
- **効果**: 視線入口の曖昧さ解消 (**user 主訴の核心**)。**+12-18点** 試算 (aman 81-87 射程)。
- **リスク**: 中。共有部品変更の影響範囲管理。3体合議推奨 (ui+frontend+qa)。
- **5原則**: 1 (読み手負担↓) + 案A の 2/3/5。

### 案C — 案B + idle 時 master full-width / 選択で detail 展開 (大・将来 Phase)

- **やること**: 案B + idle 時 Pane3 を `display:none`、Pane2 を full-width gallery 化。銘柄選択で 2カラムに展開 (progressive disclosure の「驚きの発見」)。
- **触るファイル**: 案B + `Workspace.jsx` の 3-pane layout (心臓部)。
- **効果**: 3カラム幅矛盾を根本解消。idle が full-width gallery = 最大の豪華さ。**aman 85+ の本命**だが blast radius 最大。
- **リスク**: 高。Workspace 3-pane = sticky 検索バー隣接の高リスク領域。PaneErrorBoundary / ViewTransition / scroll lock の既存 fix と干渉しうる。**6体合議 + effort max + 段階実装必須**。
- **5原則**: 全。ただし「触ると危険な箇所」に最接近。

---

## 4. 推奨 + 実装順序

**推奨 = 案B を本線、案A を Sprint 1 (即 ship)、案C を将来 Phase (user 承認 + 6体合議後)**。

- 案A で「右が空虚」(最大問題) を最小リスクで解消し早期に効果実感 → 案B で視線入口 (user 主訴核心) を解決し aman を実質押し上げ → 案C は Workspace 心臓部のため別 Phase。
- 案A は案B/C の共通土台なので**作り直しにならない** (idle hero は3案すべてで使う)。

**sprint 化 (案B 本線)**:
| sprint | 内容 | blast | review |
|---|---|---|---|
| 1 | 案A: Pane3 idle hero 化 (ScreenerIdleHero) | 小 | dogfood + vision-eval |
| 2 | master breathing room (padding/gap) + ChapterSection 視線収束 | 中 | 3体合議 |
| 3 | 銘柄行 意味グループ proximity 分節 + サイズ scarcity | 中 | 3体合議 + vision-eval |
| 4 | (案C 採用時のみ) idle full-width / 選択展開 | 大 | 6体合議 + effort max |

---

## 5. 案A prototype の DoD (夜間 autopilot 実装、screener_v2 限定)

- [ ] `ScreenerIdleHero.jsx` 新設。leaderCwh 上位3 (featured/L字gold/stagger/ランクcircle/CountUpStat 流用) + 今週決算。追加 fetch ゼロ (`_heroCache` 共有 or dedupGet)。
- [ ] `Workspace.jsx:1140-1161` の idle 分岐を ScreenerIdleHero に差し替え (screenerV2 scope 内のみ)。
- [ ] §38: 「今日の筆頭」は軸明示 (合致度/RS)、色は事実状態のみ、断定/最上級なし。免責1行。
- [ ] shadow ゼロ堅持 (`.panel-card/.bs-panel/.surface-card` を付けない)。design-system-check pass。
- [ ] testid `screener-idle-hero` を loading/error/empty/main 全 path に付与。
- [ ] `npm run build` pass → commit → push → deploy poll (`/health.commit`)。
- [ ] production bundle を curl+grep で `screener-idle-hero` 確認 (C-7 L3)。
- [ ] authed snap (before/after PNG) + vision-eval (aman 軸 3 run mean) で Δ 取得。
- [ ] `?screener_legacy=1` で退避できることを確認 (kill switch)。

---

## 6. 適合チェック

- **Trust Cliff**: 案A の idle hero に Premium 由来銘柄 (cup 完成等) を含める場合、無料 user には鍵+「Premium」先出し (押す前に分かる)。件数整合 (hero 件数 = 結果件数)。
- **§38/§5**: 色で買い断定なし。「今日の筆頭」軸明示。最上級表現禁止。
- **Hallucination Guard**: LLM 不使用 (既存数値物理層の表示のみ、静的 dictionary)。新規4層適用不要。
- **shadow ゼロ**: screener 新規モジュールに発光系 class を付けない (border/tint/scale/grouping のみ)。

---

## 7. 出典 (deep-research high/3-0 主要一次資料)

- NN/g visual hierarchy: https://www.nngroup.com/articles/visual-hierarchy-ux-definition/ (周辺コントラスト/サイズ3段/余白=attention)
- Matt Ström-Awn "UI density": https://mattstromawn.com/writing/ui-density/ (value÷時間×空間 / 配置で知覚密度)
- The Pudding (data storytelling): https://pudding.cool/process/how-to-make-dope-shit-part-3/ (sledgehammer stat front-load、※genre mismatch caveat)
- Sessions visual hierarchy: https://www.sessions.edu/notes-on-design/visual-hierarchy-key-ux-principles-that-drive-results/
- LogRocket dashboard UI (Stripe never-feels-dense): https://blog.logrocket.com/ux-design/dashboard-ui-best-practices-examples/
- 内部模範: `ScreenerPane.jsx` HeroSection (L字gold/featured/stagger) / `ChapterSection.jsx` (ローマ数字章扉) / `VerdictHero.jsx`+`Hero.jsx` (入場階層)
