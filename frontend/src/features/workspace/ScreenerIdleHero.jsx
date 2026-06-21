/**
 * ScreenerIdleHero — screener master-detail の Pane3 idle (銘柄未選択時) に表示する
 * 「今日の筆頭」Preview Hero。
 *
 * SPEC 2026-06-20: スクリーナー構造再設計 案B B1 (案A交差条件化 + 透明表示 + 集約)
 *
 * 設計原則:
 *   - 交差条件 (暫定 = RS × テクニカルのみ。ファンダ次元は据え置き):
 *       rs_percentile >= 75
 *       ∩ (cup_state ∈ {breakout_confirmed, breakout_pending} OR breakout_state === 'bo_confirmed')
 *     0件時は cup_state === 'formation' まで緩和するフォールバック。rs 降順 top3。
 *     ※ ADR: SPEC_2026-06-20_screener-master-detail §0-6。案A 本来の funda_pass 交差は専用
 *       セッションで再設計 (SSOT = memory reference_jijima_investment_criteria、KB を正とする)。
 *   - 自前 fetch: fetchScannerUniverse (api.js、auth 自動付与 + dedup 60s) で母集団を取得し
 *     フロントで交差計算。_heroCache / ScreenerPane への依存なし (custom モードでも動作)。
 *   - 透明表示 (user 主訴=ブラックボックス解消): eyebrow/説明で交差条件を明示 + ⓘ で各条件の意味。
 *   - tier gate: cup_state/breakout_state は Premium 限定 (free/pro は null)。dogfood は Premium user。
 *     一般 user の degrade は B6 で対応 (現状 default OFF なので一般 user は到達しない)。
 *   - 発光ゼロ: .panel-card/.bs-panel/.surface-card 不使用。border + tinted-bg + token のみ。
 *   - §38/§5: 軸明示、状態ラベルは静的 dict・色 neutral (買い断定なし)、断定/最上級禁止、免責1行。
 *   - testid を loading/error/empty/main 全 render path に付与。
 *   - inline 関数 component 禁止 (module-level hoist)。shadow ゼロ。raw hex 禁止。
 */
import { useState, useEffect } from 'react';
import { Hourglass, Crown, AlertCircle, Info, Lock, Zap, Target, ArrowUpRight } from 'lucide-react';
import CompanyLogo from '../../components/CompanyLogo.jsx';
import { fetchScannerUniverse } from '../../api.js';

// stagger 定数 (ScreenerPane.jsx と同値で統一感)
const ROW_REVEAL_LEAD = 240; // ms
const ROW_REVEAL_STEP = 64;  // ms

function rowRevealDelay(idx) {
  return ROW_REVEAL_LEAD + idx * ROW_REVEAL_STEP;
}

// 鮮度表示 (S4 condition6): as_of "YYYY-MM-DD" → 本日/昨日/N日前。§38 日次粒度のみ ("X分前" 禁止)。
// CustomScreenerPanel.formatAsOf と同一ロジック (date-only・安定関数のため重複許容、両者で挙動一致)。
function formatAsOf(asOf) {
  if (!asOf) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(asOf);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays <= 0) return '本日更新';
  if (diffDays === 1) return '昨日更新';
  return `${diffDays}日前に更新`;
}

// 交差シグナルの静的ラベル dict (§38: LLM 不使用・色 neutral・断定なし)。
// 優先順位: breakout_confirmed > breakout_pending > bo_confirmed > formation。
function deriveSignalLabel(it) {
  if (it.cup_state === 'breakout_confirmed') return 'ブレイク確定';
  if (it.cup_state === 'breakout_pending') return 'ブレイク待ち';
  if (it.breakout_state === 'bo_confirmed') return '新高値ブレイク';
  if (it.cup_state === 'formation') return 'カップ形成中';
  return null;
}

// Sprint B (B-3 写経): signal 種別 → Lucide icon。色 (緑/赤) でなく「アイコン形状」で type を
// 識別し §38 色 neutral を維持 (色分けは投資色ルールと衝突するため、形状コード + 単一 brand tint に写経)。
// SPEC icon mapping: breakout→Zap / pending→ArrowUpRight / cup→Target (caricature/emoji 禁止)。
function signalIconFor(label) {
  if (label === 'ブレイク確定' || label === '新高値ブレイク') return Zap;
  if (label === 'ブレイク待ち') return ArrowUpRight;
  if (label === 'カップ形成中') return Target;
  return null;
}

// ─── 投資条件しきい値 (KB SSOT = reference_jijima_investment_criteria) ───
// 実装都合で変えない (Trust Cliff §3-1: 投資条件の変更は user 承認必須)。
// eps_yoy 下限は KB「18-20%」(user gate 2026-06-21: 18)、roe≥17、営業CFマージン≥15
// (ナイス・バディの法則)、RS≥75 (じっちゃま較正、O'Neil 80→75)。SPEC §0-2。
const RS_MIN = 75;
const OCF_MARGIN_MIN = 15;
const EPS_YOY_MIN = 18;
const ROE_MIN = 17;

// 各 axis の null-safe predicate (None-preserve: null/未測定は不成立 = honest)。
// ファンダ (ocf/eps/roe/rs) は free tier、テクニカル (cup/breakout) は Premium 限定 field。
const passRs = (it) => typeof it.rs_percentile === 'number' && it.rs_percentile >= RS_MIN;
const passOcf = (it) => typeof it.ocf_margin_pct === 'number' && it.ocf_margin_pct >= OCF_MARGIN_MIN;
const passEps = (it) => typeof it.eps_yoy_pct === 'number' && it.eps_yoy_pct >= EPS_YOY_MIN;
const passRoe = (it) => typeof it.roe === 'number' && it.roe >= ROE_MIN;
// テクニカル: cup confirmed/pending OR breakout bo_confirmed
const passTech = (it) =>
  it.cup_state === 'breakout_confirmed' ||
  it.cup_state === 'breakout_pending' ||
  it.breakout_state === 'bo_confirmed';
// テクニカル緩和: + cup_state formation (取っ手形成中も注目、KB「取っ手形成中も注目」哲学)
const passTechRelaxed = (it) => passTech(it) || it.cup_state === 'formation';

// ─── 段階フォールバック ladder (strict → loose、各 level は前 level の superset) ───
// じっちゃま 2段階フィルターの上流 = 常時鮮度のファンダ候補プール (収益性×成長×ROE) を RS×テクニカルと交差。
// KB「上流 = 収益性×成長の複合」→ 単独足切り (ocf 単独 / RS 単独) は relaxed のみ (SPEC §0-2)。
// top3 を必ず埋めるため、≥3 を満たす最も strict な level を採用 (谷間でも空にしない = 原則4 人力代替)。
// funda_pass (下流・決算サプライズ超過) は交差の必須条件にしない (sparse のため加点バッジのみ)。
const HERO_LADDER = [
  { // L0 strict: RS × 営業CF × EPS成長 × ROE × テクニカル
    pred: (it) => passRs(it) && passOcf(it) && passEps(it) && passRoe(it) && passTech(it),
    eyebrow: 'RS上位 × ファンダ × Cup/ブレイク',
    axes: '相対力(RS)上位 ・ キャッシュ創出力/EPS成長/ROE ・ Cup/ブレイク形成',
    relaxNote: null,
  },
  { // L1: ROE を外す
    pred: (it) => passRs(it) && passOcf(it) && passEps(it) && passTech(it),
    eyebrow: 'RS上位 × ファンダ × Cup/ブレイク',
    axes: '相対力(RS)上位 ・ キャッシュ創出力/EPS成長 ・ Cup/ブレイク形成',
    relaxNote: '※本日は全条件該当が少なく、ROE 条件を緩めた候補です。',
  },
  { // L2: EPS成長も外す → ファンダ = キャッシュ創出力 単独
    pred: (it) => passRs(it) && passOcf(it) && passTech(it),
    eyebrow: 'RS上位 × キャッシュ創出力 × Cup/ブレイク',
    axes: '相対力(RS)上位 ・ キャッシュ創出力 ・ Cup/ブレイク形成',
    relaxNote: '※本日は該当が少なく、成長条件を緩め キャッシュ創出力を中心に広げた候補です。',
  },
  { // L3: ファンダを外す → RS × テクニカル (旧 strict)
    pred: (it) => passRs(it) && passTech(it),
    eyebrow: 'RS上位 × Cup/ブレイク',
    axes: '相対力(RS)上位 ・ Cup/ブレイク形成',
    relaxNote: '※本日はファンダ該当が少なく、RS × テクニカルを中心に広げた候補です。',
  },
  { // L4: テクニカルを formation まで緩和 (旧 relaxed)
    pred: (it) => passRs(it) && passTechRelaxed(it),
    eyebrow: 'RS上位 × Cup/ブレイク',
    axes: '相対力(RS)上位 ・ Cup/ブレイク(形成中含む)',
    relaxNote: '※本日はブレイク確定/待ちが少なく、カップ形成中まで広げた候補です。',
  },
];

// ⓘ ツールチップ文 (各条件の意味、§38: 内部プロトコル名は出さない = 「独自プロトコル」表記)
const CRITERIA_TOOLTIP =
  'RS: 市場全体に対する6ヶ月の相対力が上位75パーセンタイル以上。' +
  ' / キャッシュ創出力: 営業キャッシュフロー ÷ 売上高 ≥ 15%。' +
  ' / EPS成長: EPS 前年比 ≥ 18%。 / ROE ≥ 17%。' +
  ' / Cup・ブレイク: 株価が押し目から高値更新へ向かう形状を形成。';

// -----------------------------------------------------------
// module-level sub-components (inline 関数 component 禁止)
// -----------------------------------------------------------

/** rank circle: Sprint3 scarcity — rank-1 のみ gold (focal)、2-3 は neutral accent。
 *  pop entrance も rank-1 に限定 (複数 row への gold/演出拡散を撤去)。 */
function RankCircle({ rank }) {
  const isFirst = rank === 1;
  return (
    <span
      aria-hidden
      className={[
        'screener-idle-hero__rank',
        isFirst ? 'screener-idle-hero__rank--first' : '',
        isFirst ? 'screener-rank-pop' : '',
      ].filter(Boolean).join(' ')}
      style={{ animationDelay: `${rowRevealDelay(rank - 1)}ms` }}
    >
      {rank}
    </span>
  );
}

/** 銘柄 row 1 件。rank1 のみ featured (padding 広め / ticker 大 / gold hairline = 唯一の big)。
 *  右側に RS percentile (主) + 交差シグナルラベル (副) を縦積みで透明表示。
 *  raw 数値廃止: 全て .screener-idle-hero__* token CSS に委任 (安っぽさ root cause fix)。 */
function LeaderRow({ ticker, rs, signal, rank, onSelect, fundaPass = false }) {
  const isFeatured = rank === 1;
  const SignalIcon = signalIconFor(signal); // Sprint B: signal 種別の icon tile
  return (
    <li
      className="screener-reveal"
      style={{ animationDelay: `${rowRevealDelay(rank - 1)}ms` }}
    >
      <button
        type="button"
        className={[
          'screener-idle-hero__row',
          isFeatured ? 'screener-idle-hero__row--featured' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => onSelect(ticker)}
        data-testid={`idle-hero-ticker-${ticker}`}
        aria-label={`${ticker} の詳細を表示`}
      >
        <RankCircle rank={rank} />
        {/* ロゴ: CompanyLogo (TV→FMP→頭文字円 3段 fallback)。featured のみ一段大 */}
        <span className="screener-idle-hero__logo">
          <CompanyLogo ticker={ticker} size={isFeatured ? 22 : 18} />
        </span>
        {/* typography 層2: ticker (mono / fw700) — featured のみ 1 段大 (big max2 scarcity) */}
        <span
          className={[
            'screener-idle-hero__ticker',
            isFeatured ? 'screener-idle-hero__ticker--featured' : '',
          ].filter(Boolean).join(' ')}
        >
          {ticker}
        </span>
        {/* funda_pass バッジ (下流・決算サプライズ超過 = gold accent、§0-2 2段階区別)。
            加点表示であり交差の必須条件ではない (sparse = 決算シーズン谷間は非表示が正)。 */}
        {fundaPass && (
          <span
            className="screener-idle-hero__funda-badge"
            data-testid={`idle-hero-funda-badge-${ticker}`}
            title="最新決算で5条件 (EPS・売上・来期ガイダンス等) を達成"
          >
            決算5条件
          </span>
        )}
        {/* 右側: RS (主) + シグナルラベル (副)。§38: 色 neutral、買い断定なし */}
        <span className="screener-idle-hero__metrics">
          {typeof rs === 'number' && (
            <span className="screener-idle-hero__rs">RS {rs}</span>
          )}
          {/* typography 層3: signal = 最も静か (caption fw400 muted)。
              Sprint B: 種別 icon tile (形状コード + 単一 brand tint、§38 色 neutral) を前置。 */}
          {signal && (
            <span className="screener-idle-hero__signal">
              {SignalIcon && (
                <span className="screener-idle-hero__signal-tile" aria-hidden>
                  <SignalIcon size={11} strokeWidth={2} />
                </span>
              )}
              <span>{signal}</span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

// -----------------------------------------------------------
// メイン component (export)
// -----------------------------------------------------------

/**
 * ScreenerIdleHero
 * @param {object} props
 * @param {Function} props.onSelect - ticker string を受け取る。Workspace の setActiveTicker 相当。
 */
export default function ScreenerIdleHero({ onSelect, onUpgrade }) {
  // 自前 fetch: fetchScannerUniverse (auth 自動 / dedup 60s) で母集団を取得しフロントで交差計算。
  const [fetchState, setFetchState] = useState({
    tickers: [],
    loading: true,
    error: null,
    levelIdx: 0, // HERO_LADDER の採用 level (0=strict、大きいほど緩和)
    asOf: null,  // S4 condition6: universe.as_of (鮮度表示用)
    tier: null,  // B-6: universe.tier ('free'|'pro'|'premium')。free degrade の文言分岐用
  });

  useEffect(() => {
    const ac = new AbortController();
    async function load() {
      try {
        // api.js の fetchScannerUniverse は positional 引数 (universeSize)。
        // object を渡すと universe_size=[object Object] → backend 422 になるため必ず数値で渡す。
        // signal は fetch に渡せないが、下の ac.signal.aborted ガードで unmount 後 setState を防ぐ。
        const data = await fetchScannerUniverse(3000);
        if (ac.signal.aborted) return;
        const items = Array.isArray(data?.items) ? data.items : [];

        // 段階フォールバック: 各 level で交差 (各 level は前 level の superset → 件数は非減少)。
        // top3 を必ず埋めるため ≥3 を満たす最 strict level を採用。
        // なければ最大件数を満たす最 strict level (= 候補が 3 未満でも最良を表示、空を避ける)。
        const buckets = HERO_LADDER.map((L) => items.filter(L.pred));
        let levelIdx = buckets.findIndex((m) => m.length >= 3);
        if (levelIdx === -1) {
          const maxCount = Math.max(0, ...buckets.map((m) => m.length));
          levelIdx = Math.max(0, buckets.findIndex((m) => m.length === maxCount));
        }
        const matched = buckets[levelIdx] || [];

        // rs_percentile 降順 top3。funda_pass は加点バッジとして付与 (交差の必須条件にしない)。
        const top3 = matched
          .slice()
          .sort((a, b) => (b.rs_percentile ?? 0) - (a.rs_percentile ?? 0))
          .slice(0, 3)
          .map((it) => ({
            ticker: it.ticker,
            rs: it.rs_percentile,
            signal: deriveSignalLabel(it),
            fundaPass: it.funda_pass === true,
          }));

        setFetchState({ tickers: top3, loading: false, error: null, levelIdx, asOf: data?.as_of || null, tier: data?.tier || null });
      } catch (e) {
        if (ac.signal.aborted) return;
        setFetchState({ tickers: [], loading: false, error: String(e), levelIdx: 0, asOf: null, tier: null });
      }
    }
    load();
    return () => ac.abort();
  }, []);

  const { tickers, loading, error, levelIdx, asOf, tier } = fetchState;
  const meta = HERO_LADDER[levelIdx] || HERO_LADDER[0];
  const relaxed = levelIdx > 0;
  const isEmpty = !loading && !error && tickers.length === 0;
  const freshness = formatAsOf(asOf); // S4 condition6: 鮮度表示 (原則2「データが動いている感」)
  // B-6: free は cup_state/breakout_state が Premium 限定 (locked_facets) のため交差は常に空。
  // 「本日は…見つからない」と日次状況に見せると tier 制限を誤表示する Trust Cliff → tier で文言分岐。
  const isFreeTier = tier != null && tier !== 'premium';

  // ── loading state ──
  if (loading) {
    return (
      <div
        data-testid="screener-idle-hero"
        data-state="loading"
        className="screener-idle-hero screener-idle-hero--centered"
      >
        <Hourglass size={20} strokeWidth={1.5} aria-hidden className="screener-idle-hero__state-icon" />
        <span className="screener-idle-hero__state-text">今日の筆頭を絞り込み中…</span>
      </div>
    );
  }

  // ── error state ──
  if (error) {
    return (
      <div
        data-testid="screener-idle-hero"
        data-state="error"
        className="screener-idle-hero screener-idle-hero--centered"
      >
        <AlertCircle size={20} strokeWidth={1.5} aria-hidden className="screener-idle-hero__state-icon" />
        <span className="screener-idle-hero__state-text">データ取得に失敗しました</span>
        <span className="screener-idle-hero__state-sub">
          左の一覧から銘柄を選ぶと、ここに詳細が表示されます
        </span>
      </div>
    );
  }

  // ── empty state ──
  // B-6: free は cup/breakout が Premium 限定で交差が常に空 → tier 制限であることを honest に明示
  //   (誇張なし・§5 景表法準拠)。Premium の genuine な「本日は該当なし」と物理分離。
  if (isEmpty) {
    if (isFreeTier) {
      return (
        <div
          data-testid="screener-idle-hero"
          data-state="locked"
          className="screener-idle-hero screener-idle-hero--centered"
        >
          <Lock size={20} strokeWidth={1.5} aria-hidden className="screener-idle-hero__state-icon" />
          <span className="screener-idle-hero__state-text">
            「今日の筆頭」は Premium 機能です
          </span>
          <span className="screener-idle-hero__state-sub">
            相対力(RS) × ファンダ × Cup/ブレイクの交差で、本日の筆頭候補を毎朝お届けします。
          </span>
          {onUpgrade && (
            <button
              type="button"
              className="screener-idle-hero__upgrade-cta"
              onClick={onUpgrade}
              data-testid="idle-hero-upgrade-cta"
            >
              Premium を見る
            </button>
          )}
        </div>
      );
    }
    return (
      <div
        data-testid="screener-idle-hero"
        data-state="empty"
        className="screener-idle-hero screener-idle-hero--centered"
      >
        <Hourglass size={20} strokeWidth={1.5} aria-hidden className="screener-idle-hero__state-icon" />
        <span className="screener-idle-hero__state-text">
          本日は条件をすべて満たす銘柄が見つかりませんでした
        </span>
        <span className="screener-idle-hero__state-sub">
          左の一覧から銘柄を選ぶと、ここに詳細が表示されます
        </span>
      </div>
    );
  }

  // ── main state ──
  return (
    <div
      data-testid="screener-idle-hero"
      data-state="main"
      className="screener-idle-hero"
    >
      {/* ─── section ヘッダー: L字 gold frame (hero anchor = scarcity 内の正当な gold) ─── */}
      <div className="screener-reveal" style={{ animationDelay: '0ms' }}>
        <div className="screener-idle-hero__header">
          {/* typography 層1: eyebrow = 交差条件の透明表示 (ブラックボックス解消) */}
          <div className="screener-idle-hero__eyebrow">{meta.eyebrow}</div>
          <h4 className="screener-idle-hero__title">
            <Crown size={16} strokeWidth={1.75} aria-hidden className="screener-idle-hero__title-icon" />
            今日の筆頭
            {/* S4 condition6: 鮮度を右端に併記 (原則2「データが動いている感」、§38 日次粒度) */}
            {freshness && (
              <span className="screener-idle-hero__freshness" data-testid="idle-hero-freshness">
                {freshness}
              </span>
            )}
          </h4>
        </div>

        {/* section 説明: §38 軸明示 + ⓘ ツールチップ + 免責1行 */}
        <p className="screener-idle-hero__desc">
          <Info
            size={13}
            strokeWidth={1.75}
            aria-label="絞り込み条件の説明"
            title={CRITERIA_TOOLTIP}
            className="screener-idle-hero__desc-icon"
          />
          <span>
            {meta.axes} を
            <strong className="screener-idle-hero__desc-strong">すべて満たす</strong>
            銘柄。スクリーニング結果であり投資推奨ではありません。
          </span>
        </p>

        {/* 緩和フォールバック時の注記 (透明性: なぜこの候補か / どの条件を緩めたか level に忠実) */}
        {relaxed && meta.relaxNote && (
          <p data-testid="idle-hero-relaxed-note" className="screener-idle-hero__relax-note">
            {meta.relaxNote}
          </p>
        )}
      </div>

      {/* ─── 銘柄リスト (上位3件・row 間は 詰め) ─── */}
      <ul className="screener-idle-hero__list">
        {tickers.map((t, idx) => (
          <LeaderRow
            key={t.ticker}
            ticker={t.ticker}
            rs={t.rs}
            signal={t.signal}
            rank={idx + 1}
            onSelect={onSelect}
            fundaPass={t.fundaPass}
          />
        ))}
      </ul>

      {/* ─── 導線文 (下部・section 末尾は 抜き で区切る) ─── */}
      <div
        className="screener-reveal"
        style={{ animationDelay: `${rowRevealDelay(tickers.length)}ms` }}
      >
        <div className="screener-idle-hero__footer">
          <span className="screener-idle-hero__footer-primary">
            ← 左の一覧から銘柄を選ぶと、ここに詳細が表示されます
          </span>
          <span className="screener-idle-hero__footer-sub">
            「注目」と「絞り込み」を切り替えて候補を探せます。
          </span>
        </div>
      </div>
    </div>
  );
}
