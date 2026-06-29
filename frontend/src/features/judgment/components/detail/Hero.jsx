import { useState } from 'react';
import Card from '../../primitives/Card.jsx';
import { Star } from 'lucide-react';

// 2026-06-14 user feedback: ウォッチ登録時の「★のかけらが飛び散る」 演出の方向ベクトル (6 方位、px)。
// Math 実行時計算を避け固定配列 (hexagon)。CSS は --bx/--by で各 particle の飛距離を受ける。
const WATCH_BURST_DIRS = [
  [0, -22], [19, -11], [19, 11], [0, 22], [-19, 11], [-19, -11],
];
import Chip from '../../../../components/ui/Chip.jsx';
import EarningsRing from '../../../../components/EarningsRing.jsx';
import CompanyLogo from '../../../../components/CompanyLogo.jsx';
import { usePeriodReturns } from '../../../../hooks/usePeriodReturns.js';

// v86 R4 #3: 補助情報 chip スタイル (Hero 中央密度 anchor、 tabular-nums)
// 視覚 fidelity (2026-06-28): 正本 mockup id-row .pill-meta に合わせ 11.5px / padding 3×10 / 丸 pill (radius-pill)。
const heroFactChipStyle = {
  fontSize: 11.5,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-pill, 9999px)',
  padding: '3px 10px',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};
// 視覚 fidelity (2026-06-28): mockup .pill-countdown = amber (次決算カウントダウン)。
//   §38: 決算までの日数は事実 (時間情報) であり買い推奨でない。amber = 投資業界の「警告/注目」色 (CLAUDE.md)。
const heroFactChipCountdown = {
  ...heroFactChipStyle,
  color: 'var(--color-warning)',
  borderColor: 'color-mix(in srgb, var(--color-warning) 30%, var(--border))',
  fontWeight: 600,
};

// v6 L0 mockup id-row「テクノロジー」セクター pill: backend (rs.sector) は FMP の英語 GICS sector raw。
// 表示層で和訳 (data/presentation 分離)。canonical 11 sector を exact-match、未知は raw 英語へ fallback。
// feedback_enum_mislabel_allowlist: 近接 enum へ誤マップせず exact-match のみ (誤ラベル = Trust Cliff)。
// §38: 事実指標 (neutral 色・緑/accent 禁止)。
const SECTOR_JP = {
  'Technology': 'テクノロジー',
  'Financial Services': '金融',
  'Healthcare': 'ヘルスケア',
  'Consumer Cyclical': '一般消費財',
  'Consumer Defensive': '生活必需品',
  'Communication Services': '通信サービス',
  'Industrials': '資本財',
  'Energy': 'エネルギー',
  'Basic Materials': '素材',
  'Real Estate': '不動産',
  'Utilities': '公益事業',
};
const sectorLabelJp = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const k = raw.trim();
  if (!k) return null;
  return SECTOR_JP[k] || k; // 未知 sector は raw 英語をそのまま (捏造でなく事実)
};

/**
 * Hero section. design_system.md §B-2 Display tier 28-32px, fw600, -0.02em, lh1.1.
 * Verdict chip = beat/miss/in-line/unknown (§1-A).
 *
 * handover v82 Phase 5: EarningsRing を verdict chip の左隣 (small 40px) に mount。
 * planGating earnings_countdown_ring = FREE (マーケ verdict、 LP 訴求 hook)。
 *
 * SPEC 2026-05-19 Sprint 1 Item 3: verdict='unknown' の label を「判定待ち」に変更。
 *   Trust Cliff 解消: 「Unknown」(意味不明) → 「判定待ち」(決算発表前の状態を明示)。
 *   tooltip: 「最新四半期の決算がまだ発表されていません」(Chip primitive の title prop)。
 *   tone は muted 維持 (緑/赤/amber/cyan 使わない、投資業界色ルール遵守)。
 *
 * SPEC 2026-05-19 Sprint 2 Item 1: Hero 企業ロゴ併記 (brand-aspiration priority 1)。
 *   ticker 左に 48-56px 角丸 logo (CompanyLogo shape='rounded' monoFallback)。
 *   border-radius: var(--radius-md) token 経由。
 *   fallback: TV → FMP → neutral gray 頭文字円 (投資業界色ルール遵守)。
 *   fade-in: logo load 後 opacity 0→1 / 200ms ease-out (prefers-reduced-motion: none 時)。
 */
export default function Hero({
  ticker,
  companyName,
  verdict = 'unknown',
  period,
  nextEarningsDays,
  nextEarningsDate,
  // v6 L0 mockup id-price: 同定層の右に株価列 (価格 / 前日比 / 1W·1M)。
  //   price/changePct は detail 由来、1W/1M は usePeriodReturns (ReturnGrid と同 source)。§38: 事実数値のみ。
  price,
  changePct,
  // v6 L0 mockup id-row「テクノロジー」: 同定 sector pill (technicalRs.sector = FMP 英語 raw、§38 事実指標)。
  //   universe cache 外 / 未取得は undefined → pill 非表示 (捏造しない)。和訳は SECTOR_JP (上記)。
  sector,
  frameless = false,
  /**
   * v99 dogfood feedback ① / ③ (3 体合議):
   * - hideEyebrow=true で「判定」 eyebrow を非表示 (章扉「I. 判定」 と二重防止、 v2 mode 時)
   * - hideCountdownChip=true で D-XX chip を非表示 (EarningsRing 側に統一、 v2 mode 時)
   * default false で完全 backward compat。
   */
  hideEyebrow = false,
  hideCountdownChip = false,
  // 2026-06-14 (D2 compass・第2手): 5条件由来の verdict チップ (Beat/Miss/判定待ち) を非表示。
  // 状態コンパスが本物の信号を持つため、冒頭の二値 verdict を撤去し Miss⇔Beat 矛盾を解消。
  hideVerdictChip = false,
  // v6 IA (SPEC_2026-06-27 §2 L0): L0 は「判定でなく同定 (identity)」。EarningsRing は決算カウントダウン
  //   ring だが視覚的に verdict ring と紛らわしく、data 未取得時に「?/取得待ち」 fallback が「壊れて見える」
  //   (dogfood feedback)。v6 L0 では ring を非表示にし、カウントダウンは D-XX pill (hideCountdownChip=false)
  //   のみで担保 (mockup pane3-detail-v1.html の id-row 構造に一致)。default false で v5/legacy は不変。
  hideEarningsRing = false,
  // 2026-06-14 (D2 compass): ウォッチ追加済を「★」アイコンのみに簡素化 (compass の簡素な Hero で
  // 「★追加済」が目立つ、user dogfood)。未追加時は discoverability のため「ウォッチ追加」テキスト維持。
  compactWatchlist = false,
  // v160 D2 Sprint 2: ウォッチ追加ボタン (screener master-detail で Pane 3 詳細から直接追加)。
  //   onAddToWatchlist は App.jsx addToWatchlist (重複ガード + 無料 3 件制限 + 未ログイン同期 toast)。
  //   未配線 (legacy path) では onAddToWatchlist=undefined で button 自体を非表示 = 安全。
  watchlist,
  onAddToWatchlist,
}) {
  const inWatchlist = Array.isArray(watchlist) && !!ticker && watchlist.includes(ticker);
  // v6 L0 mockup id-price: 1W/1M リターン (usePeriodReturns・ReturnGrid と同 endpoint・return_pct は % 単位)。
  const { data: periodReturns } = usePeriodReturns(ticker);
  const ret1W = periodReturns?.periods?.['1W']?.return_pct;
  const ret1M = periodReturns?.periods?.['1M']?.return_pct;
  // v6 L0 mockup id-row セクター pill: 英語 raw → 和訳 (exact-match、未知は raw fallback)。null なら非表示。
  const sectorJp = sectorLabelJp(sector);
  const priceNum = price != null ? Number(price) : NaN;
  const changeNum = changePct != null ? Number(changePct) : NaN;
  const retColor = (r) => (r > 0 ? 'var(--color-gain)' : r < 0 ? 'var(--color-loss)' : 'var(--text-muted)');
  const fmtRet = (r) => `${r > 0 ? '+' : ''}${r.toFixed(2)}%`;
  // 2026-06-14 user feedback: 登録時の burst 演出 (追加方向のみ発火、解除では出さない)。一度きり 650ms。
  const [watchBurst, setWatchBurst] = useState(false);
  const handleWatchClick = () => {
    if (!ticker || !onAddToWatchlist) return;
    if (!inWatchlist) {
      setWatchBurst(true);
      setTimeout(() => setWatchBurst(false), 650);
    }
    onAddToWatchlist(ticker);
  };
  const tone =
    verdict === 'beat' ? 'gain' : verdict === 'miss' ? 'loss' : verdict === 'in-line' ? 'muted' : 'muted';
  const verdictLabel =
    verdict === 'beat'
      ? 'Beat'
      : verdict === 'miss'
        ? 'Miss'
        : verdict === 'in-line'
          ? 'In-line'
          : '判定待ち';
  // verdict='unknown' 時: tooltip で「決算発表前」を明示 (Trust Cliff 解消)。
  const verdictTooltip =
    verdict !== 'beat' && verdict !== 'miss' && verdict !== 'in-line'
      ? '決算発表前のため判定保留中'
      : undefined;

  // Phase 3 #6 View Transition: Pane 3 で 1 個のみ (重複なし)。
  // ticker 切替時に logo + ticker + 企業名 + verdict chip が cross-fade morph。
  // Card は ...rest を受け取るため style で直接付与可能。
  return (
    <Card data-testid="pane3-hero" frameless={frameless} style={{ viewTransitionName: 'ticker-hero' }}>
      <div
        style={{
          // v86 R5 C: Aman / Ritz 入場感のため padding を --space-6 (24px) → --space-8 (32px) に
          // 一段「ロビー」 感が出る breathing room (token は 4/8/12/16/24/32/48 のみ、 7 は無し)。
          // Vision aman 70 → 75+ 狙い、 既存 token を使用 (design system 整合)。
          padding: 'var(--space-8, 32px)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-8, 32px)',
          flexWrap: 'wrap',
        }}
      >
        {/* ticker 左側: ロゴ + テキスト情報 */}
        {/* 視覚 fidelity (2026-06-28): 正本 mockup .id-row は align-items:center (logo を name ブロック中央へ)。
            旧 flex-start + marginTop:9 hack は ticker 40px 前提だったので撤去 (ticker 26px 化に伴い不要)。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3, 12px)', minWidth: 0, flex: 1 }}>
          {/* Sprint 2: 企業ロゴ。視覚 fidelity: mockup .logo は 52px 角丸13px (同定層の主役) なので 40→52px。
              fadeIn=true / monoFallback=true (neutral gray・投資業界色ルール) / shape='rounded' (--radius-md)。 */}
          <div style={{ flexShrink: 0 }}>
            <CompanyLogo
              ticker={ticker}
              size={52}
              shape="rounded"
              monoFallback
              fadeIn
            />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
          {/* v99 dogfood feedback ① (3 体合議): v2 mode (?pane3_v2=1) では章扉「I. 判定」 と二重に
              なるため eyebrow「判定」 label を非表示。 default は維持 (revert 安全)。 */}
          {!hideEyebrow && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            判定
          </div>
          )}
          {/* 視覚 fidelity (2026-06-28): 正本 mockup .id-ticker は 26px/700/lh1/ls-0.01em (L0=同定行であり
              hero 級 40px でない)。40px は旧「Hero」由来の legacy。v6 同定行に合わせ 26px へ。 */}
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              lineHeight: 1,
              margin: '0 0 3px',
              color: 'var(--text-primary)',
            }}
          >
            {ticker}
          </h1>
          {(companyName || period) && (
            <div
              style={{
                // 視覚 fidelity (2026-06-28): mockup .id-company は 13px/400 で「社名 · FY期」を 1 行併記
                //   (mockup「Apple Inc. · FY2025 Q3」)。FY を独立 pill から会社名行へ移動。
                fontSize: 13,
                fontWeight: 400,
                color: 'var(--text-secondary)',
                lineHeight: 1.3,
              }}
            >
              {[companyName, period].filter(Boolean).join(' · ')}
            </div>
          )}
          {/* 視覚 fidelity (2026-06-28): mockup id-meta は pill 2個のみ = [次決算カウントダウン(amber)・セクター]。
              FY は会社名行へ移動・「次回日付」pill は撤去 (mockup に無い・カウントダウンと冗長)。順序も mockup 準拠。 */}
          {(sectorJp || (Number.isFinite(nextEarningsDays) && nextEarningsDays > 0 && !hideCountdownChip)) && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2, 8px)',
                marginTop: 'var(--space-2, 8px)',
                alignItems: 'center',
              }}
            >
              {/* 次決算カウントダウン (amber pill・mockup「次決算まで N 日」)。§38: 時間事実で買い推奨でない。 */}
              {Number.isFinite(nextEarningsDays) && nextEarningsDays > 0 && !hideCountdownChip && (
                <span style={heroFactChipCountdown}>次決算まで {nextEarningsDays} 日</span>
              )}
              {/* セクター pill: neutral (§38 事実指標・緑/accent 不使用)。和訳済 (SECTOR_JP)。 */}
              {sectorJp && (
                <span style={heroFactChipStyle} data-testid="pane3-hero-sector">{sectorJp}</span>
              )}
            </div>
          )}
          </div>{/* end: テキスト情報 div */}
        </div>{/* end: ロゴ + テキスト flex div */}
        {/* Sprint 3: EarningsRing が wrapper(ring + 下ラベル) を返すため flex-start に変更
            v115 fix: Number.isFinite() gate を除去、 EarningsRing 内部で 'unknown' state を扱う
            (data 未取得時に「取得待ち」 fallback 表示で「壊れて見える」 bug 対策) */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3, 12px)' }}>
          {/* v6 L0 mockup id-price: 株価列 (右寄せ・価格 / 前日比 / 1W·1M)。価格は「同定」= verdict 扱いを外す。*/}
          {Number.isFinite(priceNum) && (
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                ${priceNum.toFixed(2)}
              </div>
              {Number.isFinite(changeNum) && (
                <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: retColor(changeNum) }}>
                  {changeNum > 0 ? '+' : ''}{(changeNum * 100).toFixed(2)}%
                </div>
              )}
              {(Number.isFinite(ret1W) || Number.isFinite(ret1M)) && (
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {Number.isFinite(ret1W) && (<>1W <span style={{ color: retColor(ret1W) }}>{fmtRet(ret1W)}</span></>)}
                  {Number.isFinite(ret1W) && Number.isFinite(ret1M) && ' · '}
                  {Number.isFinite(ret1M) && (<>1M <span style={{ color: retColor(ret1M) }}>{fmtRet(ret1M)}</span></>)}
                </div>
              )}
            </div>
          )}
          {!hideEarningsRing && (
            <EarningsRing
              daysToEarnings={nextEarningsDays}
              earningsDate={nextEarningsDate}
              size={44}
            />
          )}
          {/* Phase 2.9 Sprint H3 #Gold Foil verdict badge (Aman 級 100 点 verdict、 案 1):
              Beat 時に gold metallic gradient で「最高級ホテルの真鍮プレート」 idiom。
              他 verdict (Miss / In-line / 判定待ち) は既存 tone (loss / muted) 維持。
              CSS rule は index.css [data-verdict-gold="true"] で 1 箇所定義。 */}
          {!hideVerdictChip && (
            <Chip
              size="md"
              variant="display"
              tone={tone}
              title={verdictTooltip}
              data-verdict-gold={verdict === 'beat' ? 'true' : undefined}
            >
              {verdictLabel}
            </Chip>
          )}
          {/* v160 D2 Sprint 2 → SPEC 2026-06-04 B: ウォッチ★ボタン。 onAddToWatchlist 未配線時は非表示。
              2026-06-14 user feedback (compass header = compactWatchlist):
                - 登録前後でアイコン配置が変わり隣の EarningsRing がズレる → 両状態とも同サイズの pill ★ に統一。
                - 枠付き「横長◯」 (pill) + 色を gold → cyan (brand) に変更。未追加=outline / 追加済=fill。
                - :active へこみ演出 (.hero-watch-star CSS) + 登録時 burst (★のかけら飛散)。
              非 compact モード (旧 Chip「ウォッチ追加 / 追加済」) は従来どおり維持。 */}
          {onAddToWatchlist && ticker && (
            compactWatchlist ? (
              <button
                type="button"
                className={`hero-watch-star${inWatchlist ? ' is-active' : ''}${watchBurst ? ' is-bursting' : ''}`}
                data-testid={inWatchlist ? 'hero-watchlist-added' : 'hero-watchlist-add'}
                title={inWatchlist ? 'クリックでウォッチリストから解除' : `${ticker} をウォッチリストに追加`}
                aria-label={inWatchlist ? `${ticker} をウォッチリストから解除` : `${ticker} をウォッチリストに追加`}
                aria-pressed={inWatchlist}
                onClick={handleWatchClick}
              >
                <Star size={16} strokeWidth={2} aria-hidden className="hero-watch-star__icon" />
                {watchBurst && (
                  <span className="watch-burst" aria-hidden="true">
                    {WATCH_BURST_DIRS.map(([bx, by], i) => (
                      <span
                        key={i}
                        className="watch-burst__p"
                        style={{ '--bx': `${bx}px`, '--by': `${by}px` }}
                      />
                    ))}
                  </span>
                )}
              </button>
            ) : (
              inWatchlist ? (
                <Chip
                  size="md"
                  variant="display"
                  tone="muted"
                  title="クリックでウォッチリストから解除"
                  ariaLabel={`${ticker} をウォッチリストから解除`}
                  onClick={() => onAddToWatchlist(ticker)}
                  data-testid="hero-watchlist-added"
                  icon={<Star size={13} strokeWidth={2} aria-hidden style={{ color: 'var(--color-gold)', fill: 'var(--color-gold)', marginRight: 4, verticalAlign: '-1px' }} />}
                >
                  追加済
                </Chip>
              ) : (
                <Chip
                  size="md"
                  variant="add"
                  tone="accent"
                  className="hero-watch-add"
                  onClick={() => onAddToWatchlist(ticker)}
                  ariaLabel={`${ticker} をウォッチリストに追加`}
                  data-testid="hero-watchlist-add"
                  icon={<Star size={13} strokeWidth={2} aria-hidden style={{ marginRight: 4, verticalAlign: '-1px' }} />}
                >
                  ウォッチ追加
                </Chip>
              )
            )
          )}
        </div>
      </div>
    </Card>
  );
}
