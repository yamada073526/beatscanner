/**
 * StateCompass — Pane3 冒頭の「状態コンパス」 (D2 累進開示・第2手プロトタイプ、?pane3_compass=1)
 *
 * 初心者の「で、買いですか?」に §38-safe に答える試み: 決算 / 会社 / 価格 の3つの「事実」を
 * 2秒で読めるように並べる (5原則 1=2秒 + 5=図解、北極星=人力の代替)。冒頭で「5条件のみで
 * Beat/Miss を判定」していた構成 (AMZN/GOOG しか緑にならない名前負け) を脱却し、決算サプライズ
 * (本物の予想比) + 会社の5条件 + 価格(テクニカル) の3層で「今の状態」を提示する。
 *
 * @no-llm: backend 計算済値の整形のみ。判断語・最上級・売買推奨なし (§38/§5)。
 *   - 決算: classifySurprise / fmtSurprisePct (earningsFlashTemplates、backend surprise_pct を読むだけ・再計算禁止)
 *   - 会社: result.passedCount / totalCount (5条件 N/5、連続量。binary PASS/FAIL でない)
 *   - 価格: fetchTechnical を独立呼出 (TECHNICAL_CANONICAL_PATTERNS で 5枚カードと同一 URL→dedupGet cache hit)
 *           → classifyBuyZone / BUY_ZONE_LABEL_JP (「目安」idiom、§38 safe)。色は amber 固定
 *           (緑にすると「買い」暗示で §38 risk、金融 opus verdict)。
 *
 * 設計境界 (designing-workspace-ui):
 *   - 新規 glow host を作らない (wrapper は class なし div + semantic token のみ)
 *   - raw hex / box-shadow / !important 禁止、semantic CSS token のみ
 *   - module-level component (inline 関数 component 禁止 = feedback_pane_error_boundary)
 *   - loading/errored/empty/main 全 render path に data-testid (feedback_testid_all_render_paths)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { fetchTechnical, TECHNICAL_CANONICAL_PATTERNS } from '../../../../../api.js';
import { classifySurprise, SURPRISE_VERDICT_JP, fmtSurprisePct } from '../../../constants/earningsFlashTemplates.js';
import { classifyBuyZone, BUY_ZONE_LABEL_JP } from '../../../../../lib/buyZoneLabels.js';

const TESTID = 'state-compass';

// 信号 → semantic token 色 (投資業界色ルール: gain=緑/loss=赤/warning=amber/neutral=muted)
const SIGNAL_COLOR = {
  good: 'var(--color-gain)',
  warn: 'var(--color-warning)',
  bad: 'var(--color-loss)',
  neutral: 'var(--text-muted)',
};

// 決算セル: 予想比サプライズ (±3% 分類) を事実として提示
function earningsCell(guidance) {
  const pct = guidance?.eps?.surprise_pct;
  const cls = classifySurprise(pct); // 'beat'|'inline'|'miss'|null
  if (!cls) {
    return { signal: 'neutral', value: '判定待ち', hint: '直近四半期の決算がまだ発表されていません' };
  }
  const map = {
    beat: { signal: 'good', value: '予想より良かった' },
    inline: { signal: 'warn', value: 'ほぼ予想どおり' },
    miss: { signal: 'bad', value: '予想を下回った' },
  };
  const m = map[cls];
  return {
    signal: m.signal,
    value: `${m.value}（${SURPRISE_VERDICT_JP[cls]}）`,
    hint: `アナリスト平均との差は ${fmtSurprisePct(pct)}（Beat/Miss の目安は ±3%）`,
  };
}

// 会社セル: 5条件 N/5 (連続量、binary でない)
function companyCell(result) {
  const passed = result?.passedCount;
  const total = Number.isFinite(result?.totalCount) ? result.totalCount : 5;
  if (!Number.isFinite(passed)) {
    return { signal: 'neutral', value: '—', hint: '5条件の判定データがありません' };
  }
  const signal = passed >= 4 ? 'good' : passed >= 2 ? 'warn' : 'bad';
  return {
    signal,
    value: `${total}項目中 ${passed}つが基準クリア`,
    hint: '独自プロトコルの5条件（成長性・持続性・財務・Beat履歴・割安度）',
  };
}

export default function StateCompass({ selectedTicker, result, guidance }) {
  const [technical, setTechnical] = useState(null);
  const [techLoading, setTechLoading] = useState(false);

  // 価格セルのテクニカルデータを独立 fetch (5枚カードと同一 URL → dedupGet cache hit)。
  useEffect(() => {
    if (!selectedTicker) return undefined;
    let cancelled = false;
    setTechLoading(true);
    fetchTechnical(selectedTicker, TECHNICAL_CANONICAL_PATTERNS)
      .then((t) => { if (!cancelled) setTechnical(t || null); })
      .catch(() => { if (!cancelled) setTechnical(null); })
      .finally(() => { if (!cancelled) setTechLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTicker]);

  const priceCell = useMemo(() => {
    const state = technical?.patterns?.cup_handle?.state || null;
    const zone = classifyBuyZone(state);
    if (zone === 'unknown') {
      return {
        signal: 'neutral',
        value: techLoading ? '取得中…' : '判定なし',
        hint: techLoading ? 'テクニカルデータを取得しています' : '明確なテクニカル局面は検出されていません',
      };
    }
    return {
      // user 確定: 価格は amber 固定 (中立・注目。緑=「買い」暗示で §38 risk)
      signal: 'warn',
      value: BUY_ZONE_LABEL_JP[zone] || '—',
      hint: '価格が事前定義の参考水準に近い局面です（詳細はテクニカルで確認できます）',
    };
  }, [technical, techLoading]);

  // result 未取得時は描画しない (empty state も testid を残す = 全 render path testid)
  if (!result) {
    return <div data-testid={TESTID} data-state="empty" aria-hidden="true" />;
  }

  const cells = [
    { key: 'earnings', label: '決算の出来', ...earningsCell(guidance) },
    { key: 'company', label: '会社の地力', ...companyCell(result) },
    { key: 'price', label: '今の価格', ...priceCell },
  ];

  return (
    <div data-testid={TESTID} data-state="main" style={wrapperStyle}>
      <div style={headingStyle}>今の状態 — 3つの事実</div>
      <div style={cellsRowStyle}>
        {cells.map((c) => (
          <div
            key={c.key}
            data-testid={`${TESTID}-${c.key}`}
            style={{ ...cellStyle, borderLeftColor: SIGNAL_COLOR[c.signal] }}
          >
            <div style={cellLabelStyle}>{c.label}</div>
            <div style={{ ...cellValueStyle, color: SIGNAL_COLOR[c.signal] }}>{c.value}</div>
            <div style={cellHintStyle}>{c.hint}</div>
          </div>
        ))}
      </div>
      <p style={disclaimerStyle}>
        独自プロトコルでは、これらの観点が揃う状態を「注視水準」と定義します（基準値は各セルの目安）。
        これは売買の推奨ではありません。買うかどうかはご自身の判断です。
      </p>
    </div>
  );
}

// --- styles (semantic CSS token のみ、raw hex / box-shadow 禁止) ---
const wrapperStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3, 12px)',
  marginBottom: 'var(--space-4, 16px)',
};
const headingStyle = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
};
const cellsRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3, 12px)',
};
const cellStyle = {
  flex: '1 1 180px',
  minWidth: 0,
  borderLeft: '3px solid var(--border)',
  paddingLeft: 'var(--space-3, 12px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1, 4px)',
};
const cellLabelStyle = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};
const cellValueStyle = {
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.3,
};
const cellHintStyle = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  lineHeight: 1.4,
};
const disclaimerStyle = {
  margin: 0,
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-muted)',
  lineHeight: 1.5,
};
