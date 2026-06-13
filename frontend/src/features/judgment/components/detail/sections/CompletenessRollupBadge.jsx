/**
 * CompletenessRollupBadge — 完全性台帳 (coverage manifest) Sprint3
 * SPEC_2026-06-13_completeness-ledger-top2.md / 北極星第2の柱「中身(選ぶ目の質)」第一手。
 *
 * @no-llm: このコンポーネントは backend 計算済の「取得状況 (sources)」を静的 dict で整形するだけ。
 *   LLM API 呼び出し禁止 (Hallucination Guard §4)。文言は STATUS_LABEL / COVERAGE 等の静的 dictionary のみ。
 *
 * 狙い (grill-me 2026-06-13 決定3): 規律の元データ取得失敗を黙殺して素通りする「沈黙の欠落」 を潰し、
 *   user が裏取りせず手放せる状態にする。badge = 常時1行ロールアップ + クリックでドリルダウン全監査。
 *
 * 3体 multi-review (2026-06-13) で確定した §38/§5 ガード (実装前 gate):
 *   [B-1] 完了・品質を示す動詞 (確認済/検証済/保証/クリア/合格/完了) を**全廃**。「取得した source の件数」
 *         という事実の名詞表現に限定する。「取得成功 ≠ 数値が正しい ≠ 投資判断の正しさ」 の境界を文言で守る
 *         (取得=process、評価でない)。これが優良誤認 (景表法§5) を避ける核心。
 *   [B-2] 名乗り範囲を**実際に sources を読めている2クラスタ (決算データ / 地合い) に厳密一致**。全称語
 *         (漏れなく/全/すべて) を1語も使わない。5条件/ガイダンス/機関は別 backlog で未配線のため含めない。
 *   [B-3] ok / 取得失敗 / 非該当 (該当データなし) の3状態を物理区別。empty(=非該当) を「欠落」 と出さない
 *         (新規上場で前年同期なし・銀行に粗利率なし等が正常なのに誤警告になる、qa B-3)。
 *   [B-4] 色中立 invariant: gain緑/loss赤/warning琥珀 を一切使わない (verdict 的に読まれる)。取得失敗も
 *         text-secondary の中立色 + テキストラベルで示す (○△× 等の評価スケール記号は使わない、敵対的検証 §38 minor)。
 *   [B-5] loading/undefined では「欠落あり」 と誤表示しない。sources 未到達では非表示 (skeleton を出さず空き高さ
 *         だけ確保 = CLS 回避、qa S-4)。
 *
 * データ規律 (feedback_data_completeness_guard):
 *   - quarterly-history `sources` = {earnings_surprises, income_q, cash_flow_q} = ok|empty|error
 *   - technical `patterns.{cup_handle,rs}.spy_unavailable` (bool) = 地合い (SPY) 取得状況
 *   - どちらも dedupGet 化済 → EarningsFlashSummary / StockPriceChart の既存 fetch と coalesce (追加 fetch なし)
 *
 * 設計境界: 新規 glow host (.panel-card/.bs-panel/.surface-card) を作らない (class なし div + semantic token のみ)。
 *   module-level component (inline 関数 component 禁止 = feedback_pane_error_boundary)。
 *   primary selector = data-testid (selector 幻覚予防)。loading/errored/empty/main 全 render path に data-testid。
 *   pulse / 無限 animation 不使用 (PGE 落とし穴4 / §2 静2:動1)。
 */
import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { fetchQuarterlyHistory, fetchTechnical, TECHNICAL_CANONICAL_PATTERNS } from '../../../../../api.js';

const TESTID = 'completeness-rollup-badge';
const AUDIT_TESTID = 'completeness-audit-panel';

// ── 静的 dictionary (§38: 取得状況の事実のみ。完了/品質/評価語を含めない) ──

// 決算データクラスタの source 構成 (quarterly-history `sources` の3 key)
const EARNINGS_SOURCES = [
  { key: 'earnings_surprises', label: 'EPS / 売上サプライズ' },
  { key: 'income_q', label: '四半期 損益' },
  { key: 'cash_flow_q', label: '四半期 キャッシュフロー' },
];

// 取得状況 → 文言 (B-1: 「取得済み」は process の事実。「確認済/検証済」 等の品質語は使わない)。
// (B-3: ok / failed / na の3状態を別文言で物理区別)。
const STATUS_LABEL = {
  ok: '取得済み',
  failed: '取得失敗',
  na: 'データなし（非該当）',
};
// 記号は使わない (B-4 / 敵対的検証 §38 minor): ○△× は「良/可/不可」 の grading に強く連想されるため、
// 状態はテキストラベル (取得済み / 取得失敗 / データなし) のみで伝える。色も中立。
// 取得失敗 / 非該当 の1行注記 (qa S-3: 技術 key 羅列でなく人間語で「裏取り不要」 を腹落ちさせる)。
const STATUS_NOTE = {
  failed: '最新データを取得できませんでした（時間をおいて再読み込みで解消する場合があります）。',
  na: 'この銘柄では該当データがありません（新規上場・非対象等）。',
};
// 地合い (SPY) 取得失敗の専用注記 (qa S-5: なぜ RS / カップ形成が空になるかの文脈)。
const MARKET_FAILED_NOTE =
  '地合い（SPY）データを取得できませんでした。カップ形成・RS 等の地合い依存指標は算出されません。';

// ── 分類ロジック (純粋関数。数値物理層、LLM 不使用) ──

// quarterly-history の sources を決算データクラスタに分類。
// raw: 'ok' → ok / 'error' → failed / 'empty' → na (非該当扱い、欠落警告にしない = B-3) / それ以外 → unknown。
function classifyEarnings(sources) {
  if (sources == null) {
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
  // known=0 → unknown。「全行 na のとき ok を名乗らない」 = 取得0件を「取得済み」 と誤表示しない
  // (B-1/B-3、敵対的検証 blocker)。failed 判定は known に限定 (unknown 行を含めない、data-contract minor)。
  const status =
    known.length === 0
      ? 'unknown'
      : known.some((r) => r.status === 'failed')
        ? 'failed'
        : okRows.length === 0
          ? 'na'
          : 'ok';
  // 全 source 失敗(全滅)と一部失敗を区別 (敵対的検証 再検証 minor): 全滅で「一部未取得」 と出すと
  // 「大半は取れている」 と誤読され、存在しないデータを信頼する Trust Cliff (楽観方向)。
  const failLabel =
    known.length > 0 && known.every((r) => r.status === 'failed')
      ? '決算データ未取得'
      : '決算データ一部未取得';
  return { key: 'earnings', name: '決算データ', status, failLabel, rows };
}

// technical の spy_unavailable を地合いクラスタに分類。
// false → ok / true → failed / null・undefined → unknown。
function classifyMarket(spyUnavailable) {
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

// ── ドリルダウン監査パネル (module-level、named export) ──
// 各 source の取得状況 (ok/取得失敗/非該当) を一覧。具体数値は出さない (取得状況の事実のみ = 無料面安全)。
export function CompletenessAuditPanel({ clusters }) {
  return (
    <div data-testid={AUDIT_TESTID} style={auditWrapStyle}>
      {/* B-1 の核心: 「取得できたかの記録」 であって「数値の正しさ/売買判断」 ではない、を明示宣言。 */}
      <div style={auditHeaderStyle}>データ取得状況</div>
      <p style={auditCaptionStyle}>
        各分析の元データを取得できたかの記録です（数値の正しさや売買の判断を示すものではありません）。
      </p>
      {clusters.map((c) => (
        <div key={c.key} style={{ marginTop: 'var(--space-3, 12px)' }}>
          <div style={auditGroupTitleStyle}>{c.name}</div>
          {c.rows.map((r) => (
            <AuditRow key={r.key} clusterKey={c.key} row={r} />
          ))}
        </div>
      ))}
    </div>
  );
}

// 監査の1行 (module-level)。status に応じ中立記号 + 文言 + 必要時のみ注記。
function AuditRow({ clusterKey, row }) {
  const note =
    row.status === 'failed'
      ? clusterKey === 'market'
        ? MARKET_FAILED_NOTE
        : STATUS_NOTE.failed
      : row.status === 'na'
        ? STATUS_NOTE.na
        : null;
  return (
    <div style={auditRowStyle} data-testid={`${AUDIT_TESTID}-row-${row.key}`} data-status={row.status}>
      <div style={auditRowMainStyle}>
        <span style={auditRowLabelStyle}>{row.label}</span>
        <span style={auditRowStatusStyle}>{STATUS_LABEL[row.status] || '—'}</span>
      </div>
      {note && <p style={auditNoteStyle}>{note}</p>}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string|null} props.ticker - 選択中の ticker
 */
export default function CompletenessRollupBadge({ ticker }) {
  const [sources, setSources] = useState(undefined); // quarterly-history sources (null=取得失敗)
  const [spyUnavailable, setSpyUnavailable] = useState(undefined); // bool | null
  const [resolved, setResolved] = useState({ qh: false, tech: false });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // ticker 切替時は他銘柄の残骸を出さない (EarningsFlashSummary の null reset idiom)。
    setSources(undefined);
    setSpyUnavailable(undefined);
    setResolved({ qh: false, tech: false });
    setOpen(false);
    if (!ticker) return undefined;
    let cancelled = false;
    // 両 fetch とも dedupGet 化済 → 既存 mount fetch / prefetch と coalesce (追加 HTTP なし)。
    fetchQuarterlyHistory(ticker, 8)
      .then((res) => {
        if (cancelled) return;
        setSources(res?.sources ?? null);
        setResolved((p) => ({ ...p, qh: true }));
      })
      .catch(() => {
        if (cancelled) return;
        setSources(null);
        setResolved((p) => ({ ...p, qh: true }));
      });
    fetchTechnical(ticker, TECHNICAL_CANONICAL_PATTERNS)
      .then((res) => {
        if (cancelled) return;
        const p = res?.patterns || {};
        const su = p?.cup_handle?.spy_unavailable ?? p?.rs?.spy_unavailable ?? null;
        setSpyUnavailable(su);
        setResolved((prev) => ({ ...prev, tech: true }));
      })
      .catch(() => {
        if (cancelled) return;
        setSpyUnavailable(null);
        setResolved((prev) => ({ ...prev, tech: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // empty: ticker 未選択 → grid の phantom gap を作らない (display:none、testid は維持)。
  if (!ticker) {
    return <div data-testid={TESTID} data-state="empty" style={{ display: 'none' }} />;
  }

  // loading: 両 fetch が完了するまで待つ (片方だけ resolved の中間で present=0 errored に誤遷移 → 直後 main の
  // ちらつき / CLS を防ぐ、敵対的検証 nit)。空き高さだけ確保し skeleton は出さない (B-5 / qa S-4)。
  const bothResolved = resolved.qh && resolved.tech;
  if (!bothResolved) {
    return <div data-testid={TESTID} data-state="loading" aria-hidden style={reserveStyle} />;
  }

  const earnings = classifyEarnings(sources);
  const market = classifyMarket(spyUnavailable);
  // present = 取得状況が判明したクラスタ (unknown は除外)。ok / failed / na を含む = ドリルダウン対象。
  const present = [earnings, market].filter((c) => c.status !== 'unknown');

  // errored: 両クラスタとも取得状況が不明 (fetch は返ったが sources 無し) → 誤情報を出さず静かに非表示。
  if (present.length === 0) {
    return <div data-testid={TESTID} data-state="errored" style={{ display: 'none' }} />;
  }

  const acquired = present.filter((c) => c.status === 'ok');
  const failed = present.filter((c) => c.status === 'failed');
  const naOnly = present.filter((c) => c.status === 'na');

  // ロールアップ文言 (B-1/B-2/B-3 + 敵対的検証反映): 名前ベースで「取得 / 未取得 / 該当なし」 を列挙。
  // 件数分数 (X/Y系統) は品質スコアに誤読されうるため使わない (sec38-legal minor)。全称語なし、色中立。
  // 全行 na のクラスタは acquired に入らず「該当なし」 と表示 = 取得0件を「取得済み」 と誤表示しない (blocker)。
  const parts = [];
  if (acquired.length) parts.push(`${acquired.map((c) => c.name).join('・')}を自動取得`);
  if (failed.length) parts.push(failed.map((c) => c.failLabel).join('・'));
  if (naOnly.length) parts.push(`${naOnly.map((c) => c.name).join('・')}は該当なし`);
  const rollupText = parts.join(' / ') || '取得状況を確認できません';

  return (
    <div data-testid={TESTID} data-state="main" style={mainWrapStyle}>
      <button
        type="button"
        data-testid={`${TESTID}-toggle`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={pillStyle}
        title="クリックでデータ取得状況の内訳"
      >
        <span style={eyebrowStyle}>データ取得</span>
        <span style={rollupTextStyle}>{rollupText}</span>
        <ChevronDown
          size={13}
          aria-hidden
          style={{
            flexShrink: 0,
            color: 'var(--text-muted)',
            transition: 'transform 160ms ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>
      {open && <CompletenessAuditPanel clusters={present} />}
    </div>
  );
}

// ── インラインスタイル (semantic CSS token のみ、raw hex 禁止、新規 glow host なし) ──

// loading 時の高さ確保 (badge 1 行ぶん ≈ 30px、CLS 回避)。可視内容なし。
const reserveStyle = { minHeight: 30 };

const mainWrapStyle = {
  // 静かに置く (qa S-2): 最小限の存在感。常時1行だが muted。
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2, 8px)',
};

const pillStyle = {
  alignSelf: 'start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2, 8px)',
  maxWidth: '100%',
  padding: '5px 10px',
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  cursor: 'pointer',
  textAlign: 'left',
  font: 'inherit',
};

const eyebrowStyle = {
  flexShrink: 0,
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const rollupTextStyle = {
  minWidth: 0,
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const auditWrapStyle = {
  padding: 'var(--space-3, 12px) var(--space-4, 16px)',
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
  borderRadius: 8,
};

const auditHeaderStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
};

const auditCaptionStyle = {
  margin: '4px 0 0 0',
  fontSize: 11,
  lineHeight: 1.5,
  color: 'var(--text-muted)',
};

const auditGroupTitleStyle = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: 'var(--text-secondary)',
  marginBottom: 'var(--space-1, 4px)',
};

const auditRowStyle = {
  padding: '4px 0',
  borderTop: '1px solid var(--border)',
};

const auditRowMainStyle = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--space-3, 12px)',
};

const auditRowLabelStyle = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary)',
};

const auditRowStatusStyle = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 4,
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};

const auditNoteStyle = {
  margin: '2px 0 0 0',
  fontSize: 11,
  lineHeight: 1.5,
  color: 'var(--text-muted)',
};
