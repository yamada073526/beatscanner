/**
 * diagramEssence.js — Pane3 図解最上段「一言で言うと」L1 essence hero のデータ導出 + flag + style (B7 第一手)。
 *
 * B7 図解方向性「(C) 累進開示」の第一手。初心者が図解を開いた瞬間に「この会社は何で稼ぐか + 今期の決算の
 * 出来」を 2 秒で掴ませる最上段ブロック。状態コンパス(?pane3_compass=1)の累進開示と同じ設計言語。
 *
 * @no-llm: 新規 LLM 呼び出しなし。既存確定フィールド (segmentSummary 首位 / businessFlowSteps[0] /
 *   guidance verdict) の静的 mirror のみ。状態コンパス stateCompassText.js と同型。
 *
 * §38/§5: 描写のみ (買い場/勝てる/有望/最高/絶対/必ず上がる 等の断定・最上級・売買示唆を入れない)。
 *   Beat/Miss は guidance の既存 verdict (±3% Python 判定) の mirror で独自再計算しない (5 条件 PASS/FAIL は
 *   流用しない = D2 状態コンパスの「名前負け」轍を踏まない)。色は投資業界ルール (beat=gain緑 / miss=loss赤 /
 *   それ以外=neutral)、シアンを上昇の意味で使わない。数値は frontend で再計算しない (% 算出もしない)。
 */

// flag: ?diagram_essence=1 で default OFF・完全可逆 (pane3_v2 と同型の URL→storage 永続化)。
// URL param を最優先で読み、見たら localStorage に persist する。これで一度 ?diagram_essence=1 を踏めば、
// 以後 app 内 navigation で param が書き換わっても (例: ?ticker=X&__r=1) flag が維持される。
// =0 で即 OFF (storage も削除)、param 無しは storage 値を引き継ぐ。完全可逆。
export function isDiagramEssence() {
  if (typeof window === 'undefined') return false;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('diagram_essence');
    if (urlParam === '1') {
      try { window.localStorage.setItem('diagram_essence', '1'); } catch { /* private mode 等は silent */ }
      return true;
    }
    if (urlParam === '0') {
      try { window.localStorage.removeItem('diagram_essence'); } catch { /* silent */ }
      return false;
    }
    return window.localStorage?.getItem('diagram_essence') === '1';
  } catch {
    return false;
  }
}

// guidance verdict → essence chip の表示ラベル + 事実色 tone。
// 'beat'/'miss' 以外 (in-line / unknown / 不明 / null) は neutral = 緑赤を出さない (誤発火防止)。
const VERDICT_LABEL = { beat: 'Beat', miss: 'Miss', 'in-line': '概ね一致' };
export function verdictTone(v) {
  if (v === 'beat') return 'gain';
  if (v === 'miss') return 'loss';
  return 'neutral';
}
export function verdictLabel(v) {
  return VERDICT_LABEL[v] || '判定材料待ち';
}

// tone → semantic token 色 (raw hex 禁止)。
export function toneColor(t) {
  if (t === 'gain') return 'var(--color-gain)';
  if (t === 'loss') return 'var(--color-loss)';
  return 'var(--text-muted)';
}
export function toneBg(t) {
  if (t === 'gain') return 'color-mix(in srgb, var(--color-gain) 12%, transparent)';
  if (t === 'loss') return 'color-mix(in srgb, var(--color-loss) 12%, transparent)';
  return 'var(--bg-subtle)';
}

// 首位セグメント (value_b 最大 = 主力事業)。displaySegmentName は呼び出し側 (DiagramCard) で適用。
// businessFlowSteps は value-chain のステップ図で「主力事業」ではないため、segment を優先する。
export function topSegment(data) {
  const segs = data?.segmentSummary?.segments;
  if (!Array.isArray(segs) || segs.length === 0) return null;
  return segs.reduce(
    (best, s) => ((s?.value_b ?? -Infinity) > (best?.value_b ?? -Infinity) ? s : best),
    segs[0],
  );
}

/**
 * buildEssence — essence hero の確定データを既存フィールドから導出 (LLM なし)。
 * @returns {{ segment: object|null, fallbackSubject: string|null,
 *             beatMiss: Array<{key:string,label:string,verdict:string}> }}
 */
export function buildEssence(data, guidance) {
  const segment = topSegment(data);
  // segment が無い銘柄のみ businessFlowSteps[0] を弱い fallback に。無理に「誰に」を埋めない (§38)。
  const fallbackSubject = (data?.businessFlowSteps?.[0]?.label || '').trim() || null;
  const beatMiss = [];
  if (guidance?.eps?.verdict != null) beatMiss.push({ key: 'eps', label: 'EPS', verdict: guidance.eps.verdict });
  if (guidance?.revenue?.verdict != null) beatMiss.push({ key: 'rev', label: '売上', verdict: guidance.revenue.verdict });
  return { segment, fallbackSubject, beatMiss };
}

// essence hero の style (token のみ、新規 glow host を作らない inner ブロック)。
export const ESSENCE_STYLES = {
  card: {
    margin: '14px 0 4px',
    padding: '12px 16px',
    borderRadius: 'var(--radius-md, 10px)',
    border: '1px solid var(--border)',
    background: 'var(--bg-subtle)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  eyebrow: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-muted)' },
  row: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  key: { fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0, minWidth: '4.5em' },
  val: { fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 },
  chipWrap: { display: 'inline-flex', gap: '6px', flexWrap: 'wrap' },
  chip: { fontSize: '12px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', lineHeight: 1.5 },
};
