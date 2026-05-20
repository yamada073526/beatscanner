# SPEC 2026-05-21: Pane 3 Phase 2.6 visual hotfix + 会社概要 Phase A (Sprint 1 一括)

> **status**: Draft v1 (user 在席 autonomy mode、 3 体合議 verdict 反映済、 user 追加 feedback 反映済、 gate 1 省略)
> **author**: Planner subagent (PGE 3 体ループ 仕様設計層)
> **base**: handover v90 + 3 体合議 verdict (ui-designer + frontend-architect + qa-dogfooder) + user dogfood feedback 5 件
> **生成日**: 2026-05-21
> **ターゲット**: 1 sprint (~1.8 人日)、 PGE 自律ループ 1 周

---

## 1. Context

### user prompt

> Pane 3 Phase 2.5 deploy 後 dogfood で残った visual / Trust Cliff 系 5 件 (#1 GuidanceCard Tier M / #2 IRLinksPanel 視認性 / #3 Phase A 会社概要静的拡張 / #4 「会社概要」 発光クリッピング / #9 「決算ハイライト分析」 太字残存) を 1 sprint で一括 hotfix。

### なぜ今やるか

- **handover v90 §1**: Phase 2.5 完了直後、 dogfood feedback 10 件中 5 件が「Trust Cliff + visual hierarchy」 残課題として残存
- **3 体合議 verdict (本 session)**: ui-designer + frontend-architect + qa-dogfooder の 3 体並列レビューで **root cause 5 件全て確定済** (Phase 2.5 と同様、 hotfix は機械的)
- **pre-release priority** (memory `feedback_pre_release_priority.md`): BeatScanner は pre-release、 release 準備に進む前に「LP 訴求 vs 実装」 の Trust Cliff 解消が Top priority
- **#3 会社概要** が特に重大: LP 訴求「AI 詳細レポート」 vs 現状「会社名のみ」 で典型的 Trust Cliff (CVR 30-40% 落ちる pattern)

### 期待される成果 (5 原則貢献マップ)

| 原則 | 貢献 sprint |
|---|---|
| §1 読み手に負担をかけない (2 秒理解) | #1 Tier M halo で「決算合否の核」 が即視認、 #2 IRLinksPanel 強化で IR 情報の存在を即認識 |
| §3 シンプルかつリッチ | #4 発光クリッピング解消で Aman 級「驚き / 豪華さ」 復活、 #9 太字統一で typography 階層整合 |
| §5 図解で認知コストを下げろ | #3 Phase A 会社概要静的拡張 (ロゴ + 本社 + 従業員数 + 競合 chip) で長文不要、 視覚 anchor 整備 |

### ブランド世界観 (Aman/Ritz-Carlton 級) 適合

- **驚き**: #1 Tier M halo 発火で「光って入ってくる」 入場体験
- **豪華さ**: #3 ロゴ + 本社 + 競合 chip で「ホテルの部屋に入った瞬間の情報密度」
- **興奮**: #2 hover border 強化 (40% → 55%) で「触れる箇所が呼吸する」
- **洗練さ**: #9 font-weight medium 統一で「中途半端な太字」 排除、 typography 階層完全整合
- **楽しい**: #4 発光クリッピング解消で halo が全方向に広がる「気持ち良さ」 回復

### Trust Cliff 重大度

- **#3 会社概要 Phase A**: LP「AI 詳細レポート」 vs 現状「ticker + companyName + latestPeriod + dataSource の 4 行」 = **Trust Cliff 重** (qa-dogfooder 警告)
- 他 4 件は visual hierarchy の問題、 Trust Cliff 軽-中

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

「最高級ホテルのロビー」 比喩で言えば:

- **現状の #4 発光クリッピング**: 「シャンデリアの光が天井に当たって途切れる」 = 豪華さ違反 (天井 = AccordionSection の `overflow:hidden`)
- **本 SPEC で目指す状態**: 「シャンデリアの光が全方向に広がり、 入口から見ても確かに『豪華なロビーだ』 と一目で感じる」

5 感情語彙対応:

| 感情 | 違反 → 本 SPEC で改善 |
|---|---|
| 驚き | GuidanceCard が周囲 Tier M に埋没 → halo 発火で「決算合否の核」 と即認識 |
| 豪華さ | 会社概要 4 行のみ → ロゴ + 本社 + 競合 chip で「写真集級の情報密度」 |
| 興奮 | IRLinksPanel が「平」 → hover border 強化で「触れる箇所が呼吸する」 |
| 洗練さ | 「決算ハイライト分析」 太字残存 → font-medium 統一、 中途半端な weight 排除 |
| 楽しい | 「会社概要」 で halo が clip → 全方向広がりで「気持ち良い」 復活 |

**修正禁止 anchor 遵守**: `feedback_brand_aspiration.md` の「Aman/Ritz-Carlton 級」 anchor + 5 感情語彙 + `−1` セクション原文 一切変更しない。 design_system.md `§-1` 原文 (「まるで最高級ホテルの入口からロビーへ入場したときのような、 驚き・豪華さ・興奮・洗練さを感じられて、 画面を見ているだけで楽しい」) 一切変更しない。

---

## 3. Trust Cliff チェックリスト

### LP 訴求文言との整合

1. **「AI 詳細レポート」 訴求 vs 会社概要 4 行のみ** (現状 Trust Cliff 重)
   - 本 SPEC #3 Phase A で `description` + ロゴ + 本社 + 従業員数 + 競合 chip を追加し、 LP 訴求の最低限を満たす
   - **Phase B (LLM 日本語要約)** は Phase 3 別 SPEC、 Trust Cliff 緩和は Phase A で十分 (qa-dogfooder verdict)
2. **「3 銘柄/日まで無料」 訴求** vs Phase A 追加 endpoint の demo 経路適合
   - `/api/profile-extended/{ticker}` (or 既存 `/profile` 拡張) は `handleLPTickerClick` 経由で demo mode 維持
   - 新 endpoint を直接 fetch すると demo 制限 bypass の risk → 既存 `runAnalyze` flow に組み込む
3. **「登録不要」 訴求** vs Phase A 静的データ
   - LLM 不使用 (Phase A は static のみ) のため Claude API auth 経路は変更なし、 Trust Cliff 該当なし
4. **投資業界色ルール (緑 = 上昇)** vs IRLinksPanel
   - IRLinksPanel は方向性データ非保持 (リンク列のみ) のため緑/赤の判断不要、 cyan brand color のみ
5. **「過去実績ベース、 将来予測を含みません」 (Phase 2.5 §38 文末)** vs 本 SPEC
   - 本 SPEC は backend 数値計算層に触れない、 §38 配慮文末 削除しない

### CVR 影響予測

- **#3 Phase A 単独で CVR 改善** (qa-dogfooder 推定): 「会社概要 4 行のみで離脱」 → 「ロゴ + 本社で『情報あるな』 と認識」 = 5-10% CVR up 期待
- 他 4 件は visual 改善、 直接 CVR 改善は小さいが「またこのアプリを開きたい」 retention 改善 (Phase 2.5 と同じく measurement 不能だが定性的)

---

## 4. Hallucination Guard 適合

### LLM 呼び出しを含むか

**no** (Phase A は静的 dictionary + Python 計算で完結)

### 詳細

- **#1 Tier M 昇格**: className 追加のみ、 LLM 関与なし
- **#2 IRLinksPanel 強化**: CSS opacity + empty skeleton 追加、 LLM 関与なし
- **#3 Phase A 会社概要静的拡張**: FMP `/profile` の既存 field (`description` / `image` / `city` / `state` / `country` / `fullTimeEmployees` / `sector` / `industry`) + `/stock-peers/{ticker}` の peer ticker chips、 LLM 関与なし
  - **description は英語のまま表示** (Phase A は translation なし、 Phase B で LLM hybrid に進む際に Hallucination Guard 4 重防御を適用)
  - **BLOCKLIST_REGEX 不要** (静的 FMP データ、 LLM 生成テキストなし)
- **#4 AccordionSection overflow 修正**: CSS のみ、 LLM 関与なし
- **#9 ConferenceAnalysis font-weight**: ReactMarkdown components mapping の className 変更、 既存 LLM 生成テキストへの style 変更のみ (生成 prompt 変更なし)

### Hallucination Guard layer 適用範囲

| Layer | 適用 |
|---|---|
| Layer 1 (pre-commit hook) | **適用** (`backend/app/aggregator/*.py` への LLM SDK import を BLOCK は backend 変更なしのため発火しない、 ただし hook は維持) |
| Layer 2 (NEGATIVE_EXAMPLES) | **適用範囲外** (LLM 呼び出しなし) |
| Layer 3 (BLOCKLIST_REGEX) | **適用範囲外** (静的データ、 LLM 出力なし) |
| Layer 4 (sources schema + per-source data namespace) | **適用範囲外** (新 endpoint or 既存 endpoint 拡張で FMP 単一 source) |

**Phase B (将来別 SPEC)** で LLM 日本語要約に進む際は 4 重防御 + 6 体合議必須、 本 SPEC では Phase A 静的で完結。

---

## 5. スプリント分割 (1 sprint = 5 件一括、 上限 6 sprint 遵守)

### Sprint 1: Phase 2.6 visual hotfix 5 件一括 (~1.8 人日)

#### 5-1. #1 GuidanceCard Tier M 昇格 (0.3 人日)

**目的**: GuidanceCard を Tier M (halo sweep) に昇格、 「決算合否の核」 として周囲 5 条件 cards と整合させる。

**触るファイル**:
- `frontend/src/components/JudgmentDetail.jsx` (line ~482、 GuidanceCard wrapper の className に `tier-m-glow` 追加)

**呼ぶ既存 skill**:
- `designing-workspace-ui` (Tier M halo の階層整合確認)
- `design-system-check` (className whitelist / elevation_scale.md 整合)

**完了判定基準**:
- `cd frontend && npm run build` 成功
- IntersectionObserver で `data-halo-ready` が 1 回限り発火 (900ms cyan sweep、 v54-v59 安全パターン遵守)
- snap-debug-pane3.mjs で AAPL ロード時に GuidanceCard halo 視認確認
- design-system-check WARN/ERR 増加なし

#### 5-2. #2 IRLinksPanel 視認性強化 (0.5 人日)

**目的**: NewsPanel と class 一致だが内容密度低で「平」 に見える IRLinksPanel を、 hover border 全体強化 + empty skeleton 追加で視認可能化。

**触るファイル**:
- `frontend/src/index.css` (`.tier-l-glow` hover border-color **40% → 55%** に底上げ、 NewsPanel + IRLinksPanel + DetailReport の全 Tier L 同時改善)
- `frontend/src/components/IRLinksPanel.jsx` (pressReleases.length === 0 時の empty skeleton 追加、 「IR リソース取得中」 or 「公開ニュース 0 件」 fallback UI)

**呼ぶ既存 skill**:
- `designing-workspace-ui` (Tier L 階層維持確認、 5 条件 > news の階層を破壊しない)
- `design-system-check` (border-color whitelist + opacity range)

**完了判定基準**:
- pressReleases.length === 0 でも IRLinksPanel に「IR リソース取得中」 or 「公開ニュース 0 件」 が表示される (feedback_data_completeness_guard.md 3 段階分岐 UI 準拠)
- hover で border-color が cyan 55% 強度で発火、 NewsPanel + IRLinksPanel + DetailReport 全 Tier L で同等視認
- snap-debug-pane3.mjs で hover シミュレーション後の border 視認確認

#### 5-3. #4 「会社概要」 発光クリッピング (0.3 人日)

**目的**: AccordionSection の `overflow:hidden` が halo を clip する root cause を解消、 全方向広がり復活。

**触るファイル**:
- `frontend/src/components/AccordionSection.module.css` (`.root` の `overflow:hidden` → `overflow:visible`、 ただし `:where([data-state="closing"])` 時のみ hidden 復活)

**呼ぶ既存 skill**:
- `designing-workspace-ui` (glow host border-radius ownership 整合確認)
- `pge-loop-debugger` (v54-v59 教訓 re-emergence risk、 snap-debug-pane3.mjs visual harness exception で必ず verify)

**完了判定基準**:
- AAPL / NVDA / TSLA / MSFT / META の 5 銘柄で「会社概要」 アコーディオン展開時に halo クリッピングなし (snap-debug-pane3.mjs verify)
- closing state での clip-path animation 維持 (overflow:hidden 復活)
- **`contain: paint` 絶対追加禁止** (v54-v59 anchor、 glow_elevation_postmortem.md 最重要 rule)
- design-system-check WARN/ERR 増加なし

#### 5-4. #3 Phase A 会社概要静的拡張 (0.5 人日)

**目的**: LP「AI 詳細レポート」 訴求 vs 現状「会社名のみ」 の Trust Cliff 重を、 LLM 不使用の静的拡張で最低限解消。

**触るファイル**:
- `backend/app/services/fmp_client.py` (`profile()` で既存 FMP `/profile` response の `description` / `image` / `city` / `state` / `country` / `fullTimeEmployees` field を frontend に渡す、 既に取得済の可能性高、 propagation のみの可能性)
- `backend/app/routes/profile.py` (or `/api/analyze` 内 profile 系 endpoint、 `/stock-peers/{ticker}` 呼出追加 → 3-5 peer ticker chips)
- `frontend/src/components/ProfileCard.jsx` (ロゴ画像 + description (英語のまま) + 本社所在地 + 従業員数 + セクター + 競合 chip の表示拡張)

**呼ぶ既存 skill**:
- `fmp-api-retry` (FMP `/profile` + `/stock-peers/{ticker}` の retry / rate limit pattern)
- `designing-workspace-ui` (ProfileCard 内 layout の Aman 級整合、 typography 階層、 chip primitive 利用)
- `shadcn` (chip primitive 既存利用、 inline style 禁止)

**完了判定基準**:
- AAPL: 「Apple Inc.」 + ロゴ + Cupertino, California, US + 従業員数 + Sector (Technology) + Industry + 競合 chip (MSFT / GOOG / AMZN 等 3-5 件)
- LLM 呼び出し 0 件 (`grep -r "anthropic" backend/app/services/fmp_client.py` で 0 件確認)
- aggregator/*.py に LLM SDK import なし (pre-commit hook Check 3 PASS)
- **demo mode (3 req/IP/day) 維持**: `handleLPTickerClick` 経由で同一 limit 適用
- `cd frontend && npm run build` 成功

#### 5-5. #9 「決算ハイライト分析」 太字残存 (0.2 人日)

**目的**: Phase 2.5 Sprint 1 で `font-bold` → `font-semibold` 修正済だが、 user 視認「太いまま」、 他 section の SectionHeader fw500 と整合せず。 `font-medium` に統一。

**触るファイル**:
- `frontend/src/components/ConferenceAnalysis.jsx` (line 12 h2 / line 19 h3 / line 28 p[isSection] / line 38 strong の className を `font-semibold` → `font-medium` に変更、 全 4 箇所)

**呼ぶ既存 skill**:
- `conference-analysis` (太字統一 + chip 化維持の SSOT)
- `design-system-check` (typography 階層 6 段階整合)

**完了判定基準**:
- `frontend/src/components/ConferenceAnalysis.jsx` の 4 箇所が `font-medium` に統一
- chip 化 (bg-subtle + padding) は **維持** (情報階層の visual 区切りとして必要)
- 他 section の SectionHeader fw500 と整合 (snap-debug-pane3.mjs で確認)
- `cd frontend && npm run build` 成功

### Sprint 1 全体完了 gate

- **Evaluator L1-L4** (build / testid grep / NaN grep / design-system-check) 全 PASS
- **内蔵 3 体合議** (ui-designer + frontend-architect + qa-dogfooder) で verdict (条件付 PASS or 賛成 PASS)
- snap-debug-pane3.mjs で 5 銘柄 (AAPL/NVDA/TSLA/MSFT/META) 全ロード後の visual verify
- bundle hash 更新確認 (Phase 2.5 末 → Phase 2.6 hash)

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

### 絶対不変 (本 SPEC 全期間)

- `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1、 LLM 数値計算指示 BLOCK)
- `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3、 数値物理層 vs narration 分離)
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor、 BAD-1〜6 pattern)
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX (typo は OK、 logic 不変)
- `.claude/launch.json` (人間用、 AI 使用禁止)
- `migrations/*.sql` (DB schema、 本 SPEC は backend schema 変更なし)
- `handover_*.md` (read-only reference、 v90 含む)
- `railway.toml` cron 定義 (10 分 cron / 15 分 warmup 不変)
- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域、 §C-6 anchor)
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高 risk、 v54-v59 6 セッション教訓)
- `frontend/src/components/SectionFade.jsx` variants 化 (v90 Sprint 1 で確定、 `viewport once + amount 0.15`、 `margin -10%` 戻さない)
- `frontend/src/App.jsx` root listener `bs:open:addtx` (v90 Sprint 1 確定、 削除禁止)
- `window.__bs_indices_mounted` guard (v90 Sprint 1 確定、 二重 modal 防止)
- Chart 系 Recharts `isAnimationActive=false` (feedback_chart_overlay_safety.md、 chart 真っ白事故防止 4 層防御)
- 投資業界色ルール (`var(--color-gain)` 緑 / `var(--color-loss)` 赤 / `var(--color-warning)` amber、 cyan `--color-accent` は brand 専用)
- elevation 5 層 + typography 6 段階 + 8pt grid (`elevation_scale.md` whitelist)
- 5 条件 cards Tier M halo 強度 (Phase 2.5 Sprint 2 確定、 opacity 40-55% / mask peak 35-65% / duration 900ms / blur 2px)
- Tier L 階層整合 (5 条件 > news の階層維持、 Tier L に halo 適用しない、 hover border + box-shadow inset のみ)
- QuarterlyHistoryTable colgroup + 凡例 §38 文末「過去実績ベース、 将来予測を含みません」 (Phase 2.5 Sprint 3 確定、 削除禁止)
- Insider Premium teaser 文言「Premium で開放: Form 4 / 13F」 (Phase 2.5 Sprint 1 確定、 「壊れている」 印象に戻さない)
- ConferenceAnalysis.jsx の chip 化 (bg-subtle + padding) 維持 (font-weight のみ変更)

### Sprint 1 該当範囲外 (本 SPEC では触らない)

- 新規 backend endpoint の RLS / 認証境界 (Phase A 静的拡張は既存 endpoint 拡張で十分、 新 RLS 不要)
- Pro tier 課金 UI / ProTeaser localStorage gate (v90 §6 で確定の Sprint 1 完了後別 SPEC)
- Cup-Handle 関連 (Phase 2 で着地済、 本 SPEC 範囲外)
- Pane 2 (世界市場) / Pane 4 (ウォッチリスト) (本 SPEC は Pane 3 限定)
- LandingPage.jsx / SampleAnalysisSection (LP 訴求文言、 本 SPEC は LP 触らない)

---

## 7. multi-review 必要性判定

### 3 軸チェック

1. **LLM 出力品質** (景表法 / 金商法 / hallucination risk): **inactive**
   - Phase A は LLM 不使用、 静的 FMP データのみ。 BLOCKLIST_REGEX 適用範囲外。 Hallucination Guard layer 2-4 非関与。
2. **Trust Cliff** (LP 訴求 vs 実装の整合): **active**
   - #3 Phase A 会社概要静的拡張は「AI 詳細レポート」 訴求 vs 「会社名のみ」 の Trust Cliff 重を Phase A 最低限で解消。
   - 他 4 件 (visual 系) も Trust Cliff 軽-中。
3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: **inactive**
   - 既存 `/profile` endpoint の field propagation または `/stock-peers/{ticker}` 追加で対応、 RLS 不要 (FMP 公開データ)、 認証境界変更なし。

### 判定

**active 軸数 = 1** → **3 体合議で十分** (6 体合議不要)

**推奨 reviewer 構成**: `ui-designer + frontend-architect + qa-dogfooder` の 3 体並列 (1 メッセージ起動、 ~5 分)

**根拠 1 行**:
> LLM prompt 不変 + 既存 schema 維持 + frontend 局所修正 + backend 既存 endpoint 拡張のみ、 Trust Cliff 1 軸 active で v82 Phase 5.5 同 pattern と一致。

---

## 8. 想定リスク + roll-back plan

### Sprint 1 失敗時のリスク

| Sprint 5-X | 失敗時に壊れるもの | 緊急 roll-back |
|---|---|---|
| 5-1 (#1 Tier M) | GuidanceCard の halo が他 Tier M と整合せず違和感 | `git revert <commit>` で className 追加削除 |
| 5-2 (#2 IRLinksPanel) | hover border 強度が他 Tier L で過剰、 全 Tier L で過発光 | `git revert <commit>` で `.tier-l-glow` opacity 40% に戻す |
| 5-3 (#4 overflow) | **v54-v59 教訓 re-emergence**: 発光バグ復活、 二重枠 / 半径不一致 / shadow クリップ | `git revert <commit>` で `overflow:hidden` 復活、 snap-debug-pane3.mjs 比較画像で即検出 |
| 5-4 (#3 Phase A) | FMP `/stock-peers/{ticker}` rate limit 抵触、 demo mode bypass、 ProfileCard layout 崩壊 | `git revert <commit>`、 `/profile` field 表示のみ rollback (peer chip 削除)、 demo mode 確認 |
| 5-5 (#9 font-weight) | ConferenceAnalysis 全体 font-weight が薄すぎて読めなくなる | `git revert <commit>` で `font-semibold` に戻す |

### roll-back 手順

1. **失敗検出**: snap-debug-pane3.mjs visual diff or user dogfood report
2. **commit revert**: `git revert <SHA>` (該当 Sprint 5-X の commit)
3. **Railway redeploy**: `railway up` (本番デプロイ、 bundle hash 確認)
4. **verify**: snap-debug-pane3.mjs 5 銘柄で正常表示確認

### 全 Sprint 失敗時の緊急 roll-back

`git reset --hard <Phase 2.5 完走 commit>` + `railway up` で Phase 2.5 末状態に復帰。 user 在席 autonomy mode のため緊急回避時のみ実施 (user 承認後)。

### v54-v59 re-emergence risk が最大 (Sprint 5-3 #4 overflow)

- AccordionSection の `overflow:hidden` → `visible` 変更は v54-v59 教訓と同型の root cause 修正
- **snap-debug-pane3.mjs visual harness exception で必ず verify** (60s teardown、 5 銘柄ロード、 アコーディオン展開時 halo クリッピングなし確認)
- `contain: paint` を絶対追加しない (glow_elevation_postmortem.md 最重要 rule、 box-shadow 要素境界クリップ root cause)
- 失敗時の visual 検出が困難な場合は user dogfood 直後に rollback 判断

---

## 9. Sprint 1 完了 gate (Evaluator L1-L4 + 内蔵 3 体合議)

### Evaluator L1 (build)

- `cd frontend && npm run build` 成功
- `cd backend && pytest` 既存テスト PASS (新 endpoint 拡張ありの場合 test 追加)

### Evaluator L2 (testid grep)

- 既存 testid (Sprint 1 で命名済) の grep mismatch なし
- 新規 testid 追加時は ProfileCard 系 (例: `data-testid="profile-description"` / `profile-peer-chip-{ticker}"`) を Generator が自発 grep verify

### Evaluator L3 (NaN grep + selector hallucination check)

- `grep -r "NaN" frontend/src/components/ProfileCard.jsx` で NaN 出現なし (FMP `fullTimeEmployees` が null の場合 fallback)
- selector hallucination check: snap-debug-pane3.mjs で実 DOM 取得後 selector 一致確認 (feedback_pge_loop_pitfalls.md L3 教訓)

### Evaluator L4 (design-system-check)

- WARN/ERR 増加なし (Phase 2.5 末 baseline 維持)
- raw hex / shadow / !important whitelist 違反なし
- typography 階層 6 段階 + 8pt grid 整合

### 内蔵 3 体合議 (ui-designer + frontend-architect + qa-dogfooder)

- 1 メッセージ並列起動 (~5 分)
- verdict 集約: 賛成 PASS or 条件付 PASS (修正 1-2 件込)
- 反対 PASS は Sprint 1 内 hotfix or Phase 2.7 で対応

### Sprint 1 完了 → main consolidate + Railway deploy

- bundle hash 変化確認 (Phase 2.5 末 → Phase 2.6 hash)
- 本番 URL で 5 銘柄 (AAPL/NVDA/TSLA/MSFT/META) ロード verify
- user dogfood 確認 (Phase 2.6 全 5 件直っているか)

---

## 10. Phase 3 候補 (本 SPEC スコープ外、 後日別 SPEC)

| 項目 | 工数 | 着手条件 |
|---|---|---|
| #3 Phase B (LLM hybrid 会社概要、 日本語要約) | 1.5-2.5 人日 + 6 体合議 + Hallucination Guard 4 重防御 | Phase A dogfood verify 完了後 |
| #5 Insider 本格実装 (FMP /insider-trading + Pro tier gate) | 1.5-3.0 人日 + 6 体合議 + 法務 review | 記事タブ launch 後 |
| #6 View Transition Pane 切替拡張 | 0.8-1.8 人日 | Aman 級「画面遷移の優しさ」 強化、 user 判断後 |
| #4 sticky verdict mini-pin (Phase 2.5 §2 繰越) | 0.4 人日 | Phase 2.6 完了後の dogfood verdict 次第 |

---

## 11. SPEC 起票後のアクション (Generator 起動準備)

### Generator subagent に渡す情報

1. **SPEC path**: `/Users/yamadadaiki/Projects/beatscanner/docs/specs/SPEC_2026-05-21_pane3-phase26-visual-hotfix.md`
2. **Sprint 1 着手**: 上記 5-1 〜 5-5 を順次実装 (5-1 → 5-2 → 5-3 → 5-4 → 5-5 推奨、 dependency なしのため並列も可)
3. **完了 gate**: §9 Evaluator L1-L4 + 内蔵 3 体合議 全通過
4. **触らない領域**: §6 全項目 (特に v54-v59 anchor、 SectionFade variants、 App root listener、 chart overlay safety)
5. **multi-review**: §7 判定通り 3 体合議で十分 (Phase 2.6 完了 gate)
6. **Hallucination Guard**: §4 適用範囲外、 Phase A 静的のみ

### Generator self-eval 5 項目 (feedback_generator_selfeval_incomplete.md SOP)

1. `cd frontend && npm run build` 成功 verify
2. 新規 testid grep verify
3. NaN grep verify (ProfileCard fallback 確認)
4. design-system-check WARN/ERR 増加 0 件 verify
5. Evaluator subagent 起動 (内蔵 3 体合議含む)

main 側 (オーケストレータ) は Generator の self-eval が止まった場合 (例: design-system-check で止まる) は手動補完 SOP を適用。

---

## 12. user 承認 (gate 1)

**省略** (user 在席 autonomy mode、 3 体合議 verdict 反映済、 user 追加 feedback 反映済)

Generator 起動準備完了。 Sprint 1 着手可能。
