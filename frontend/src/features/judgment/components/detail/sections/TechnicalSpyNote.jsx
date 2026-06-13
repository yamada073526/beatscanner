/**
 * TechnicalSpyNote — 完全性台帳 Sprint3 #4 (SPEC_2026-06-13)
 *
 * @no-llm: 静的文言のみ。LLM API 呼び出し禁止。
 *
 * SPY 取得失敗 (technical の patterns.{cup_handle,rs}.spy_unavailable === true) のときだけ、テクニカル章で
 * 「地合いデータ未取得」 を §38 中立表現で示す。地合い依存指標 (カップ形成 / RS) が空になる理由を文脈提示し、
 * user が「なぜ RS / カップ形成が空なのか」 を裏取りせず腹落ちできるようにする (qa S-5)。
 *
 * §38: 「地合いが悪い (= 売り)」 ではなく「地合いデータを取得できていない」 という取得状況の事実のみ
 *   (verdict に読ませない)。色中立 (warning 琥珀を使わない)。SPY 取得成功 / 不明では何も出さない
 *   (常時表示しない = 誤警告回避 B-5、§2 静かさ)。
 *
 * 配置: JudgmentDetail の chartBlock 内に1箇所 mount することで isV5 / isV4 / legacy 全 path のテクニカル章に
 *   到達する (TechnicalChapterSummary が legacy path 専用で default に届かなかった問題を回避、敵対的検証 major)。
 *   technical は dedupGet 化済 → StockPriceChart / CompletenessRollupBadge / prefetch と coalesce (追加 fetch なし)。
 *
 * 設計境界: module-level component。新規 glow host を作らない。data-testid は表示時 (spy_unavailable=true) のみ
 *   付与する条件付き注記 (banner idiom)。
 */
import React, { useEffect, useState } from 'react';
import { fetchTechnical, TECHNICAL_CANONICAL_PATTERNS } from '../../../../../api.js';

const TESTID = 'technical-spy-unavailable';

/**
 * @param {object} props
 * @param {string|null} props.ticker
 */
export default function TechnicalSpyNote({ ticker }) {
  const [spyUnavailable, setSpyUnavailable] = useState(null); // true=取得失敗 / false=取得成功 / null=不明

  useEffect(() => {
    setSpyUnavailable(null); // ticker 切替で他銘柄の残骸を出さない
    if (!ticker) return undefined;
    let cancelled = false;
    fetchTechnical(ticker, TECHNICAL_CANONICAL_PATTERNS)
      .then((res) => {
        if (cancelled) return;
        const p = res?.patterns || {};
        setSpyUnavailable(p?.cup_handle?.spy_unavailable ?? p?.rs?.spy_unavailable ?? null);
      })
      .catch(() => {
        if (cancelled) return; // CompletenessRollupBadge の catch と対称に cancelled guard を明示
      });
    return () => { cancelled = true; };
  }, [ticker]);

  // 取得成功 / 不明では何も描かない。取得失敗のときだけ中立注記を出す。
  if (spyUnavailable !== true) return null;
  return (
    <p data-testid={TESTID} data-state="main" style={noteStyle}>
      地合いデータ未取得（SPY取得失敗）。カップ形成・RS 等の地合い依存指標は算出されません。
    </p>
  );
}

const noteStyle = {
  margin: 'var(--space-2, 8px) 0 0 0',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--text-secondary)', // 色中立 (warning 琥珀を使わない = verdict に読ませない)
};
