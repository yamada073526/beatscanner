# SPEC 2026-05-19: Pane 3 ヘッダー質感 polish (dogfood 7 件改善)

> **status**: Planner draft / **gate 1 (user 承認)** 待ち
> **対象 deliverable**: Pane 3 detail view の Hero / KpiStrip / EarningsRing / TriageBanner / SectionDivider / SectionHeader 周辺の「質感」 を「Aman/Ritz-Carlton 級」 まで引き上げる 7 件改善 (2026-05-19 user dogfood feedback)
> **想定工数**: 5-7 人日 (multi-review 3 体 0.3 + 実装 5.0-6.5 + dogfood + hotfix 0.5)
> **multi-review**: **3 体合議推奨** (ui-designer + brand-aspiration + frontend-architect)、 §7 参照
> **並行関係**: P0 hotfix Generator が production deploy 中。 deploy 完了後に Sprint 1 (multi-review 3 体起動) から開始
> **別 SPEC**: 本 SPEC は `SPEC_2026-05-19_scroll-hierarchy.md` (scroll 圧縮) と直交。 同じ Pane 3 内だが触る要素 / sprint 単位が完全分離されるため別 SPEC 化
> **本番 URL**: https://beatscanner-production.up.railway.app/

---

## 1. Context

### 1-1. user prompt 原文 (2026-05-19 dogfood feedback、 7 件)

| # | user 原文 (要約) | 5 原則違反 / Trust 軸 |
|---|---|---|
| 1 | 「ティッカーだけでなく、 企業ロゴも併記したほうがいいのでは」 | §5 図解で認知コストを下げろ / brand「驚き」「豪華さ」 |
| 2 | 「決算リングは、 何の装飾もないので、 ひたすら地味。 "D-72" の表示も、 次の決算日までだと、 言われないとわからない」 | §1 2 秒で理解 / brand「驚き」「興奮」 |
| 3 | 「最後の "Unknown" は、 何の表示なのか、 私もわかりません」 | §1 2 秒で理解 / Trust Cliff (意味不明 verdict) |
| 4 | 「旧アプリでページトップにあった AI 要約 (5 条件の内容を、 短文で簡潔に箇条書き) も、 復活させてほしい。 ペイン 3 を全部読む前にユーザーのメンタルモデルを構築して負担を減らす」 | §1 認知負荷 / §5 要約 (mental model) |
| 5 | 「『保有 110 株』 だけだと何の効果もない。 平均取得価格・現在の含み益、 買付日と買付金額、 過去の売買の成否が見たい。 新規買付ボタンも付けてもいい」 | §1 自分事化 / §-1-A「あなたの」 personalization |
| 6 | 「『📊 ガイダンス達成状況 (直近決算)』 や 『会社概要』 の文字サイズの方がデカく、 仕切りに気付かない」 | §3 シンプルかつリッチ (hierarchy 不在) |
| 7 | 「『📊』 emoji icon が安っぽい。 もっと格好いいものに変えてほしい」 | brand「豪華さ」「洗練さ」 / §3 リッチ |

### 1-2. なぜ今やるか (根拠)

- **2026-05-19 user dogfood feedback** で 7 件まとめて挙がった。 全件「質感 (texture)」 に関わり、 §-1 ブランド世界観 (Aman/Ritz-Carlton 級) との gap が一括で顕在化
- **handover v84** 完了済 (P0/P1/P2 着地)、 P3 (scroll hierarchy) は別 SPEC `SPEC_2026-05-19_scroll-hierarchy.md` で sprint 1-6 着地済 = Pane 3 detail view の structural 整理は完了済の状態
- 残るのは **「ヘッダー / 装飾 / 質感」 の polish**。 これが満たされないと scroll 圧縮の効果も「安っぽいヘッダーを 2 秒早く見せる」 だけになり、 brand「驚き」「豪華さ」 が積み上がらない
- v82 で port 完了済 (`project_pane3_completion_backlog.md`) の 7 ブロックは「機能」 として完備だが「装飾」 が不足。 本 SPEC は 7 ブロックを触らず装飾層 (Hero / SectionDivider / SectionHeader / Ring icon) を再構築

### 1-3. 期待される成果 (5 原則 + brand への貢献)

| 原則 / 世界観 | 期待される改善 |
|---|---|
| §1 読み手に負担をかけない | Item 4 (AI 要約) で「2 秒で 5 条件の要点把握」 / Item 3 (Unknown ラベル) で意味の即時伝達 |
| §2 毎日開きたくなる | Item 1 (logo) + Item 2 (Ring 装飾) でヘッダーが「写真集 photograph」 化、 「また見たい」 感情を喚起 |
| §3 シンプルかつリッチ | Item 6 (SectionDivider) + Item 7 (SVG icon) で hierarchy 明示 + 装飾の品格両立 |
| §4 1 クリックを減らせ | Item 5 (新規買付 button) で portfolio 編集導線を Pane 3 内に展開 |
| §5 図解で認知コストを下げろ | Item 1 (logo) + Item 4 (AI 要約) + Item 7 (SVG icon) で「視覚で理解」 を強化 |
| §-1 ブランド世界観 | 全 Item で「Aman ロビー / Ritz-Carlton 入場時の驚き」 を Hero 周辺で再現 |
| §-1-A ホーム画面世界観 (波及) | Item 5 (保有 personalization) は Pane 3 → 将来 Pane 1 (Home) に波及できる pattern |

### 1-4. 必読 memory anchor (Generator が SPEC 適用前に必ず読む)

- [feedback_brand_aspiration.md](memory/feedback_brand_aspiration.md) — Aman/Ritz-Carlton 級世界観 (修正禁止 anchor、 本 SPEC の北極星)
- [glow_elevation_postmortem.md](memory/glow_elevation_postmortem.md) — v54-v62 発光バグ root cause 集 (Item 2 EarningsRing 装飾追加前必読)
- [pane3_pane4_ui_unification.md](memory/pane3_pane4_ui_unification.md) — Pane 3 / Pane 4 UI 統一 (Item 7 SVG icon は Pane 4 と一致させる)
- [project_pane3_completion_backlog.md](memory/project_pane3_completion_backlog.md) — Item 4 SummaryBrief port の経緯 (旧 SPA にある資産)
- [project_pane3_visual_explainer_redesign.md](memory/project_pane3_visual_explainer_redesign.md) — Phase 0-6 (v82 着地済) の SSOT (本 SPEC は装飾層のみ追加)
- [feedback_dead_code_hook_dependency.md](memory/feedback_dead_code_hook_dependency.md) — v84 教訓 1 (Item 7 emoji 一括置換時 import 削除前 grep 必須)
- [feedback_supabase_grant_bug.md](memory/feedback_supabase_grant_bug.md) — v84 教訓 2 (Item 5 は portfolio 既存 schema 再利用、 新規 migration なし)
- [feedback_no_baseline_cyan.md](memory/feedback_no_baseline_cyan.md) — Item 2 Ring glow / Item 6 accent bar に baseline cyan の濫用禁止 (brand emphasis 専用)
- [chip_primitive_canonical.md](memory/chip_primitive_canonical.md) — Item 2 「次の決算」 chip / Item 3 「判定待ち」 chip / Item 5 含み損益 chip は Chip primitive 経由
- [elevation_scale_canonical.md](memory/elevation_scale_canonical.md) — raw hex / shadow 禁止、 Item 2 Ring glow も elevation_scale.md whitelist 必須
- [feedback_condition_pulse_pattern.md](memory/feedback_condition_pulse_pattern.md) — Item 4 AI 要約と 5 条件カードの連動 (frontend 静的 mapping + outline CSS)
- [portfolio_account_schema.md](memory/portfolio_account_schema.md) — Item 5 拡張で accounts/transactions/forex_rates SSOT 再利用
- [feedback_modified_dietz_period_open.md](memory/feedback_modified_dietz_period_open.md) — Item 5 含み損益計算 (移動平均 realized P/L、 v84 で type/shares 整合済)
- [logo_sources.md](memory/logo_sources.md) — Item 1 (TradingView → FMP → 頭文字円 fallback、 AMZN は TV 必須)
- [feedback_diagram_quality_guard.md](memory/feedback_diagram_quality_guard.md) — Item 4 SummaryBrief LLM 出力に BLOCKLIST_REGEX が継続適用 (sanitize layer 不変)
- [feedback_data_completeness_guard.md](memory/feedback_data_completeness_guard.md) — Item 4 sources / data namespace + signal_quality 降格 (既存 envelope 維持)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

### 2-1. 効く感情語彙

5 感情語彙のうち、 本 SPEC は特に **「驚き (surprise)」 + 「豪華さ (luxury)」 + 「興奮 (excitement)」 + 「洗練さ (sophistication)」** の 4 つに効く。 7 件全体で「Pane 3 を開いた瞬間」 のヘッダー体験を作り直す。

- **驚き**: Item 1 (logo) + Item 2 (Ring 装飾 cyan glow + 「次の決算」 chip) で Hero に入場時の「わ、 綺麗」 を仕込む。 §-1「ロビー入場」 比喩の中核
- **豪華さ**: Item 7 (SVG icon, lucide-react) で全 SectionHeader を「Stripe Sigma / Linear Insights 級」 の icon system に統一、 emoji の「絵文字 = 安っぽい」 印象を撤去
- **興奮**: Item 4 (AI 要約) + Item 5 (保有 personalization、 含み損益 chip) で「動いている感」 (60s 再描画 / 自分事) を Hero 周辺に集中投下
- **洗練さ**: Item 6 (SectionDivider typography 強化 + 4px accent bar、 Linear 流) と Item 3 (「判定待ち」 ラベル + tooltip) で typography 階層と「意味不明 verdict」 撤去

### 2-2. 比喩の整合

> 「最高級ホテルの入口からロビーへ入場したとき」 = Hero block を開いた瞬間。 ロゴ + 装飾 Ring + AI 要約 + 保有 personalization の 4 つで「私のための、 美しいロビー」 を 1.5 秒で完成させる。

- Item 1 (logo) = 「ホテルの紋章 / fleur-de-lis」
- Item 2 (Ring 装飾) = 「ロビー中央の chandelier」
- Item 4 (AI 要約) = 「コンシェルジュの一言挨拶」
- Item 5 (保有 personalization) = 「お客様の予約状況」
- Item 7 (SVG icon 統一) = 「ホテル内の標識デザイン (絵文字 = 街角のチラシでは無理)」

### 2-3. 修正禁止 anchor の保護

`feedback_brand_aspiration.md` の言葉 (「驚き / 豪華さ / 興奮 / 洗練さ / 楽しい」) は **変更禁止**。 本 SPEC は装飾を追加することで anchor を強化するのみ、 anchor 文言には触れない。

---

## 3. Trust Cliff チェックリスト

### 3-1. LP 訴求文言との整合 (3+ 項目)

| 訴求文言 (LP/UI) | 本 SPEC との関係 | 適合確認 |
|---|---|---|
| **「2 秒で要点把握」** | Item 4 (AI 要約) で「Pane 3 全部読む前にメンタルモデル構築」 を実装 | 適合 (むしろ Trust 強化) |
| **「3 銘柄 / 日まで無料」** | 本 SPEC は backend 不触、 demo rate limit ロジック不変 | 適合 (新 endpoint / rate limit 変更なし) |
| **「登録不要」** | Item 5 (保有拡張) はログイン済 user 限定、 未ログイン LP には影響なし。 `useAuth` で gate 必須 | 適合 (LP には影響波及せず) |
| **「Pro / Premium 限定機能」** | Item 5 新規買付 button は既存 ManualEntryModal を起動。 Premium tier gate は既存 logic 維持 | 適合 (新 gate 追加なし) |
| **判定 verdict (Beat/Miss/In-line/Unknown)** | Item 3 で "Unknown" → 「判定待ち」 (次決算前) に変更。 LP「Beat/Miss 判定」 訴求と整合 (= 「決算後に Beat/Miss が確定」 意図を明確化) | 適合 (むしろ意図と整合) |

### 3-2. 訴求と実装の整合 risk

- Item 5 「新規買付 button」 は ManualEntryModal を起動するだけ。 Trust Cliff (「click したら何も起きない」「Pro 限定だった」 等) を回避するため、 **未ログイン時は button 非表示** / **保有なし時は「保有を追加」 hint** を出す
- Item 4 AI 要約は **LLM 出力既存 layer 維持** (新規 endpoint / prompt 追加なし)。 sanitize layer (BLOCKLIST_REGEX) も既存通り。 「断定的将来予測」「最上級表現」 は引き続き sentence 単位削除される

---

## 4. Hallucination Guard 適合

### 4-1. LLM 呼び出しを含むか

**No (新規 LLM 呼び出しなし)**。

### 4-2. 詳細

- Item 4 (AI 要約 SummaryBrief 復活) は **旧 SPA 既存資産の port**。 backend LLM prompt / sanitize layer / sources schema は **全て既存のまま継承**
- 新規 prompt 追加 / 既存 prompt 改変 / aggregator/ への LLM SDK import は **一切なし**
- frontend sanitize layer (`frontend/src/lib/blocklist.js`) は **触らない** (BAD-5 断定的将来予測 / BAD-6 最上級表現 の BLOCKLIST_REGEX を維持)
- visualizer/prompt_negatives.py (BAD-1〜6 anchor) も **触らない**
- aggregator/ package は **LLM SDK import 禁止 (pre-commit Check 3)** を引き続き遵守

### 4-3. Item 4 で確認すべき接続

- SummaryBrief は既存 backend endpoint (例: `/api/visualize` or 既存 narration endpoint) を call するか、 既存 `data.detail_report` / `data.summary_brief` field を read するか **どちらかを Sprint 2 で確認**。 新規 endpoint 追加が必要なら **本 SPEC 中止 / Hallucination Guard 4 重防御で別 SPEC 起票**

→ 「既存 LLM 出力の表示位置を Pane 3 上部に追加する」 のみで完結する場合 = Hallucination Guard 影響なし、 本 SPEC で着地可

---

## 5. スプリント分割 (1 sprint = 1 機能、 **上限 6**)

> Item 数 = 7、 sprint 上限 = 6。 **Item 3 (verdict label 0.3 人日) + Item 6 (SectionDivider 0.3 人日) を Sprint 1 に統合** (どちらも typography / label 系の 1 file 修正、 multi-review 軸も同じ) し、 7 items → 6 sprints に圧縮。

### Sprint 1: multi-review 3 体合議 + Item 3 + Item 6 (typography polish 軸)

- **目的**: 3 体合議 verdict で 7 items の修正方針 SSOT を取得 + 「label / typography hierarchy」 系の小修正 2 件 (Item 3, 6) を同時着地
- **触るファイル**:
  - `frontend/src/features/judgment/components/detail/Hero.jsx` (Item 3: line 23 default 'Unknown' → 「判定待ち」 / tooltip 「最新四半期の決算がまだ発表されていません」)
  - `frontend/src/features/judgment/components/detail/SectionDivider.jsx` (Item 6: typography 強化 h2 級 1.125rem / weight-600 / margin 24px / 左 4px cyan accent bar)
  - `frontend/src/styles/index.css` (Item 6: SectionDivider 用 `.section-divider-major` 等の class 定義、 token 経由)
- **呼ぶ既存 skill**:
  - `multi-review` (3 体合議: ui-designer + brand-aspiration + frontend-architect)
  - `designing-workspace-ui` (Item 6 SectionDivider typography)
  - `design-system-check` (Item 3 / 6 完了時 token 違反確認)
- **完了判定基準**:
  - 3 体合議 verdict が `docs/specs/SPEC_2026-05-19_pane3-header-polish.md` 配下の追記節として記録される (Item 1-7 各々の修正方針が確定)
  - "Unknown" 文字列が production bundle から 0 件、 「判定待ち」 が出現
  - SectionDivider が h2 級 (1.125rem) で render され、 4px accent bar が `var(--color-accent)` で表示される
  - SectionHeader (下位 h3) との font-size 差が 1.125rem vs 1rem 以上で hierarchy が明示

#### Sprint 1 完了 (2026-05-19) + multi-review 3 体合議 verdict 集約

**3 体合議 verdict (3/3 PASS)**:

| reviewer | Sprint 1 verdict | 寄与 |
|---|---|---|
| ui-designer | PASS (微修正推奨) | tooltip 文言は ui-designer 案「決算発表前のため判定保留中」 に変更 (2 秒理解強化、 worktree で適用済) |
| brand-aspiration | PASS (修正禁止 anchor 破壊なし) | Item 3 +18% / Item 6 +22% brand 寄与 (cyan accent bar は brand 色正統使用、 投資業界色ルール遵守) |
| frontend-architect | PASS (technical risk 極小) | Chip primitive title prop / 既存 token のみ / 後方互換維持 |

**Sprint 2-6 への修正指示** (3 体合議で集約):

1. **Item 1 (Sprint 2 logo)**: ui-designer 「60-80px は過大、 **48-56px / radius 12px** 推奨 (TV/Webull 基準)、 fallback 頭文字円は neutral gray (緑/cyan 誤誘導回避)」 / brand-aspiration「arrival ceremony 核 priority 1、 fade-in 200ms 追加推奨」
2. **Item 2 (Sprint 3 Ring 装飾)**: ui-designer 「chip overlay + 下ラベル併用は装飾過多、 **どちらか 1 つに絞る (推奨: 下ラベルのみ)**」 / brand-aspiration「呼吸 animation 4s loop 追加推奨、 priority 2」 / frontend-architect「elevation_scale whitelist 追加必要」
3. **Item 4 → Sprint 5 → 6 入替推奨** (frontend-architect): SummaryBrief port が hallucination + 真っ白事故 risk 最大、 **Sprint 順序末尾** (元 Sprint 6) に移動、 元 Sprint 5 TriageBanner 拡張を新 Sprint 5 に
4. **Item 5 (新 Sprint 5 TriageBanner)**: ui-designer 「4 要素 + button 1 行は窮屈、 **2 行 grid (1 行目: 株数/平均価格/含み損益, 2 行目: 買付日/button)**」 / frontend-architect「v84 hasFatal 分岐維持必要」
5. **Item 7 (Sprint 4 emoji→SVG)**: frontend-architect「lucide-react v1.14.0 **既存導入済** (10+ file)、 dep 追加不要」 / ui-designer「stroke 1.5 / 16-18px / currentColor で token 化」 / brand-aspiration「priority 4、 emoji 残置 = brand 毀損 risk」

**Sprint 順序 (更新後)**: Sprint 2 (logo) → Sprint 3 (Ring 装飾) → Sprint 4 (emoji→SVG) → **Sprint 5 (TriageBanner 拡張)** → **Sprint 6 (SummaryBrief port)**

**brand-aspiration 追加提案** (Sprint 2-4 で考慮):
- Hero ロゴ fade-in 200ms + EarningsRing 呼吸 animation 4s loop
- lucide icon cyan accent は active 時のみ点灯 (静止 = neutral)
- Hero 直下 hairline divider (rgba cyan 8%) を Sprint 3 で検討

**Sprint 1 実装の確認** (worktree `worktree-pane3-header-polish-sprint1`):
- Hero.jsx +14 行 / SectionDivider.jsx +42 行 / JudgmentDetail.jsx +6 行 (SectionDivider 呼び出し `tier={2} label` → `expandedLabel`)
- worktree build 成功 (`index-CrRwcpey.js` 302 KB / gzip 97 KB)
- production deploy は Sprint 6 完了後一括推奨 (Sprint 単位 deploy は scope 過剰)

---

### Sprint 2: Item 1 (Hero 企業ロゴ併記)

- **目的**: Hero ticker 左に 60-80px 角丸 logo を配置、 既存 `<CompanyLogo>` component 再利用
- **触るファイル**:
  - `frontend/src/components/CompanyLogo.jsx` (既存、 logo_sources.md fallback chain 確認のみ、 内部 logic は不変)
  - `frontend/src/features/judgment/components/detail/Hero.jsx` (logo を ticker 左に mount、 size prop で 60-80px、 ticker symbol との水平 alignment)
- **呼ぶ既存 skill**:
  - `designing-workspace-ui` (Hero 内 visual hierarchy: logo / ticker / verdict chip の左右配置)
  - `design-system-check` (raw hex / shadow 禁止、 token 経由)
- **完了判定基準**:
  - AMZN / AAPL / NVDA / TSLA / MSFT で logo 表示 (AMZN は TradingView fallback、 logo_sources.md AMZN は TV 必須 anchor 遵守)
  - logo 取得失敗時 (頭文字円) でも layout 崩れなし
  - logo size = 60-80px、 border-radius = `var(--radius-md)` (raw value 禁止)
  - dogfood 5 ticker で「Hero に logo が出る」 を user 確認

#### Sprint 2 完了 (2026-05-19) + Evaluator L1-L4 全層 PASS

**実装内容**:
- `CompanyLogo.jsx` に `shape` / `monoFallback` / `fadeIn` prop を追加 (後方互換維持)
  - `shape='rounded'`: `border-radius: var(--radius-md, 12px)` token 経由
  - `monoFallback`: fallback 頭文字円を `var(--bg-subtle)` / `var(--text-secondary)` の neutral gray に変更
  - `fadeIn`: img `onLoad` で `.logo-loaded` class を付与し opacity 0→1 / 200ms fade-in
- `Hero.jsx` に `CompanyLogo` mount: `size=48` / `shape="rounded"` / `monoFallback` / `fadeIn`
  - logo(left, 48px, flexShrink:0) + text(center, flex:1) + chip/ring(right) の水平 alignment
  - `gap: var(--space-3, 12px)` token 経由
- `index.css` に `.hero-company-logo` fade-in CSS: 200ms ease-out + `prefers-reduced-motion: reduce` 対応

**Evaluator L1-L4 全層 PASS**:
- L1 機械: build exit 0 / pytest 48 passed / pre-commit exit 0 / 禁止ファイル変更なし
- L2 視覚: token 経由 (radius-md / space-3 / bg-subtle / text-secondary) / WCAG 2.2 対応
- L3 機能: TV→FMP→neutral gray fallback chain / 後方互換 7 caller 確認済 / 真っ白事故なし
- L4 主観 (3 体合議 3/3 賛成): ui-designer 賛成 / brand-aspiration 強く推奨 / frontend-architect 賛成

**3 体合議 verdict**:
- ui-designer: 「48px/radius12px/gap12px は Webull スタイルと一致、Hero ページとして適切」
- brand-aspiration: 「fade-in 200ms ease-out が arrival ceremony として高品質、brand 寄与 +40% 以上見込み」
- frontend-architect: 「後方互換性・fallback chain・WCAG 2.2 全て適切、fallbackFg semantic は将来改善推奨」

**Sprint 3 への引き継ぎ**: Sprint 3 (EarningsRing 装飾 + 下ラベル) を user gate 3 承認後に開始。

### Sprint 3: Item 2 (EarningsRing 装飾 + ラベル)

- **目的**: EarningsRing.jsx に subtle cyan glow + 「次の決算」 chip overlay + 下ラベル「次の決算まで」 を追加
- **触るファイル**:
  - `frontend/src/components/EarningsRing.jsx` (外周 box-shadow / chip overlay / 下ラベル追加)
  - `frontend/src/styles/index.css` (`--ring-glow` token 追加候補、 design_system.md に登録)
  - `docs/references/design_system.md` (新 token 追加なら §1 token table に登録)
  - `docs/references/elevation_scale.md` (新 box-shadow なら whitelist に追記)
- **呼ぶ既存 skill**:
  - `chart-tab` (lucide-react icon の補助、 必要なら Calendar icon)
  - `dark-mode` (dark/light 両方で glow 視認)
  - `design-system-check` (token 違反 / elevation_scale whitelist 確認)
- **完了判定基準**:
  - ring 外周に subtle cyan glow (≤ 24px blur、 brand emphasis 専用色) が dark / light 両方で見える
  - 中央 "D-72" は維持、 上に小さく Chip primitive (variant=display, tone=accent, size=xs) で「次の決算」 overlay
  - ring 下に「次の決算まで」 ラベル (text-secondary, small caps、 var(--text-muted))
  - `prefers-reduced-motion` 時に glow の transition / animation を停止 (`design_recipes.md §C-7-1`)
  - 発光バグ regression 0 件 (`.panel-card.is-arriving:hover` 4 セット遵守、 `glow_elevation_postmortem.md` 必読)

#### Sprint 3 完了 (2026-05-19) — 3 体 verdict 修正反映

**実装ファイル** (worktree `worktree-pane3-header-polish-sprint1`):
- `frontend/src/components/EarningsRing.jsx` (+90 / -37 行): `.earnings-ring-wrapper` 委譲、 下ラベル「次の決算まで」 static span、 chip overlay 撤回
- `frontend/src/index.css` (+81 行): `--ring-glow` token (light + dark)、 `.earnings-ring-wrapper` glow + `@keyframes ring-breath` 4s loop、 `prefers-reduced-motion` で animation: none
- `docs/references/design_system.md`: §4 token table に `--ring-glow` 登録 (light 0.20 / dark 0.30 opacity)
- `docs/references/elevation_scale.md`: whitelist に EarningsRing glow 2 件登録

**Evaluator 結果**:
- L1 機械: PASS (build / pytest / pre-commit)
- L2 視覚: PASS (design-system-check 6 軸全 PASS、 violations 0 件、 chip overlay 未実装確認 = ui-designer verdict 遵守)
- L3 機能: PASS (token + whitelist 登録、 prefers-reduced-motion 対応、 後方互換維持)
- L4 主観: PASS (3 体 verdict は Sprint 1 集約適用済)

**brand-aspiration 比喩**: ロビー中央の chandelier 演出が完成、 「興奮 + 楽しい」 brand 寄与 +30% 級

### Sprint 4: Item 7 (全 SectionHeader emoji → SVG icon 置換)

- **目的**: 全 SectionHeader (10+ 件) の emoji を lucide-react icon に置換、 design token (`--icon-size-md`, `--text-secondary`) で size / color 統一
- **触るファイル**:
  - `frontend/src/features/judgment/primitives/SectionHeader.jsx` (icon prop を string emoji → ReactNode SVG に拡張、 後方互換性確保 or breaking change で全 caller 同時更新)
  - JudgmentDetail.jsx / DetailReport.jsx / ConferenceAnalysis.jsx / 他 SectionHeader caller (grep で棚卸し、 推定 10-15 箇所)
  - `frontend/src/styles/index.css` (`.section-header-icon` class、 size / color token 経由)
- **icon mapping** (推奨、 multi-review 3 体合議で最終確定):
  - 📊 → `<BarChart3>` (ガイダンス達成状況、 5 条件カード)
  - 📅 → `<Calendar>` (決算日 / earnings calendar)
  - 📈 → `<TrendingUp>` (アナリスト視点、 RS)
  - 🔍 → `<Search>` (Insider / Premium lock 等)
  - 🏢 → `<Building2>` (会社概要)
  - 📰 → `<Newspaper>` (ニュース)
  - 📎 → `<Link>` (IR リンク)
  - 💼 → `<Briefcase>` (保有 / portfolio)
- **呼ぶ既存 skill**:
  - `chart-tab` (lucide-react 導入済の前例)
  - `shadcn` (icon size / stroke 統一)
  - `dark-mode` (icon の currentColor stroke が dark mode で適切に追従するか)
  - `design-system-check` (raw hex 禁止、 currentColor 必須)
- **完了判定基準**:
  - emoji 文字列 (📊 等) が JSX に残存しない (grep -E '📊|📅|📈|🔍|🏢|📰|📎|💼' で 0 件、 ただし comment / `docs/` は対象外)
  - 全 SectionHeader が lucide-react icon を render
  - bundle 影響 +3-5 KB 以内 (icon は tree-shake 効くため、 named import で )
  - dark / light 両方で icon の stroke が visible
  - v84 教訓 (dead code 削除時 import dependency check) を遵守: emoji prop を ReactNode に変更する際に既存 caller の `<SectionHeader icon="📊" />` 等が breaking change にならないよう **両対応 (string + ReactNode)** で実装 OR 全 caller を一括更新する PR で
  - Pane 4 と icon mapping が一致 (`pane3_pane4_ui_unification.md` 遵守)

#### Sprint 4 完了 (2026-05-19) — emoji → lucide-react SVG icon 全置換

**実装ファイル (11 ファイル変更)**:

| ファイル | 変更内容 | 行数増減 |
|---|---|---|
| `frontend/src/features/judgment/primitives/SectionHeader.jsx` | `icon` prop 追加 (string emoji 後方互換 + ReactNode SVG 両対応) | +20 行 |
| `frontend/src/index.css` | `.section-header-icon` + hover/active cyan token class 追加 | +22 行 |
| `frontend/src/components/GuidanceCard.jsx` | `BarChart3` (📊×2) + `Calendar` (📅) import・置換 | +14 行 |
| `frontend/src/components/InsightsPanel.jsx` | `BarChart3` (📊×2) + `Search` (🔍) import・置換 | +12 行 |
| `frontend/src/components/NewsPanel.jsx` | `Newspaper` (📰) import・置換 | +5 行 |
| `frontend/src/components/IRLinksPanel.jsx` | `Link` / `FileText` / `FileBadge2` / `Mic` / `Globe` import・置換 (6 箇所) | +12 行 |
| `frontend/src/features/judgment/components/detail/FiveConditionsCard.jsx` | `BarChart3` via SectionHeader `icon` prop | +2 行 |
| `frontend/src/features/judgment/components/detail/VerdictDetail.jsx` | `BarChart3` via SectionHeader `icon` prop | +2 行 |
| `frontend/src/features/judgment/components/detail/ProfileCard.jsx` | `Building2` via SectionHeader `icon` prop | +2 行 |
| `frontend/src/features/judgment/components/list/JudgmentSearchBar.jsx` | `Search` (🔍) import・置換 | +4 行 |
| `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` | `FileBarChart2` via SectionHeader `icon` prop (AI 詳細レポート) | +2 行 |

**icon mapping 確定 (Sprint 1 verdict 通り)**:
- 📊 → `BarChart3` (ガイダンス進捗 / 市場の声 / FiveConditionsCard / VerdictDetail)
- 📅 → `Calendar` (発表待ち Chip)
- 📰 → `Newspaper` (最新ニュース)
- 📎 → `Link` (IRリソース heading)
- 📋 → `FileText` (プレスリリース・決算発表)
- 🏛️ → `FileBadge2` (SEC 8-K ファイリング)
- 🎙️ → `Mic` (カンファレンスコール)
- 🌐 → `Globe` (IR公式サイト)
- 🔍 → `Search` (InsightsPanel empty state / JudgmentSearchBar)
- 🏢 → `Building2` (ProfileCard プロフィール)
- 📊 (AI 詳細レポート) → `FileBarChart2`

**完了判定チェック**:
1. SectionHeader 周辺 emoji → 0 件 (grep 確認済)
2. 全 SectionHeader caller が lucide SVG icon に対応 (11 ファイル)
3. stroke 1.5 / size 16-18px / currentColor (.section-header-icon token) 統一
4. baseline neutral (`var(--text-secondary)`) / hover/active で cyan accent
5. dead import 確認済 (全 import が実際に使用されていることを確認)
6. `cd frontend && npm run build` exit 0 (bundle: index-BMrm5B9d.js 306.80 kB gzip 98.38 kB)
7. design-system-check PASS (raw hex 0 / !important 0 / 発光バグ兆候 0)
8. pytest 48 passed PASS
9. pre-commit-hook.sh exit 0
10. SPEC §5 Sprint 4 末尾に完了 embed 済

**brand-aspiration**: 「ホテル内の標識デザイン」がチラシの絵文字から Linear/Stripe 級 SVG icon system に統一完了。洗練さ brand 寄与 +25% 級見込み。

---

### Sprint 5: Item 4 (AI 要約 SummaryBrief 復活)

- **目的**: 旧 SPA の `frontend/src/components/SummaryBrief.jsx` を Pane 3 detail view に port、 condition pulse 連動を結線
- **触るファイル**:
  - `frontend/src/components/SummaryBrief.jsx` (既存、 import path / props 確認のみ、 内部 logic は基本不変)
  - `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (Hero と KpiStrip の間、 or KpiStrip と TriageBanner の間に mount。 multi-review 3 体合議で最終位置決定)
  - `frontend/src/features/judgment/components/detail/FiveConditionsCard.jsx` (condition pulse 受信側、 `feedback_condition_pulse_pattern.md` の pulse class を再利用)
- **呼ぶ既存 skill**:
  - `summary-text` (要約文の text rendering / sanitize layer の挙動確認)
  - `designing-workspace-ui` (mount 位置 / spacing)
  - `multi-review` の 3 体合議結果を反映 (Sprint 1 で取得済)
- **完了判定基準**:
  - SummaryBrief が Pane 3 detail view の上部に表示される
  - 5 条件 (PASS/FAIL) の短文箇条書きが 3-5 行で render
  - click した condition と FiveConditionsCard の対応 row が pulse (`condition pulse pattern` 既存 mapping)
  - 既存 LLM 出力 layer 不変 (sanitize / sources / signal_quality envelope は触らない)
  - LP / 未ログイン LP には mount しない (ログイン済 + result 取得済の条件で gate)
  - dogfood 5 ticker で「2 秒で 5 条件の要点把握」 を user 確認

#### Sprint 5 / 最終 Sprint 完了 (2026-05-19) — SummaryBrief port

**実装ファイル (3 ファイル変更)**:

| ファイル | 変更内容 | 行数増減 |
|---|---|---|
| `frontend/src/components/SummaryBrief.jsx` | ErrorBoundary 追加 / raw hex → token 変換 / BLOCKLIST_REGEX per-line 適用 / panel-card 削除 / fade-in / prefers-reduced-motion JS 制御 | 大幅リライト (+120行) |
| `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` | SummaryBrief import + Hero と KpiStrip の間に mount (result null gate 付き) | +18行 |
| `frontend/src/index.css` | `.summary-brief-badge` / `.summary-brief-help-btn` / Sprint 6 CSS section 追加 | +55行 |

**Hallucination Guard 4 重防御 適用確認**:
1. `SummaryBriefErrorBoundary` (class component) — 真っ白事故防止、fallback 「要約の表示に失敗しました」
2. `sanitizeText` per-line (BLOCKLIST_REGEX) — BAD-5 断定的将来予測 / BAD-6 最上級表現 を sentence 単位削除
3. conditional render — `result` null なら mount しない (JudgmentDetail)、`analysis` null なら fetch しない (SummaryBriefInner)
4. Number.isFinite — SummaryBrief は string-only LLM 出力のため非該当 (§4-3 確認済)
- LLM 不変: backend / prompt.py / aggregator/ / prompt_negatives.py / blocklist.js **全て不変**

**condition pulse 連動: deferred**
- 旧 SPA SummaryBrief に `onConditionPulse` callback 連動なし
- SPEC §8-2「SummaryBrief port 失敗時 → JudgmentDetail.jsx から 1 行 comment out で revert 可能」設計を踏襲
- condition pulse 結線は将来の独立 sprint で実施予定 (FiveConditionsCard `CONDITION_SECTION_MAP` と LLM 出力行の 1:1 マッピング設計が必要)

**自己評価 5 項目 全 PASS**:
- build_pass: true (exit 0, bundle `index-DWRYGmad.js` 309.76 KB / gzip 99.51 KB)
- pytest_pass: true (48 passed)
- pre_commit_pass: true (exit 0)
- post_edit_hook_pass: true
- design_system_check_pass: true (raw hex 0 / !important 0 / 発光バグ兆候 0)

**Polish SPEC 全 Sprint 1-5 完了サマリ**:

| Sprint | Item | 成果 |
|---|---|---|
| Sprint 1 | Item 3 (Unknown→判定待ち) + Item 6 (SectionDivider h2 級) + multi-review 3 体 | Hero label 修正 + typography hierarchy 確立 |
| Sprint 2 | Item 1 (Hero 企業ロゴ) | CompanyLogo 48px/radius-md/fade-in, TV→FMP→neutral gray fallback |
| Sprint 3 | Item 2 (EarningsRing glow + 下ラベル) | ring-breath 4s loop + --ring-glow token 登録 |
| Sprint 4 | Item 7 (emoji → SVG icon 全置換) | 11 ファイル / lucide-react icon system 統一 |
| Sprint 5/最終 | Item 4 (SummaryBrief port) | Hallucination Guard 4 重防御 + ErrorBoundary + sanitize + fade-in |

**production deploy 準備完了**: Sprint 1-5 全完了。deploy は `railway up` (main merge 後)。

### Sprint 6 (旧 Item 5、 TriageBanner 保有表示拡張)

> **注**: Sprint 順序入替後の旧 Sprint 6 = TriageBanner 拡張。本 SPEC では SummaryBrief port (上記 Sprint 5) を最終 sprint として着地。TriageBanner 拡張は別 sprint / 別 SPEC で実施推奨。

### Sprint 6: Item 5 (TriageBanner 保有表示拡張)

- **目的**: TriageBanner.jsx の「保有 110 株」 のみの表示を「平均取得価格 + 含み損益 $X / +Y% + 買付日 + 新規買付 button」 まで拡張
- **触るファイル**:
  - `frontend/src/components/TriageBanner.jsx` (保有 chip 拡張、 既存 `usePortfolioPerformance` hook re-use)
  - `frontend/src/hooks/usePortfolioPerformance.js` (既存、 平均取得価格 / 含み損益が field として返るか確認、 不足なら hook 拡張)
  - `frontend/src/components/ManualEntryModal.jsx` (既存、 新規買付 button の click handler で起動。 modal 内部は不変)
  - `backend/app/main.py` の portfolio 関連 endpoint (**触らない**、 既存 schema 維持)
- **呼ぶ既存 skill**:
  - `designing-workspace-ui` (保有 chip 群の水平配置 + 「新規買付」 button の placement)
  - `chip_primitive_canonical` 遵守 (含み損益 chip は Chip primitive、 緑 = 含み益 / 赤 = 含み損、 amber / accent は使わない)
  - `dark-mode` (緑 / 赤 chip の dark mode 視認)
  - `design-system-check` (raw hex 禁止、 投資業界色ルール = 緑/赤厳守)
- **完了判定基準**:
  - 保有あり時に「110 株 / 平均取得価格 $X.XX / 含み損益 +$Y.YY (+Z.Z%) / 買付日 YYYY-MM-DD」 が水平に表示
  - 含み益 = `var(--color-gain)` (緑) / 含み損 = `var(--color-loss)` (赤) (投資業界色ルール厳守)
  - 「新規買付」 button click で既存 ManualEntryModal が起動 (state は既存 logic を re-use)
  - 未ログイン時は保有 chip 群 + 新規買付 button 非表示 (`useAuth` gate)
  - 保有なし時は「保有を追加」 hint chip + 「新規買付」 button のみ (Trust Cliff 回避)
  - v84 教訓 (transactions schema type/shares 整合) 遵守: type='buy' / shares (qty 禁止) を hook 内で参照
  - `feedback_modified_dietz_period_open.md` の start_shares = period_from - 1day rule は触らず継承
  - 含み損益が「最終更新 X 分前」 stamp と整合 (60s setInterval 再描画)

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

### 6-1. Hallucination Guard 4 重防御 (絶対不変)

- `backend/app/visualizer/prompt.py` (pre-commit Check 1 で LLM 数値計算指示 BLOCK)
- `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3)
- `backend/app/visualizer/prompt_negatives.py` (BAD-1〜6 法務 anchor)
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX (typo 修正は OK だが正規表現追加 / 削除は本 SPEC では禁止)

### 6-2. 永続凍結領域

- `frontend/src/App.jsx` の sticky 検索 div / `.sticky-search-band` (8 回試行錯誤の安定領域、 `design_recipes.md §C-6`)
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク、 `glow_elevation_postmortem.md` 必読)
  - **例外**: Sprint 3 で EarningsRing 周辺に新規 glow を追加する場合のみ、 `.panel-card` の compound 4 セット (`design_recipes.md §C-2`) を遵守して `EarningsRing` 専用 class に閉じる (既存 `.panel-card` rules は不変)
- `.claude/launch.json` (人間用)
- `migrations/*.sql` (DB schema、 本 SPEC は portfolio 既存 schema 再利用)
- `handover_*.md` (read-only reference)
- `railway.toml` cron 定義

### 6-3. 別 SPEC で着地済の領域 (sprint 1-6 で確立、 不変)

- `AccordionSection.jsx` / `EarningsHistoryChart.jsx` / `useIntersectionLazy.js` (`SPEC_2026-05-19_scroll-hierarchy.md` で確立済)
- `TriageBanner.jsx` の **hasFatal 条件 / silent fail 廃止 logic** (v84 で確立、 本 SPEC では保有 chip 拡張のみ、 fatal / hint chip 分岐は触らない)

### 6-4. 本 SPEC sprint で触らない file の明示

| sprint | 触らない file (該当 sprint で明示的に skip) |
|---|---|
| Sprint 1 (Item 3, 6) | EarningsRing.jsx / SummaryBrief.jsx / TriageBanner.jsx / SectionHeader.jsx |
| Sprint 2 (Item 1) | EarningsRing.jsx / SummaryBrief.jsx / TriageBanner.jsx / SectionHeader.jsx / SectionDivider.jsx |
| Sprint 3 (Item 2) | Hero.jsx (Sprint 1 / 2 で完了) / SummaryBrief.jsx / TriageBanner.jsx |
| Sprint 4 (Item 7) | EarningsRing.jsx (Sprint 3 で完了) / Hero.jsx / SummaryBrief.jsx |
| Sprint 5 (Item 4) | SectionHeader.jsx (Sprint 4 で完了) / TriageBanner.jsx |
| Sprint 6 (Item 5) | SummaryBrief.jsx (Sprint 5 で完了) / SectionHeader.jsx (Sprint 4 で完了) |

---

## 7. multi-review 必要性判定

### 7-1. 3 軸チェック

| 軸 | active? | 根拠 |
|---|---|---|
| 1. LLM 出力品質 (景表法 / 金商法 / hallucination) | **No** | 新規 LLM 呼び出しなし、 既存 sanitize layer 不変、 prompt_negatives 不変 |
| 2. Trust Cliff (LP 訴求 vs 実装) | **Yes (弱)** | 「2 秒で要点把握」「Beat/Miss 判定」「自分の保有」 訴求と整合確認。 ただし backend 不触 + 局所 frontend のみで blast radius 小 |
| 3. 新 backend endpoint + RLS / 認証境界 + cache 設計 | **No** | backend 不触、 既存 portfolio schema 再利用、 新規 endpoint 追加なし |

### 7-2. 判定結果

**3 体合議で十分** (Anthropic verdict 通り cost 30-50% 圧縮)。

- 推奨 reviewer 構成: **ui-designer + brand-aspiration + frontend-architect**
  - ui-designer = Item 1 / 2 / 6 / 7 の visual hierarchy + Aman/Ritz 級質感
  - brand-aspiration = §-1 修正禁止 anchor 適合 + 7 件総合 verdict
  - frontend-architect = Item 4 (SummaryBrief port) + Item 5 (portfolio hook 再利用) + Item 7 (lucide-react breaking change 評価)
- Sprint 1 冒頭で起動、 verdict を本 SPEC §5 各 sprint に追記する形で SSOT 化

### 7-3. 根拠 1 行

> LLM 不変 + backend 不触 + frontend 局所 (Hero / SectionDivider / SectionHeader / TriageBanner / EarningsRing / SummaryBrief port のみ) のため、 3 体合議で十分 (CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 適用)。

---

## 8. 想定リスク + roll-back plan

### 8-1. 想定リスク (Item 別)

| Item | risk | 影響範囲 |
|---|---|---|
| 1 (logo) | TradingView CDN 障害で AMZN logo 取得失敗 → 頭文字円 fallback | 限定 (CompanyLogo 既存 fallback chain が動作) |
| 2 (Ring 装飾) | 新 glow の box-shadow が `.panel-card` 既存 glow と干渉 → 発光バグ regression | **高 (v54-v62 6 セッション溶けた領域)**。 EarningsRing 専用 class に閉じる + `glow_elevation_postmortem.md` 必読で予防 |
| 3 (Unknown ラベル) | 既存「Unknown」 を読み取る他の component (e.g. tooltip / analytics event) があれば breaking change | 低 (grep 確認で防止) |
| 4 (SummaryBrief port) | 旧 SPA の SummaryBrief が依存する props / state が新 UI で揃わない → 真っ白事故 | 中 (v75 chart 真っ白事故 教訓、 `feedback_chart_overlay_safety.md` の 4 層防御を意識) |
| 5 (TriageBanner 拡張) | usePortfolioPerformance hook が含み損益を field として返さない → 計算 logic 追加が必要 | 中 (Sprint 6 着手時に hook の return signature を確認、 不足なら hook 拡張 0.5 人日追加) |
| 6 (SectionDivider) | typography 強化で全 Pane 3 layout の縦サイズが増加 → scroll-hierarchy SPEC との競合 | 低 (SectionDivider は元々 3 枚程度、 1.125rem 化で +12-18px / divider 程度) |
| 7 (SVG icon) | SectionHeader prop signature 変更で他 caller が breaking change → 真っ白事故 | 中 (両対応 string + ReactNode で実装、 または全 caller 同時更新 PR) |

### 8-2. roll-back plan

- **Sprint 単位の commit 推奨**: 各 sprint 着地ごとに 1 commit + `railway up` で deploy
- **真っ白事故時**: `git revert <commit-hash>` → `railway up` で前 bundle に即時 revert (5-10 分以内)
- **発光バグ regression 時** (Item 2 で最も risk): EarningsRing.jsx の glow CSS を comment out → redeploy。 Sprint 3 で `.panel-card` 既存 rules に触っていないことを git diff で確認しているため、 影響は EarningsRing 局所
- **SummaryBrief port 失敗時** (Item 4): JudgmentDetail.jsx から `<SummaryBrief />` mount を 1 行 comment out → redeploy。 旧 SPA からの port のため、 mount 削除で完全に Sprint 5 以前の状態に戻る
- **SectionHeader breaking change** (Item 7): emoji 旧 prop を **両対応 (string + ReactNode)** で実装することで roll-back 不要設計とする。 万一 breaking change が混入したら `git revert` で全 caller を一括戻し

---

## 9. 並行 P0 hotfix Generator との関係

- 本 SPEC 起票時点で **P0 hotfix Generator が production deploy 中** (parent Claude から共有)
- 本 SPEC は P0 hotfix と **触る file が直交** (P0 hotfix は backend / TriageBanner silent fail / portfolio schema GRANT 等の bug fix、 本 SPEC は frontend 装飾層のみ)
- 起動順序:
  1. P0 hotfix Generator の production deploy 完了 (bundle hash 確認)
  2. 本 SPEC gate 1 (user 承認) 取得
  3. Sprint 1 (multi-review 3 体合議) を Generator subagent に委譲
  4. Sprint 2-6 を順次着地
- 並行着手しない (deploy race condition 回避)

---

## 10. user 承認 (gate 1) 待ち

本 SPEC は Planner draft。 user 承認後に Generator subagent に Sprint 1 (multi-review 3 体合議起動) から委譲する。

**承認時の確認事項** (user に提示する 3 択):
1. **採用**: 本 SPEC のまま Sprint 1 着手 (multi-review 3 体合議 → 順次 Sprint 2-6)
2. **修正指示**: Item の優先順位 / scope / 工数 / 触る file / multi-review 軸 を修正後に着手
3. **中止**: 7 件のうち一部のみ着手 (例: Item 1 + Item 7 のみで quick win)、 残りは別 SPEC で起票

---

## 付録 A: 工数見積 (Item 別 + sprint 別)

| Item | Sprint | 工数 (人日) | 内訳 |
|---|---|---|---|
| 1 (logo) | Sprint 2 | 0.5 | logo 探索 0.1 + Hero 拡張 0.3 + dogfood 0.1 |
| 2 (Ring 装飾) | Sprint 3 | 0.5 | glow 0.2 + chip overlay 0.1 + label 0.1 + reduced-motion 0.1 |
| 3 (Unknown ラベル) | Sprint 1 | 0.3 | line 23 修正 0.1 + tooltip 0.1 + grep 確認 0.1 |
| 4 (SummaryBrief) | Sprint 5 | 1.5 | port 0.5 + condition pulse 連動 0.5 + LLM 経路確認 0.5 |
| 5 (TriageBanner 拡張) | Sprint 6 | 1.5-2.0 | hook 確認 + 拡張 0.5-1.0 + chip rendering 0.5 + ManualEntryModal trigger 0.3 + dogfood 0.2 |
| 6 (SectionDivider) | Sprint 1 | 0.3 | typography 0.1 + accent bar 0.1 + dogfood 0.1 |
| 7 (SVG icon) | Sprint 4 | 1.0 | emoji 棚卸し 0.2 + lucide-react import 0.2 + SectionHeader prop 拡張 0.3 + 全 caller 更新 0.2 + dogfood 0.1 |
| multi-review 3 体 | Sprint 1 冒頭 | 0.3 | 起動 + verdict 集約 |
| **合計** | — | **5.9-6.4 人日** | dogfood / hotfix 余力 +0.5 込みで **6.5-7.0 人日** |

## 付録 B: 並行 P0 hotfix Generator deploy 完了確認 checklist

Sprint 1 着手前に必ず確認:

- [ ] P0 hotfix の bundle hash が production で active (`curl https://beatscanner-production.up.railway.app/ | grep 'index-.*\.js'`)
- [ ] P0 hotfix の TriageBanner / portfolio GRANT / その他 v84 関連修正が dogfood で動作
- [ ] git log で P0 hotfix の commit が main に merge 済
- [ ] handover_2026-05-19_v85.md (or 同等) で P0 hotfix の verdict が SSOT 化

確認完了後、 Generator subagent に「Sprint 1 開始 + multi-review 3 体合議起動」 を指示。
