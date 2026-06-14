/**
 * ModalSummary — 全 ?/ⓘ モーダル末尾の「まとめカード + 免責」共有プリミティブ (LOOK の SSOT)。
 *
 * 視覚の正典は CompassInfoButton (状態コンパスの ⓘ モーダル)。本モジュールはその summary/disclaimer の
 * スタイルを切り出し、コンパス以外のモーダル (5 条件 / グラフの見方 等) からも同一の見た目で使えるようにする。
 * 2026-06-14 user 依頼「全モーダルの書式を統一」: まとめ = 枠カード + 全文太字 + 見出しなし、末尾に免責。
 *
 * @no-llm: 静的テキスト専用。色は semantic token (color-mix で cyan 強調) のみ、raw hex / box-shadow なし。
 */
import React from 'react';
import { MODAL_DISCLAIMER } from '../features/judgment/constants/stateCompassText.js';

export { MODAL_DISCLAIMER };

// まとめカード: cyan 25% 枠 + cyan 5% 背景 (CompassInfoButton の summaryCardStyle と同値 = SSOT)。
export const MODAL_SUMMARY_CARD_STYLE = {
  border: '1px solid color-mix(in srgb, var(--color-accent) 25%, var(--border))',
  borderRadius: 'var(--radius-md, 12px)',
  padding: 'var(--space-4, 16px)',
  background: 'color-mix(in srgb, var(--color-accent) 5%, transparent)',
};
// まとめ本文: 枠内すべて太字 (fontWeight 600) + 見出しなし (user 模範)。
export const MODAL_SUMMARY_TEXT_STYLE = { margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.7, color: 'var(--text-primary)' };
// 免責: 小さく muted、モーダルシェル上に直接置く (枠なし)。
export const MODAL_DISCLAIMER_STYLE = { margin: 0, fontSize: 11.5, fontWeight: 500, lineHeight: 1.6, color: 'var(--text-muted)' };

/** まとめカード (枠 + 全文太字 + 見出しなし)。コンパス以外のモーダル末尾用。mb で次要素 (免責) と間隔。 */
export function ModalSummaryCard({ children }) {
  return (
    <div style={{ ...MODAL_SUMMARY_CARD_STYLE, marginBottom: 'var(--space-3, 12px)' }}>
      <p style={MODAL_SUMMARY_TEXT_STYLE}>{children}</p>
    </div>
  );
}

/** モーダル末尾の標準免責 (§38)。既定文言は MODAL_DISCLAIMER (SSOT)。 */
export function ModalDisclaimer({ text = MODAL_DISCLAIMER }) {
  return <p style={MODAL_DISCLAIMER_STYLE}>{text}</p>;
}
