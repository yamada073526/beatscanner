/**
 * completenessLedger.js — 完全性台帳 (coverage manifest) の純粋ロジック SSOT。
 * SPEC_2026-06-13_completeness-ledger-top2.md / 北極星第2の柱「中身(選ぶ目の質)」。
 *
 * @no-llm: 静的 dict + 純粋関数のみ。React / LLM 非依存 = unit test 可能 (Sprint4 eval の「沈黙の欠落
 *   0件率」 を保証する regression guard の対象)。CompletenessRollupBadge.jsx (描画) はここを import する。
 *
 * 「沈黙の欠落」 不変条件 (この module が守る契約、completenessLedger.test.js が網羅 assert):
 *   - source の backend status (error/empty) は必ず非 ok 状態 (failed/na) として表面化する。
 *   - cluster が rollup で「を自動取得」 を名乗れるのは ok 行が1件以上のときのみ (全 na を ok と詐称しない)。
 *   - 全滅 (全 source error) と一部失敗を failLabel で区別する。
 *
 * §38: 文言は取得状況の事実のみ (完了/品質/verdict 語なし・全称語なし)。色は呼び元 (描画層) で中立固定。
 */

// 決算データクラスタの source 構成 (quarterly-history `sources` の3 key)。
export const EARNINGS_SOURCES = [
  { key: 'earnings_surprises', label: 'EPS / 売上サプライズ' },
  { key: 'income_q', label: '四半期 損益' },
  { key: 'cash_flow_q', label: '四半期 キャッシュフロー' },
];

// 取得状況 → 文言 (B-1: 「取得済み」 は process の事実。品質語 (確認済/検証済) は使わない)。
// B-3: ok / failed / na の3状態を別文言で物理区別。
export const STATUS_LABEL = {
  ok: '取得済み',
  failed: '取得失敗',
  na: 'データなし（非該当）',
};

// 取得失敗 / 非該当 の1行注記 (qa S-3: 技術 key 羅列でなく人間語で「裏取り不要」 を腹落ちさせる)。
export const STATUS_NOTE = {
  failed: '最新データを取得できませんでした（時間をおいて再読み込みで解消する場合があります）。',
  na: 'この銘柄では該当データがありません（新規上場・非対象等）。',
};

// 地合い (SPY) 取得失敗の専用注記 (qa S-5: なぜ RS / カップ形成が空になるかの文脈)。
export const MARKET_FAILED_NOTE =
  '地合い（SPY）データを取得できませんでした。カップ形成・RS 等の地合い依存指標は算出されません。';

// quarterly-history の sources を決算データクラスタに分類。
// raw: 'ok' → ok / 'error' → failed / 'empty' → na (非該当扱い、欠落警告にしない = B-3) / それ以外 → unknown。
export function classifyEarnings(sources) {
  if (sources == null) {
    // null = fetch 失敗 or 旧 schema。誤った ok/failed を出さず unknown 扱い (present から除外される)。
    return { key: 'earnings', name: '決算データ', status: 'unknown', failLabel: '決算データ一部未取得', rows: [] };
  }
  const rows = EARNINGS_SOURCES.map((s) => {
    const raw = sources[s.key];
    let status;
    if (raw === 'ok') status = 'ok';
    else if (raw === 'error') status = 'failed';
    else if (raw === 'empty') status = 'na';
    else status = 'unknown';
    return { key: s.key, label: s.label, status };
  });
  const known = rows.filter((r) => r.status !== 'unknown');
  const okRows = rows.filter((r) => r.status === 'ok');
  // status: 取得失敗が1件でも → failed / ok が1件以上 → ok / known はあるが ok=0 → na (全行 非該当) /
  // known=0 → unknown。「全行 na のとき ok を名乗らない」 = 取得0件を「取得済み」 と誤表示しない (沈黙の欠落 blocker)。
  // failed 判定は known に限定 (unknown 行を含めない)。
  const status =
    known.length === 0
      ? 'unknown'
      : known.some((r) => r.status === 'failed')
        ? 'failed'
        : okRows.length === 0
          ? 'na'
          : 'ok';
  // 全滅 (全 known が failed) と一部失敗を区別: 全滅で「一部未取得」 は「大半は取れている」 誤読 (楽観 Trust Cliff)。
  const failLabel =
    known.length > 0 && known.every((r) => r.status === 'failed')
      ? '決算データ未取得'
      : '決算データ一部未取得';
  return { key: 'earnings', name: '決算データ', status, failLabel, rows };
}

// technical の spy_unavailable を地合いクラスタに分類。false → ok / true → failed / null・undefined → unknown。
export function classifyMarket(spyUnavailable) {
  let status;
  if (spyUnavailable === false) status = 'ok';
  else if (spyUnavailable === true) status = 'failed';
  else status = 'unknown';
  const rowStatus = status === 'unknown' ? 'unknown' : status;
  return {
    key: 'market',
    name: '地合い',
    status,
    failLabel: '地合いデータ未取得',
    rows: [{ key: 'market', label: '地合い（SPY）', status: rowStatus }],
  };
}

// valuation-extras の sources.institutional (13F 機関保有・O'Neil "I") を機関保有クラスタに分類。
// raw: 'ok'→ok / 'error'・'timeout'→failed / 'empty'→na (該当データなし=13F 非対象・ADR 等で正常) /
//   それ以外 (null/undefined=未 fetch/旧 schema)→unknown。
// ⚠️ 'timeout' を明示的に failed 扱いする (sources.institutional は backend で 4 値 ok|empty|error|timeout、
//   main.py L1288-1295)。classifyEarnings の 3 値マッピングを流用すると 'timeout' が unknown に落ち、
//   buildPresent から除外されて「沈黙の欠落」 になる = 本クラスタ固有の blocker。
export function classifyInstitutional(sourceStatus) {
  let status;
  if (sourceStatus === 'ok') status = 'ok';
  else if (sourceStatus === 'error' || sourceStatus === 'timeout') status = 'failed';
  else if (sourceStatus === 'empty') status = 'na';
  else status = 'unknown';
  return {
    key: 'institutional',
    name: '機関保有',
    status,
    failLabel: '機関保有データ未取得',
    rows: [{ key: 'institutional', label: '機関投資家の保有（13F）', status }],
  };
}

// 取得状況が判明したクラスタ (unknown は除外)。ok / failed / na を含む = ドリルダウン対象。
// institutional は後付け配線のため optional (未渡し=undefined は filter で除外、後方互換)。
export function buildPresent(earnings, market, institutional) {
  return [earnings, market, institutional].filter((c) => c && c.status !== 'unknown');
}

// ロールアップ文言を組む (B-1/B-2/B-3): 名前ベースで「取得 / 未取得 / 該当なし」 を列挙。
// 件数分数 (X/Y系統) は品質スコアに誤読されうるため使わない。全称語なし。
// 全行 na のクラスタは acquired に入らず「該当なし」 と表示 = 取得0件を「取得済み」 と誤表示しない (沈黙の欠落 0件)。
export function buildRollup(present) {
  const acquired = present.filter((c) => c.status === 'ok');
  const failed = present.filter((c) => c.status === 'failed');
  const naOnly = present.filter((c) => c.status === 'na');
  const parts = [];
  if (acquired.length) parts.push(`${acquired.map((c) => c.name).join('・')}を自動取得`);
  if (failed.length) parts.push(failed.map((c) => c.failLabel).join('・'));
  if (naOnly.length) parts.push(`${naOnly.map((c) => c.name).join('・')}は該当なし`);
  const text = parts.join(' / ') || '取得状況を確認できません';
  return { acquired, failed, naOnly, text };
}
