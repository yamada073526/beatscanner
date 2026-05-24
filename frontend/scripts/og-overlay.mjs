/**
 * og-overlay.mjs — OGP image 生成スクリプト (P3.3)
 *
 * 役割:
 *   `frontend/public/og/template.svg` の placeholder ({{TICKER}} 等) を記事データで置換し、
 *   @resvg/resvg-js で PNG 化して `dist/articles/og/<slug>.png` に出力する。
 *
 * 設計方針:
 *   - build-time only: bundle に影響しない (devDependency の @resvg/resvg-js)
 *   - 失敗時は static default PNG (frontend/public/og/default.png) を参照する URL を返す
 *   - headline は 28 字で折り返し (OGP 1200x630 の読みやすさ基準)
 *   - verdict に応じて badge の色を変える (BEAT=green / MISS=red / WATCH=amber)
 *
 * 注意:
 *   - @resvg/resvg-js は native addon。Railway build 環境で動作するが、
 *     M1/M2 Mac ではアーキテクチャ対応版 (resvg-js@2.6+) が必要。
 *   - template.svg の {{HEADLINE_L1}} / {{HEADLINE_L2}} は 28 字ずつ分割して渡す。
 *
 * memory anchors:
 *   - feedback_brand_aspiration.md (Aman/Ritz-Carlton 級)
 *   - design_system.md §1 token (--color-gold / --color-gain / --color-loss / --color-warning)
 *   - project_pane45_redesign.md (v113 P3.3 OGP A 案採用)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 定数 ─────────────────────────────────────────────────────────────────────

const TEMPLATE_SVG_PATH = path.resolve(__dirname, '../public/og/template.svg');
const DEFAULT_OG_PNG_URL = '/og/default.png';

// CANONICAL_BASE は build-articles.mjs と同じ値を参照
const CANONICAL_BASE =
  process.env.VITE_PUBLIC_SITE_URL ||
  'https://beatscanner-production.up.railway.app';

// OGP headline の折り返し文字数 (1200px 幅で font-size 54px の場合の目安)
const HEADLINE_MAX_CHARS = 22;

// ── ヘルパー ──────────────────────────────────────────────────────────────────

/**
 * headline を HEADLINE_MAX_CHARS 字で折り返し、2 行分を返す。
 * 超過分は省略 (SEO 的に 60 字以内が理想)。
 *
 * @param {string} headline
 * @returns {{ line1: string, line2: string }}
 */
function splitHeadline(headline) {
  if (!headline) return { line1: '', line2: '' };
  const str = String(headline);
  if (str.length <= HEADLINE_MAX_CHARS) {
    return { line1: str, line2: '' };
  }
  const line1 = str.slice(0, HEADLINE_MAX_CHARS);
  const rest = str.slice(HEADLINE_MAX_CHARS);
  // 2 行目は最大 HEADLINE_MAX_CHARS 字、超過は「...」で省略
  const line2 =
    rest.length <= HEADLINE_MAX_CHARS
      ? rest
      : rest.slice(0, HEADLINE_MAX_CHARS - 1) + '…';
  return { line1, line2 };
}

/**
 * verdict 文字列を BEAT / MISS / WATCH に正規化
 *
 * @param {string|null} verdict
 * @returns {{ label: string, color: string, strokeColor: string, bgFill: string }}
 */
function normalizeVerdict(verdict) {
  const v = String(verdict || '').toUpperCase();
  if (v === 'BEAT' || v === 'PASS') {
    return {
      label: 'BEAT',
      color: '#34EF81',         // --color-gain
      strokeColor: 'rgba(52,239,129,0.5)',
      bgFill: 'rgba(52,239,129,0.15)',
    };
  }
  if (v === 'MISS' || v === 'FAIL') {
    return {
      label: 'MISS',
      color: '#F87171',         // --color-loss
      strokeColor: 'rgba(248,113,113,0.5)',
      bgFill: 'rgba(248,113,113,0.15)',
    };
  }
  // WATCH / unknown
  return {
    label: 'WATCH',
    color: '#F59E0B',           // --color-warning
    strokeColor: 'rgba(245,158,11,0.5)',
    bgFill: 'rgba(245,158,11,0.15)',
  };
}

/**
 * ISO 8601 日時を「2026 年 5 月 24 日」形式に変換 (ArticleHero.jsx と同等)
 *
 * @param {string|null} isoStr
 * @returns {string}
 */
function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  } catch {
    return '';
  }
}

/**
 * SVG の XML 属性値で安全なエスケープ
 *
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── 主処理 ────────────────────────────────────────────────────────────────────

/**
 * 記事データから OGP PNG を生成し、出力パスを返す。
 * 失敗時は null を返す (呼び出し側で default OG URL を使う)。
 *
 * @param {Object} params
 * @param {string} params.slug
 * @param {string} params.title
 * @param {string|null} params.ticker
 * @param {string|null} params.published_at
 * @param {string|null} params.verdict  — BEAT / MISS / WATCH (optional, P3.1 schema)
 * @param {string} params.outDir        — dist/articles/og のような出力先 dir
 * @returns {Promise<string|null>}       — 生成した PNG の相対 URL (/articles/og/<slug>.png) or null
 */
export async function generateOgImage({ slug, title, ticker, published_at, verdict, outDir }) {
  // ── template.svg 読み込み ──────────────────────────────────────────────────
  let templateSvg;
  try {
    templateSvg = fs.readFileSync(TEMPLATE_SVG_PATH, 'utf-8');
  } catch (err) {
    console.warn('[og-overlay] template.svg 読み込み失敗:', err.message);
    return null;
  }

  // ── placeholder 置換 ───────────────────────────────────────────────────────
  const { line1, line2 } = splitHeadline(title || '');
  const verdictInfo = normalizeVerdict(verdict);
  const dateLabel = formatDate(published_at);
  const tickerLabel = (ticker || 'BeatScanner').toUpperCase();

  let svg = templateSvg
    .replace(/\{\{TICKER\}\}/g, escapeXml(tickerLabel))
    .replace(/\{\{HEADLINE_L1\}\}/g, escapeXml(line1))
    .replace(/\{\{HEADLINE_L2\}\}/g, escapeXml(line2))
    .replace(/\{\{DATE\}\}/g, escapeXml(dateLabel))
    .replace(/\{\{VERDICT\}\}/g, escapeXml(verdictInfo.label));

  // verdict badge の色を動的に置き換え (template では green がデフォルト)
  // verdict-bg: fill と stroke を verdict 色に差し替え
  svg = svg
    .replace(
      /(<rect id="verdict-bg"[^>]*fill=")[^"]*("[^>]*stroke=")[^"]*(")/,
      `$1${verdictInfo.bgFill}$2${verdictInfo.strokeColor}$3`,
    )
    .replace(
      /(<text id="verdict-text"[^>]*fill=")[^"]*(")/,
      `$1${verdictInfo.color}$2`,
    );

  // HEADLINE_L2 が空の場合は該当 <text> を非表示に
  if (!line2) {
    svg = svg.replace(
      /(<text id="headline-line2"[^>]*)>/,
      '$1 visibility="hidden">',
    );
  }

  // ── @resvg/resvg-js で SVG → PNG 変換 ────────────────────────────────────
  let pngBuffer;
  try {
    // dynamic import: build-time only dep なので静的 import しない
    const { Resvg } = await import('@resvg/resvg-js');
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: 'width',
        value: 1200,
      },
      font: {
        // Railway build 環境ではシステムフォントが限られるため、
        // Noto Serif JP は embed せず Inter / system-ui にフォールバック
        loadSystemFonts: true,
        defaultFontFamily: 'Inter',
      },
    });
    pngBuffer = resvg.render().asPng();
  } catch (err) {
    console.warn('[og-overlay] SVG → PNG 変換失敗 (@resvg/resvg-js):', err.message);
    return null;
  }

  // ── PNG を dist/articles/og/<slug>.png に書き出し ─────────────────────────
  try {
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const pngPath = path.join(outDir, `${slug}.png`);
    fs.writeFileSync(pngPath, pngBuffer);

    const sizeKb = Math.round(pngBuffer.length / 1024);
    console.log(`[og-overlay] OG image 生成: dist/articles/og/${slug}.png (${sizeKb} KB)`);

    if (pngBuffer.length < 1024) {
      console.warn(`[og-overlay] 警告: ${slug}.png が 1KB 未満です (空 PNG の可能性)`);
    }

    return `/articles/og/${slug}.png`;
  } catch (err) {
    console.warn('[og-overlay] PNG 書き出し失敗:', err.message);
    return null;
  }
}

/**
 * OGP image URL を決定する。
 * generateOgImage が成功すれば slug 固有 PNG、失敗時は default PNG URL。
 *
 * @param {Object} article   - Supabase 記事レコード
 * @param {string} outDir    - dist/articles/og 絶対パス
 * @returns {Promise<string>} - 絶対 OGP image URL
 */
export async function resolveOgImageUrl(article, outDir) {
  const { slug, title, ticker, published_at } = article;

  // verdict は articles table スキーマ上 optional (P3.1 schema に含まれない場合あり)
  const verdict = article.verdict || null;

  const relativeUrl = await generateOgImage({
    slug,
    title,
    ticker,
    published_at,
    verdict,
    outDir,
  });

  if (relativeUrl) {
    return `${CANONICAL_BASE}${relativeUrl}`;
  }

  // fallback: static default PNG (frontend/public/og/default.png が存在する場合)
  console.warn(`[og-overlay] slug=${slug} の OG image 生成失敗、default を使用`);
  return `${CANONICAL_BASE}${DEFAULT_OG_PNG_URL}`;
}
