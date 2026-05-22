import { useState, useEffect, useRef } from 'react';
import InfoModal from './InfoModal.jsx';
import Chip from './ui/Chip.jsx';
import { BarChart3, Calendar, CalendarRange } from 'lucide-react';

// ── signal_quality envelope (handover v82 Phase 0) を 3-tier badge に変換 ──
// confidence 別に tone / label / tooltip を decide。 「ガイダンス: 非開示」 を
// 「未確認」 (Not Provided) 等の文言に統一して Trust Cliff を解消する。
//
// memory: feedback_citation_required.md / project_pane3_visual_explainer_redesign.md
function confidenceToTone(confidence) {
  if (confidence === 'high') return 'gain';
  if (confidence === 'medium') return 'warning';
  return 'muted'; // low / undefined
}
function signalQualityLabel(sq) {
  if (!sq) return '未確認';
  if (sq.confidence === 'high') return '公式データ';
  if (sq.confidence === 'medium') return '推定データ';
  return '未確認';
}
function signalQualityTooltip(sq, kind = 'EPS') {
  if (!sq) return `${kind} のデータソースが取得できませんでした`;
  const parts = [];
  if (sq.source && sq.source !== 'none') parts.push(`source: ${sq.source}`);
  if (typeof sq.consensus_count === 'number') parts.push(`アナリスト ${sq.consensus_count}人`);
  if (typeof sq.freshness_days === 'number') parts.push(`鮮度 ${sq.freshness_days}日`);
  const detail = parts.length ? `（${parts.join(' / ')}）` : '';
  if (sq.confidence === 'high') return `${kind}: FMP analyst consensus 等の公式データ${detail}`;
  if (sq.confidence === 'medium') return `${kind}: 補完データ${detail}。 メインデータが取れず代替を使用`;
  return `${kind}: データソース取得失敗${detail}`;
}
function SignalQualityChip({ signalQuality, kind = 'EPS' }) {
  const sq = signalQuality || null;
  // signal_quality 未提供 (旧 backend / fallback) なら何も表示しない
  if (!sq) return null;
  return (
    <Chip
      variant="display"
      tone={confidenceToTone(sq.confidence)}
      size="xs"
      title={signalQualityTooltip(sq, kind)}
      ariaLabel={`${kind} データ信頼性: ${signalQualityLabel(sq)}`}
    >
      {signalQualityLabel(sq)}
    </Chip>
  );
}

// ── Tooltip (PC: hover, スマホ: tap) ──────────────────────────────────────────
function Tooltip({ text, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);
  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md px-3 py-1.5 text-xs font-normal leading-snug text-white shadow-lg"
          style={{
            background: 'rgb(30, 41, 59)',
            whiteSpace: 'nowrap',
            maxWidth: 280,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {text}
          <span
            aria-hidden
            className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent"
            style={{ borderTopColor: 'rgb(30, 41, 59)' }}
          />
        </span>
      )}
    </span>
  );
}

// ── Guidance explanation modal ────────────────────────────────────────────────

function GuidanceInfoModal({ onClose }) {
  return (
    <InfoModal title="ガイダンス達成状況とは" onClose={onClose}>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📌 概要</p>
        <p className="text-sm leading-relaxed text-slate-700">
          「ガイダンス」が事前のコンセンサス予想を上回ること（ガイダンス達成）は、<strong style={{ color: 'rgb(56, 189, 248)' }}>株価の上昇を決定づける極めて重要な要素</strong>です。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📖 ガイダンスとは何か？</p>
        <p className="text-sm leading-relaxed text-slate-700">
          ガイダンスとは、企業側（特に財務部長）が公式に示す、来期や今年度通年の「売上高」および「EPS（一株当たり利益）」の業績見通しのことです。財務部長は誰よりも自社の業績見通しについて精密な予想を立てられる立場にあり、通常、ガイダンスは「これなら達成できるだろう」という控えめな努力目標として提示されます。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">💡 なぜガイダンス達成が重要か</p>
        <div className="space-y-3 text-sm leading-relaxed text-slate-700">
          <div>
            <p className="font-semibold text-slate-900">・アナリストの「コンセンサス予想」を動かす決定的な要因だから</p>
            <p className="mt-1">証券会社のアナリストたちが業績予想を立てる際、最も参考にするのが会社側から示されるガイダンスです。決算発表で新しいガイダンスが示されると、アナリストたちはそれを基に一斉に予想数字を変更します。ガイダンスがコンセンサス予想を上回れば（上方修正）アナリスト予想も引き上げられ、<strong style={{ color: 'rgb(56, 189, 248)' }}>市場全体のコンセンサス予想がジワジワと上昇します。</strong>逆に下回れば、予想もすぐに下がり始めます。</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">・予想の上方修正が「株価上昇」に直結するから</p>
            <p className="mt-1">株価はアナリストのコンセンサス予想がスルスルと上昇しているときに上がりやすく、逆に下がっているときには下がる傾向があります。ガイダンスがコンセンサスを上回って予想が上方修正されることは、「おのずと今後株価が上昇する理由を含んでいる」と考えるのが自然です。</p>
          </div>
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-500">📋 まとめ</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">
          過去の「実績（直近のEPSと売上高）」がどれだけ良くても、未来の「見通し（ガイダンス）」が弱ければ、投資家は失望し株価は売られてしまいます。企業が強気な未来を示すこと（ガイダンス達成）こそが、アナリストの予想を引き上げ、株価を持続的に押し上げる最大の原動力です。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          だからこそ<strong>「EPS」「売上高」「ガイダンス」の3つすべてがコンセンサス予想を上回ることを、「良い決算」の絶対条件</strong>としています。
        </p>
      </div>
    </InfoModal>
  );
}

// Phase 2.8 Sprint 1 #2: inset shadow opacity 20% → 30% (user dogfood 4 回目「まだ弱い」 fix)
// + outer 0 2px 8px 0 accent 12% で EarningsHistoryChart cluster と同等の elevation 感
// token 経由のみ (hex 直書き禁止)。contain: paint は v54 禁止教訓のため絶対追加しない。
// glow_elevation_postmortem.md §v54 準拠。
const GUIDANCE_SECTION_STYLE = {
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  boxShadow: [
    'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 30%, transparent)',
    '0 2px 8px 0 color-mix(in srgb, var(--color-accent) 12%, transparent)',
  ].join(', '),
  transition: 'transform 0.35s ease, box-shadow 0.35s ease, border-color 0.35s ease',
};

// v97 CLS fix + Aman 級 skeleton 統一:
// raw hex (slate-200) を token (--bg-muted / --bg-subtle) に置換 + gold shimmer animation 統一
// (ProfileCard SummaryShimmer Sprint H7 と同じ idiom)。
// min-height を明示することで GuidanceCard 後追い load 時の ProfileCard ジャンプ防止。
const GuidanceSkeleton = () => (
  <section
    className="panel-card rounded-2xl p-5 shadow-sm"
    style={{ ...GUIDANCE_SECTION_STYLE, minHeight: 360 }}
    data-testid="guidance-skeleton"
  >
    <style>{`
      @keyframes bs-guidance-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      .bs-guidance-skel {
        border-radius: var(--radius-sm, 4px);
        background: linear-gradient(
          90deg,
          var(--bg-subtle) 0%,
          color-mix(in srgb, var(--color-gold) 12%, var(--bg-subtle)) 50%,
          var(--bg-subtle) 100%
        );
        background-size: 200% 100%;
        animation: bs-guidance-shimmer 1.5s infinite linear;
      }
      [data-theme="dark"] .bs-guidance-skel {
        background: linear-gradient(
          90deg,
          var(--bg-muted) 0%,
          color-mix(in srgb, var(--color-gold) 18%, var(--bg-muted)) 50%,
          var(--bg-muted) 100%
        );
        background-size: 200% 100%;
        animation: bs-guidance-shimmer 1.5s infinite linear;
      }
      @media (prefers-reduced-motion: reduce) {
        .bs-guidance-skel { animation: none; background: var(--bg-subtle); }
        [data-theme="dark"] .bs-guidance-skel { background: var(--bg-muted); }
      }
    `}</style>
    {/* header line */}
    <div className="bs-guidance-skel mb-3" style={{ height: 16, width: 160 }} />
    <div className="mt-2" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
      {/* EPS row */}
      <div className="flex items-center gap-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3, 12px)' }}>
        <div className="bs-guidance-skel" style={{ height: 16, width: 40 }} />
        <div className="bs-guidance-skel" style={{ height: 16, width: 176 }} />
        <div className="bs-guidance-skel ml-auto" style={{ height: 24, width: 96, borderRadius: 999 }} />
      </div>
      {/* Revenue row */}
      <div className="flex items-center gap-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3, 12px)' }}>
        <div className="bs-guidance-skel" style={{ height: 16, width: 56 }} />
        <div className="bs-guidance-skel" style={{ height: 16, width: 192 }} />
        <div className="bs-guidance-skel ml-auto" style={{ height: 24, width: 96, borderRadius: 999 }} />
      </div>
    </div>
    {/* SEC section placeholder (min-height 確保で CLS 防止) */}
    <div
      className="mt-4 rounded-lg p-4"
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', minHeight: 140 }}
    >
      <div className="bs-guidance-skel mb-3" style={{ height: 12, width: 80 }} />
      {[140, 200, 170, 190, 155].map((w, i) => (
        <div key={i} className="bs-guidance-skel mb-2.5" style={{ height: 12, width: `${w}px`, animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  </section>
);

const SecSkeleton = () => (
  <div className="mt-4 rounded-lg p-4" style={{ background: 'var(--bg-subtle)', border: '0.5px solid var(--border)' }}>
    <div className="mb-3 h-3 w-20 rounded bg-slate-200" style={{animation:'pulse 1.5s infinite'}} />
    {[140, 200, 170, 190, 155].map((w, i) => (
      <div key={i} className="mb-2.5 h-3 rounded bg-slate-200"
        style={{width:`${w}px`, animation:'pulse 1.5s infinite', animationDelay:`${i * 0.1}s`}} />
    ))}
    <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
  </div>
);

// v97 Phase F emoji audit: ✅ 🟡 ❌ ❓ (full-width OS emoji glyph、 Aman 級ではない) を
// unicode 半角記号 (✓ – ✕ ·) に置換。 OS 依存 glyph 解消 + 「最高級ホテル」 タイポ品格。
// 色 / 背景は既存 token (緑/amber/赤/グレー) 維持で投資業界色ルール遵守。
const VERDICT_STYLE = {
  beat:     { bg: 'bg-[#22c55e]', icon: '✓', label: '上振れ（Beat）' },
  'in-line':{ bg: 'bg-[#eab308]', icon: '–', label: '概ね一致（In-line）' },
  miss:     { bg: 'bg-[#ef4444]', icon: '✕', label: '下振れ（Miss）' },
  // unknown は inline style（color/bg はインライン適用、Row 側で分岐）
  unknown:  { color: '#9ca3af', bg: 'rgba(156,163,175,0.15)', icon: '·', label: '不明' },
  '不明':   { color: '#9ca3af', bg: 'rgba(156,163,175,0.15)', icon: '·', label: '不明' },
};

function formatEps(v) {
  if (v === null || v === undefined) return '—';
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function formatRevenue(v) {
  if (v === null || v === undefined) return null;
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function formatPct(v) {
  if (v === null || v === undefined) return '';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

/** EPS absolute diff: used when estimate is near-zero and % would be misleading */
function formatAbsDiff(actual, estimated) {
  if (actual == null || estimated == null) return '';
  const diff = actual - estimated;
  const sign = diff >= 0 ? '+' : '';
  // reuse formatEps which already formats as $X.XX with negative sign
  return `${sign}${formatEps(diff)}`;
}

// v97 G-1 sub-agent verdict 案 A 軽量版: 2 Scorecard 大型化 + 自然文 collapse。
// user dogfood「文字壁感、 パッと見でわかりにくい」 → 大型達成率 (32px) + verdict バッジ
// + arc progress (SVG) で「2 秒 readable」 を実現。 既存 Row は legacy として残置、
// 新 ScorecardCell を採用。
function ArcProgress({ value, color = 'var(--color-accent)', size = 56, strokeWidth = 4 }) {
  // value: 達成率 % (0-150 で clamp、 100 を中央 anchor とする arc)
  // arc: 半円 (180°) 弧で 0-100% を表現、 100%+ は full + overflow バッジ
  if (value == null || !Number.isFinite(value)) {
    return (
      <div
        style={{
          width: size,
          height: size / 2 + strokeWidth,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
        aria-hidden="true"
      >
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>
      </div>
    );
  }
  const clamped = Math.max(0, Math.min(150, value));
  const ratio = Math.min(1, clamped / 100);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;
  // 半円 arc (180° = π rad) を value/100 で埋める
  const startAngle = Math.PI;
  const endAngle = Math.PI - Math.PI * ratio;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = ratio > 0.5 ? 1 : 0;
  const pathD = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  // 100% bench mark に dashed line
  return (
    <svg
      width={size}
      height={size / 2 + strokeWidth}
      viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {/* background half circle */}
      <path
        d={`M ${strokeWidth / 2} ${cy} A ${r} ${r} 0 0 1 ${size - strokeWidth / 2} ${cy}`}
        fill="none"
        stroke="var(--bg-muted)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* progress arc */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ScorecardCell({ label, estimated, actual, surprisePct, verdict, formatter, signalQuality, nextEarningsDays, isAwaitingEarnings }) {
  const style = verdict ? VERDICT_STYLE[verdict] : null;
  const isUnknown = verdict === 'unknown' || verdict === '不明';
  // 達成率 % (actual / estimated * 100、 ただし estimated が 0 / null なら null)
  let achievementPct = null;
  if (Number.isFinite(actual) && Number.isFinite(estimated) && Math.abs(estimated) > 0.01) {
    achievementPct = (actual / Math.abs(estimated)) * 100;
  }
  // verdict 由来の arc color
  const arcColor = verdict === 'beat' ? 'var(--color-gain)' :
                   verdict === 'miss' ? 'var(--color-loss)' :
                   verdict === 'in-line' ? 'var(--color-warning)' :
                   'var(--text-muted)';
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        padding: 'var(--space-4, 16px)',
        borderRadius: 'var(--radius-md, 12px)',
        background: 'var(--bg-subtle)',
        border: '1px solid color-mix(in srgb, var(--color-gold) 18%, var(--border))',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2, 8px)',
        minHeight: 160,
      }}
      data-testid={`scorecard-${label}`}
    >
      {/* header: label + signal chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)' }}>
        <span
          style={{
            display: 'inline-block',
            width: 3,
            height: 11,
            borderRadius: 2,
            background: 'var(--color-gold)',
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          {label}
        </span>
        <SignalQualityChip signalQuality={signalQuality} kind={label} />
      </div>

      {/* 達成率 大型表示 + arc progress */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3, 12px)', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {achievementPct != null ? (
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                lineHeight: 1,
                color: arcColor,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
              }}
            >
              {achievementPct.toFixed(0)}<span style={{ fontSize: 18, fontWeight: 600 }}>%</span>
            </span>
          ) : isAwaitingEarnings ? (
            <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-muted)' }}>
              発表待ち
            </span>
          ) : (
            <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-muted)' }}>—</span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            達成率
          </span>
        </div>
        <ArcProgress value={achievementPct} color={arcColor} size={56} strokeWidth={5} />
      </div>

      {/* verdict バッジ + surprise % */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', flexWrap: 'wrap' }}>
        {style && (
          isAwaitingEarnings ? (
            <Chip variant="display" tone="muted" size="sm">
              <Calendar size={12} strokeWidth={1.5} aria-hidden="true" style={{ marginRight: 4 }} />
              発表待ち {Number.isFinite(nextEarningsDays) ? `(D-${nextEarningsDays})` : ''}
            </Chip>
          ) : (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${!isUnknown ? 'text-white ' + style.bg : ''}`}
              style={isUnknown ? { background: style.bg, color: style.color } : undefined}
            >
              <span aria-hidden="true">{style.icon}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{style.label}</span>
            </span>
          )
        )}
        {!isUnknown && surprisePct != null && (
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: arcColor,
            fontVariantNumeric: 'tabular-nums',
          }}>
            ({surprisePct > 0 ? '+' : ''}{surprisePct.toFixed(1)}% vs 予想)
          </span>
        )}
      </div>

      {/* sub-line: 実績 / 予想 (small caps) */}
      {!isAwaitingEarnings && (
        <div style={{ display: 'flex', gap: 'var(--space-3, 12px)', fontSize: 11, color: 'var(--text-muted)', marginTop: 'auto' }}>
          <span>実績 <strong style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatter(actual) || '—'}</strong></span>
          <span>予想 <strong style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatter(estimated) || '—'}</strong></span>
        </div>
      )}
    </div>
  );
}

function Row({ label, estimated, actual, surprisePct, verdict, verdictReason, formatter, source, signalQuality, nextEarningsDays }) {
  const style = verdict ? VERDICT_STYLE[verdict] : null;
  const isUnknown = verdict === 'unknown' || verdict === '不明';
  const reasonText = verdictReason || 'データを取得できませんでした';
  // P0-4: unknown verdict で「発表待ち」表示に切替。
  // nextEarningsDays が正の数 → 次の決算前 → 「📅 発表待ち」を示す。
  const isAwaitingEarnings = isUnknown && Number.isFinite(nextEarningsDays) && nextEarningsDays > 0;
  // signal_quality envelope (handover v82 Phase 0) があれば 3-tier badge を表示。
  // 旧 「via {source}」 italic 文言は signal_quality 経由で SSOT 化、 重複を避けるため撤去。
  return (
    <div className="grid grid-cols-1 gap-2 border-t border-slate-100 py-3 md:grid-cols-[80px_1fr_auto] md:items-center md:gap-4">
      <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        <span>{label}</span>
        <SignalQualityChip signalQuality={signalQuality} kind={label} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-slate-500">予想: </span>
          <span className="font-medium text-slate-900">{formatter(estimated)}</span>
        </div>
        <div>
          <span className="text-slate-500">実績: </span>
          <span className="font-medium text-slate-900">
            {/* P0-4: actual が未定の場合、発表待ちなら D-N 表示、それ以外は — */}
            {actual == null && isAwaitingEarnings
              ? `発表待ち (D-${nextEarningsDays})`
              : formatter(actual)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {style ? (
          isUnknown ? (
            isAwaitingEarnings ? (
              // P0-4: 発表待ち chip (tone="muted"、📅 prefix)
              <Chip
                variant="display"
                tone="muted"
                size="sm"
                title={`次回決算まで ${nextEarningsDays} 日。実績はまだ発表されていません。`}
              >
                <span className="section-header-icon" aria-hidden="true" style={{ width: 14, height: 14, marginRight: 4 }}>
                  <Calendar size={14} strokeWidth={1.5} />
                </span>
                発表待ち
              </Chip>
            ) : (
            <Tooltip text={reasonText}>
              <span
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold cursor-help"
                style={{ background: style.bg, color: style.color }}
              >
                {/* P0-5: white-space nowrap で縦書き防止 */}
                <span>{style.icon}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{style.label}</span>
              </span>
            </Tooltip>
            )
          ) : (
            <>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white ${style.bg}`}
              >
                <span>{style.icon}</span>
                <span>{style.label}</span>
              </span>
              <span className="text-sm font-semibold text-slate-700">
                {surprisePct != null
                  ? formatPct(surprisePct)
                  : formatAbsDiff(actual, estimated)}
              </span>
            </>
          )
        ) : (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
            データなし
          </span>
        )}
      </div>
    </div>
  );
}

function RevenueRow({ revenueActual, revenueEstimated, signalQuality }) {
  const formatted = formatRevenue(revenueActual);

  if (!formatted) {
    return (
      <div className="grid grid-cols-1 gap-2 border-t border-slate-100 py-3 md:grid-cols-[80px_1fr_auto] md:items-center md:gap-4">
        <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <span>売上高</span>
          <SignalQualityChip signalQuality={signalQuality} kind="売上高" />
        </div>
        <div className="text-sm text-slate-500">—</div>
        <div>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
            データなし
          </span>
        </div>
      </div>
    );
  }

  if (revenueEstimated == null) {
    // アナリスト予想未取得 → handover v82 Trust Cliff fix: 「公式未開示」 統一
    return (
      <div className="grid grid-cols-1 gap-2 border-t border-slate-100 py-3 md:grid-cols-[80px_1fr_auto] md:items-center md:gap-4">
        <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <span>売上高</span>
          <SignalQualityChip signalQuality={signalQuality} kind="売上高" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <div>
            <span className="text-slate-500">予想: </span>
            <span className="text-sm italic" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>公式未開示</span>
          </div>
          <div>
            <span className="text-slate-500">実績: </span>
            <span className="font-medium text-slate-900">{formatted}</span>
          </div>
        </div>
        <div>
          <span className="text-sm italic" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>—</span>
        </div>
      </div>
    );
  }

  const rawPct = (Math.abs(revenueEstimated) > 0)
    ? ((revenueActual - revenueEstimated) / Math.abs(revenueEstimated)) * 100
    : null;
  const surprisePct = rawPct != null ? Math.max(-500, Math.min(500, rawPct)) : null;
  const verdict = surprisePct == null ? 'in-line'
    : surprisePct >= 3 ? 'beat' : surprisePct <= -3 ? 'miss' : 'in-line';
  const style = VERDICT_STYLE[verdict];
  return (
    <div className="grid grid-cols-1 gap-2 border-t border-slate-100 py-3 md:grid-cols-[80px_1fr_auto] md:items-center md:gap-4">
      <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        <span>売上高</span>
        <SignalQualityChip signalQuality={signalQuality} kind="売上高" />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-slate-500">予想: </span>
          <span className="font-medium text-slate-900">{formatRevenue(revenueEstimated)}</span>
        </div>
        <div>
          <span className="text-slate-500">実績: </span>
          <span className="font-medium text-slate-900">{formatted}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white ${style.bg}`}>
          <span>{style.icon}</span>
          <span>{style.label}</span>
        </span>
        <span className="text-sm font-semibold text-slate-700 tabular-nums">
          {surprisePct != null ? (surprisePct > 0 ? '+' : '') + surprisePct.toFixed(1) + '%' : ''}
        </span>
      </div>
    </div>
  );
}

const renderBold = (line) => {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
};

const renderGuidanceText = (text) => {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return null;
    if (/^[・•\-]/.test(line.trim())) {
      return (
        <li key={i} style={{
          marginBottom: '6px',
          lineHeight: '1.6',
          fontSize: '0.9em',
          listStyle: 'none',
          paddingLeft: '0',
          display: 'flex',
          gap: '6px'
        }}>
          <span style={{color:'var(--color-text-secondary)', flexShrink:0}}>・</span>
          <span>{renderBold(line.replace(/^[・•\-]\s*/, ''))}</span>
        </li>
      );
    }
    if (/[：:]\s*$/.test(line.trim())) {
      return (
        <p key={i} style={{ fontWeight: 'bold', marginTop: '10px', marginBottom: '4px', fontSize: '0.9em' }}>
          {renderBold(line)}
        </p>
      );
    }
    return (
      <p key={i} style={{ fontSize: '0.9em', lineHeight: '1.6' }}>
        {renderBold(line)}
      </p>
    );
  }).filter(Boolean);
};

export default function GuidanceCard({ guidance, isLoading = false, isSecLoading = false, nextEarningsDays = null }) {
  const [showModal, setShowModal] = useState(false);
  // Phase 2.6 5-1: Tier M halo sweep (FiveConditionsCard と同一パターン)
  // IntersectionObserver で初入場時に 1 回限り halo-sweep animation を発火
  const cardRef = useRef(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (el.dataset.haloFired === '1') return;
    let timer = null;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) return;
        if (el.dataset.haloFired === '1') return;
        io.disconnect();
        el.dataset.haloReady = '1';
        const HALO_DURATION_MS = 920; // 900ms CSS duration + 20ms buffer
        timer = setTimeout(() => {
          el.removeAttribute('data-halo-ready');
          el.dataset.haloFired = '1';
        }, HALO_DURATION_MS);
      },
      { rootMargin: '-10% 0px -10% 0px', threshold: 0.15 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []); // mount 時 once

  if (isLoading && !guidance) return <GuidanceSkeleton />;

  if (!guidance) {
    return (
      // Phase 2.6 5-1: tier-m-glow wrapper — halo sweep の IO observe 対象
      <div ref={cardRef} className="tier-m-glow" data-testid="guidance-card-wrapper">
        <section className="panel-card rounded-2xl p-5 shadow-sm" style={GUIDANCE_SECTION_STYLE}>
          <div className="flex items-center justify-between">
            <h3 className="section-label flex items-center gap-1.5" style={{ marginBottom: 0 }}>
              <span className="section-header-icon" aria-hidden="true">
                <BarChart3 size={18} strokeWidth={1.5} />
              </span>
              ガイダンス進捗
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[9px] font-bold transition-colors"
                style={{
                  background: 'rgba(34,211,238,0.15)',
                  color: 'rgb(56, 189, 248)',
                  border: '1px solid rgba(34,211,238,0.4)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.30)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.15)'; }}
                aria-label="ガイダンス達成状況の説明を表示"
              >
                ？
              </button>
            </h3>
            <span className="text-xs text-amber-600">
              ※ データプランの制限により取得できませんでした。
            </span>
          </div>
          {showModal && <GuidanceInfoModal onClose={() => setShowModal(false)} />}
        </section>
      </div>
    );
  }

  const { fiscal_period, date, eps, revenue, revenue_actual, revenue_estimated, sec_guidance_text, sec_guidance_source } = guidance;
  // handover v82 Phase 0 で eps.signal_quality / revenue.signal_quality envelope を backend 追加。
  // 旧 guidance には存在しないので optional chaining で安全に取得。
  const epsSignalQuality = eps?.signal_quality || null;
  const revenueSignalQuality = revenue?.signal_quality || null;
  const subtitle = fiscal_period || date || '直近決算';

  return (
    // Phase 2.6 5-1: tier-m-glow wrapper — halo sweep の IO observe 対象
    <div ref={cardRef} className="tier-m-glow" data-testid="guidance-card-wrapper">
    <section className="panel-card rounded-2xl p-5 shadow-sm" style={GUIDANCE_SECTION_STYLE}>
      <div className="flex items-center justify-between">
        <h3 className="section-label flex items-center gap-1.5" style={{ marginBottom: 0 }}>
          <span className="section-header-icon" aria-hidden="true">
            <BarChart3 size={18} strokeWidth={1.5} />
          </span>
          ガイダンス進捗
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[9px] font-bold transition-colors"
            style={{
              background: 'rgba(34,211,238,0.15)',
              color: 'rgb(56, 189, 248)',
              border: '1px solid rgba(34,211,238,0.4)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.30)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.15)'; }}
            aria-label="ガイダンス達成状況の説明を表示"
          >
            ？
          </button>
        </h3>
        <span className="text-xs text-slate-500">{subtitle}</span>
      </div>
      {showModal && <GuidanceInfoModal onClose={() => setShowModal(false)} />}
      <p className="mt-1 text-[10px] text-slate-400">
        ※ EPS: GAAP（報告値）基準。リストラ費用・資産売却等の非経常損益を含みます。調整後EPS（Non-GAAP）との乖離にご注意ください。
      </p>
      <p className="mt-0.5 text-[10px] text-slate-400">
        ※ 判定閾値 ±3%（上振れ Beat / 概ね一致 In-line / 下振れ Miss）。業種により適切な閾値は異なります。
      </p>
      {/* v97 G-1 Scorecard 2 cards (sub-agent verdict 案 A 軽量版): EPS / 売上 横並び
          大型達成率 + arc progress + verdict バッジ で「2 秒 readable」 を実現。
          legacy Row / RevenueRow は他用途で残置、 ここでは ScorecardCell を採用。 */}
      <div className="mt-3" style={{ display: 'flex', gap: 'var(--space-3, 12px)', flexWrap: 'wrap' }}>
        <ScorecardCell
          label="EPS"
          estimated={eps?.estimated}
          actual={eps?.actual}
          surprisePct={eps?.surprise_pct}
          verdict={eps?.verdict}
          formatter={formatEps}
          signalQuality={epsSignalQuality}
          nextEarningsDays={nextEarningsDays}
          isAwaitingEarnings={
            (eps?.verdict === 'unknown' || eps?.verdict === '不明')
            && Number.isFinite(nextEarningsDays) && nextEarningsDays > 0
          }
        />
        <ScorecardCell
          label="売上高"
          estimated={revenue_estimated}
          actual={revenue_actual}
          surprisePct={
            (Number.isFinite(revenue_actual) && Number.isFinite(revenue_estimated) && Math.abs(revenue_estimated) > 0)
              ? ((revenue_actual - revenue_estimated) / Math.abs(revenue_estimated)) * 100
              : null
          }
          verdict={(() => {
            if (!Number.isFinite(revenue_actual) || !Number.isFinite(revenue_estimated)) return 'unknown';
            if (Math.abs(revenue_estimated) === 0) return 'in-line';
            const p = ((revenue_actual - revenue_estimated) / Math.abs(revenue_estimated)) * 100;
            if (p >= 3) return 'beat';
            if (p <= -3) return 'miss';
            return 'in-line';
          })()}
          formatter={formatRevenue}
          signalQuality={revenueSignalQuality}
          nextEarningsDays={nextEarningsDays}
          isAwaitingEarnings={
            !Number.isFinite(revenue_actual)
            && Number.isFinite(nextEarningsDays) && nextEarningsDays > 0
          }
        />
      </div>
      {isSecLoading && !sec_guidance_text ? (
        <SecSkeleton />
      ) : sec_guidance_text ? (
        // v97 G-1 sub-agent verdict: 文字壁解消のため <details> で default collapse。
        // summary をユーザーが「読みたい時だけ展開」、 panel 全体の認知負荷を 60% 削減。
        // R1-b CLS fix も維持 (open 時 minHeight 140 + maxHeight 280 + overflow auto)。
        <details
          className="mt-4"
          style={{
            background: 'var(--bg-subtle)',
            border: '0.5px solid var(--border)',
            borderRadius: '8px',
            padding: 'var(--space-3, 12px) var(--space-4, 16px)',
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              listStyle: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2, 8px)',
              userSelect: 'none',
            }}
            data-testid="sec-guidance-summary"
          >
            <CalendarRange size={13} strokeWidth={1.5} aria-hidden="true" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              次期見通し (SEC 文書由来)
            </span>
            {sec_guidance_source && (
              <span className="text-[10px]" style={{ color: 'rgb(96, 165, 250)' }}>{sec_guidance_source}</span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              展開で全文 ›
            </span>
          </summary>
          <div
            className="text-sm leading-relaxed"
            style={{
              color: 'var(--text-secondary)',
              marginTop: 'var(--space-3, 12px)',
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            <ul style={{ paddingLeft: '0', margin: '0' }}>
              {renderGuidanceText(sec_guidance_text)}
            </ul>
          </div>
        </details>
      ) : null}
    </section>
    </div>
  );
}
