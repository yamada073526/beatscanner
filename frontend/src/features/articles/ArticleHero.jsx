/**
 * ArticleHero.jsx — 記事 Hero section (title + subtitle + 発行日 + ticker badge)
 *
 * SPEC P3.2:
 *   - data-testid="article-hero" が DOM に存在
 *   - Noto Serif JP / Aman/Ritz-Carlton 級洗練
 *   - design_system.md token のみ使用 (hex 直書き禁止)
 *   - _sanitized フラグ時は「※一部表現を編集しました」 note 表示 (Trust Cliff 防止)
 *
 * 5 原則:
 *   - 原則 1「2 秒理解」: title + subtitle + 日付で即座に記事価値を判断可能
 *   - 原則 3「シンプル & リッチ」: Noto Serif JP + gold 数字 highlight = FT Weekend 級
 */

/**
 * ISO 8601 日時を「2026 年 5 月 24 日」形式に変換 (ロケール依存なし)
 * @param {string|null} isoStr
 * @returns {string}
 */
function formatPublishedAt(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y} 年 ${m} 月 ${day} 日公開`;
  } catch {
    return '';
  }
}

/**
 * v116 R6 verdict 正規化 (UI/UX P2、 multi-review verdict)
 *   - BEAT / PASS: 緑 (--color-gain)
 *   - MISS / FAIL: 赤 (--color-loss)
 *   - WATCH / unknown: amber (--color-warning) — default
 */
function normalizeVerdict(verdict) {
  const v = String(verdict || '').toUpperCase();
  if (v === 'BEAT' || v === 'PASS') return { label: 'BEAT', tone: 'gain' };
  if (v === 'MISS' || v === 'FAIL') return { label: 'MISS', tone: 'loss' };
  return { label: 'WATCH', tone: 'warning' };
}

export default function ArticleHero({ title, subtitle, ticker, published_at, verdict, _sanitized }) {
  const dateLabel = formatPublishedAt(published_at);
  const verdictInfo = normalizeVerdict(verdict);

  return (
    <header
      data-testid="article-hero"
      className="article-hero"
    >
      {/* ticker + verdict badge row (v116 R6 UI/UX P2) */}
      <div className="article-hero__badge-row">
        {ticker && (
          <div className="article-hero__ticker-badge">
            {ticker}
          </div>
        )}
        <div
          className={`article-hero__verdict-badge article-hero__verdict-badge--${verdictInfo.tone}`}
          data-testid="article-hero-verdict"
          aria-label={`判定: ${verdictInfo.label}`}
        >
          {verdictInfo.label}
        </div>
      </div>

      {/* 記事 title — Noto Serif JP で FT Weekend idiom */}
      <h1 className="article-hero__title">
        {title || '記事タイトル'}
      </h1>

      {/* subtitle / 導入文 */}
      {subtitle && (
        <p className="article-hero__subtitle">
          {subtitle}
        </p>
      )}

      {/* メタ行 (発行日 + 著者 attribution) */}
      <div className="article-hero__meta">
        {dateLabel && (
          <time className="article-hero__date" dateTime={published_at || ''}>
            {dateLabel}
          </time>
        )}
        <span className="article-hero__author">BeatScanner Editor</span>
      </div>

      {/* Hallucination Guard 透明性 note (P3.5 sanitize フラグが立った場合) */}
      {_sanitized && (
        <p className="article-hero__sanitized-note">
          ※ 一部表現を編集しました
        </p>
      )}
    </header>
  );
}
