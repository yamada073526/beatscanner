# handover v313 — autopilot: mockup-fidelity guard 機械化 + Phase D gate 材料 (2026-07-01)

前任: v312 (Pane3 L0 polish 完了・PR #157-#161 merged)。本セッションは **user 不在の autopilot 自律**。
egress 403 (本番 URL 到達不可・visual/deploy 検証不可) 制約下で、**無監視 ship 可能な 1 件のみ ship**し、
残 Phase D (S2-S5) は全て gate/danger/§38/visual に該当するため **gate 判断材料に整理して user に委ねた**。

## 🎯 本セッションで ship (autopilot SAFE-SHIP・draft・要 user レビュー)

**PR #162 (draft)**: `fix(mockup-fidelity): claim grounding を pre-commit で機械強制 + macOS realpath portability 修正`
- branch = `claude/mockup-fidelity-claims-hook` (origin/main 起点・PR merged 後は再作成)。**dev tooling のみ・本番デプロイに影響なし**。merge は user gate。
- 内容:
  1. `scripts/pre-commit-hook.sh` **Check 8** 追加 — staged `*.claims.tsv` を `verify-claims.sh` で自動 grounding、FAIL/WARN で commit BLOCK。規約: `<name>.claims.tsv` + 先頭に `# mockup: docs/specs/mockups/<file>.html` 宣言。fixture `example-claims.tsv` は `-claims.tsv`(= `.claims.tsv$` 非一致) で誤発火しない。`--no-verify` で迂回可。
  2. `verify-claims.sh` **macOS portability 修正** — `realpath -m` は GNU 専用で macOS BSD `/bin/realpath` は `illegal option -- m` → `resolved` 空 → **全 `path:` impl_ref が誤 TRAVERSAL 化**していた (#158 の潜在バグ・darwin が user 常用 platform)。example fixture が path: を「元々 FAIL 期待」でしか使わず exit1 が偶然一致してマスクされていた。realpath 非依存の portable 判定 (絶対path/`..`拒否 + repo相対存在確認) に置換・traversal 防御維持。
  3. `SKILL.md` Phase 0 に機械強制 note 追記。
- **ground-truth 検証 (全て手元・green)**: hook 4 シナリオ (正当→exit0 / 捏造→block / mockupヘッダ欠落→block / 無関係file→no-op) + traversal拒否 + example fixture が誤TRAVERSAL→正しい PHANTOM 判定に是正 (C10-4,8)・documented 挙動 (exit1) 維持。session baseline: `npm run build` EXIT0 / vitest 140 passed。

## 📊 Phase D 残 Sprint (S2-S5) gate 判断材料 (sub-agent 調査 + main 独立裏取り済)

> ⚠️ 全 Sprint が「danger zone / §38核心 / #117 merge gate / Pane3 visual (egress403 で私は検証不可)」の
> いずれかに該当 → **自律 ship 不可**。以下は user が朝に gate 判断するための材料 (paths は main 裏取り済)。
> C10 教訓: sub-agent は 2 件のパスを誤記 (下記 ✅是正) → **上流の主張は必ず ground-truth 照合してから着手**。

| Sprint | 分類 | 1行 |
|---|---|---|
| **S3** ⑤summary復元+Protag+In-line色 | **SAFE候補** (visual dogfood前提) | 非LLM数値表示/色是正/primitive後方互換追加。§38/danger clean。ただし Pane3 visual = 私は検証不可 → 実装時は build+logic+grep + **朝 dogfood** で着地 |
| **S4** 来期コンセンサス(C8)+良い決算連続(C9) | **NEEDS-REVIEW** | PR #117 merge が gate + 既存 chip 二重化を要裁定 |
| **S2** gold縁取り復活(C1) | **NEEDS-REVIEW** | danger zone (発光系隣接・6セッション溶けた領域)・continuity は user 目視 gate |
| **S5** ③テクニカル累進開示(C11) | **DEFER** | §38核心・6体 multi-review 必須。骨格既存で残作業は「4 tiles 要否」diff |

### S3 (⑤その他 summary 動的復元) — 最有力の次 sprint
- 対象 (裏取り済): `JudgmentDetail.jsx:983` `summary="発表翌日の株価変化"` / `:1003` `summary="直近 90 日の売買"` / `ContextSection.jsx:44` `summary="一次ソースへのリンク"` を **非LLM実績数値**へ復元 (8Q「Beat N回 平均+X.X%」/ Insider「買付N件」/ ニュース「最新N件・X時間前」)。
- `AccordionSection.jsx` に pro-tag = **未実装** (grep 0件) → primitive 後方互換で追加 (全 fold 波及・要回帰)。
- ⚠️ `feedback_accordion_collapsed_unmount`: fold summary は**親が prefetch 済の非LLM source を読む** (LLM eager fetch = cost 回帰)。
- **user 決定**: (a) 市場の声 summary (C3) を defer(SPEC default) か 非LLM sentiment 新設計か / (b) Pro tag を 8Q だけか Insider 等にも展開か。

### S4 (来期コンセンサス + 良い決算連続) — #117 merge 判断
- PR #117 (`origin/claude/pane3-sprint4-backend-gcn1m4` `d6247aae`): **2 files +116/-1**。`main.py` quarterly-history に top-level `beat_streak`(EPS beat AND 売上 beat) / `eps_yoy_acceleration`(accel/decel/flat/null) 追加 (**Python算出・LLM不使用・§38-safe**・cache_key v3→v4)。frontend `EarningsGrowthSpark.jsx` chip も同梱。**新 endpoint なし**。working-tree main.py に `beat_streak` は無い = 未 merge 確認済。
- ⚠️ **二重化リスク**: 既存 `frontend/src/features/judgment/components/detail/EpsBeatStreakChip.jsx` (+ `useEpsBeatStreak.js`) が **EPS単独 streak** を独自 fetch 表示中。#117 は **EPS+売上 streak** で判定基準が違う → merge すると二重表示になりうる。
- **user 決定**: (a) #117 を merge するか / (b) 既存 `EpsBeatStreakChip` を #117 の top-level `beat_streak` に一本化 (DRY) か並存か。

### S2 (gold 縁取り復活) — danger zone 単独
- `Hero.jsx:22` は `border:1px solid var(--border)` (neutral)。`VerdictHero.jsx` は既に Beat 時のみ gold gradient (下地あり)。gold token whitelist 実在 (`elevation_scale.md:126-128` `#d4af37/#f4cd5d/#c8952c` = `--color-gold` 系・raw hex 不要)。
- ⚠️ `feedback_gold_accent_continuity`: gold は全 panel 一貫でないと noise → 片方だけ適用は危険。発光系 class 自体には触らない設計。
- **user 決定**: (a) L0 + 判定カード両方に一貫適用か片方か / (b) merge gate を vision-eval 3run か user 実機目視必須か。

### S5 (③テクニカル 買いゾーン累進開示) — §38核心・想定より軽い
- **骨格既存 (裏取り是正)**: `sections/BuyZoneVerdictBar.jsx` 実在 + `JudgmentDetail.jsx:830` 配線済。§38ガード内蔵の静的辞書 = `frontend/src/features/judgment/constants/buyZoneVerdict.js` (+ `.derive.test.js`。※sub-agent の `components/detail/constants/` は誤り・**正は `features/judgment/constants/`**)。`VERDICT_TONE`/`VERDICT_PHASE_LABEL`(ブレイク待ち/確認済/スピード違反圏)/`VERDICT_CAPTION` 定義済・confirm に cyan 不使用・pivot乖離% 非表示 (Premium 距離逆算漏洩 BAN)。
- 残作業は「4 risk tiles (52週高値距離/pivot距離/ATR/出来高) UI 要否」+ 損切りライン露出の state gate 厳密化のみ (台帳自身「想定より軽い」)。`PriceLadder.jsx`(=`StockPriceChart.jsx` ~1907行) は **全文取込み禁止・offset/limit Read**。
- **user 決定**: (a) 4 tiles を新規実装か (data は backend にあるが UI 有無を diff 後判断・既存で十分なら最小化) / (b) 損切りライン露出を bo_confirmed 以降に厳密化するか / (c) 6体 multi-review 必須。

## 🟡 重要知見 (carryforward)
1. **egress 403 (本番到達不可) は継続**: `beatscanner-production.up.railway.app` は agent proxy が 403。→ **/health も snap も叩けず、Pane3 (authed) の visual 検証不可**。私の検証範囲は build + vitest + §38/raw-hex grep まで。**Pane3 visual 系は自律 ship 不可 → 実装しても朝 dogfood 必須**。policy で `*.up.railway.app` 許可されれば解消。
2. **sub-agent 主張は必ず main が独立裏取り** (C10 教訓の実践): 本セッションで sub-agent が S5 定数 path (`constants/buyZoneVerdict.js`) と S4 chip path (`sections/EpsBeatStreakChip.jsx`) を誤記 → grep で是正。存在≠正確。着手前に必ず ground-truth 照合。
3. **verify-claims.sh の macOS バグは PR #162 で修正済** — merge 前は mockup-fidelity Phase 0 の `verify-claims.sh` が macOS で全 `path:` を誤 TRAVERSAL する (workaround: `[repo_root]` 引数で GNU realpath 環境を渡すか PR #162 を先に merge)。

## ⚠️ 触ると危険 / 検証規律 (CLAUDE.md 準拠・厳守)
- **danger zone**: 発光系 (`.panel-card`/`.bs-panel`/`.surface-card`) / gold accent (`feedback_gold_accent_continuity`) / sticky検索バー / `index.css` / `StockPriceChart.jsx`(全文取込み禁止・grep+offset)。
- **検証 = build + vitest + §38/raw-hex grep が ground-truth** (報告/LLM を証拠にしない)。**snap/deploy は egress で不可** → user 目視。
- **deploy = PR draft → user承認 → squash-merge → Railway auto-deploy (user gate)**。
- **`git add -A` 禁止** (対象のみ stage) / tool-call 崩壊兆候で即停止 / mockup 作業は mockup-fidelity の claim grounding ゲート必須。
- branch: 本 handover = `claude/pane3-phase-c-handover-lf2tfc`。PR #162 = `claude/mockup-fidelity-claims-hook`。follow-up は origin/main から作り直し + force-with-lease。

## 📊 残バックログ (推奨着手順)
1. **PR #162 レビュー + merge** (draft・dev tooling のみ・低リスク)。
2. **[gated] 監査台帳 `AUDIT_pane3_2026-07-01.md` (PR #155) の L0 #3-8/C10 訂正** — 訂正内容は main の `AUDIT_pane3-L0-fidelity_2026-07-01.md` に完全記載。**台帳変更は user gate**。#155 branch = `claude/pane3-phase-c-spec-rignjx`。
3. **Phase D**: 上記 gate 材料で user が sprint を選択 → 推奨は **S3 (SAFE候補) → S4 (#117判断) → S2 (danger) → S5 (§38・6体)**。S3 も Pane3 visual なので実装は build+logic+grep + 朝 dogfood 前提。
4. **[低優先]** 2-1 判定サマリー callout (現状維持推奨) / 微差。

## 📁 主要 file
- `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (章配線・S3/S4/S5 で触る → sprint 間 commit 必須)
- S3: `sections/ContextSection.jsx` / `primitives/AccordionSection.jsx` / `components/EarningsReactionPanel.jsx`
- S4: `sections/EarningsGrowthSpark.jsx` / `detail/EpsBeatStreakChip.jsx` / `detail/useEpsBeatStreak.js` / (backend) PR #117
- S5: `sections/BuyZoneVerdictBar.jsx` / `constants/buyZoneVerdict.js` / `components/StockPriceChart.jsx`(=PriceLadder)
- guard: `scripts/pre-commit-hook.sh` / `.claude/skills/mockup-fidelity/scripts/verify-claims.sh` (PR #162)
