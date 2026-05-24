# SPEC v113 Phase 3: Vite 静的 generation + `/articles/[slug]` route + OGP + sitemap

**起票日**: 2026-05-24
**起票 session**: v114 (P1+P2 着地後、 Railway deploy 待ち時間で P3 詳細仕様化)
**親 SPEC**: `docs/specs/SPEC_2026-05-24_v113_pane45_articles_redesign.md` §Phase 3 (line 105-112)
**実装着手 session**: 次 session (本 SPEC 承認後 generator 起動)
**工数合計**: **2 人日** (7 sprint、 1 sprint = 0.2-0.4 人日)
**multi-review 推奨**: 着手前 3 体合議 (frontend-architect + ui-designer + qa-dogfooder) + Phase 3 完了時 6 体合議 (Hallucination Guard + Trust Cliff + 法令 risk + SEO + Aman brand + frontend)

---

## 1. ゴール (P3 完了条件)

### 1.1 機能要件
**Supabase の `status='published'` 記事を `/articles/[slug]` で SEO friendly に静的配信できる**。

具体的に以下が全て満たされれば P3 完了:
1. Vite build 時に Supabase から `published` 記事を fetch → `dist/articles/<slug>.html` に静的 HTML 生成
2. 各 page は title / meta description / canonical URL / OGP (`og:title / og:description / og:image`) / Article schema.org JSON-LD を持つ
3. `/sitemap.xml` を FastAPI が動的生成 (Supabase from `published` 記事)
4. `robots.txt` で `/articles/*` を crawl 許可
5. 記事内の数値・固有名詞は `[N]` citation tooltip 付きで表示、 出典 URL list を bottom に anchor
6. Hallucination Guard 第 3 層 (frontend sanitize) を blocklist.js で記事 body にも適用 (BAD-5/BAD-6 sentence 単位削除)
7. `snap-vision-eval.mjs` で `/articles/[slug]` を直接 URL navigate → screenshot 撮影可能 (articles mode 追加)
8. Pane 3 から 関連記事 link 1 個 配置 (Pane 3 削除は P6 で実施、 P3 では link 1 個追加のみ)

### 1.2 5 原則 + ブランド世界観への貢献
- **原則 1 「2 秒理解」**: 記事 title + subtitle で読み始め判断、 timeline 図解で長文回避 (原則 1+5)
- **原則 2 「毎日開きたくなる」**: 朝 06:00 JST に新着記事 → ブックマーク習慣化
- **原則 3 「シンプル & リッチ」**: max-width 680px / Noto Serif JP / gold 数字 highlight = FT Weekend 級の編集装飾
- **原則 4 「1 クリックを減らせ」**: 直接 URL → 静的 HTML (SPA 経由 navigation 不要、 検索流入から 0 click 到達)
- **原則 5 「図解で認知コスト」**: 数値 timeline は Recharts (既存資産流用)

**ブランド世界観 (Aman/Ritz-Carlton 級)**:
- 親 SPEC §5.2 「Luxury Financial Editorial」 idiom 適用
- 5 感情のうち **洗練 + 豪華 + 興奮** を target (静的記事は驚き / 楽しい は弱め、 親 SPEC verdict)
- 感嘆符・口語禁止 (Hallucination Guard §2 BAD-6 抵触防止)

---

## 2. sub-phase 分割 + 工数 (合計 2 人日 / 7 sprint)

| sprint | 内容 | 工数 | 主担当 |
|---|---|---|---|
| **P3.1** | Vite build-time Supabase fetch + 静的 HTML 生成 strategy 決定 + 実装 | 0.4 人日 | generator |
| **P3.2** | `/articles/[slug]` React Router route + Markdown renderer + 編集 typography | 0.4 人日 | generator |
| **P3.3** | OGP meta tags + Article schema.org JSON-LD + canonical URL | 0.3 人日 | generator |
| **P3.4** | `/sitemap.xml` FastAPI endpoint + `robots.txt` 更新 | 0.2 人日 | generator |
| **P3.5** | Hallucination Guard 第 3 層 = blocklist.js 流用で記事 body sanitize | 0.2 人日 | generator |
| **P3.6** | `snap-vision-eval.mjs` に `articles` mode 追加 (`/articles/[slug]` 直接 navigate) | 0.3 人日 | generator + evaluator |
| **P3.7** | Pane 3 redirect link 1 個 + 関連記事 internal linking (markdown post-process) | 0.2 人日 | generator |

合計: **2.0 人日**

**注**:
- 1 sprint = 0.2-0.4 人日に収め、 worktree session 1 つで 1 sprint 完結を目標
- 各 sprint 完了時に build + grep verify、 全 sprint 完了時に Railway deploy + smoke test
- evaluator は P3.6 で vision-eval 安定化を確認 (3 run mean、 noise floor 別途測定)

---

## 3. sprint 順序図 (DAG)

```
[P3.1] Vite SSG strategy + build script
   │
   ├─→ [P3.2] React Router route + Markdown renderer
   │      │
   │      ├─→ [P3.3] OGP + schema.org (P3.2 の head 注入機構が必要)
   │      │      │
   │      │      └─→ [P3.7] Pane 3 redirect link
   │      │
   │      └─→ [P3.5] blocklist.js sanitize (P3.2 の render 経路に注入)
   │
   └─→ [P3.4] /sitemap.xml + robots.txt (P3.1 と並行可、 backend のみ)

[P3.6] vision-eval articles mode
   └─ P3.2 + P3.3 完了後 (page が表示できる + OGP で title 取得可能になってから)
```

**並列実行可能**:
- P3.4 (backend のみ) は P3.1 と並行可
- P3.7 (Pane 3 link) は P3.3 完了後で良いが他の sprint と独立

**直列必須**:
- P3.1 → P3.2 → P3.3 → P3.5 → P3.6 (page 表示パスの依存 chain)

---

## 4. 各 sprint の DoD

### P3.1: Vite build-time Supabase fetch + 静的 HTML 生成

**実装方針**:
- **採用: custom build script** (vite-plugin-md は markdown → component 変換用で SSG 機能なし)
- `frontend/scripts/build-articles.mjs` を新規作成、 `vite build` 後に post-process で実行
- 流れ: Supabase から `status='published'` 記事 fetch → 各 article を `dist/articles/<slug>/index.html` に書出 (entry point は React app の clone + initial state injection)
- `package.json` に `"build": "vite build && node scripts/build-articles.mjs"` で chain
- rebuild cadence: **Railway deploy trigger 時のみ** (= 手動 or GitHub Actions で daily deploy)。 cron で daily rebuild する場合は P3 範囲外、 別 sprint で検討

**触るファイル**:
- 新規: `frontend/scripts/build-articles.mjs` (build script)
- 更新: `frontend/package.json` (`build` script + `@supabase/supabase-js` 既存)
- 更新: `frontend/vite.config.js` (必要なら `appType: 'mpa'` 検討、 ただし react-router で SPA 維持の方が薄い)
- 新規: `frontend/.env.production.example` (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 既存だが build script 側で読込確認)

**DoD**:
- [ ] `cd frontend && npm run build` 実行で `dist/articles/<slug>/index.html` が **1 つ以上** 生成される (前提: Supabase に published 記事が 1 つ以上ある = NVDA の draft を 1 つ手動で `status='published'` に変更してテスト)
- [ ] 生成 HTML 内に **article body text の最初 50 字** が含まれる (`grep "$(echo $body_md | head -c 50)" dist/articles/<slug>/index.html`)
- [ ] testid `data-testid="article-body"` が HTML 内に存在 (`grep 'data-testid="article-body"' dist/articles/<slug>/index.html`)
- [ ] Supabase fetch 失敗時は **build を fail させず警告 log のみ** (silent-fail、 P1+P2 と同 pattern)
- [ ] build 時間 +15 秒以内 (記事 10 本想定で fetch + 書出が 15 秒以下)

**smoke test**:
```bash
cd frontend && npm run build
ls dist/articles/  # 1 つ以上 slug dir が存在
cat dist/articles/<slug>/index.html | grep -c "article-body"  # 1 以上
```

---

### P3.2: `/articles/[slug]` React Router route + Markdown renderer + 編集 typography

**実装方針**:
- 既存 React Router (react-router-dom) に `/articles/:slug` route 追加
- 既存 `react-markdown` (manualChunks に分離済) 流用、 新規 dep 追加しない
- Component: `frontend/src/features/articles/ArticlePage.jsx` (約 200 行想定)
- typography: 親 SPEC §5.1 に従い、 max-width 680px / Noto Serif JP 16px / line-height 1.85 / gold accent 数字
- 記事 metadata は build 時に `dist/articles/<slug>/article-data.json` で出力、 ArticlePage が fetch
- SPA fallback: 静的 HTML 無い slug は React Router で「準備中」 page 表示 (404 でなく Suggestion 案内)

**触るファイル**:
- 新規: `frontend/src/features/articles/ArticlePage.jsx`
- 新規: `frontend/src/features/articles/ArticleHero.jsx` (title + subtitle + 発行日 + author badge)
- 新規: `frontend/src/features/articles/ArticleBody.jsx` (react-markdown + custom renderers)
- 新規: `frontend/src/features/articles/ArticleCitations.jsx` (bottom anchored list)
- 新規: `frontend/src/index.css` に `.article-prose` class block 追加 (typography only、 既存 token 流用)
- 更新: `frontend/src/App.jsx` (route 追加、 ただし `sticky 検索 div` には触らない、 lazy load 推奨)

**DoD**:
- [ ] `cd frontend && npm run build` でエラーなし
- [ ] `/articles/<slug>` で 200 OK + body_md レンダリング (curl で HTTP 200 + 50 字 grep)
- [ ] `data-testid="article-hero"` / `article-body` / `article-citations` の 3 testid が DOM に存在
- [ ] design-system-check skill で hex 直書き 0 件 (token 経由のみ)
- [ ] react-markdown は manualChunks `markdown` chunk から lazy load (`React.lazy(() => import('./ArticlePage'))`)
- [ ] 編集装飾 acceptance: Noto Serif JP / max-width 680px / line-height 1.85 適用 (computed style 確認)

**smoke test**:
```bash
cd frontend && npm run build
# dist/articles/<slug>/index.html を local file:// で開いて目視 (or snap-pdca-loop で確認)
grep 'data-testid="article-hero"' dist/articles/<slug>/index.html  # 1 hit
grep 'data-testid="article-body"' dist/articles/<slug>/index.html  # 1 hit
grep 'data-testid="article-citations"' dist/articles/<slug>/index.html  # 1 hit
```

---

### P3.3: OGP + Article schema.org JSON-LD + canonical URL

**実装方針**:
- build-articles.mjs (P3.1) に「head 注入」 step 追加
- 各 `dist/articles/<slug>/index.html` の `<head>` に以下 inject:
  - `<title>{article.title} | BeatScanner</title>`
  - `<meta name="description" content="{article.subtitle or body_md.slice(0,140)}">`
  - `<link rel="canonical" href="https://beatscanner-production.up.railway.app/articles/{slug}">`
  - `<meta property="og:title" content="{article.title}">`
  - `<meta property="og:description" content="...">`
  - `<meta property="og:image" content="{ogImageUrl}">`
  - `<meta property="og:type" content="article">`
  - `<meta property="og:url" content="canonical url">`
  - `<meta name="twitter:card" content="summary_large_image">`
  - `<script type="application/ld+json">{Article schema.org JSON}</script>`
- **OGP image 戦略**: **static OG template SVG + ticker overlay** を採用 (Edge Function 不使用、 infra 増やさない)
  - `frontend/public/og/template.svg` (1200x630、 BeatScanner ロゴ + 余白)
  - build 時に `og-overlay.mjs` でテキスト overlay → `dist/og/<slug>.png` 出力 (`@resvg/resvg-js` で SVG → PNG、 軽量 dep)
  - 代替案 B (採用しない場合): 全記事 共通 OG 1 枚 (`/og/default.png`) で固定。 click rate 低下するが実装 0 行
  - **判断は P3.3 着手 sprint 内で 30 分検証 → ROI 高い方採用**、 SPEC では A 案 default
- canonical URL: 本番 URL hardcode (`https://beatscanner-production.up.railway.app`)、 env で override 可能設計

**Article schema.org JSON-LD 必須 fields**:
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{title}",
  "description": "{description}",
  "datePublished": "{published_at ISO 8601}",
  "dateModified": "{generated_at ISO 8601}",
  "author": { "@type": "Organization", "name": "BeatScanner Editor" },
  "publisher": {
    "@type": "Organization",
    "name": "BeatScanner",
    "logo": { "@type": "ImageObject", "url": "{logo url}" }
  },
  "image": "{ogImageUrl}",
  "mainEntityOfPage": "{canonical url}"
}
```

**触るファイル**:
- 更新: `frontend/scripts/build-articles.mjs` (head 注入 step 追加)
- 新規 (採用時): `frontend/scripts/og-overlay.mjs` + `frontend/public/og/template.svg`
- 新規 dep (採用時): `@resvg/resvg-js` (約 5MB、 build-time only なので bundle 影響なし)

**DoD**:
- [ ] `curl -fsS https://beatscanner-production.up.railway.app/articles/<slug>/ | grep -E "og:title|og:description|og:image|canonical"` で 4 行 hit
- [ ] `curl -fsS https://.../articles/<slug>/ | grep -A 1 "application/ld+json"` で schema.org JSON 確認
- [ ] Google Rich Results Test ([https://search.google.com/test/rich-results](https://search.google.com/test/rich-results)) で Article schema 認識
- [ ] OG image (A 案採用時): `curl -fsSI https://.../og/<slug>.png` で 200 + content-type image/png
- [ ] OGP debugger (Facebook / Twitter) で preview 確認 (1 記事のみ手動)

**smoke test**:
```bash
# canonical URL は env で本番に切替 (build 時)
curl -fsS file://$(pwd)/dist/articles/<slug>/index.html | grep 'og:title'  # 1 hit
curl -fsS file://$(pwd)/dist/articles/<slug>/index.html | grep 'application/ld+json'  # 1 hit
```

---

### P3.4: `/sitemap.xml` FastAPI 動的生成 + robots.txt

**実装方針**:
- backend `/api/sitemap.xml` 新規 endpoint (FastAPI、 既存 router pattern 流用)
- Supabase から `status='published'` 記事 fetch → `<urlset>` XML 生成
- `<lastmod>` は `generated_at` (or `human_reviewed_at` 優先) ISO 8601
- 静的 page (/ / /stock/[ticker]) も含める (Top page + 主要 5 銘柄 NVDA/AAPL/MSFT/GOOGL/AMZN sample 静的 URL)
- response cache: 1 時間 (`Cache-Control: public, max-age=3600`)
- `robots.txt` 更新: `Sitemap: https://.../api/sitemap.xml` + `Allow: /articles/`

**触るファイル**:
- 新規 / 更新: `backend/app/main.py` (新 endpoint 追加、 article_pipeline と同様の router 分離検討)
- 新規 (optional): `backend/app/sitemap.py`
- 更新: `frontend/public/robots.txt` (新規作成 or 既存更新)

**DoD**:
- [ ] `curl -fsS https://beatscanner-production.up.railway.app/api/sitemap.xml | head -20` で XML schema 認識
- [ ] sitemap 内に `<loc>https://.../articles/<slug></loc>` が published 記事数だけ存在
- [ ] `curl -fsS https://.../robots.txt | grep -E "Sitemap|Allow: /articles"` で 2 行 hit
- [ ] Google Search Console で sitemap 登録テスト (P3 release 後の手動 setup task)

**smoke test**:
```bash
curl -fsS https://beatscanner-production.up.railway.app/api/sitemap.xml | xmllint --noout -  # XML valid
curl -fsS https://beatscanner-production.up.railway.app/robots.txt | grep Sitemap
```

---

### P3.5: Hallucination Guard 第 3 層 = blocklist.js 流用で記事 body sanitize

**実装方針**:
- 既存 `frontend/src/lib/blocklist.js` の `sanitizeText()` を ArticleBody.jsx 内で呼出
- 流れ: react-markdown の renderer で paragraph / list item / heading 単位で sanitize → 空になった node は skip
- **重要**: sentence 単位削除 (`。`/`\n` 区切り) は既存 `sanitizeText` でそのまま動作、 markdown structure (h1/h2/li/p) は維持
- backend `prompt_negatives.py:BLOCKLIST_REGEX` との 1:1 mirror は **既に維持済** (v82 phase 4.5 で確立)、 P3 では追加 pattern 不要
- sanitize 結果として `_sanitized: true` flag が立つ場合は ArticleHero に「※一部表現を編集しました」 small note を表示 (Trust Cliff 防止、 透明性確保)

**触るファイル**:
- 更新: `frontend/src/features/articles/ArticleBody.jsx` (sanitize 呼出)
- 更新 (optional): `frontend/src/features/articles/ArticleHero.jsx` (`_sanitized` flag note 表示)
- **触らない**: `frontend/src/lib/blocklist.js` (mirror SSOT、 backend `prompt_negatives.py` 編集とセットでないと整合崩壊)

**DoD**:
- [ ] ArticleBody.jsx 内で `sanitizeText` import + 全 markdown render 経路に適用
- [ ] テストケース: body_md に `「確実に上昇します」` 含む article を build → 該当 sentence が DOM に存在しない (削除確認)
- [ ] テストケース: body_md に `「業界 No.1」` 含む article → 削除確認
- [ ] `grep -c "sanitizeText" frontend/src/features/articles/ArticleBody.jsx` で 1+ hit
- [ ] backend BLOCKLIST_REGEX (prompt_negatives.py) と frontend BLOCKLIST_PATTERNS の数が一致 (v82 から維持済 14+pattern)

**smoke test**:
```bash
# test fixture を含む article で build → 違反 sentence が dist に含まれない
node -e "const {sanitizeText} = require('./frontend/src/lib/blocklist.js'); console.log(sanitizeText('AAPL は確実に上昇します。 売上高は前年比 30% 増加。'))"
# 期待: "売上高は前年比 30% 増加。" (前半 sentence 削除)
```

---

### P3.6: `snap-vision-eval.mjs` に articles mode 追加

**実装方針**:
- 既存 `frontend/scripts/snap-vision-eval.mjs` に `--mode articles --slug <slug>` parameter 追加
- 流れ: `https://beatscanner-production.up.railway.app/articles/<slug>` を直接 URL navigate → full-page screenshot → Haiku で typography / spacing / aman 3 軸採点
- 既存 BYPASS_TOKEN 機構流用 ([[bypass-token]])、 demo rate limit 回避
- 3 run mean ([[vision-api-noise]] 教訓、 noise floor 別途測定)
- evaluator が後で「articles noise floor = X.X」 を SPEC 完了 report に記録

**触るファイル**:
- 更新: `frontend/scripts/snap-vision-eval.mjs` (mode 分岐追加)
- 触らない: `frontend/scripts/snap-pdca-loop.mjs` (別 script、 articles mode は vision-eval 側のみ)

**DoD**:
- [ ] `cd frontend && node scripts/snap-vision-eval.mjs --mode articles --slug <slug>` 実行で JSON output
- [ ] output JSON に `typography_pt` / `spacing_pt` / `aman_pt` / `overall_pt` 4 値
- [ ] 3 run mean で実行 (overall ±2pt noise 想定)、 noise floor を handover に記録
- [ ] visual harness exception 4 条件遵守 (headless / 60s timeout / `.visual/` 出力 / HTTP server なし)

**smoke test**:
```bash
cd frontend && ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY ../backend/.env | cut -d= -f2) \
  node scripts/snap-vision-eval.mjs --mode articles --slug nvda-202605240542 --runs 3
# 期待 output: .visual/vision-eval-articles-nvda-*.json
```

---

### P3.7: Pane 3 redirect link + 関連記事 internal linking

**実装方針**:
- **Pane 3 側**: ticker 詳細 page (例: AAPL) で「最新の AAPL 関連記事を読む」 link を 1 個配置 (Pane 3 redesign は P6 で実施、 P3 では最小限の link 追加のみ)
- **記事内 internal linking**: build-articles.mjs (P3.1) で markdown post-process、 記事内 `AAPL` / `NVDA` 等 ticker mention を `[AAPL](/stock/AAPL)` 自動 link 化
- 全 ticker mention を link 化すると noise なので、 **初出のみ** link 化 (同 article 内 2 回目以降 plain text)

**触るファイル**:
- 更新: `frontend/scripts/build-articles.mjs` (markdown post-process step 追加)
- 更新: 既存 Pane 3 ticker detail component (例: `StockPriceChart` 近辺 or DetailReport、 触る最小範囲を明示)
- 触らない: `frontend/src/components/StockPriceChart.jsx` の Recharts overlay 系 ([[chart-overlay-safety]] 4 層防御 zone)

**DoD**:
- [ ] AAPL ticker detail で「関連記事」 link 1 個表示 (記事 0 件なら link 非表示で safe)
- [ ] 記事 body 内 `NVDA` 初出が `/stock/NVDA` link になっている (HTML grep)
- [ ] 同記事内 2 回目以降の `NVDA` は plain text (link 重複なし)

**smoke test**:
```bash
grep -E 'href="/stock/[A-Z]+"' dist/articles/<slug>/index.html | head -5
# 期待: 1+ link、 ただし同 ticker は 1 回のみ
```

---

## 5. Hallucination Guard 4 層目 組込タイミング

| 層 | 場所 | P3 内 sprint | 状態 |
|---|---|---|---|
| 1. pre-commit hook (LLM SDK import / 数値計算指示 BLOCK) | `scripts/pre-commit-hook.sh` Check 1+3+4 | P1 で完了 | ✅ 既存 |
| 2. system block NEGATIVE_EXAMPLES (BAD 1-6) | `backend/app/visualizer/prompt_negatives.py` + `article_pipeline/writer.py` | P1 で完了 | ✅ 既存 |
| 3. **frontend sanitize** (BLOCKLIST_REGEX、 sentence 単位削除) | `frontend/src/lib/blocklist.js` 流用 → ArticleBody.jsx で呼出 | **P3.5 で組込** | 🟡 本 SPEC |
| 4. sources schema + per-source data namespace + citation 必須 | `article_pipeline/researcher.py` URL whitelist + `writer.py` [N] enforcement | P1 で完了 | ✅ 既存 |

**重要**: backend `BLOCKLIST_REGEX` と frontend `BLOCKLIST_PATTERNS` の **1:1 mirror** を維持 (v82 から確立)。 P3.5 で frontend patterns を編集してはいけない、 backend `prompt_negatives.py` と必ずセットで編集する (本 SPEC は frontend pattern 編集なし)。

**memory SSOT**:
- `feedback_diagram_quality_guard.md` (BAD 1-6 + Trust Cliff DoD)
- `feedback_citation_required.md` (景表法 §5 / 金商法 §38 anchor)
- `feedback_data_completeness_guard.md` (per-source namespace 3 段階分岐)

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

### 6.1 絶対禁止 (CLAUDE.md §触ると危険な箇所)

| ファイル / pattern | 理由 |
|---|---|
| `frontend/src/App.jsx` の sticky 検索 div (`.sticky-search-band`) | 8 回試行錯誤の Apple 方式安定領域、 触ると検索 UX 崩壊 |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | v54-v62 で 6 セッション溶けた発光バグ高リスク zone |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_PATTERNS` 配列 | backend `prompt_negatives.py:BLOCKLIST_REGEX` との 1:1 mirror、 typo 修正以外編集禁止 |
| `backend/app/visualizer/prompt.py` | Hallucination Guard pre-commit Check 1 BLOCK zone |
| `backend/app/aggregator/*.py` への LLM SDK import | Check 3 BLOCK zone |
| `backend/app/article_pipeline/*.py` の system prompt 内 imperative 数値計算指示 | Check 4 BLOCK zone (v113 P1 着地、 negation 文脈は除外) |
| `migrations/*.sql` / `docs/migrations/*.sql` | DB schema、 P3 は schema 変更なし (Supabase articles table P2 で完了) |
| `railway.toml` cron 定義 | warm cron pattern 死守、 P3 で新 cron 追加なし |
| `.claude/launch.json` | 人間用 |
| `handover_*.md` | read-only reference |
| `frontend/src/components/StockPriceChart.jsx` の Recharts overlay 系 | [[chart-overlay-safety]] 4 層防御 zone、 P3.7 redirect link は別 location |
| `frontend/src/features/workspace/Pane4Inspector.jsx` + `frontend/src/features/workspace/pane4/` 全 1,709 行 | P6 で削除予定、 P3 では touch しない (削除 timing 早めると workspace 全体崩壊 risk) |
| `backend/app/news_*.py` / `backend/app/aggregator/news.py` / `backend/app/visualizer/news_*.py` / `backend/app/rss_collector.py` | P6 で削除予定、 P3 では touch しない |

### 6.2 編集可だが慎重

| ファイル | 注意 |
|---|---|
| `frontend/vite.config.js` | manualChunks 追加可、 ただし既存 chunk 配置 (react-vendor / supabase / charts / dnd / markdown / framer-motion) は触らない |
| `frontend/src/App.jsx` (route 追加部分) | sticky 検索 div より下、 React Router の `<Routes>` 内に `<Route path="/articles/:slug">` 追加のみ |
| `frontend/src/index.css` | `.article-prose` class block 追加可、 既存 `.panel-card / .bs-panel / .surface-card` 直前/直後の class block 編集禁止 |
| `frontend/package.json` | `build` script chain 追加可、 既存 dependencies は touch しない (新規 dep `@resvg/resvg-js` のみ追加検討) |
| `frontend/public/robots.txt` | 新規作成 or 既存に Sitemap line 追加 |
| `Dockerfile` Stage 1 ARG | 新規 `VITE_*` 環境変数追加時のみ更新 (P3 で新規 VITE_* なし想定、 既存 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 流用) |
| `backend/app/main.py` | router 統合のみ、 既存 endpoint logic は touch しない |

---

## 7. Trust Cliff 防止 checklist

### 7.1 LP 訴求 vs 実装 整合 (3 項目以上)

| LP / 既存訴求文言 | P3 実装での整合確認 |
|---|---|
| 「無料登録不要」 | `/articles/<slug>` は無登録で閲覧可能、 認証 wall 設置禁止 (Supabase RLS で `published` のみ public read、 P2 で確認済) |
| 「毎朝 06:00 配信」 (新訴求、 P5 で確定) | P3 では Resend 配信は未実装、 ただし `/articles/<slug>` 静的 page は 21:00 UTC 生成 (= 06:00 JST 翌朝) → cron pattern と整合 |
| 「3 銘柄/日まで無料」 | `/articles/<slug>` は ticker 詳細 page と異なり、 個別 ticker analyze 消費しない (記事閲覧は無制限) → LP 訴求と矛盾しない |
| 「独自プロトコル」 (じっちゃま代替表記) | 記事内で「独自プロトコル」 表記統一、 「じっちゃま」 表記が body_md に混入していたら sanitize で削除 or 編集 (内部 prompt は OK、 UI 表示はじっちゃま禁止) |

### 7.2 fact 欠落 sentence の sanitize (P3.5 で blocklist)

- BAD-5 / BAD-6 を含む sentence は sanitize で削除 (景表法 §5 / 金商法 §38 抵触防止)
- `_sanitized: true` flag が立った記事は ArticleHero に「※一部表現を編集しました」 note 表示 (透明性、 Trust Cliff 防止)
- citation 欠落 ([N] が 1 つも無い記事) は P1 Writer 段階で publish 不可、 P3 では already filtered

### 7.3 「最終更新 X 分前」 併記 (CLAUDE.md §動的データルール)

- ArticleHero に発行日表示 (`datePublished` ISO 8601)、 ただし記事は静的なので「X 分前」 不要
- 代わりに「2026 年 5 月 24 日 06:00 公開」 等の絶対日時表示で十分

### 7.4 LP → ticker click 経路 (CLAUDE.md §Trust Cliff)

- 記事内 ticker link (`[NVDA](/stock/NVDA)`) は `handleLPTickerClick` 経由でなく React Router navigate でも OK (demo モード判定は ticker detail 側で行う)
- ただし `runAnalyze` 直接呼出は禁止、 必ず既存 `App.jsx` の click handler 経由

---

## 8. vision-eval gate (P3.6)

### 8.1 目標
- `articles` mode で 3 軸 (typography / spacing / aman) 各 80+ pt
- overall 80+ pt
- noise floor (3 run mean ±) を P3.6 で測定、 handover に記録

### 8.2 acceptance
- typography 80+ pt: Noto Serif JP 16px / line-height 1.85 / max-width 680px 適用、 編集装飾品質
- spacing 80+ pt: paragraph spacing 1.5rem / Hero と body 間の 32px+ 余白
- aman 80+ pt: gold accent 数字 highlight + FT Weekend 級静寂感、 装飾過多回避

### 8.3 noise floor 測定 protocol
- 3 run mean (Pane 3: 72.4 / Pane 4: 70.0 が既知 noise floor)
- articles noise floor は未測定、 P3.6 完了時に記録
- ±2pt noise (typography / spacing) / ±4pt noise (aman) 想定

### 8.4 polish iteration ROI 判断
- [[polish-iteration-roi-decay]] 教訓に従い、 articles noise floor 接近時の小幅 polish は規制対象
- 大胆 polish が必要なら本 SPEC でなく別 SPEC で新 sprint 起票

---

## 9. user 承認 gate 1 setup

### 9.1 SPEC 全体への user 確認
本 SPEC 書出後、 AskUserQuestion で以下 3 択を提示:
- **採用** → P3.1 から generator 起動 (1 sprint 単位で worktree 分離、 [[pge-loop-pitfalls]] 教訓遵守)
- **修正指示** → 修正項目を聞き取り、 本 SPEC を再起票 (planner re-run)
- **中止** → SPEC を残して終了、 P4-P6 だけ先行する判断も可

### 9.2 sprint 単位の中間 gate
- P3.1 / P3.2 / P3.5 完了時点で user に短い report (建設的 1-2 行) + 続行判断
- 各 sprint 完了時に build + grep verify、 全 sprint 完了時に Railway deploy + smoke test

### 9.3 multi-review gate (P3 全 sprint 完了時)
- **3 軸判定**:
  1. LLM 出力品質: P3.5 で sanitize 組込、 景表法 / 金商法 risk active
  2. Trust Cliff: LP 訴求 vs 実装整合 (§7)、 active
  3. backend endpoint + RLS / cache: `/sitemap.xml` 新規、 ただし P2 で articles RLS 既に確立 → moderate
- **2 軸が active** → **6 体合議推奨** (Hallucination Guard + Trust Cliff + 法令 risk + SEO + Aman brand + frontend-architect)
- Phase 3 完了直前 + Railway deploy 前に multi-review 起動

---

## 10. 残 risk + roll-back plan

### 10.1 想定 risk
1. **vite-plugin-md vs custom script**: custom script 採用 → React app の clone + initial state injection が複雑化、 P3.1 で 0.4 人日超過 risk
2. **OGP image 動的生成**: A 案 (resvg-js) で SVG → PNG 失敗時は B 案 (共通 1 枚) に即 pivot、 0.2 人日吸収可
3. **react-router の SSG 親和性**: SPA 経由 navigation が静的 page と二重表示 risk、 ArticlePage 内で `useEffect` の重複 fetch 防止が必要
4. **build 時間増加**: 記事 10 本で 15 秒、 100 本で 150 秒 想定。 100 本超えたら incremental build 検討 (P3 範囲外)
5. **Supabase fetch 失敗**: P3.1 で silent-fail 設計、 build 失敗 risk なし
6. **sitemap.xml size**: 記事 1000 本超えたら 50MB 超えで Google index 拒否 risk、 1000 本未満なら問題なし

### 10.2 roll-back plan
- **P3.1 失敗** → `frontend/scripts/build-articles.mjs` 削除 + `package.json` build script を `vite build` 単独に戻す。 影響範囲は記事 page のみ、 既存 SPA は無傷
- **P3.2 失敗** → `App.jsx` の `<Route path="/articles/:slug">` 削除 + `ArticlePage.jsx` 削除。 SPA は無傷
- **P3.5 sanitize 暴発** (記事全削除等) → `ArticleBody.jsx` の `sanitizeText` import コメントアウト、 raw markdown 表示に fallback、 root cause 調査後再有効化
- **緊急 roll-back**: `git revert <P3 commit>` + `railway up` で本番 5 分以内に v112-10 (index-C6w3Vo3X.js) に戻る

### 10.3 risk が顕在化したら
- handover v115 (本 SPEC 完了後) に risk 記録 + 学習 anchor 起票
- vision-eval articles noise floor 想定外 (60pt 等) なら、 P3 ROI 再評価 + polish iteration 規制発動

---

## 11. 着手判断 check (P3.1 開始前)

- [ ] user verdict 取得 (本 SPEC への 採用 / 修正 / 中止) — gate 1
- [ ] Railway deploy 完了 (v114 §1) + NVDA 本番 smoke test 成功
- [ ] Supabase articles table に `published` 記事が **1 つ以上** 存在 (NVDA draft を手動で `status='published'` に変更 or 別記事を生成)
- [ ] 既存 memory 6 件 read 確認 (project_pane45_redesign / polish_iteration_roi_decay / article_generator / diagram_quality_guard / citation_required / data_completeness_guard)
- [ ] P3.1 着手前に `frontend/scripts/build-articles.mjs` の draft を 30 分 prototype (vite-plugin-md vs custom script ROI 決定)

---

## 12. handover 連携

- 次 session 開始時: handover v114 + 本 SPEC + 関連 memory 6 件 read で P3.1 着手
- P3 完了後: handover v115 起票、 vision-eval articles noise floor 記録、 P4-P6 着手判断
- 本 SPEC 全 sprint 完了時の multi-review verdict は handover に必須記録 (6 体構成想定、 cost 効率運用 [[cost-efficient-operation]] で 3 体 Sonnet + 3 体 Opus mixed model)

---

## 13. multi-review 必要性判定 (本 SPEC 全体)

**3 軸チェック**:
1. **LLM 出力品質**: ✅ active (P3.5 sanitize 組込、 景表法 / 金商法 risk)
2. **Trust Cliff**: ✅ active (LP 訴求整合、 BAD-5/BAD-6 sentence 削除の透明性 note)
3. **新 backend endpoint + RLS / cache**: 🟡 moderate (`/sitemap.xml` 新規、 ただし articles RLS は P2 で確立済、 cache は 1h `Cache-Control`)

**判定**: **2 軸が active** → **6 体合議推奨** (Phase 3 完了 gate)

**6 体構成案**:
| reviewer | model | 役割 |
|---|---|---|
| 金融 verdict | Opus | 景表法 / 金商法 / Hallucination Guard 4 層適用 |
| Anthropic engineer | Opus | LLM cost / cache hit ratio / API rate limit |
| マーケター / Trust Cliff | Opus | LP 訴求整合 / sanitize note の文言設計 |
| ui-designer | Sonnet | Aman brand / Noto Serif JP / 編集装飾 |
| frontend-architect | Sonnet | Vite SSG / React Router / bundle 影響 |
| qa-dogfooder | Sonnet | E2E smoke test / OGP debugger / Google Rich Results |

cost 効率運用 [[cost-efficient-operation]] 準拠: 3 体 Opus + 3 体 Sonnet mixed model で並列起動。

---

## 14. SPEC change log

- 2026-05-24 v114 session: 初版起票、 親 SPEC §Phase 3 (line 105-112) を 7 sprint に展開
