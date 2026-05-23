# SPEC: iOS 版 path 実装ロードマップ (v100、 2026-05-23)

handover v99 QA 先回り 5 件 + user dogfood feedback (QA #3-A) を受け、 mobile / iPad 縦 / iPad
横 / desktop / 将来 iOS Native の path を整理する SPEC。 user の依頼 (2026-05-23 16:32):
「実装ロードマップをサブエージェントレビュー頂きたい」 + 「旧 UI の買付履歴等の DB が現 UI で
反映されてない」 を反映。

---

## 0. 背景 (現状把握)

### UI 切替 logic (App.jsx)

```jsx
const isMobileForWorkspace = useIsMobile(768);     // 768px 未満 = mobile
const useWorkspaceLayout = !isMobileForWorkspace && !urlWantsClassic;
```

- **width < 768px** (iPhone / iPad 縦)  → 旧 UI 強制 (`?layout=workspace` 指定でも mobile では旧 UI)
- **width ≥ 768px + `?layout=classic` 無し** → 新 UI workspace
- **width ≥ 768px + `?layout=classic` 指定** → 旧 UI

### 旧 UI 構成 (タブ型 SPA、 App.jsx 直 mount)

| tab | component | 主要機能 |
|---|---|---|
| home | `HomeTab.jsx` | LP + ポートフォリオ + 注目銘柄 + 経済指標 |
| judgment | `JudgmentTab.jsx` (旧 / 新 v2 切替) | 判定 list + 詳細 |
| report | `DetailReport.jsx` | AI 詳細レポート + 図解 + AccordionSection |
| チャート | `ChartTab.jsx` | lightweight-charts ローソク足 |

portfolio 関連:
- `PortfolioDashboard.jsx`、 `TransactionEntryModal.jsx`、 `TransactionHistoryModal.jsx`、 `PortfolioHistoryChart.jsx`

### 新 UI workspace 構成 (3 pane、 `?layout=workspace`)

```
features/workspace/
├── WorkspaceShell.jsx     # 全体 layout
├── Workspace.jsx          # pane 構成
├── Pane1MacroSection.jsx  # 世界市場 + 指標
├── IndicesView.jsx        # 指数詳細
├── PaneDetailView.jsx     # 中央 Pane 3 dispatcher (ticker / portfolio / 指数)
├── TickerDetailBody.jsx   # Pane 3 銘柄判定 (= JudgmentDetail.jsx)
├── PortfolioDetailBody.jsx # Pane 3 ポートフォリオ詳細
├── Pane4Inspector.jsx     # 右 Pane (news / scanner)
└── pane4/
```

### portfolio 関連の hook (共通)

`useHoldings`, `useTransactions`, `usePortfolioPerformance`, `usePortfolioHistory`,
`usePortfolioPrices`, `usePortfolioJudgment`, `useHoldingsMeta`, `usePortfolioEvents`

**仮説**: 旧 UI / 新 UI で同 hook 経由 → 同 Supabase 同 RLS から読むはず。 user 認識「現 UI
で反映されない」 は: (a) state 同期 cache invalidation 漏れ、 (b) 別 endpoint、 (c) workspace
mode で `PortfolioDetailBody` が transactions を読まない、 のいずれか。 **Phase 0 で実態 audit
必須**。

---

## 1. user feedback summary

### QA #3-A (iOS path)
- スマホ縦 + iPad 縦 → 旧 UI 自動切替
- iPad 横 → workspace で動作 (QA #3-B fix 済)
- 「pane でなく tab 型になるのはもちろん、 内部 contents もほぼ別」
- 「旧 UI の買付履歴等の DB は現 UI に反映されてない」

### user 推奨方針
- **B 案 (旧 UI 維持)** で OK。 ただし統合 ロードマップをサブエージェントレビューしてほしい

---

## 2. 推奨 Phase plan

### Phase 0: 現状 audit (1-2 人日、 🔴 release 前 mandatory)

1. **portfolio データフロー監査**
   - 旧 UI `TransactionEntryModal` → `useTransactions` → Supabase
   - 新 UI workspace `PortfolioDetailBody` → 同 hook? → Supabase
   - 同一 DB schema / 同一 RLS policy 検証
   - user 認識「反映されない」 の真因特定:
     - (a) cache invalidation 漏れ (state stale)
     - (b) 別 endpoint で別 table 読込
     - (c) PortfolioDetailBody が transactions を render しない設計
2. **旧 UI vs 新 UI feature gap matrix**
   - 旧 UI 各タブの全機能列挙
   - 新 UI 各 pane の全機能列挙
   - 「旧 UI のみ機能」 「新 UI のみ機能」 「両方あるが UI 異なる」 を 3 分類
3. **mobile user share 測定基盤**
   - Sentry / GA tag で iPhone/iPad/Android UA 比率を本番 dogfood で記録
   - release 後 1-2 ヶ月で「mobile workspace の必要性」 判断材料

### Phase 1: portfolio データ整合性 fix (3-5 人日、 🔴 release 前 mandatory)

Phase 0 audit 結果に応じた fix:
- 同一 DB schema 確認 → 異なれば migration
- 同一 RLS policy 確認 → user_id 共通化
- state 同期 (旧 UI で transaction 入力 → 新 UI で即反映、 cache invalidation pattern)
- 旧 UI `TransactionEntryModal` を新 UI Pane 3 からも開ける ように route 共通化

### Phase 2: 旧 UI mobile UX 改善 (2-3 人日、 🟡 release 後)

旧 UI 継続なら mobile 体験を強化:
- 旧 UI design を Aman design system tokens に近づけ (brand 一貫性向上、 dark mode 統一)
- mobile pull-to-refresh + sticky bottom nav 等の iOS native パターン
- iPad 縦 (768-1024px) で旧 UI を **2 列 layout に拡張** (現状 1 列、 余白が広い)

### Phase 3: mobile 専用 workspace 再構築 (6-10 人日、 🟡 release 後 ~3 ヶ月、 C 案)

release 後 dogfood verdict + mobile user share 測定で必要と判定 → 着手:
- 3 pane → **タブ型 4-5 tab** に再構成:
  - 案 A: ホーム / 銘柄 / 判定 / ニュース / ポートフォリオ
  - 案 B: ホーム / 銘柄リスト / 判定詳細 / ポートフォリオ (4 tab、 ニュースは判定詳細内 section)
  - 案 C: bottom nav (ホーム / 銘柄 / ポートフォリオ) + tap で右 drawer (ニュース / scanner)
- design system 維持 (Aman 級 tokens / dark / motion / typography)
- 内部 contents は **新 UI workspace と feature parity** target
- portfolio Modal は native iOS / Android view で実装 (or PWA drawer)

### Phase 4: Next.js 移行 (10-15 人日、 🟢 記事タブ launch 前後、 D 案)

- CLAUDE.md「Next.js + Vercel 移行」 計画と整合 (記事タブ launch 3-4 週間前)
- responsive design で **1 codebase desktop / tablet / mobile portable**
- SSR / ISR で SEO + 初期 load 改善
- 記事タブ (AI 記事配信 §11-D-1) の前提技術

---

## 3. 工数 summary

| Phase | 工数 | 効果 | priority |
|---|---|---|---|
| Phase 0 audit | 1-2 人日 | 隠れた gap 発見、 真因 SSOT 化 | 🔴 release 前 |
| Phase 1 portfolio 整合性 | 3-5 人日 | user 信頼ベース | 🔴 release 前 |
| Phase 2 旧 UI mobile UX | 2-3 人日 | brand 一貫性向上 | 🟡 release 後 |
| Phase 3 mobile workspace | 6-10 人日 | mobile / iPad 縦 で workspace 体験 | 🟡 release 後 ~3 ヶ月 |
| Phase 4 Next.js 移行 | 10-15 人日 | 1 codebase responsive | 🟢 記事タブ launch 前後 |

---

## 4. サブエージェントレビューに掛ける論点

1. **Phase 1 portfolio データ整合性 真因**: cache / RLS / endpoint / hook 設計、 どこに bug が
   ある最も possible か。 audit 順序 (どの hook / endpoint から見る) の推奨。
2. **Phase 3 タブ構成 idiom**: 4-5 tab 案 (ホーム / 銘柄 / 判定 / ニュース / ポートフォリオ)
   は妥当か、 bottom nav + drawer 案 (案 C) の方が iOS native idiom に近いか。 Aman 級世界観を
   mobile に portable する design 考察。
3. **C 案 (mobile workspace 再構築) vs D 案 (Next.js responsive)**: 同 codebase responsive で
   両方賄える D 案で十分か、 mobile 特化 UX が必須で C 案も独立して必要か。
4. **release 前 vs release 後 の判定 axis**: Phase 1 (portfolio 整合性) は release 前 mandatory
   と判断したが、 release 後で OK か。 Trust Cliff (LP 訴求 vs 実装一致) との関連で必須性判断。
5. **B 案維持 (現状継続) の長期 risk**: 旧 UI が腐る (新機能 mobile 対応忘れ、 feature gap 蓄積)
   の cost と Phase 3/4 着手判断 timing。

---

## 5. 関連 memory anchor / 参照

- `feedback_design_principles.md` (5 原則)
- `feedback_brand_aspiration.md` (Aman/Ritz-Carlton 級世界観)
- `feedback_pre_release_priority.md` (pre-release では release 速度優先)
- `portfolio_account_schema.md` (accounts/transactions/forex_rates 正本 schema)
- `feedback_modified_dietz_period_open.md` (Phase 1 P/L 計算式)
- `nextjs_constraints.md` (Next.js 16 移行制約)
- CLAUDE.md「Next.js + Vercel 移行 (将来計画)」 §記事タブ launch 3-4 週間前

---

## 6. 開発当初の SSOT 担当者割当 (Phase 1 着手時)

- **データ整合性 (Supabase / RLS / hooks)**: backend + frontend hooks engineer
- **mobile UX (Phase 2/3)**: ui-designer + frontend-architect
- **Next.js 移行 (Phase 4)**: フル team + multi-review 6 体合議

releasse 前は Phase 0+1 のみ、 release 後 dogfood verdict で Phase 2-4 を順次判定。
