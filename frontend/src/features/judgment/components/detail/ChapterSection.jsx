/**
 * ChapterSection — Phase G Phase 3 (handover v99 §0-D)
 *
 * 章扉「N. <title>」 (Noto Serif JP / gold accent) を共通化する汎用 wrapper。
 * UnifiedJudgmentSection (章 1) を generalize し、 章 2-5 で再利用可能に。
 *
 * 2 mode:
 *   - **default (wrap mode)**: children を section body 内に wrap (章 1 と同じ)
 *   - **headerOnly={true}**: 章扉のみ render、 body は wrap しない (章 2-5 で content 再配置を避けつつ
 *     gold 章扉 brand 一貫性 [[feedback-gold-accent-continuity]] を実現)
 *
 * Phase 4-6 で section 再配置時に wrap mode へ移行する path 維持。
 */
import React from 'react';

/**
 * @param {object} props
 * @param {string} props.chapterNumber - 章番号 ("I", "II", "III"...)、 ローマ数字推奨 (Aman menu idiom)
 * @param {string} props.chapterTitle - 章タイトル ("判定", "数値"...)
 * @param {React.ReactNode} [props.children] - wrap mode のみ使用
 * @param {boolean} [props.headerOnly=false] - true で章扉のみ render (body wrap なし)
 * @param {'main'|'sub'} [props.tier='main'] - v99 dogfood 3 体合議 verdict (2+3 構成):
 *   - 'main': 大柱 (I. 判定 / III. 市場評価) — Noto Serif JP 18px + gold hairline + 番号大書き
 *   - 'sub' : 副柱 (II. 数値 / IV. テクニカル / V. リファレンス) — sans 13px medium + muted + 番号小さく
 * @param {boolean} [props.frameless=false] - Phase 2 frameless mode (wrap mode のみ有効)
 */
export default function ChapterSection({
  chapterNumber,
  chapterTitle,
  children,
  headerOnly = false,
  tier = 'main',
  frameless = false,
}) {
  const headingId = `chapter-heading-${String(chapterNumber).toLowerCase()}`;
  const tierClass = tier === 'sub' ? 'judgment-chapter-heading--sub' : 'judgment-chapter-heading';
  const headerJsx = (
    <header className={tierClass}>
      <span className="judgment-chapter-number" aria-hidden="true">{chapterNumber}.</span>
      <h2 id={headingId} className="judgment-chapter-title">
        {chapterTitle}
      </h2>
    </header>
  );

  if (headerOnly) {
    // 章扉のみ mode: section/article wrap せず、 inline で章扉を出す。
    // 既存 section content (Guidance / EarningsHistory 等) はそのまま、 上に章扉を追加する形。
    const tierModifier = tier === 'sub' ? 'chapter-section--sub' : '';
    return (
      <div
        className={`chapter-section chapter-section--header-only ${tierModifier}`.trim()}
        data-chapter-number={chapterNumber}
        data-chapter-tier={tier}
        data-testid={`chapter-section-${String(chapterNumber).toLowerCase()}-header`}
      >
        {headerJsx}
      </div>
    );
  }

  // wrap mode: 章 1 と同じ全 wrap、 sub-component 全体を章 body に包む
  const bodyClass = frameless
    ? 'judgment-chapter-body is-frameless-children'
    : 'judgment-chapter-body';
  return (
    <section
      className={`judgment-chapter chapter-section--wrap`}
      aria-labelledby={headingId}
      data-chapter-number={chapterNumber}
      data-testid={`chapter-section-${String(chapterNumber).toLowerCase()}`}
    >
      {headerJsx}
      <div className={bodyClass}>
        {children}
      </div>
    </section>
  );
}
