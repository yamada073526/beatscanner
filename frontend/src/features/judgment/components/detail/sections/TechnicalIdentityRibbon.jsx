import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import CompanyLogo from '../../../../../components/CompanyLogo.jsx';
import { fetchProfileSummary } from '../../../../../api.js';
import { sanitizeText } from '../../../../../lib/blocklist.js';
import { buildSegmentSummaryText } from '../../../../../lib/segmentNames.js';

/**
 * TechnicalIdentityRibbon — v6 テクニカル章 冒頭の「同定リボン」(2026-06-28)
 *
 * 設計意図 (user 2026-06-28): テクニカルから入ってくる人 / 銘柄を全く知らない人でも
 *   「この会社が何をしているか」 を 2 秒で把握できるよう、テクニカル・買い場 section の
 *   冒頭に 1 行の身元表示を置く。
 *
 * ファンダの「会社概要 fold」(ProfileCard: 詳細パラグラフ + 本社 + 従業員 + peer + ETF)
 *   とは粒度を変える (= 1 行の身元のみ) ことで重複感 (ごっちゃ) を回避し、住み分ける。
 *
 * データ (追加コストゼロ):
 *   - summary_jp / segmentSummary は /api/profile-summary 由来。同 endpoint は prefetchAll
 *     に含まれ (api.js)、backend は 7 日 TTL の _SUMMARY_CACHE を持つため、本 component の
 *     fetch は LLM を再実行せず cached JSON を返す (= 追加 LLM コストなし)。
 *   - companyName は親 (JudgmentDetail result) から prop で受領、logo は CompanyLogo(ticker)。
 *
 * §38/§5: 純粋な事実記述のみ (色信号 / 行動指示 / 将来予測なし)。LLM 出力 (summary_jp) は
 *   ProfileCard と同じく sanitizeText (BLOCKLIST_REGEX) を通す。
 *
 * AccordionSection 非依存: 本 ribbon は折りたたみ fold の外 (常時 mount) に置くため、
 *   ProfileCard (展開時のみ mount) の unmount 制約を受けず自前 fetch できる。
 */

// module-level 10 分 TTL cache (ProfileCard と同 idiom)。backend は 7 日 cache のため
// LLM は再実行されないが、session 内の重複 HTTP を抑える。
const _RIBBON_CACHE = new Map(); // ticker -> { t: number, data: object }
const _TTL_MS = 10 * 60 * 1000;

export default function TechnicalIdentityRibbon({ ticker, companyName }) {
  const [data, setData] = useState(() => {
    if (!ticker) return null;
    const c = _RIBBON_CACHE.get(ticker);
    return c && Date.now() - c.t < _TTL_MS ? c.data : null;
  });
  const acRef = useRef(null);
  // タップ展開 (2026-06-28 user): 既定は 1 行 ellipsis、押すと和文 1 行を全文 wrap 表示。
  const [expanded, setExpanded] = useState(false);

  // 銘柄が変わったら畳んだ状態に戻す (前銘柄の展開状態を持ち越さない)。
  useEffect(() => {
    setExpanded(false);
  }, [ticker]);

  useEffect(() => {
    if (!ticker) return undefined;
    const cached = _RIBBON_CACHE.get(ticker);
    if (cached && Date.now() - cached.t < _TTL_MS) {
      setData(cached.data);
      return undefined;
    }
    if (acRef.current) acRef.current.abort();
    const ac = new AbortController();
    acRef.current = ac;
    fetchProfileSummary(ticker, { signal: ac.signal })
      .then((d) => {
        if (ac.signal.aborted || !d || d._error) return;
        _RIBBON_CACHE.set(ticker, { t: Date.now(), data: d });
        setData(d);
      })
      .catch(() => {
        // best-effort: ribbon は補助情報なので失敗時は logo + 社名のみで graceful degrade
      });
    return () => {
      ac.abort();
      acRef.current = null;
    };
  }, [ticker]);

  if (!ticker) return null;

  // 和文 1 行: summary_jp を sanitize (ProfileCard sanitizeSummaryData と同 pattern)。
  const rawOneLine = data?.summary_jp || null;
  const oneLine = rawOneLine ? (sanitizeText(rawOneLine) || rawOneLine) : null;
  const segmentText = buildSegmentSummaryText(data?.segmentSummary, 2);
  const name = companyName || ticker;

  return (
    <div
      data-testid="v6-technical-identity-ribbon"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: expanded ? 'flex-start' : 'center',
        gap: 'var(--space-2, 8px)',
        minWidth: 0,
        padding: 'var(--space-2, 8px) var(--space-3, 12px)',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <CompanyLogo ticker={ticker} size={20} />
      <span
        style={{
          fontWeight: 700,
          fontSize: 13,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {name}
      </span>
      {oneLine && (
        <>
          <span aria-hidden style={{ color: 'var(--text-muted)', flexShrink: 0 }}>·</span>
          <button
            type="button"
            data-testid="v6-technical-identity-oneline"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? '会社概要を1行に畳む' : '会社概要を全文表示する'}
            title={expanded ? undefined : oneLine}
            style={{
              // button reset
              appearance: 'none',
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              font: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
              // layout
              display: 'flex',
              alignItems: expanded ? 'flex-start' : 'center',
              gap: 4,
              minWidth: 0,
              flex: '1 1 auto',
              color: 'var(--text-secondary)',
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                minWidth: 0,
                flex: '1 1 auto',
                ...(expanded
                  ? { whiteSpace: 'normal' }
                  : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
              }}
            >
              {oneLine}
            </span>
            <ChevronDown
              size={13}
              aria-hidden
              style={{
                flexShrink: 0,
                color: 'var(--text-muted)',
                marginTop: expanded ? 2 : 0,
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 150ms ease',
              }}
            />
          </button>
        </>
      )}
      {segmentText && (
        <>
          <span aria-hidden style={{ color: 'var(--text-muted)', flexShrink: 0 }}>·</span>
          <span
            data-testid="v6-technical-identity-segment"
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {segmentText}
          </span>
        </>
      )}
    </div>
  );
}
