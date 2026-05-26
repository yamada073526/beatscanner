# SPEC v2: Pane 2 抜本改革 + 銘柄スクリーナー workspace 移設 (multi-review 6 体反映)

**起票日**: 2026-05-26 / **session**: v120 / **依頼者**: user (handover v119 Task 0+1)
**v2 改訂**: 2026-05-26 multi-review 6 体合議 (全 CONDITIONAL PASS) verdict 反映

---

## 背景

handover v119 で 2 件の重大課題が継承:

1. **Pane 2 chip 4 行 / sparkline / 騰落率 / "—" の 4 件** (user dogfood 指摘、 放置されていた)
2. **銘柄スクリーナー workspace 移設** (P6 で Pane 4 削除した副作用、 workspace mode から access 断絶)

両方 Pane 2 周辺なので統合 SPEC として 1 件で multi-review 6 体合議 → 全 CONDITIONAL PASS。 amendments 反映後 PASS。

---

## 真因分析 (現状コード基準、 grep 確認済)

### A. Pane 2 「chip 4 行」 の正体
| # | source | chip 内訳 | 個数 |
|---|---|---|---|
| 1 | `Pane2MetaToggle` ChipBar 上段 | 期間: 1d/1w/1m/6m/1y | 5 |
| 2 | `Pane2MetaToggle` ChipBar 下段 | 表示: 1日%/5条件/決算/タグ | 4 |
| 3 | `JudgmentSearchBar` (sticky 44px) | search input | 0 |
| 4 | `JudgmentFilters` 左 | グループ: すべて/保有/観察/5条件合致 | 4 |
| 5 | `JudgmentFilters` 右 | 並び替え: デフォルト/タグ順/決算近/騰落順 | 4 |

→ 物理 4 control row + chrome 圧迫。

### B. sparkline 意味ない: 80×28 で形状判別不能、 trend は color (=change%) で代替可
### C. 騰落率 「無い」: 既に Col 3 にあるが fontSize 10 / fontWeight 500 で視認性不足
### D. 「—」: Col 3 + Col 4 で change% 二重表示 (Col 4 default が 5 条件 dot ではなく change1d だった)
### E. screener access 断絶: P6 で Pane 4 削除 → workspace mode 経路完全消失

---

## 設計原則
1. chrome 軽量化: 17 chip → 0 control chip + filter 8 chip
2. redundant 削除: Col 3 / Col 4 二重 change% 解消
3. sparkline 削除 + 代替視覚 (1y trend arrow + %) で「リッチ感」 維持
4. screener: workspace header に新 access point (modal lazy)

---

## Sprint 構成 (4 sprint + 任意 sprint 5、 2.0-2.5 人日)

### Sprint 1: Pane2MetaToggle 廃止 + workspaceStore migrate v13→v14

**変更**:
- `Workspace.jsx` の `Pane2MetaToggle` component 全削除 + import 除去
- `workspaceStore.js`: `version: 13 → 14` 昇格、 migrate 関数で **`pane2Meta: 'condition'` reset** (Frontend 指摘)
- `sparklinePeriod` は store 維持 (MarketStripCompact 副作用回避、 QA 指摘 D2)
  - hardcode `'1y'` 固定はしない、 store 値そのまま MarketStripCompact が引き続き使用
- `pane2Meta` state も維持、 callsite (JudgmentRow.jsx) は 'condition' default 固定で参照
- deprecated comment 付与: `// UI 切替廃止 (Sprint 1)、将来復活時は migration v++ 必要`

**file**:
- `frontend/src/features/workspace/Workspace.jsx` (L27 import、 L113-140 Pane2MetaToggle、 L654 mount 削除)
- `frontend/src/state/workspaceStore.js` (version 14 migrate)

**完了判定**:
- Pane 2 上部 control 行が search 44px + JudgmentFilters のみ (Pane2MetaToggle 消失)
- build pass
- `grep -rn "Pane2MetaToggle" frontend/src` 結果 0 件
- `grep -rn "SPARKLINE_PERIOD_OPTIONS\|META_OPTIONS" frontend/src/features/workspace/Workspace.jsx` 0 件
- localStorage `workspace-store` 開いて `pane2Meta=condition / version=14` 確認

### Sprint 2: JudgmentRow 再設計 (sparkline 削除 + 1y trend arrow + Col 3 強化)

**Col 2 (sparkline)**: **削除**
- `RowSparkline` import + `<span className="ws-row-sparkline">` 全削除 (Frontend Hint 5: invisible fetch 防止)
- `.ws-row-sparkline` CSS class 残置 (他用途あれば再利用)
- grid template: container query での 80px 列消失 (Sprint 2 内で `.ws-judgment-row` の grid-template-columns を Col 1 (1fr) + Col 3 (140px) + Col 4 (60px) に再構成、 UI/UX Amendment PA1)

**Col 3 (株価 + 騰落率 + 1y trend)**:
- 株価: fontSize 14 / fontWeight 700 (維持)
- 騰落率 (1日%): fontSize **12 / fontWeight 600** (10→12 / 500→600 強化)
- **1Y trend** (Marketer A-4 代替案): fontSize **10 / color: trendColor**、 「1Y ▲ +12.3%」 形式
  - data source: `useRowSparkline` の prices 配列から `(last/first - 1) * 100` で算出 (RowSparkline 自体は削除するが hook は活かす)
  - 不要なら hook ごと削除して `period-returns` API 1y で代替も可。 工数 minimum 路線で hook 流用
- null 時の em dash「—」 削除 (span hide)

**Col 4 (meta cell) 簡素化**:
- `pane2Meta === 'change1d'` ケース削除 (redundant)
- default `condition` (5 条件 dot) 固定
- `earnings` / `tag` ケースは dead branch (UI 切替廃止) として `// 廃止予定` comment 付与で残置 (future migration risk 低減、 QA D3)

**file**:
- `frontend/src/features/judgment/components/list/JudgmentRow.jsx`
- `frontend/src/features/workspace/index.css` (grid template)

**完了判定**:
- JudgmentRow に sparkline 列が無い
- Col 3 で株価 14px + 1日% 12px / fontWeight 600 + 1Y trend 10px の 3 段表示
- null 時 em dash 消失 (span hide)
- testid `ws-judgment-row` grep 残存
- `MarketStripCompact` sparkline は visible (副作用無し、 QA D2)
- build pass

### Sprint 3: Screener WorkspaceHeader button + Modal (radix Dialog + lazy)

**Header button** (WorkspaceHeader.jsx L196-200 actions cluster):
- 位置: `MarketStatusPill` 直後、 kebab 直前
- **desktop ≥768px**: `<Filter size={13} />` + label「スクリーナー」 (fontSize 12, fontWeight 600, gap 6px) (Marketer A-1)
- **mobile <768px**: icon only + tooltip (Marketer A-1 mobile fallback)
- 非 Pro user: **Pro amber badge** 付与 (Marketer A-2)
- `useUpgradeModal()` を WorkspaceHeader 内で直接呼出 (Frontend Hint 1)、 非 Pro 時 `upgrade.open('銘柄スクリーナー', { title, description, ctaLabel })` 呼出 (Marketer A-3、 ただし upgrade.open signature 確認後実装)

**Modal**:
- `WorkspaceScreenerModal.jsx` 新規 (radix-ui/react-dialog or shadcn `<Dialog>` 採用、 Anthropic Eng A2)
- focus trap / scroll lock / a11y 自動付与
- z-index: `var(--z-modal, 1000)` (既存 ProTeaser modal と同階層)
- mobile (≤640px): full-screen
- 中身: `<CustomScreenerPanel onSelect={(sym) => { close(); setActiveTicker(sym); }} />` (close 先、 ticker 後 = QA Amendment)
- **lazy load**: `lazy(() => import('./WorkspaceScreenerModal.jsx'))` for WorkspaceHeader、 `Suspense fallback={null}` で wrap (Frontend Hint 2 + Anthropic Eng A3)
- `useArrivalSpotlight` **必須**化 (Marketer A-5、 magic moment)

**setActiveTicker 経路**: `useWorkspaceStore((s) => s.setActiveTicker)` で modal 内 store 直接呼出 (UI/UX C3 + QA Amendment、 props drilling 不要)

**file**:
- `frontend/src/features/workspace/WorkspaceHeader.jsx`
- `frontend/src/features/workspace/WorkspaceScreenerModal.jsx` (新規)

**完了判定**:
- WorkspaceHeader actions cluster: desktop で「スクリーナー」 label visible、 mobile で icon only + tooltip
- 非 Pro user: Pro badge visible、 click で ProTeaser open (custom copy)
- Pro user: click で modal open、 中身に CustomScreenerPanel mount
- modal 内銘柄 click → modal close + Pane 3 detail 表示 (close 先、 setActiveTicker 後)
- Esc / × / backdrop click で close
- mobile 375px / 640px / 1024px / 1440px の 4 viewport で header wrap なし (Anthropic Eng A1 / QA D5)
- bundle size 増加 ≤ 5KB gzipped (Anthropic Eng A3)
- a11y: role="dialog", aria-modal, focus trap, scroll lock 自動 OK

### Sprint 4: multi-review 3 体合議 (verdict 反映) + deploy

- **multi-review 3 体合議** (Anthropic Eng A4 縮小: ui-designer + frontend-architect + qa-dogfooder、 sonnet 並列)
- design-system-check skill 実行
- railway deploy
- smoke test 10 件 (下記 DoD 参照)
- bundle hash 確認

### Sprint 5 (任意): grace preview + 「決算前自動分析」 grace 表記確認 (Marketer A-6 / TC-6)
- 非 Pro user ProTeaser 内に Cup-Handle 1 件 grace preview (`/api/scanner/cup-handle?limit=1`)
- LP §Pricing「決算前自動分析 (近日提供予定)」 grace 表記が消されていないか smoke test

---

## 関連 file SSOT

### 修正 (5 file)
- `frontend/src/features/workspace/Workspace.jsx`
- `frontend/src/features/workspace/WorkspaceHeader.jsx`
- `frontend/src/features/judgment/components/list/JudgmentRow.jsx`
- `frontend/src/state/workspaceStore.js` (migrate v13→v14)
- `frontend/src/features/workspace/index.css` (grid template、 必要なら)

### 新規 (1 file)
- `frontend/src/features/workspace/WorkspaceScreenerModal.jsx`

---

## Definition of Done (multi-review 反映後)

### chrome / row redesign
- [ ] Pane 2 chip 行が search 44px + filters 32px = ~76px に収束
- [ ] JudgmentRow に sparkline 列が無い (削除)
- [ ] JudgmentRow Col 3 で株価 14 / 1日% 12 / 1Y trend 10 の 3 段表示
- [ ] null 時 em dash「—」 削除 (span hide)
- [ ] `MarketStripCompact` の sparkline は visible (副作用なし、 QA D2)

### screener
- [ ] WorkspaceHeader Screener button: desktop で「スクリーナー」 label visible
- [ ] mobile (<768px) で icon only + tooltip
- [ ] 非 Pro user: Pro amber badge visible
- [ ] 非 Pro user click → ProTeaser open with screener-specific copy
- [ ] Pro user click → modal open
- [ ] modal 内銘柄 click → modal close + Pane 3 detail (close 先、 ticker 後)
- [ ] Esc / × / backdrop click で close
- [ ] modal a11y: role="dialog", aria-modal, focus trap, scroll lock

### viewport / regression
- [ ] viewport 375 / 640 / 1024 / 1440 px で WorkspaceHeader wrap なし
- [ ] 既存 SPA mode drawer から screener 起動も regression なし (App.jsx L2295)
- [ ] `pane2Meta` localStorage が version 14 で `'condition'` reset

### build / deploy
- [ ] build pass
- [ ] bundle size 増加 ≤ 5KB gzipped
- [ ] railway deploy 成功 + bundle hash 変化
- [ ] smoke test: BYPASS_TOKEN で `/api/scanner/cup-handle?filter=cup` 200
- [ ] design-system-check skill PASS
- [ ] multi-review 3 体合議 2/3 以上 PASS

### Trust Cliff
- [ ] LP §Pricing「決算前自動分析 (近日提供予定)」 grace 表記未削除
- [ ] LP §Pricing「✓ バックテスト 5 年実証」 vs workspace UI 整合 (本 SPEC 範囲外、 別 ticket 起票候補)

---

## 触ると危険な箇所 (回避策)

- **sticky-search-band**: 触らない (永久凍結)
- **`ds-judgment-search-bar` class**: 触らない (専用 class)
- **CustomScreenerPanel.jsx**: 内部実装は無触
- **`/api/scanner/cup-handle` endpoint**: backend 無触 (main.py L13894)
- **発光系 (.panel-card / .bs-panel / .surface-card)**: 入れ子禁止
- **MarketStripCompact**: sparklinePeriod store 共有のため hardcode `'1y'` 固定にしない

---

## 工数 (v2)

| Sprint | 内容 | 見積 |
|---|---|---|
| 1 | Pane2MetaToggle 廃止 + migrate v13→v14 | 0.3 人日 |
| 2 | JudgmentRow 再設計 + 1Y trend arrow | 0.6 人日 |
| 3 | Screener Modal (radix Dialog + lazy + visible label + Pro badge) | 0.8 人日 |
| 4 | multi-review 3 体 + deploy | 0.3 人日 |
| 5 | (任意) grace preview + TC-6 | 0.3 人日 |
| **合計** | | **2.0-2.3 人日** |
