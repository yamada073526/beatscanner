/**
 * build-articles.mjs — P3.1+P3.3 Vite SSG post-process script
 *
 * 役割:
 *   `vite build` 完了後に本スクリプトを実行。
 *   Supabase から `status='published'` 記事を fetch → dist/articles/<slug>/index.html を生成。
 *
 * 設計方針:
 * - Supabase fetch 失敗時は **build を fail させず** 警告 log のみ (silent-fail)
 * - dist/index.html を各 slug の雛形として clone → <head> に記事 meta / body の initial state
 *   を script tag で注入 (SPA SSG の最小骨格)
 * - anon key で RLS published filter → service_role key があれば bypass 可 (P3.1 は anon 優先)
 * - 生成する HTML には Supabase key を一切含めない (build script が読むだけ, 出力に混入禁止)
 *
 * P3.3 追加:
 * - OGP meta tags (og:title / og:description / og:image / og:type / og:url)
 * - Article schema.org JSON-LD (<script type="application/ld+json">)
 * - canonical URL (<link rel="canonical">)
 * - W-L2-01 修正: site-wide canonical (/) を記事 page では削除、記事固有 canonical のみ残す
 * - OGP image: og-overlay.mjs で SVG → PNG 生成 (失敗時は default PNG fallback)
 * - og:description に sanitize 適用 (BAD-5/BAD-6 sentence 単位削除)
 *
 * 環境変数:
 *   VITE_SUPABASE_URL         Supabase project URL (Railway build arg で渡される)
 *   VITE_SUPABASE_ANON_KEY    anon public key
 *   SUPABASE_SERVICE_ROLE_KEY (optional) — draft も含めてビルドしたい場合に使用
 *   VITE_PUBLIC_SITE_URL      canonical base URL (default: https://beatscanner-production.up.railway.app)
 *
 * DoD (P3.1 + P3.3):
 *   - dist/articles/<slug>/index.html が 1+ 件生成される
 *   - 生成 HTML に <meta property="og:title"> / <link rel="canonical"> / application/ld+json が存在
 *   - 生成 HTML に Supabase key が含まれない
 *   - dist/articles/og/<slug>.png が存在 (1KB 以上)
 *   - canonical が 1 件のみ (W-L2-01 修正: site-wide canonical を記事 page で削除)
 *   - ビルド時間 +15 秒以内 (記事 10 本想定)
 *
 * memory anchors:
 *   - project_pane45_redesign.md (v113 P1+P2 着地)
 *   - feedback_supabase_grant_bug.md (service_role GRANT 必須)
 *   - feedback_diagram_quality_guard.md (BAD-5/6 Trust Cliff)
 *   - feedback_triage_banner_pattern.md (per-source data namespace)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOgImageUrl } from './og-overlay.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── dotenv 読み込み (Railway build 環境以外でのローカルテスト用) ────────────────
// Node 20.6+ の --env-file フラグと同等の最小実装
// 優先順位: 既存の process.env > .env.build > backend/.env (SUPABASE_* のみ)
function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      // 既存の env を上書きしない (Railway Service Variables 優先)
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // ファイル読み込み失敗は無視 (optional)
  }
}

// frontend/.env.build (ローカルテスト用、gitignore 推奨) → backend/.env の順で試行
loadEnvFile(path.resolve(__dirname, '../.env.build'));
// backend/.env から SUPABASE_* のみ読む (VITE_ prefix なし key の fallback)
const backendEnvPath = path.resolve(__dirname, '../../../backend/.env');
loadEnvFile(backendEnvPath);

// ── 定数 ───────────────────────────────────────────────────────────────────────

const FRONTEND_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(FRONTEND_DIR, 'dist');
const ARTICLES_DIR = path.resolve(DIST_DIR, 'articles');
const DIST_INDEX = path.resolve(DIST_DIR, 'index.html');

const CANONICAL_BASE =
  process.env.VITE_PUBLIC_SITE_URL ||
  'https://beatscanner-production.up.railway.app';

// OGP image 出力先ディレクトリ (dist/articles/og/)
const OG_IMAGE_DIR = path.resolve(DIST_DIR, 'articles', 'og');

// BeatScanner logo URL (schema.org publisher.logo)
const LOGO_URL = `${CANONICAL_BASE}/favicon.svg`;

// ── Supabase 接続 ───────────────────────────────────────────────────────────────

/**
 * Supabase REST API を fetch で直接呼ぶ (Node.js の built-in fetch, v18+)。
 * @supabase/supabase-js を build script 側で import する場合は ESM 変換が複雑なため、
 * 生の REST API を使う方が依存を増やさず安全 (SPEC §10 risk 1 対策)。
 *
 * @returns {Promise<Array<import('./types').Article>>} — 失敗時は空配列
 */
async function fetchPublishedArticles() {
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  // service_role key があれば draft も含めてビルド可 (P3.1 では optional)
  const apiKey = serviceRoleKey || anonKey;

  // v114 deploy 診断: env 取得状況を build log に明示出力
  console.log(
    `[build-articles] env diag: VITE_SUPABASE_URL=${supabaseUrl ? supabaseUrl.slice(0, 30) + '...' : '<missing>'} | ` +
    `serviceRoleKey=${serviceRoleKey ? 'present' : '<missing>'} | ` +
    `anonKey=${anonKey ? 'present' : '<missing>'}`,
  );

  if (!supabaseUrl || !apiKey) {
    console.warn(
      '[build-articles] VITE_SUPABASE_URL or key が未設定。記事 HTML 生成をスキップします。',
    );
    return [];
  }

  // service_role key 使用時は draft も対象、anon key 使用時は published のみ (RLS)
  const statusFilter = serviceRoleKey
    ? 'status=in.("published","draft")'
    : 'status=eq.published';

  const endpoint = `${supabaseUrl}/rest/v1/articles?${statusFilter}&select=slug,title,subtitle,body_md,citations,ticker,published_at,generated_at&order=generated_at.desc`;

  try {
    const res = await fetch(endpoint, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000), // 10 秒 timeout
    });

    if (!res.ok) {
      console.warn(
        `[build-articles] Supabase fetch 失敗 (HTTP ${res.status})。記事 HTML 生成をスキップします。`,
      );
      return [];
    }

    const articles = await res.json();
    console.log(
      `[build-articles] ${articles.length} 件の記事を取得 (filter: ${statusFilter})`,
    );
    return Array.isArray(articles) ? articles : [];
  } catch (err) {
    console.warn('[build-articles] Supabase fetch エラー:', err.message);
    return [];
  }
}

// ── sanitize ヘルパー (P3.5: body_md + og:description の BAD-5/BAD-6 削除) ──────
//
// P3.5 変更点:
//   - 旧 sanitizeDescription の簡略パターン (6件) → frontend/src/lib/blocklist.js の
//     BLOCKLIST_PATTERNS (17件) と 1:1 mirror に強化
//   - body_md 全体にも sanitize を適用し、SSG 段階で BAD-5/BAD-6 を除去する
//     (SPA 経由は ArticleBody.jsx が render 時に sanitize、SSG 経由は本関数が補完)
//   - article-data.json / window.__ARTICLE_DATA__ / noscript preview 全て sanitize 済み body_md を使用
//
// 重要: frontend/src/lib/blocklist.js を直接 import するとパス解決が複雑になるため、
//       パターンをここに同期コピーする。
//       パターン変更時は blocklist.js と必ずセットで更新する (1:1 mirror 維持)。

/**
 * frontend/src/lib/blocklist.js の BLOCKLIST_PATTERNS (17件) と 1:1 mirror。
 * BAD-5 (断定的将来予測 / 金商法 §38) + BAD-6 (最上級表現 / 景表法 §5)。
 *
 * ⚠️ このパターン配列を編集する場合は blocklist.js と backend/app/visualizer/prompt_negatives.py
 *    を必ずセットで更新すること (単独変更は mirror 整合崩壊)。
 */
const BLOCKLIST_PATTERNS_SSG = [
  // BAD-5: 断定的将来予測
  /確実(です|に|な)?/,
  /必ず(達成|到達|実現)?/,
  /絶対(に|的)?(勝|成功|達成)/,
  // BAD-6: 最上級表現
  /世界\s*(一|No\.?\s*1|首位|最大)/,
  /業界\s*(最強|トップ|首位|No\.?\s*1)/,
  /(圧倒的|圧倒)(な|して|的)?/,
  /他社を圧倒/,
  /最強の/,
  // Phase B grey zone: BAD-6 系 景表法 §5 強化
  /圧倒的シェア|圧倒的優位|圧倒的な/,
  /他の追随を許さない|追随を許さない/,
  /群を抜く|群を抜いて/,
  /\b(leading|dominant|first-mover|market\s*leader)\b/i,
  /市場リーダー|業界リーダー/,
  // Phase B grey zone: BAD-5 系 金商法 §38 強化
  /成長見込み|成長が見込まれる|成長が期待/,
  /拡大基調|拡大が続く|拡大傾向/,
  /追い風となる|追い風が吹く|追い風/,
  /中長期的に有望|中長期的な成長|長期的に有望/,
];

/**
 * text に違反パターンが含まれるか判定。
 * @param {string} sentence
 * @returns {boolean}
 */
function hasViolation(sentence) {
  return BLOCKLIST_PATTERNS_SSG.some((p) => p.test(sentence));
}

/**
 * text 内の违反センテンスを削除して安全なテキストを返す。
 * 句点「。」または改行 (markdown 行) で分割し、違反センテンスを drop。
 * 削除が発生した場合は { text, sanitized: true } を返す。
 *
 * @param {string} text
 * @returns {{ text: string, sanitized: boolean }}
 */
function sanitizeBodyText(text) {
  if (!text || typeof text !== 'string') return { text: text || '', sanitized: false };
  if (!hasViolation(text)) return { text, sanitized: false };

  // 句点・改行でセンテンス分割し、違反センテンスを除去
  const sentences = text.split(/([。\n])/);
  const kept = [];
  let wasSanitized = false;
  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i];
    const delimiter = sentences[i + 1] || '';
    if (sentence && hasViolation(sentence)) {
      wasSanitized = true;
      // delimiter も落とす (違反センテンス全体を除去)
    } else if (sentence != null) {
      kept.push(sentence + delimiter);
    }
  }
  return { text: kept.join('').trim(), sanitized: wasSanitized };
}

/**
 * og:description 用 sanitize (短いテキスト、body_md より緩い分割)。
 * body_md が既に sanitize 済みの場合は違反が残っていないはずだが、
 * subtitle / body_md.slice 経由の description にも適用する。
 *
 * @param {string} text
 * @returns {string} sanitize 済みテキスト
 */
function sanitizeDescription(text) {
  if (!text || typeof text !== 'string') return '';
  const { text: result } = sanitizeBodyText(text);
  return result || '';
}

// ── P3.7: ticker mention internal linking ─────────────────────────────────────
//
// 記事 body_md 内の ticker mention (例: 「NVDA は...」「AAPL の Q3...」) を
// `[AAPL](/stock/AAPL)` 形式に自動変換する markdown post-process。
//
// ルール:
//   1. 認識対象: 2〜5 文字の大文字英字のみの ticker (NYSE/NASDAQ 標準)
//   2. 自リンク制御: 記事の ticker (article.ticker) と同じ ticker は 初出のみ link、2 件目以降は plain text
//   3. 他 ticker: 記事内 初出のみ link、2 件目以降 plain text (visual noise 削減)
//   4. 既存 markdown link 内の ticker は変換しない (二重 link 防止)
//   5. link の rel="noopener" は ArticleBody.jsx の react-markdown custom renderer で付与
//      (build script は markdown 記法のみ出力、HTML 直書きしない)
//
// security: `rel="noopener"` は ArticleBody.jsx の <a> renderer で付与済み (P3.2 で設定)。
// SPEC §P3.7 DoD: 初出が /stock/TICKER link、2 件目以降は plain text

/**
 * 既知の主要 ticker セット (NYSE/NASDAQ 上場、大文字 2-5 文字)。
 * 誤検知 (英単語 "IT" / "AI" 等) を防ぐため、短い ticker は注意が必要だが
 * 正規表現で word boundary を使用するため英文中の単語との混同は最小化される。
 *
 * 誤検知が多い場合は TICKER_BLOCKLIST でスキップ可。
 */
const TICKER_BLOCKLIST = new Set([
  // 英単語 / 金融略語と衝突する ticker
  'IT', 'AI', 'CO', 'DO', 'ME', 'OR', 'ARE', 'ALL',
  // 決算記事で頻出する金融略語 (NYSE/NASDAQ ticker でない)
  // v115 user フィードバック: "PEG" が ticker 誤認 → 財務略語を網羅的に追加
  'EPS', 'YOY', 'YOY%', 'SPS', 'BPS', 'CFPS', 'KPI', 'CEO', 'CFO', 'CTO', 'COO',
  'IPO', 'ETF', 'ETFs', 'ROE', 'ROA', 'ROIC', 'FCF', 'DCF', 'EBIT', 'EBITDA',
  'PEG', 'PER', 'PBR', 'PSR', 'WACC', 'CAGR', 'QoQ', 'NPV', 'IRR', 'YTD', 'MTD',
  'GAAP', 'IFRS', 'ESG', 'SEC', 'SaaS', 'PaaS', 'IaaS',
  'USD', 'EUR', 'JPY', 'GBP', 'CNY', 'HKD',
  'PASS', 'FAIL', 'NA', 'Q1', 'Q2', 'Q3', 'Q4',
  'FY', 'FY24', 'FY25', 'FY26', 'FY27',
  'US', 'EU', 'UK', 'DE', 'JP', 'CN', 'IN',
  'AI', 'ML', 'NLP', 'GPU', 'CPU', 'SSD', 'API', 'SDK', 'IDE', 'CDN', 'LLM',
  'AWS', 'GCP',
  // v116 user フィードバック (GOOGL 記事 dogfood): 物理単位 + 投資略語 が ticker 誤認
  'GW', 'MW', 'KW', 'TW',                  // ワット単位 (giga / mega / kilo / tera)
  'GWh', 'MWh', 'KWh', 'TWh',              // ワット時 (大文字 5 文字以内)
  'ROI',                                    // Return On Investment (ROIC は既存)
  'ERS',                                    // ERShares 等の短縮 (XOVR が valid ETF ticker、 ERS 単独は ticker でない)
  'TL', 'TLDR', 'DR',                       // tl;dr 系 ("TL;DR" の "DR" が独立 match されるため blocklist 化
  // BAD-5/6 パターンに含まれる英字列 / テスト用 marker
  'No', 'OK', 'PR', 'VP', 'BAD', 'GOOD', 'MAX', 'MIN', 'AVG',
]);

/**
 * markdown body_md 内の ticker mention を `/stock/<TICKER>` 内部リンクに変換する。
 *
 * @param {string} bodyMd   元の markdown テキスト (sanitize 済み)
 * @param {string} articleTicker  記事の主要 ticker (article.ticker)
 * @returns {{ bodyMd: string, linkedTickers: string[] }}
 *   bodyMd: 変換後の markdown
 *   linkedTickers: リンク化された ticker 一覧 (デバッグ / DoD verify 用)
 */
function addTickerInternalLinks(bodyMd, articleTicker) {
  if (!bodyMd || typeof bodyMd !== 'string') {
    return { bodyMd: bodyMd || '', linkedTickers: [] };
  }

  // 初出 tracking set: linked ticker を記録、2 件目以降はスキップ
  const linkedSet = new Set();
  const linkedTickers = [];

  // markdown 内の ticker 認識パターン:
  //   - 大文字 2-5 文字 (A-Z のみ)
  //   - word boundary 相当: 前後が word 文字 (\w) でない位置
  //   - 既存 markdown link [] / () 内は除外
  //
  // アプローチ:
  //   1. 既存の markdown link `[...](...)`、code block ``` 等は変換しない
  //   2. 残りのテキスト部分に対してのみ ticker 置換を実行
  //
  // 実装: テキストを「link / code」と「通常テキスト」に分割して処理
  //   regex で markdown 記法ブロックをキャプチャ → match ごとに通常テキスト部分のみ変換

  // 分割パターン: 既存 markdown link / inline code / code block を preserved block として扱う
  // - `[text](url)` — inline link (already linked)
  // - `\`...\`` — inline code
  // - ```` ```...``` ```` — code block
  const PRESERVED_PATTERN = /(\[([^\]]*)\]\([^)]*\)|`[^`]+`|```[\s\S]*?```)/g;

  // ticker 検出パターン: \b は日本語と組み合わせると機能しないため
  // 前後の char を lookahead/lookbehind で確認
  // 前: 行頭 / 空白 / 日本語文字 / ASCII 句読点
  // 後: 空白 / 日本語文字 / ASCII 句読点 / 行末
  const TICKER_RE = /(?<![A-Z])([A-Z]{2,5})(?![A-Z])/g;

  function replaceInPlainText(text) {
    return text.replace(TICKER_RE, (match, ticker) => {
      // blocklist チェック (英単語と衝突する ticker をスキップ)
      if (TICKER_BLOCKLIST.has(ticker)) return match;

      // 初出チェック
      if (linkedSet.has(ticker)) {
        // 2 件目以降: plain text のまま (自リンク含む)
        return match;
      }

      // 初出: リンク化
      linkedSet.add(ticker);
      linkedTickers.push(ticker);
      return `[${ticker}](/stock/${ticker})`;
    });
  }

  // テキストを preserved blocks と通常テキストに分割して処理
  let result = '';
  let lastIndex = 0;

  for (const m of bodyMd.matchAll(PRESERVED_PATTERN)) {
    // preserved block の前の通常テキスト部分を変換
    const plainBefore = bodyMd.slice(lastIndex, m.index);
    result += replaceInPlainText(plainBefore);
    // preserved block はそのまま追加 (変換しない)
    result += m[0];
    lastIndex = m.index + m[0].length;
  }

  // 残りの通常テキスト部分を変換
  result += replaceInPlainText(bodyMd.slice(lastIndex));

  if (linkedTickers.length > 0) {
    console.log(
      `[build-articles] [P3.7 internal links] ticker リンク化: ${linkedTickers.join(', ')}`,
    );
  }

  return { bodyMd: result, linkedTickers };
}

// ── HTML 生成 ─────────────────────────────────────────────────────────────────

/**
 * dist/index.html を読み込み、記事固有の <head> meta + SSR initial state を注入して返す。
 * P3.3: OGP meta / canonical / Article schema.org JSON-LD を追加。
 * P3.3 W-L2-01 修正: site-wide canonical (/) を記事 page で削除、記事固有 canonical のみ残す。
 *
 * @param {string} baseHtml   dist/index.html の生テキスト
 * @param {Object} article    Supabase から取得した記事レコード
 * @param {string} ogImageUrl OGP image の絶対 URL (og-overlay.mjs が生成、失敗時は default)
 * @returns {string}          完成した HTML 文字列
 */
function buildArticleHtml(baseHtml, article, ogImageUrl) {
  const {
    slug,
    title,
    subtitle,
    body_md = '',   // P3.5: 呼出側 (main) で sanitize 済みの body_md が渡される
    citations = [],
    ticker,
    published_at,
    generated_at,
  } = article;

  // description: subtitle があれば使用、なければ sanitize 済み body_md の先頭 140 字
  // P3.3: og:description に sanitize 適用 (BAD-5/BAD-6 sentence 単位削除)
  // P3.5: body_md は呼出側 (main) で sanitize 済みなので description も安全
  const rawDesc =
    subtitle ||
    body_md
      .replace(/[#*`[\]()]/g, '') // markdown 記号を除去
      .slice(0, 140);
  const description = sanitizeDescription(rawDesc.trim());

  const canonicalUrl = `${CANONICAL_BASE}/articles/${slug}`;
  const pageTitle = title ? `${title} | BeatScanner` : 'BeatScanner Articles';

  // ── Article schema.org JSON-LD (P3.3) ─────────────────────────────────────
  // @type: "Article" (NewsArticle は publisher verification 必要なため Article を使用)
  // dateModified は generated_at (LLM 生成日時) を使用
  const schemaOrg = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title || '',
    description: description,
    datePublished: published_at || generated_at || new Date().toISOString(),
    dateModified: generated_at || published_at || new Date().toISOString(),
    author: {
      '@type': 'Organization',
      name: 'BeatScanner Editor',
    },
    publisher: {
      '@type': 'Organization',
      name: 'BeatScanner',
      logo: {
        '@type': 'ImageObject',
        url: LOGO_URL,
      },
    },
    image: ogImageUrl,
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
  };

  const schemaOrgScript = `<script type="application/ld+json">\n${JSON.stringify(schemaOrg, null, 2)}\n</script>`;

  // ── initial state injection ────────────────────────────────────────────────
  // React app が mount された後に window.__ARTICLE_DATA__ を参照して
  // Supabase fetch を省略できるようにする (P3.2 で ArticlePage が参照)
  //
  // P3.5: body_md は sanitize 済みのものを inject (SSG 経由で hydrate する場合も安全)
  //       SPA 経由では ArticleBody.jsx の render 時に再 sanitize されるため二重安全
  // 重要: 出力 HTML に Supabase key を含めない (pageTitle/description/body_md のみ)
  const articleDataJson = JSON.stringify(
    {
      slug,
      title,
      subtitle,
      body_md,   // sanitize 済み body_md (P3.5)
      citations,
      ticker,
      published_at,
      generated_at,
    },
    null,
    0,
  );

  const initialStateScript = `<script>window.__ARTICLE_DATA__ = ${articleDataJson};</script>`;

  // ── <head> 注入 meta tags (P3.3 完全版) ───────────────────────────────────
  const metaTags = `
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:title" content="${escapeHtml(title || 'BeatScanner')}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:type" content="article" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title || 'BeatScanner')}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
  ${schemaOrgScript}`;

  // dist/index.html の <title> は vite が "Earnings Dashboard" 等を入れている
  // → それを記事固有の <title> で上書き
  let html = baseHtml;

  // 既存 <title> を除去して新しい title + meta を注入
  html = html.replace(/<title>[^<]*<\/title>/, '');

  // W-L2-01 修正: dist/index.html に site-wide canonical が含まれている場合は削除する。
  // 記事 page では記事固有の canonical のみを残す (重複 canonical は SEO に悪影響)。
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/gi,
    '',
  );

  // W-L2-01 拡張: site-wide OGP meta (og:title / og:description / og:image / og:url / og:type) も削除。
  // 記事 page では記事固有の OGP だけを注入するため、既存の汎用 OGP を除去する。
  html = html.replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>/gi, '');
  // twitter card meta も同様に削除
  html = html.replace(/<meta\s+name="twitter:[^"]*"\s+content="[^"]*"\s*\/?>/gi, '');
  // site-wide の application/ld+json も削除 (Article JSON-LD と WebApplication JSON-LD の重複回避)
  html = html.replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');

  // </head> の直前に meta tags + initial state を注入
  html = html.replace('</head>', `${metaTags}\n  ${initialStateScript}\n</head>`);

  // data-testid="article-body" を body 末尾に追加
  // (P3.2 で ArticlePage が mount されると DOM に実際のコンテンツが入る)
  // → SSG の段階では prerender 的な noscript fallback として body_md の先頭を出力
  // P3.5: body_md は sanitize 済みのため noscript preview も安全
  const bodyPreview = body_md.slice(0, 200).replace(/[<>&"']/g, (c) => {
    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c];
  });

  // <div id="root"> の中に SSG 骨格を追加
  // React hydration 時に上書きされるが、HTML grep で testid を確認できる
  const ssrSkeleton = `<noscript data-testid="article-body" id="article-ssr-skeleton">${bodyPreview}...</noscript>`;
  html = html.replace(
    /(<div id="root">)(<\/div>)?/,
    `$1${ssrSkeleton}`,
  );

  return html;
}

/**
 * HTML 属性値で安全なエスケープ
 */
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── article-data.json 生成 ────────────────────────────────────────────────────

/**
 * ArticlePage.jsx (P3.2) が fetch する記事データ JSON を出力する。
 * 静的 HTML と同じ slug dir に配置。
 *
 * P3.5: body_md は sanitize 済みのものを渡す (呼出側 main() で sanitizeBodyText 適用済み)。
 *       SPA 経由で article-data.json を fetch したユーザーも sanitize 済みの body_md を受け取る。
 *
 * 重要: Supabase key は含めない (article の公開データのみ)
 *
 * @param {string} articleDir
 * @param {Object} article     - body_md が sanitize 済みの article オブジェクト
 */
function writeArticleDataJson(articleDir, article) {
  const safeData = {
    slug: article.slug,
    title: article.title,
    subtitle: article.subtitle,
    body_md: article.body_md,   // P3.5: sanitize 済み body_md (呼出側で処理済み)
    citations: article.citations,
    ticker: article.ticker,
    published_at: article.published_at,
    generated_at: article.generated_at,
  };

  const jsonPath = path.join(articleDir, 'article-data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(safeData, null, 2), 'utf-8');
}

// ── モック記事 (--mock フラグ時のテスト用) ────────────────────────────────────

const MOCK_ARTICLES = [
  {
    slug: 'nvda-202605240542',
    title: 'NVDA 2025 Q1 決算詳報 — データセンター売上が市場予想を大幅上回る',
    subtitle: '独自プロトコルによる 5 条件分析と今後のカタリスト',
    body_md: `## エグゼクティブサマリー

NVIDIA の 2025 年 Q1 決算は、データセンター部門の売上高が前年同期比 427% 増の 226 億ドルとなり、アナリスト予想 [1] を 15% 上回った。

## 売上高の内訳

| セグメント | 売上高 | YoY |
|---|---|---|
| データセンター | $22.6B | +427% |
| ゲーミング | $2.6B | +18% |
| プロフェッショナル | $0.4B | -8% |

## 独自プロトコル 5 条件評価

1. 売上高成長率: **PASS** — 前年比 262% 増
2. EPS 成長率: **PASS** — 前年比 461% 増
3. アナリスト予想超過: **PASS** — EPS +15%
4. ガイダンス上方修正: **PASS** — 次四半期 +10%
5. 業界トレンド整合: **PASS** — AI インフラ需要拡大継続
`,
    citations: [
      { id: 1, source_url: 'https://ir.nvidia.com/', title: 'NVIDIA Q1 FY2026 Earnings' },
    ],
    ticker: 'NVDA',
    published_at: '2026-05-24T06:00:00+09:00',
    generated_at: '2026-05-24T05:42:00Z',
  },
  // ── P3.5 Hallucination Guard sanitize テスト用 mock ──────────────────────────
  // BAD-5 (「確実に上昇します」) + BAD-6 (「業界最強の AI チップ」) を含む記事。
  // build 後に dist/articles/sanitize-test-p35/index.html を grep して
  // 違反センテンスが削除されていることを確認 (DoD L3 functional verify)。
  {
    slug: 'sanitize-test-p35',
    title: 'P3.5 Hallucination Guard sanitize テスト記事',
    subtitle: '違反センテンス削除の確認用 mock (本番には公開しない)',
    body_md: `## テスト概要

この記事は Hallucination Guard (第 3 層 frontend sanitize) の動作確認のために生成されたテスト記事です。

## BAD-5 テストセンテンス (削除されるべき)

NVDA は今後確実に上昇します。売上高は前年比 30% 増加が見込まれます。

## BAD-6 テストセンテンス (削除されるべき)

NVIDIA は業界最強の AI チップメーカーとして市場をリードしています。データセンター部門の売上高は 226 億ドルを記録しました。

## 正常センテンス (残るべき)

2025 年 Q1 の EPS は 6.12 ドルでアナリスト予想を 10% 上回った。
次四半期のガイダンスは 450 億ドル (中間値) となった。
`,
    citations: [
      { id: 1, source_url: 'https://ir.nvidia.com/', title: 'NVIDIA Q1 FY2026 Earnings' },
    ],
    ticker: 'NVDA',
    published_at: '2026-05-24T06:00:00+09:00',
    generated_at: '2026-05-24T05:42:00Z',
  },
];

// ── メインルーティン ───────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const useMock = process.argv.includes('--mock');
  console.log(`[build-articles] P3.1 SSG script 開始${useMock ? ' (--mock モード)' : ''}`);

  // ── dist/index.html 存在確認 ───────────────────────────────────────────────
  if (!fs.existsSync(DIST_INDEX)) {
    console.warn(
      `[build-articles] ${DIST_INDEX} が見つかりません。vite build を先に実行してください。スキップ。`,
    );
    return;
  }

  const baseHtml = fs.readFileSync(DIST_INDEX, 'utf-8');

  // ── Supabase から記事 fetch (--mock フラグ時はモック記事を使用) ──────────────
  const articles = useMock
    ? MOCK_ARTICLES
    : await fetchPublishedArticles();

  if (articles.length === 0) {
    console.warn(
      '[build-articles] 記事が 0 件です。dist/articles/ は生成されません。',
    );
    // build は fail させない (silent-fail)
    return;
  }

  // ── dist/articles/ ディレクトリ作成 ────────────────────────────────────────
  if (!fs.existsSync(ARTICLES_DIR)) {
    fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  }

  // ── dist/articles/og/ ディレクトリ作成 (P3.3 OGP image 出力先) ─────────────
  if (!fs.existsSync(OG_IMAGE_DIR)) {
    fs.mkdirSync(OG_IMAGE_DIR, { recursive: true });
  }

  // ── 各記事の HTML + JSON 生成 ─────────────────────────────────────────────
  let successCount = 0;
  for (const article of articles) {
    if (!article.slug) {
      console.warn('[build-articles] slug が空の記事をスキップ:', article);
      continue;
    }

    try {
      const articleDir = path.join(ARTICLES_DIR, article.slug);
      if (!fs.existsSync(articleDir)) {
        fs.mkdirSync(articleDir, { recursive: true });
      }

      // P3.5: Hallucination Guard 第 3 層 (SSG path) — body_md を sanitize
      //       SPA 経由: ArticleBody.jsx の render 時に sanitize (2 系統とも適用)
      //       SSG 経由: ここで sanitize → buildArticleHtml / writeArticleDataJson 両方に反映
      const { text: sanitizedBodyMd, sanitized: bodyWasSanitized } = sanitizeBodyText(
        article.body_md || '',
      );
      if (bodyWasSanitized) {
        console.log(
          `[build-articles] [Hallucination Guard] slug=${article.slug}: ` +
          `body_md に BAD-5/BAD-6 violation を検出、 違反センテンスを削除しました。`,
        );
      }
      // sanitize 済み body_md を持つ article オブジェクトを作成 (元オブジェクトを mutate しない)
      // P3.7: sanitize 後に ticker mention internal linking を適用
      //       order: sanitize → internal link (sanitize で安全化してから link 化)
      const { bodyMd: linkedBodyMd } = addTickerInternalLinks(
        sanitizedBodyMd,
        article.ticker || '',
      );
      const sanitizedArticle = { ...article, body_md: linkedBodyMd };

      // P3.3: OGP image 生成 (og-overlay.mjs 経由、失敗時は default PNG URL)
      // eslint-disable-next-line no-await-in-loop
      const ogImageUrl = await resolveOgImageUrl(article, OG_IMAGE_DIR);

      // index.html 生成 (P3.5: sanitizedArticle を渡して body_md sanitize 済みで処理)
      const html = buildArticleHtml(baseHtml, sanitizedArticle, ogImageUrl);
      const htmlPath = path.join(articleDir, 'index.html');
      fs.writeFileSync(htmlPath, html, 'utf-8');

      // article-data.json 生成 (P3.5: sanitizedArticle を渡して body_md sanitize 済みで出力)
      writeArticleDataJson(articleDir, sanitizedArticle);

      console.log(`[build-articles] 生成完了: dist/articles/${article.slug}/ (OG: ${ogImageUrl})`);
      successCount++;
    } catch (err) {
      console.warn(
        `[build-articles] slug=${article.slug} の生成に失敗 (スキップ):`,
        err.message,
      );
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[build-articles] 完了: ${successCount}/${articles.length} 件生成 (${elapsed}s)`,
  );

  if (elapsed > 15) {
    console.warn(
      '[build-articles] 警告: build 時間が 15 秒を超えました。記事数が増えたら incremental build を検討してください。',
    );
  }
}

main().catch((err) => {
  console.error('[build-articles] 予期しないエラー:', err);
  // build を fail させない (silent-fail)
  process.exit(0);
});
