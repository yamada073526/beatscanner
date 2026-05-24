# SPEC v113: Pane 4/5 全面再設計 = 1 日 1 回クロール + まとめ配信

**起票日**: 2026-05-24
**起票 session**: v112 polish iteration 完結 + Pane 4/5 vision-eval 不安定発覚 + user 「自動採点を可能に + 構造再設計」 verdict
**実装着手**: 次 session 以降 (今 session は spec 確定 + handover で終了)
**工数**: P1-P6 合計 **9.5 人日** (P7 別 session)
**multi-review 4 体合議**: UI/UX + Frontend + SEO/Marketing + 金融/Aman brand (2026-05-24 converge)

---

## 1. 背景 / 真因

### 1.1 既存 Pane 4/5 の制約
- **Pane 4** = inspector (workspace narrow column 18-25%、 ニュース feed + Cup-Handle スキャナー segmented tab)
- **Pane 5** = Reading Mode overlay (Pane 4 内 slot、 SSE 翻訳 + 構造化記事 viewer)
- vision-eval baseline (3 run × 2 ticker): Pane 4 overall **69.2** / Pane 5 single run **57**
- v112-8 Pane 4 polish (typography 集中) = +0.8 noise range
- Pane 5 vision-eval baseline 取得不安定 (NewsItem click 後 6 run 中 5 run FATAL 「Reading Mode mount されない」)

### 1.2 PDCA ROI 低下の根拠
- v112-5 (stagger + shimmer): overall **-1.8 regression** (revert)
- v112-9 Phase A (大型 Hero 拡大): overall **-4.3 regression** (revert、 期待 +7〜+10 → 実 -4.3 の真逆)
- 高信頼軸 (typography / spacing) は ±2pt noise floor 接近、 低信頼軸 (motion / aman) は ±4pt noise で large polish 必須

### 1.3 user 意向 (2026-05-24 session)
- 「自動採点を可能にするにはどうすればいいか」 (技術的解決)
- 「現状の Pane 4/5 は最悪破棄になっても構わない」
- 「以前のサブエージェントレビューで、 検索流入が見込めないので 1 日単位でクロール + ニュースまとめ配信を」 (構造再設計案あり)

→ **Pane 4/5 全面破棄 + 静的記事 page 構造 (1 日 1 回クロール + まとめ配信) で SEO 流入 + 自動採点 + Aman brand 三方良し**

---

## 2. 4 体合議 converge ポイント

### 2.1 全員一致
1. **静的 page (SSG/ISR or 静的 HTML)** が SEO 流入 + vision-eval 親和性で必須
2. **Hallucination Guard 4 重防御 enforced** (citation + Fact-Checker + BLOCKLIST + Verdict Sign Guard) 全記事に適用
3. **frontend / backend 大幅 refactor**: Pane4 1,709 行 + news_*.py + visualizer/news_*.py 削除 + 新 article_pipeline/ 追加
4. **Phase 分解必須**: backend pipeline → schema/cron → frontend route → workspace embed → SEO → 既存削除

### 2.2 意見対立 → 統合解

| 論点 | 案 A | 案 B | 統合解 |
|---|---|---|---|
| frontend route | Vite 静的 (5.5 人日、 SEO 中) | Next.js 16 全面移行 (8-13 人日、 SEO 最強) | **Vite 静的先行 (Phase 1-6) → 記事 10-20 本蓄積後 Next.js 段階移行 (Phase 7 別 session)** |
| 記事形式 | 銘柄 deep-dive (long-tail SEO) | テーマ Horizon (じっちゃま 8/10 / NVDA キラー型) | **両方併用**: 銘柄 毎朝 5-7 記事 + テーマ 1-2 記事/週 |
| 表示位置 | dedicated `/articles/` (SEO) | Pane 3 inline / workspace embed (retention) | **両方**: dedicated route + workspace ホーム tab に Daily Digest 3 card embed |

---

## 3. Phase 分解 (9.5 人日)

### Phase 1: backend pipeline 骨格 (3 人日)
**目的**: AI 記事自動生成 4 agent pipeline (Researcher → Writer → Fact-Checker → Verdict Sign Guard)

**file 構造**:
```
backend/app/article_pipeline/
  __init__.py
  researcher.py   # Sonnet 4.6 + tool_use + web_search + Citations API
                  # RSS pull (Reuters / Bloomberg / SEC EDGAR / Benzinga / Reddit)
                  # → 全数字を citation 付き JSON で返す
  writer.py       # Opus 4.7 + 5 分 prompt cache
                  # 独自プロトコル few-shot 30 本 (KB 側で curated)
                  # 数字は Researcher JSON からのみ引用 (system hard constraint)
  fact_checker.py # Haiku 4.5 + Citations API
                  # 生成記事の全数値・固有名詞を Researcher JSON と突き合わせ
                  # 不一致は writer に regenerate 要求 (最大 2 周)
  verdict_sign_guard.py  # judgment 5 条件 PASS/FAIL と論調 sign 一致 check
                         # 矛盾は両論併記 + 乖離バッジ (block しない)
  scheduler.py    # Railway cron HTTP trigger (21:00 UTC = 06:00 JST)
```

**Hallucination Guard 4 重防御 (P1 から先行実装必須、 景表法 §5 / 金商法 §38 直撃 zone)**:
- 第 1 層: pre-commit hook (既存 `scripts/pre-commit-hook.sh` で article_pipeline/*.py への LLM SDK import が aggregator/ と分離されているか check)
- 第 2 層: system block 内 NEGATIVE_EXAMPLES (BAD-1 英語混在 / BAD-2 抽象 / BAD-3 数値捏造 / BAD-4 step 不足 / **BAD-5 断定的将来予測** / **BAD-6 最上級表現**)
- 第 3 層: frontend sanitize (BLOCKLIST_REGEX で違反 sentence 単位削除、 `frontend/src/lib/blocklist.js` 流用)
- 第 4 層: sources schema + per-source data namespace (Researcher が返す JSON に citation 必須、 confidence < 0.7 で破棄再取得)

### Phase 2: Supabase schema + Railway cron (1 人日)
**Supabase `articles` table**:
```sql
CREATE TABLE articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  subtitle text,
  body_md text NOT NULL,
  citations jsonb NOT NULL,
  ticker text,                      -- 銘柄 deep-dive 時、 テーマ記事は null
  format text NOT NULL,             -- 'deep_dive' | 'theme_horizon' | 'daily_digest'
  status text NOT NULL DEFAULT 'draft',  -- 'draft' | 'published' | 'archived'
  published_at timestamptz,
  generated_at timestamptz NOT NULL DEFAULT now(),
  human_reviewed_at timestamptz,
  vision_eval_score numeric        -- 後で vision-eval 統合
);
CREATE INDEX articles_published_idx ON articles (published_at DESC) WHERE status = 'published';
CREATE INDEX articles_ticker_idx ON articles (ticker) WHERE ticker IS NOT NULL;
```

**Railway cron**: `railway.toml` に `0 21 * * * curl https://...up.railway.app/api/cron/generate-articles` (21:00 UTC = 06:00 JST)、 既存 `/health` warm cron と同 pattern。

### Phase 3: Vite 静的 generation + dedicated route (2 人日)
**実装**:
- `vite-plugin-md` 採用 (Vite Markdown plugin) or build 時に Supabase fetch → `dist/articles/<slug>.html` 静的生成
- `/articles/[slug]` route (React Router 経由でも可、 ただし SSR でなく build 時 SSG)
- OGP: `og:title / og:description / og:image` (Edge Function or static で動的生成、 ticker + verdict 入り)
- sitemap: `/sitemap.xml` 動的生成 (FastAPI from Supabase)
- Article schema.org: `datePublished / dateModified / author` 必須 (Google ニュース discover 流入)
- internal linking: 記事内 ticker mention → `/stock/[ticker]` 自動リンク (markdown post-process)

### Phase 4: workspace embed (0.5 人日)
- workspace 「ホーム」 tab に **Daily Digest 3 card** embed (Supabase from articles where published_at > now() - 1 day order by published_at desc limit 3)
- card click で `/articles/[slug]` へ navigate (workspace から離脱)
- 50 行未満で実装可

### Phase 5: Resend 朝メール + RSS + Twitter (2 人日)
- Resend (既存導入済) で日次配信 (06:00 JST、 1-click unsub 必須、 open rate 目標 25%+)
- `/feed.xml` RSS feed 提供
- Twitter Bot (決算 Beat/Miss 速報) → フォロワー → サイト流入の逆引き

### Phase 6: 既存 Pane 4/5 削除 (1 人日)
**削除対象**:
- `frontend/src/features/workspace/Pane4Inspector.jsx`
- `frontend/src/features/workspace/pane4/` 全 1,709 行 (MacroLensPanel / NewsItem / ReadingMode / ScannerSlot / ReadingRoomPanel / useNewsFeeds / useTranslation / useSignalPipeline / usePrefetchTopNews / signal / format / markdown)
- `backend/app/news_*.py` (RSS / FMP / yfinance ニュース取得 endpoint)
- `backend/app/aggregator/news.py`
- `backend/app/visualizer/news_*.py` (SSE 翻訳 LLM call)
- `backend/app/rss_collector.py`
- `frontend/scripts/snap-vision-eval.mjs` の Pane 4/5 mode (pane3 のみに戻す)

**migration risk**:
- workspace `pane4Expanded` zustand state は keep (default false) で safe
- WorkspaceShell の Pane 4 slot は keep (将来 inspector 復活余地)、 default 非表示

**流用**:
- `backend/app/fmp_client.py` → Researcher 層で top news pull
- `backend/app/claude_client.py` → Writer / Fact-Checker で流用
- `backend/app/visualizer/prompt.py` のキャッシュ pattern → Writer system キャッシュ ([[prompt-cache-pattern]] memory 整合)

### Phase 7 (別 session): Next.js 16 段階移行 (5-8 人日)
**Trigger**: 記事 10-20 本蓄積 + Vite SSG の SEO 効果見極め後 (2-3 週後想定)

---

## 4. KPI 仮設 (SEO/Marketing strategist verdict)

| 時点 | 月間 organic search | メール購読者 |
|------|---------------------|--------------|
| Day 0 | 0 | 0 |
| Day 30 | 500 | 200 |
| Day 90 | **10,000** | **1,500** |

検証可能: Google Search Console (Day 30 後 setup) + Resend dashboard (open rate / unsub rate)

---

## 5. 記事 design (UI/UX + Aman 4 体 converge)

### 5.1 1 article page 構造
```
[Hero]
  title (32px / font-serif Noto Serif JP)
  subtitle (18px / --color-muted)
  発行日 + 著者 tag (gold badge "BeatScanner Editor")

[Body]
  font-serif Noto Serif JP 16px
  line-height 1.85
  max-width 680px
  --spacing-paragraph 1.5rem
  gold accent で数字 timeline 強調

[Timeline] (optional)
  Recharts BarChart (既存資産再利用) or CSS table
  gold highlight on key year

[Citation]
  footnote superscript → bottom anchored list
  source_url 必須 (Hallucination Guard §4 準拠)

[Related Articles]
  3-card horizontal scroll (既存 panel-card token 流用)
```

### 5.2 「Luxury Financial Editorial」 idiom (金融/Aman brand 推奨)
- FT Weekend / Bloomberg Markets の「冷静な興奮」 anchor
- 熱量は **構造で表現** (反コンセンサス冒頭宣言 → 数字 timeline → 業界対立 3 幕構成)
- 感嘆符・口語禁止 (Hallucination Guard §2 BAD-6 最上級表現 抵触防止)
- Aman 級「驚き・豪華・興奮・洗練・楽しい」 5 感情のうち **洗練 + 豪華 + 興奮** を target (静的記事は驚き / 楽しい は弱め)

### 5.3 記事形式 hybrid (両立)
- **銘柄 deep-dive** (long-tail SEO): 1 銘柄 × 1,200-1,500 字、 SEC 10-K / earnings transcript citation、 業界対立 narrative、 月間 500-2000 検索流入想定
- **テーマ Horizon** (じっちゃま 8/10): industry 全体 × 3-5 銘柄、 反コンセンサス angle、 NVDA キラー記事型、 月間 5,000+ 検索だが競合強
- **日次 digest** (低 SEO、 retention 用): 5-10 銘柄の short summary list、 Resend 朝メール配信

---

## 6. 既存 memory 連携

- `project_article_generator.md` (11 日前構想): Researcher / Writer / Fact-Checker / Verdict Sign Guard pipeline
- `project_hot_topic_discovery.md` (11 日前構想): 4 層 Multi-agent (RSS pull → Signal Hunter → Theme Synthesizer → Editor)
- `feedback_citation_required.md`: 数値・固有名詞・因果文に source_url 必須、 confidence=low 15% 超で破棄再生成
- `feedback_diagram_quality_guard.md`: BAD pattern 1-6 + Trust Cliff DoD
- `feedback_data_completeness_guard.md`: per-source namespace + 3 段階分岐 UI
- `feedback_llm_calc_separation.md`: 数値 Python / narration LLM 物理分離
- `feedback_prompt_cache_pattern.md`: system + few-shot を ephemeral cache、 cache hit 80% 維持で月 cost $80→$10

---

## 7. 残 risk (未解決、 P1 着手前確認)

1. **Hallucination Guard 4 層の article_pipeline 適用方法**: 既存 aggregator/visualizer pattern を踏襲できるか
2. **prompt cache hit ratio**: Writer few-shot 30 本で cache size 大、 5 分 TTL で hit ratio が低下する可能性
3. **Supabase RLS**: articles table は public read (SEO 流入用)、 ただし draft / archived は service_role のみ access
4. **Railway cron 信頼性**: 既存 `/health` warm cron が安定稼働しているか確認、 不安定なら GitHub Actions cron に切替
5. **記事 LLM cost**: Researcher (Sonnet) + Writer (Opus) + Fact-Checker (Haiku) で 1 記事 ~$0.02-0.05、 月 200 記事で $4-10 (許容 cost)
6. **Next.js 16 移行 Phase 7 の timing**: 早すぎると Vite SSG 効果不明、 遅すぎると SEO 機会損失

---

## 8. 着手判断 (P1 開始前 check)

- [ ] user 4 体 verdict 集約に同意 ✅ (本 session で取得)
- [ ] 既存 memory 2 件 (article_generator + hot_topic_discovery) と整合 ✅
- [ ] Hallucination Guard 4 層 enforced design 確認 (P1 設計時)
- [ ] Supabase articles table 仕様確定 (P2 着手前)
- [ ] Railway cron 既存 warm pattern 流用可能か確認
- [ ] vision-eval friendly (static page) 確認: snap-vision-eval.mjs で `/articles/[slug]` を直接 URL navigate → screenshot 撮影可能

---

## 9. handover 連携

- 次 session: `/fetch-handover` で本 spec + handover v113 を read → P1 着手
- handover v113 §「次 session 最優先」 で本 spec を必須 read 指示
- 実装中 multi-review (3 体 or 6 体合議) 起動: Hallucination Guard + Trust Cliff + 法令 risk 3 軸で 6 体推奨
