# SPEC 2026-06-09: C-3 競合ナビ (アプリ内パンくず)

> **状態**: 設計確定済・gate1 通過済 (3体合議 ui/frontend/qa 全員賛成 + user 確認、2026-06-09)。本 SPEC は autopilot 実装用 (user 不在中)。AskUserQuestion 禁止。
> **設計 SSOT**: `memory/project_competitor_nav_breadcrumb.md` + `handover_2026-06-09_v193.md §🔴`。本 SPEC は確定設計を「どう実装するか」に落とすもので、設計再議は行わない。
> **planner 実コード調査済 (推測でなく実コードに基づく)**: App.jsx / useJudgmentResult.js / workspaceStore.js / useUrlSync.js / Workspace.jsx / PaneDetailView.jsx / JudgmentDetail.jsx / ProfileCard.jsx / FundamentalsAccordion.jsx / TickerBadge.jsx / AccordionSection.jsx / snap-v5-dogfood.mjs。
> **呼ぶ skill**: `designing-workspace-ui` (パンくず UI / token 適用) / `pge-loop-debugger` (Generator 起動前の 4 落とし穴) / `design-system-check` (raw hex/shadow gate)。

---

## 1. Context

**user prompt (確定設計の発端)**:
> 会社概要末尾の競合チップから他社 detail に飛ぶと戻れず「ブラウジングのサクサク感が失われる」(user dogfood 2026-06-09)。

**なぜ今やるか**:
- handover v193 §🔴 で「次セッション最優先」と明示。設計は 3体合議 (ui/frontend/qa) + user 確認で確定済 (gate1 通過)、実装のみ持ち越し。
- 状態管理 blast radius 中のため「新鮮なセッションで集中実装」推奨と memory に明記。本セッションが該当。
- 必読 memory: `project_competitor_nav_breadcrumb.md` (SSOT) / `feedback_pane3_detail_view.md` (selectedTarget discriminated union + ?detail=PREFIX:ID) / `feedback_new_ui_only.md` (機能追加は Pane3 系のみ、ChartTab.jsx は触らない)。

**期待される成果 (5原則への貢献)**:
- **原則1 (読み手に負担をかけない)**: 「どこから来たか」を 1 視線で示し、迷子を防ぐ。
- **原則2 (毎日開きたくなる)**: 競合を次々辿る「ブラウジングのサクサク感」を取り戻す = retention lever。
- **原則4 (1クリックを減らせ)**: ブラウザ戻る (LP に戻ってしまう) を使わず、1 click で祖先 ticker に 0 秒復元。投資家が手作業でやる「複数銘柄の見比べ」を肩代わりする方向。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情: **「楽しい (joy)」+「洗練さ (sophistication)」**。
最高級ホテルの比喩で言えば、現状は「villa (個別銘柄の精読室) に入ったら、入ってきた廊下が消えて戻れない」状態。パンくずは「来た廊下の道標」を villa の入口上に常時掲示するコンシェルジュ的所作で、`resultCacheRef` cache hit による 0 秒復元が「廊下を戻る瞬間に待たされない」滑らかさ (joy) を生む。TickerBadge のロゴ併記と `›` 区切りの控えめな typography 階層 (現在地=primary/fw600、祖先=secondary、区切り=muted) は Linear / Stripe 流の洗練さ。
`feedback_brand_aspiration.md` の修正禁止 anchor は破壊しない (新規修飾語追加なし、既存世界観への適合のみ)。**§-1-B (ベッド読書 warm tint) は Pane 3 で撤回済**のため、パンくずバーに warm overlay は付与しない (機能 UI = typography/spacing/elevation で演出)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言との整合 (3項目以上):

1. **「登録不要で試せる」**: パンくずクリック → `runAnalyze` 経由は非 Pro user では `demoAnalyze` (3 req/IP/day) を通る既存経路をそのまま使う。ただし**祖先 ticker は `resultCacheRef` cache hit (10分TTL) で復元される設計のため、戻る操作では原則 demo 回数を消費しない** (cache hit 分岐は API を呼ばない)。新規 detail への前進クリックのみ既存どおり消費。→ 「3銘柄/日まで無料」と矛盾しない (むしろ戻りは無料)。
2. **「ブラウジングのサクサク感」(user 期待)**: qa 警告どおり、データだけ cache hit でスクロール位置・accordion 開閉が戻らないと「戻ったのに先頭・accordion 閉じ」で逆に Trust Cliff になる。→ **Phase 1b でスクロール+accordion 復元を必須実装**。「戻る = 元の見え方に戻る」を担保する。
3. **demo 回数上限到達時の戻り**: cache hit でない祖先 (10分超で TTL 切れ) をクリックして 429 になった場合、既存の error 分岐 (useJudgmentResult L143「本日のお試し回数を超えました」) がそのまま表示される。パンくずは新たな Trust Cliff を作らず既存 error UX に委ねる (誤って「戻れない」と感じさせない文言は既存資産)。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **no**。
- 本機能は frontend 局所の navigation state 管理 + UI のみ。新規 Claude API call なし、`backend/app/visualizer/` `backend/app/aggregator/` `backend/app/agents/` 不触。
- パンくずが表示するのは ticker symbol (大文字化済) + ロゴ (CompanyLogo 既存 fallback) のみで、LLM narration を一切含まない。→ **「LLM 不要、静的 state + 既存 cache / React 計算で完結」**。
- 4重防御 (pre-commit / NEGATIVE_EXAMPLES / sanitize / sources schema) は本 SPEC では適用対象外 (該当 endpoint を作らない)。

---

## 5. スプリント分割 (全 2 sprint、上限 6 以内)

### 【最重要成果物】履歴 push 統合点の図解 (実コード根拠、推測なし)

本 SPEC の最重要設計判断。実コード調査の結論を先に図示する。

```
■ detail (ticker) 遷移の 2 経路 — 実コードで確認した収束点

経路A: 競合チップ / 検索 / LP / Cmd+K / Pane2「結果」click
  ProfileCard.PeerComparisonSection
    onNavigateTicker(row.ticker)                ← ProfileCard.jsx:858
      └─(FundamentalsAccordion で onNavigateTicker = onAnalyze)  ← FundamentalsAccordion.jsx:109,132
          onAnalyze(t)  == App.jsx の runAnalyze == useJudgmentResult.runAnalyze
            └─ useWorkspaceStore.getState().setActiveTicker(t)   ← useJudgmentResult.js:90  ★
            └─ resultCacheRef cache hit 分岐 (10分TTL) で 0 秒復元 ← useJudgmentResult.js:94-104

経路B: Pane2 銘柄 list click (watchlist / movers / 結果)
  withViewTransition(() => setActiveTicker(it.ticker))   ← Workspace.jsx:422 / 603 / 等
            └─ useWorkspaceStore.setActiveTicker(t)               ★

  ┌─────────────────────────────────────────────────────────┐
  │ ★ 収束点 = workspaceStore.setActiveTicker(t)             │
  │   経路A も経路B も最終的に必ずここを通る                  │
  │   (runAnalyze は内部で getState().setActiveTicker を呼ぶ) │
  └─────────────────────────────────────────────────────────┘

→ 結論: 履歴 push は setActiveTicker(t) の中に 1 点だけ集約する。
   「onAnalyze を wrap する」案は経路B (Pane2) が漏れるため不採用 (memory 警告どおり)。
   setActiveTicker に集約すれば両経路を 1 箇所で捕捉できる。
```

**注意点 (実コードで判明、memory の当初想定との差分を明記)**:
- memory は「配置 = `PaneDetailView.jsx` の `case 'ticker'`」としていたが、**実態は ticker detail が `PaneDetailView` を通らない**。Workspace.jsx の Pane3 render は `isIndices` の時だけ `PaneDetailView` (dispatcher) を通り、home/judgment タブの ticker detail は `JudgmentDetail` を**直接** render している (Workspace.jsx L1096/1117/1125)。
- したがって **DetailBreadcrumb の挿入先は `JudgmentDetail.jsx` L640 の `className="ds-judgment-detail"` の first child** とする (memory の「ds-judgment-detail first child」という代替記述が正しい)。`PaneDetailView` は触らない。
- `setActiveTicker(t)` は `selectedTarget` を変更しない (ticker detail は `activeTicker` 駆動、`selectedTarget` は index/portfolio 用)。よって履歴 stack は **ticker symbol の文字列 stack** として持てばよく、discriminated union 全体を積む必要はない (Phase1 は ticker 限定、index/portfolio パンくずは将来 Phase)。

---

### Sprint 1a: パンくず UI + detailHistory store + cache hit 0 秒戻り

**目的**: 横並びパンくず「⌂ › AAPL › NVDA」を Hero 上に表示し、祖先クリックで `resultCacheRef` cache hit による 0 秒復元を実現する。スクロール/accordion 復元は含まない (1b へ)。

**触るファイル**:
1. `frontend/src/state/workspaceStore.js`
   - state 追加: `detailHistory: []` (ticker 文字列 stack、最大10件、**persist 除外** = `partialize` に含めない / `version` bump 不要 = persist 外なので migration 不要)。
   - setter 追加:
     - `pushDetailHistory(ticker)`: 末尾 push。**重複排除** (直前と同じなら no-op、stack 内に既出なら「その位置まで truncate して末尾に」= ブラウジングの自然な巻き戻り。3体合議の「重複排除」要件)。最大10件で先頭 shift。
       - **⚠️ push ガード (main session 追検証 2026-06-09): `setActiveTicker` は 18 箇所から呼ばれ、`IndicesView` が `setActiveTicker('^GSPC')` 等、`setActiveTicker(null)` (クリア) も含む。`pushDetailHistory` 冒頭で次を弾く: (1) falsy (null/空文字)、(2) 非株式シンボル = `^` prefix / `=F` (先物) / `=X` (為替)。** 判定ロジックは `StockPriceChart.jsx:370 isNonEquityTicker` と同一 (`t.startsWith('^') || t.endsWith('=F') || t.endsWith('=X')`) を small util に切り出して共用 (重複定義を避ける) か、最低限同等の inline guard を置く。これがないと会社パンくずに指数/為替/portfolio ノイズが混入し Trust Cliff になる (Phase1 は equity ticker 限定の確定設計 §L89 と整合)。
     - `navigateBack()`: stack を 1 つ pop した結果の ticker を返す純関数的 setter (実際の遷移は consumer が `setActiveTicker` で行う、store 内で API 呼ばない)。
   - **`setActiveTicker(s)` の中で `pushDetailHistory(s)` を呼ぶ**よう改修 (収束点への集約)。ただし null セット時 (list に戻る / tab 離脱) は push しない。**無限ループ注意**: パンくしクリックで `setActiveTicker` を呼ぶと再 push されるため、「stack 内既出 → truncate」ロジックで吸収する (新規 entry でないので増殖しない)。
2. `frontend/src/features/workspace/DetailBreadcrumb.jsx` (新規)
   - workspaceStore 直読み (`detailHistory` / `setActiveTicker`)、**props 不要**。
   - `TickerBadge` (size='xs' or 'sm', ロゴ付き) を流用して各 ticker を render。
   - 起点 ⌂ = Home アイコンのみ (lucide 等の既存アイコン、「ホーム」文字は出さない)、`aria-label="スクリーナーに戻る"`。クリックで list に戻る (`setActiveTicker(null)` 既存挙動)。
   - 区切り `›` = `--text-muted`。現在地 (stack 末尾) = `--text-primary` / fw600、祖先 = `--text-secondary` (hover で下線)。
   - **5段以上は `⌂ › … › 直前 › 現在` に省略** (中間を `…` 1 つに畳む)。
   - 高さ **28px の独立バー**。**発光系 class (`.panel-card`/`.bs-panel`/`.surface-card`) 不使用** (ui 案A)。`--space-2` gap、raw hex 禁止 (全 token 経由)。
3. `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx`
   - L640 `className="ds-judgment-detail"` の **first child** に `<DetailBreadcrumb />` を挿入。
   - **stack が 0〜1 件 (= ルートのみ、辿っていない) のときは render しない** (常時バー出しは初見ユーザーに無意味なノイズ = 原則1違反)。2 件以上で表示。

**完了判定基準 (DoD)**:
- [ ] AAPL detail → 競合チップで NVDA → パンくず「⌂ › AAPL › NVDA」が Hero 上に横並び表示。
- [ ] パンくずの「AAPL」クリックで AAPL detail に**戻る**。10分以内なら `resultCacheRef` cache hit で API を呼ばず 0 秒復元 (Network タブで demo 回数を消費しない)。
- [ ] 重複排除: AAPL→NVDA→AAPL と辿ると stack が `[AAPL]` に truncate される (NVDA が消え、AAPL が現在地)。
- [ ] 6 段辿ると `⌂ › … › (直前) › (現在)` に省略表示。
- [ ] Pane2 list から銘柄クリックでも履歴に積まれる (経路B カバー、収束点が効いている証跡)。
- [ ] `npm run build` パス。

**検証方法**:
- `cd frontend && npm run build` (構文/型)。
- `snap-*.mjs` (headless 60s 以内、`frontend/.visual/` 出力): 公開ビュー (demo モードで AAPL→競合チップ→パンくず表示) でパンくずバーの DOM 存在 + 横並び + テキスト「AAPL」「NVDA」を assert。`window.__p3` パターン (`.ds-judgment-detail` の overflow 親辿り、snap-v5-dogfood.mjs L67-68 参照) でスクロール非依存に first-fold を撮る。
- bundle grep: deploy 後 `/assets/index-*.js` を curl + grep で `DetailBreadcrumb` / `pushDetailHistory` 文字列確認 (反映 hash 確認)。
- **authed chart 内 (Premium gate) の目視は「朝 dogfood 項目」に回す** (headless 認証注入は本 Sprint の DoD に含めない)。

---

### Sprint 1b: スクロール位置 + accordion 開閉復元 (sessionStorage)

**目的**: パンくずで祖先に戻ったとき、データだけでなく**スクロール位置と accordion 開閉状態も元に戻す** (qa 警告: これが無いと「戻ったのに先頭・accordion 閉じ」で逆に Trust Cliff)。

**触るファイル**:
1. `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (or 専用 hook `useDetailScrollRestore.js` 新規)
   - **scroll container 特定**: `.ds-judgment-detail` の overflow 親 (実態 = Workspace.jsx L1095 の `<div style={{flex:1, minHeight:0, overflowY:'auto'}}>`)。明示 ref が無いため、`snap-v5-dogfood.mjs` の `__p3` パターンと同手法 (`.ds-judgment-detail` から parentElement を辿り `overflowY === 'auto'|'scroll' && scrollHeight > clientHeight` の最初の祖先) を React 内で実装するヘルパを置く。
   - **保存タイミング**: ticker を**離れる直前** (= 次の `setActiveTicker` 発火時 / unmount cleanup) に、現 ticker をキーに `{ scrollTop, openAccordionIds[] }` を `sessionStorage` に書く。キー例: `bs:c3:detail:<TICKER>`。
   - **復元タイミング**: **cache hit で detail が描画され終わった後** (memory 明記)。`resultCacheRef` cache hit 時は同期描画に近いが、accordion/chart の遅延描画があるため `requestAnimationFrame` 2 回 or `useLayoutEffect` + 描画完了 flag で復元 (描画前に scrollTo すると 0 に戻る罠)。
2. `frontend/src/features/judgment/primitives/AccordionSection.jsx`
   - accordion 開閉は現状 `useState(defaultOpen)` のローカル保持 (ticker remount で消える)。復元のため、JudgmentDetail 側が ticker 別の openIds を読み、各 `AccordionSection` の `id` に対し `defaultOpen` を注入できるようにする。`AccordionSection` は既に `id` props + `onOpenChange(id, isOpen)` を持つ (L50) ので、**この id ベースで「どの section が open か」を収集・復元**する。controlled 化までは不要 (defaultOpen 注入で足りる、最小改変)。
   - ⚠️ PGE 落とし穴4 (infinite animation): AccordionSection は open/close で完結する既存設計 (L12 コメントで明記) を壊さない。復元は初期 defaultOpen に流すだけで、復元後の通常開閉アニメは従来どおり。

**完了判定基準 (DoD)**:
- [ ] AAPL detail で 3000px スクロール + 「ファンダ」accordion を open → 競合チップで NVDA へ → パンくずで AAPL に戻ると、**スクロール位置 3000px 付近 + accordion open が復元**される。
- [ ] 戻り先が cache miss (10分超 TTL 切れ) の場合は再 fetch されるが、その場合もデータ描画完了後にスクロール/accordion を best-effort 復元 (描画前 scrollTo の 0 戻り罠を踏まない)。
- [ ] sessionStorage キーが ticker 別に分離され、別 ticker の状態が混線しない。
- [ ] `prefers-reduced-motion` でスクロール復元が `behavior:'instant'` (smooth 復元の酔い防止)。
- [ ] `npm run build` パス。

**検証方法**:
- `npm run build`。
- **専用 snap スクリプト** `frontend/scripts/snap-c3-breadcrumb.mjs` (headless 60s 以内、`finally{browser.close()}` + hard timeout 必須、`.visual/` 出力): demo AAPL detail → `window.__p3.scrollTo({top:3000})` → accordion open click → 競合チップ click → パンくず「AAPL」click → スクロール位置と accordion data-open を assert。`window.__p3` は snap-v5-dogfood.mjs L67-83 のパターンを再利用。検証後スクリプトは残置可 (regression 用) or 削除。
- bundle grep で `sessionStorage` 復元ロジックの反映 hash 確認。
- **authed (Premium) chart を含む section の復元目視は「朝 dogfood 項目」**。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` | **触らない** (本機能は LLM 不使用、backend 不触) |
| `backend/app/aggregator/*.py` への LLM SDK import | **触らない** (backend 不触) |
| `backend/app/visualizer/prompt_negatives.py` | **触らない** (法務 anchor、backend 不触) |
| `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX | **触らない** (LLM 出力 sanitize、本機能と無関係) |
| `.claude/launch.json` | **触らない** (人間用) |
| `migrations/*.sql` | **触らない** (DB schema 変更なし) |
| `handover_*.md` | **read-only reference** |
| `railway.toml` cron 定義 | **触らない** |
| `frontend/src/App.jsx` の sticky 検索 div / `.sticky-search-band` | **触らない** (8回試行錯誤の安定領域、§C-6 凍結)。runAnalyze 本体も極力不触 (setActiveTicker への集約は store 側で完結) |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | **触らない** (発光バグ高リスク)。DetailBreadcrumb は発光系 class 不使用の独立バー |
| `frontend/src/features/workspace/PaneDetailView.jsx` | **触らない** (ticker detail は通らないことが実コードで判明、`contain:layout` glow host 領域) |
| `frontend/src/features/workspace/useUrlSync.js` (replaceState 設計) | **触らない** (pushState 化は L17 設計破壊 + 2-3人日で却下済、replaceState 維持) |
| Hero card (`.bs-panel-hero` / `contain:layout`) | **触らない** (発光 host)。パンくずは Hero の**上**に独立配置、Hero 内部を変えない |

---

## 7. multi-review 必要性判定

3軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination)**: **inactive** — LLM 不使用、新規 narration なし (§4)。
2. **Trust Cliff (LP 訴求 vs 実装)**: **限定的に active** — §3 のとおり「登録不要/3銘柄無料」との整合は cache hit 経路で担保され、新たな訴求文言追加なし。設計は確定済で limited。
3. **新 backend endpoint + RLS/認証境界 + cache 設計**: **inactive** — frontend 局所のみ、backend 不触、新 endpoint なし、既存 `resultCacheRef` (memory cache) 流用。

**判定: 3体合議で十分 (本 SPEC は実装 review のみ)**。
**根拠 (1行)**: LLM prompt 不変 + 既存 schema/endpoint 維持 + frontend 局所修正のみ + 設計判断は gate1 で確定済 (scope 縮小済) のため、CLAUDE.md「3体で十分」条件に合致。推奨構成 = **ui-designer + frontend-architect + qa-dogfooder** (Sprint 1b 着地後、スクロール/accordion 復元の Trust Cliff 担保を qa が確認)。

---

## 8. 想定リスク + roll-back plan

**このスプリントが失敗したとき何が壊れるか**:
- **最大リスク = `setActiveTicker` への push 集約**: 全 ticker detail 遷移 (検索/競合/Pane2/Cmd+K/LP) がこの setter を通るため、無限ループ or 過剰再 render を仕込むと **Pane3 全体が固まる** (blast radius 中)。→ 重複排除ロジック (既出 truncate) を最初に単体検証し、`pushDetailHistory` が冪等になるまで `setActiveTicker` への結線をしない。
- **sessionStorage 復元の描画前 scrollTo 罠**: 描画完了前に scrollTo すると 0 に戻り「戻ったのに先頭」= 狙った Trust Cliff を**自分で再生産**する。→ rAF 2回 / 描画完了 flag で必ず gate。
- **detailHistory の persist 誤混入**: 誤って `partialize` に入れると localStorage に古い stack が残り再訪時に幽霊パンくずが出る。→ persist 除外を DoD で明示確認。

**緊急 roll-back 手順**:
1. **DetailBreadcrumb 単体無効化**: `JudgmentDetail.jsx` の `<DetailBreadcrumb />` 1 行を削除 (or `return null` ガード) → パンくず非表示で既存挙動に即復帰。store の `pushDetailHistory` 結線も `setActiveTicker` から外せば完全に無害化 (state 追加は残っても persist 外なので無影響)。
2. **commit 単位 revert**: Sprint 1a / 1b を別 commit にし、問題発生時は `git revert <hash>` → `git push origin main` (Railway auto-deploy ~30s で反映、`/health` の commit で確認)。
3. **緊急時の feature flag** (任意): `feedback_feature_flag_dual_mode.md` の URL param (`?c3=0`) + localStorage パターンで DetailBreadcrumb を即時 off にできるよう Sprint 1a で gate を 1 つ仕込むと、revert 待たずに dogfood/切戻し可能 (推奨だが必須ではない)。

---

## 付録: Generator が最初に着手すべき file と順序

1. `frontend/src/state/workspaceStore.js` — `detailHistory` state + `pushDetailHistory` (冪等・重複排除) + `navigateBack` を追加し、`setActiveTicker` に push を結線。**ここを最初に固め、push の冪等性を単体で確認**してから UI に進む (無限ループ予防、blast radius 最大箇所)。
2. `frontend/src/features/workspace/DetailBreadcrumb.jsx` (新規) — TickerBadge 流用、token のみ、発光系 class 不使用。
3. `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` — L640 first child に挿入 (2件以上で表示)。
4. (Sprint 1b) scroll/accordion 復元 hook + `AccordionSection.jsx` の id ベース defaultOpen 注入。
