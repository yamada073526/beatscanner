/**
 * InsiderPanel — Pane 3 Insider 取引 section (handover v100 §100点 multi-review、 金融アナリスト verdict)
 *
 * FMP Premium /stable/insider-trading (Form 4 経営者売買) + /stable/institutional-ownership (13F 機関投資家保有)
 * を統合表示。 直近 30 件の Form 4 + 上位 20 件の機関保有変動。
 *
 * 設計:
 *   - sources schema (form4 / holders 個別 ok|empty|error|timeout): [feedback-data-completeness-guard]
 *   - 数値は LLM 経由不可 (Hallucination Guard 4 重防御 §1): 全て backend で計算済
 *   - 表示は静的、 LLM narration なし
 */
import { useEffect, useState } from 'react';

const fmtShares = (n) => {
  if (!Number.isFinite(n) || n === 0) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const fmtUSD = (v) => {
  if (!Number.isFinite(v) || v === 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};

// v115 round 3: 役職 (英語) → 日本語訳 + 投資初心者向けラベル
// 主要役職 (CEO/CFO/COO/Chairman) は gold accent で強調、 一般役員/取締役は muted
function translateRole(rawRole) {
  if (!rawRole) return { jp: null, isKeyExec: false };
  const role = String(rawRole).trim();
  const lower = role.toLowerCase();

  // CEO / CFO / 主要 C-suite (gold accent 対象)
  if (/chief executive officer|^ceo$|\bceo\b/i.test(role)) return { jp: 'CEO (最高経営責任者)', isKeyExec: true };
  if (/chief financial officer|^cfo$|\bcfo\b/i.test(role)) return { jp: 'CFO (最高財務責任者)', isKeyExec: true };
  if (/chief operating officer|^coo$|\bcoo\b/i.test(role)) return { jp: 'COO (最高執行責任者)', isKeyExec: true };
  if (/chief technology officer|^cto$|\bcto\b/i.test(role)) return { jp: 'CTO (最高技術責任者)', isKeyExec: true };
  if (/chairman|chairperson/i.test(role)) return { jp: '会長', isKeyExec: true };
  if (/president/i.test(role)) return { jp: '社長', isKeyExec: true };

  // 副 C-suite / EVP (中強度)
  if (/principal accounting officer/i.test(role)) return { jp: '会計責任者 (PAO)', isKeyExec: false };
  if (/principal financial officer/i.test(role)) return { jp: '財務責任者 (PFO)', isKeyExec: false };
  if (/general counsel/i.test(role)) return { jp: '法務責任者', isKeyExec: false };
  if (/executive vice president|^evp\b/i.test(role)) return { jp: '上席副社長 (EVP)', isKeyExec: false };
  if (/senior vice president|^svp\b/i.test(role)) return { jp: '上級副社長 (SVP)', isKeyExec: false };
  if (/vice president|^vp\b/i.test(role)) return { jp: '副社長', isKeyExec: false };

  // 一般役員 / 取締役 (低強度)
  if (lower === 'director' || /^director\b/i.test(role)) return { jp: '取締役', isKeyExec: false };
  if (lower === 'officer' || /^officer\b/i.test(role)) return { jp: '役員', isKeyExec: false };
  if (/10[% ]+owner|10[- ]?percent/i.test(role)) return { jp: '大株主 (10%以上)', isKeyExec: false };

  // 「officer: Principal Accounting Officer」 等の compound 形式 (左側を試す)
  if (role.includes(':')) {
    const inner = role.split(':').slice(1).join(':').trim();
    if (inner) {
      const innerResult = translateRole(inner);
      if (innerResult.jp) return innerResult;
    }
  }

  // 未マッチは raw 表示 (英語のまま)
  return { jp: role, isKeyExec: false };
}

// v115 round 3: 取引種別 (P/S/A/D/F/G) を投資初心者向けラベル + tooltip 化
// SEC Form 4 transactionCode 仕様準拠
function translateTxType(type) {
  switch ((type || '').toUpperCase()) {
    case 'P': return { jp: '買付', desc: '市場で株式を購入 (強気シグナル)', tone: 'gain' };
    case 'S': return { jp: '売却', desc: '市場で株式を売却', tone: 'loss' };
    case 'A': return { jp: 'RSU受領', desc: 'Restricted Stock Unit (報酬としての株式付与)', tone: 'muted' };
    case 'D': return { jp: '会社売却', desc: '発行会社への株式売却', tone: 'loss' };
    case 'F': return { jp: '税金売却', desc: '権利行使または税金支払いのための株式売却 (任意でない)', tone: 'muted' };
    case 'G': return { jp: '寄付', desc: '株式の贈与・寄付', tone: 'muted' };
    case 'M': return { jp: 'オプション行使', desc: 'ストックオプション行使に伴う取得', tone: 'muted' };
    default: return { jp: type || '—', desc: '取引種別', tone: 'muted' };
  }
}

// §C-11 A (v195): v5 では AccordionSection title「Insider 取引」が L2 冠のため、 内部 h3 はその傘下の
// サブ見出し = L3 (12/500/muted) に降格する。 v4/classic は従来 (13/700/primary) のまま (BC)。
const INNER_HEADING_DEFAULT = { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 };
const INNER_HEADING_L3 = { fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', margin: 0 };

export default function InsiderPanel({ ticker, l3Headings = false }) {
  const innerHeading = l3Headings ? INNER_HEADING_L3 : INNER_HEADING_DEFAULT;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/insider/${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  // v125 P7-3: data-testid を全 state (loading/error/main) に統一付与
  if (loading) {
    return (
      <div data-testid="insider-panel" style={{ padding: 'var(--space-4, 16px)', color: 'var(--text-muted)', fontSize: 13 }}>
        Insider 取引データを取得中…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div data-testid="insider-panel" style={{ padding: 'var(--space-4, 16px)', color: 'var(--text-muted)', fontSize: 13 }}>
        Insider 取引データを取得できませんでした
      </div>
    );
  }

  const form4 = Array.isArray(data.form4) ? data.form4 : [];
  const holders = Array.isArray(data.holders) ? data.holders : [];
  const f4Status = data.sources?.form4 || 'ok';
  const hStatus = data.sources?.holders || 'ok';

  return (
    <div data-testid="insider-panel" style={{ padding: 'var(--space-4, 16px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5, 20px)' }}>
      {/* Form 4 (経営者株式売買) */}
      <section>
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <h3 style={innerHeading}>
            Form 4 経営者売買
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            直近 {form4.length} 件
          </span>
        </header>
        {form4.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {f4Status === 'empty' ? '直近の Form 4 取引はありません' : '取得できませんでした'}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {form4.slice(0, 10).map((r, i) => {
              // v115 round 3: 取引種別を日本語訳 + tooltip 化、 役職も日本語訳
              const tx = translateTxType(r.type);
              const role = translateRole(r.role);
              const tone =
                tx.tone === 'gain' ? 'var(--color-gain)' :
                tx.tone === 'loss' ? 'var(--color-loss)' :
                'var(--text-secondary)';
              const txLabel = tx.jp;
              const isMeaningful = r.shares > 0 || r.value > 0;
              return (
                <li
                  key={`${r.date}-${i}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    rowGap: 4,
                    columnGap: 12,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    alignItems: 'baseline',
                    paddingBottom: 6,
                    borderBottom: i < Math.min(form4.length, 10) - 1 ? '1px dashed var(--border)' : 'none',
                  }}
                >
                  {/* 1 段目: 日付 + 名前 + 役職 chip */}
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', gridColumn: 1 }}>
                    {r.date || '—'}
                  </span>
                  <span style={{
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 8,
                    gridColumn: 2,
                    fontWeight: role.isKeyExec ? 600 : 500,
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                    {role.jp && (
                      <span style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        color: role.isKeyExec ? 'var(--color-gold-accent, var(--text-primary))' : 'var(--text-muted)',
                        background: role.isKeyExec
                          ? 'color-mix(in srgb, var(--color-gold-accent, var(--color-accent)) 12%, transparent)'
                          : 'var(--bg-subtle)',
                        fontWeight: role.isKeyExec ? 600 : 500,
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.02em',
                      }}>
                        {role.jp}
                      </span>
                    )}
                  </span>
                  {/* 1 段目右端: 金額 (太字、 大口は強調) */}
                  <span
                    style={{
                      color: tone,
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 600,
                      gridColumn: 3,
                      whiteSpace: 'nowrap',
                    }}
                    title={isMeaningful ? `${tx.desc} — ${fmtShares(r.shares)}株 × $${(r.price || 0).toFixed(2)}` : tx.desc}
                  >
                    {isMeaningful ? `${txLabel} ${fmtUSD(r.value)}` : '—'}
                  </span>
                  {/* 2 段目: 取引内訳 (株数 + 解説、 muted で副情報) */}
                  {isMeaningful && (
                    <span
                      style={{
                        gridColumn: '2 / 4',
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        marginTop: -2,
                      }}
                    >
                      {fmtShares(r.shares)} 株 — {tx.desc}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 13F 機関投資家保有 */}
      <section>
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <h3 style={innerHeading}>
            13F 機関投資家保有
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            上位 {holders.length} 件
          </span>
        </header>
        {holders.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {hStatus === 'restricted' ? (
              <>
                {/* v115 round 3 user feedback: 実装都合 (現プラン制限) の文言を削除、
                    user 価値 (SEC EDGAR 無料閲覧導線) のみ残す。 Trust Cliff + 景表法 §5 防止維持。 */}
                <div>
                  機関投資家の保有動向は{' '}
                  <a
                    href={`https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(ticker)}%22&forms=13F-HR&dateRange=custom`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
                  >
                    SEC EDGAR 13F 検索
                  </a>{' '}
                  で無料閲覧できます。
                </div>
              </>
            ) : hStatus === 'empty' ? (
              '13F データはありません'
            ) : (
              '取得できませんでした'
            )}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {holders.slice(0, 10).map((h, i) => {
              const tone = h.change > 0 ? 'var(--color-gain)' : h.change < 0 ? 'var(--color-loss)' : 'var(--text-muted)';
              return (
                <li key={`${h.name}-${i}`} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  alignItems: 'baseline',
                }}>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.name}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtShares(h.shares)} 株
                  </span>
                  <span style={{ color: tone, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {h.change > 0 ? '+' : ''}{fmtShares(h.change)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
