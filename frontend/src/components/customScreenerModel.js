// ─────────────────────────────────────────────────────────────────────────────
// customScreenerModel.js — スクリーナー (screener_v2 + legacy) の純関数層 SSOT。
//
// CustomScreenerPanel.jsx から物理抽出した React 非依存の「データ / 述語 / 集計」層。
// facet 定義・grade ヘルパ・述語レジストリ・preset 定義 maps・件数/集計の純関数を集約する。
// 副作用なし・hooks/JSX 非依存・外部 import 不要 (完全自立)。
//
// ⚠️ 件数 SSOT (Trust Cliff の核): PRESET_PREDICATES / itemPasses / buildActiveGrades /
//    countPreset の出力は「表示件数 == 実 list」を保証する。挙動を変える編集は禁止。
//    機械検査は CustomScreenerPanel.invariants.test.js が担保する。
//
// 公開 named export の一部 (PRESET_CONDS / CROW_LAYOUT / itemPasses / countPreset 等) は
// 後方互換のため CustomScreenerPanel.jsx からも re-export している (consumer の import 元維持)。
// ─────────────────────────────────────────────────────────────────────────────

// FMP /stable/company-screener の sector (英語) → 日本語表示ラベル。
export const SECTOR_LABEL_JP = {
  'Technology': 'テクノロジー',
  'Healthcare': 'ヘルスケア',
  'Financial Services': '金融',
  'Consumer Cyclical': '一般消費財',
  'Communication Services': '通信',
  'Industrials': '資本財',
  'Consumer Defensive': '生活必需品',
  'Energy': 'エネルギー',
  'Basic Materials': '素材',
  'Real Estate': '不動産',
  'Utilities': '公益',
};
export const SECTOR_OTHER = 'その他';
export function sectorLabelJp(sector) {
  if (!sector) return SECTOR_OTHER;
  return SECTOR_LABEL_JP[sector] || SECTOR_OTHER;
}

// 時価総額帯 (backend _mcap_band と 1:1 mirror)。 hint は数値 tooltip (finance verdict)。
export const MCAP_BANDS = [
  { key: 'mega', label: '大型', hint: '時価総額 $10B 以上' },
  { key: 'mid', label: '中型', hint: '時価総額 $2B〜$10B' },
  { key: 'small', label: '小型', hint: '時価総額 $2B 未満' },
];

// ─── Pass 3b: facet engine SSOT ─────────────────────────────────────────────
// §0-7(b) 本番較正値。count と list が必ず同一 predicate = Trust Cliff 防止の核。
// Phase1 S3: category = 「品質(ファンダ)/タイミング(テクニカル)/需給」3カテゴリ accordion 再編 (§0-7)。
//   quality = 利益・キャッシュの質 / timing = 値動き・勢い / demand = 機関の動き。
//   RS は勢い指標なので timing、機関保有増は需給。grade の preset 駆動 (CORE) かどうかとは独立。
// §2.1 原典較正ラダー (2026-06-23 gate1: じっちゃま原典優先→オニール CAN-SLIM §7.1)。
//   eps_yoy_pct: severe(+100) 追加 (canslim p.179-197)。
//   eps_cagr_3y: 緩い段=「3年連続増」state は backend #4 DEFER のため未配線 →
//     緩標同値矛盾を避けるべく loose 段を出さず standard(25) を下限とする (金融レビュー指摘)。
//   roe: 床 17 (原典 p.179-210 注)・rs_percentile: 標準 80 / 床 70 ハードゲート。
//   ⚠️ roe床10→17・rs標準85→80 は Free 標準プリセットの件数を動かす (原典忠実の代償・gate1 承認済)。
// delta=true: 成長/変化系 (符号併記 "+25%")、false: 水準系 (≥ 併記 "≥80")。
export const FUNDA_FACETS = [
  // floor: 0 = 「直近EPS成長 ≥0%（減益でない）」の床。新高値ブレイク等の技術系 preset で
  //   赤字/減益のジャンク・ブレイクを弾く下限 (金融合議 2026-06-25)。facetLevels が GRADE_ORDER で
  //   filter するため精度 seg (緩/標/厳/最厳) には出ない (internal level)。
  { key: 'eps_yoy_pct',         field: 'eps_yoy_pct',         label: 'EPS成長(四半期)', unit: '%', tier: 'free', category: 'quality', delta: true,  grades: { floor: 0, loose: 20, standard: 25, strict: 50, severe: 100 } },
  { key: 'eps_cagr_3y',         field: 'eps_cagr_3y',         label: 'EPS成長(3年)',    unit: '%', tier: 'free', category: 'quality', delta: true,  grades: { standard: 25, strict: 50 } },
  { key: 'roe',                 field: 'roe',                 label: 'ROE',            unit: '%', tier: 'free', category: 'quality', delta: false, grades: { loose: 17, standard: 25, strict: 50 } },
  { key: 'rs_percentile',       field: 'rs_percentile',       label: 'RS(相対強さ)',     unit: '',  tier: 'free', category: 'timing',  delta: false, grades: { loose: 70, standard: 80, strict: 90 } },
  { key: 'volume_surge_pct',    field: 'volume_surge_pct',    label: '出来高急増',       unit: '%', tier: 'free', category: 'timing',  delta: true,  grades: { loose: 25, standard: 40, strict: 50 } },
  // 逆張り「静かな優良株」中核軸B (SPEC_2026-06-28 screener-quiet-quality-rs Sprint 1):
  //   volume_surge_pct を「上限 (cmp:'lte')」で見る別 key = 出来高が急増していない (静か) の軸。
  //   既存 volume_surge_pct (≥ 型・新高値ブレイク用) と field 共有・別 key なので件数 SSOT に無影響。
  //   grades は SPEC §9 実データ較正: 緩≤50 / 標≤20 (中央値+35%より下=本当に静か) / 厳≤0 (出来高細り)。
  //   §38/§5: 「静か」は出来高事実の描写 (お宝/割安/上がる でない・中立フレーム)。delta は cmp 'lte' で未使用。
  { key: 'volume_quiet',        field: 'volume_surge_pct',    label: '出来高 静か',      unit: '%', tier: 'free', category: 'timing',  delta: false, cmp: 'lte', grades: { loose: 50, standard: 20, strict: 0 } },
  { key: 'inst_holders_qoq_pct', field: 'inst_holders_qoq_pct', label: '機関保有増(45日遅延)', unit: '%', tier: 'free', category: 'demand', delta: true,  grades: { loose: 0, standard: 3, strict: 5 } },
  // 逆張り「静かな優良株」accumulation vs crowding gating (SPEC_2026-06-28 §5 Sprint2 / §9 重要発見):
  //   inst_holders_qoq_pct を「上限 (cmp:'lte')」で見る別 key = 機関が殺到していない (euphoric crowding 除外)。
  //   §9 重要発見: gating は Premium・cup-only(24%) の ad_volume でなく free・full-cov の inst_qoq 上限が広く効く。
  //   実例 SNDK = RS99 だが instQoQ+60.8% (機関殺到=手垢) → ≤20 で除外。既存 ≥型 inst_holders_qoq_pct は無改変。
  //   grades は §9 実データ較正 (p75+7.3/p90+15.2/p95+22.7): 緩≤30/標≤20(殺到除外の anchor)/厳≤10。
  //   §38: 「殺到なし」は機関 QoQ の事実描写 (過熱/注意でなく中立)。LLM 不使用。
  { key: 'inst_qoq_calm',        field: 'inst_holders_qoq_pct', label: '機関 殺到なし',      unit: '%', tier: 'free', category: 'demand', delta: false, cmp: 'lte', grades: { loose: 30, standard: 20, strict: 10 } },
  // S2 P1-a: 営業CFマージンを binary gate ≥15% 固定から可変 grade (緩≥10/標≥15/厳≥25) へ昇格 (user 承認 2026-06-25)。
  //   標準精度=15% で旧 gate と件数中立、業種特性に応じた緩急調整が可能に (金融: 業種により正常 CF マージンが異なる→固定 15% は硬直)。
  { key: 'ocf_margin_pct',      field: 'ocf_margin_pct',      label: 'キャッシュ創出力',   unit: '%', tier: 'free', category: 'quality', delta: false, grades: { loose: 10, standard: 15, strict: 25 } },
];
// ─── 新高値ブレイク gate 修正 (SPEC_2026-06-25): near_high 段階OR + 買い場圏 strict-only grade cond ──
// 0件恒常化の根治。is_new_52w_high (出来高確定ブレイク=数十件) のみだと高値圏に静かに居る高RS株を
// 拾えないため、全銘柄にある near_high_pct_scaled (直近終値/52週高値×100) との段階的 OR で拾う。
// ★ FUNDA_FACETS には入れない: 入れると activeFacets (グレード行レンダリング) に誤露出するため
//   (SPEC §4.1 結線注意②)。FACET_MAP には含める: buildActiveGrades の clampLevel(FACET_MAP[k]) が要る
//   (結線注意①)。crow 表示は renderCrow の new_high_break 専用 custom 分岐で描く (汎用 grade crow は
//   999 sentinel / 0〜+5% range を正しく出せないため)。
export const NEW_HIGH_SIGNAL_FACET = {
  key: 'new_high_signal',
  field: 'near_high_pct_scaled',
  label: '52週高値圏',
  labelShort: '高値圏',
  tooltip: '直近終値が52週高値に近い（精度で「高値10%/5%/3%以内」と変化）、または出来高を伴う実ブレイク。',
  unit: '%', delta: false, tier: 'premium', category: 'timing',
  // 段階OR: 緩90/標95/厳97 (高値10%/5%/3%以内) または is_new_52w_high===true (実ブレイク)。
  //   厳=97 は実ブレイク手前の pivot 近接帯も拾い 0件恒常化を回避 (SPEC_2026-06-25 微調整・3体合議)。
  //   旧 strict=999 sentinel (実ブレイクのみ) は strict funda triple-AND と重なり恒常0件のため廃止。
  grades: { loose: 90, standard: 95, strict: 97 },
};
export const BUY_ZONE_G_FACET = {
  key: 'buy_zone_g',
  field: 'pivot_distance_pct',
  label: '買い場圏 (節目近接)',
  labelShort: '買い場圏',
  tooltip: '直近の節目 (pivot) から 0〜+5% 以内。新高値ブレイクの「厳しい」設定でのみ有効。',
  unit: '%', delta: false, tier: 'premium', category: 'timing',
  grades: { strict: 5 }, // 厳のみ適用 (pivot 0〜+5%)。閾値は pass で range 判定するため lvl は無視。
};
// ─── 「市場をリードし始めた銘柄」preset 専用 facet (SPEC_2026-06-28 screener-market-leading) ──
// 個別の相対力が市場(SPY)を上回り始めた「中位帯の出遅れ回復株」を拾う。既存カラムのみ・追加 migration 不要。
// 4 facet は新 field (rs_vs_spy_pct) or 既存 field の別 key (件数 SSOT 無影響・quiet_quality の volume_quiet と同パターン)。
// ★ FUNDA_FACETS には入れない: 汎用 activeFacets grade 行 / facetLevelCounts への誤露出回避
//   (NEW_HIGH_SIGNAL_FACET と同型・renderCrow の market_leading 限定 guard で描画)。FACET_MAP には含める
//   (buildActiveGrades の clampLevel(FACET_MAP[k]) が要る)。
// §38: 全て観測事実の閾値 (対SPY超過/相対力帯/利益率/成長率)、色 polarity なし・将来断定なし。
export const VS_SPY_FACET = {
  key: 'vs_spy',
  field: 'rs_vs_spy_pct',
  label: '対SPY超過 (6ヶ月)',
  labelShort: '対SPY',
  tooltip: '直近6ヶ月のリターンが S&P500 (SPY) を上回った幅 (ポイント)。プラス = 市場平均より強い値動き。',
  unit: 'pt', tier: 'free', category: 'timing', delta: false,
  // 精度連動 (auto): 緩≥5 / 標≥8。厳・最厳は clampLevel で standard(8) に寄る (vs_spy は標準以降締めず他軸で絞る)。
  //   2 段定義で mseg に「標=厳=最厳が同値」の冗長セグメントを出さない (件数は clamp で 5/8/8/8 と不変)。
  grades: { loose: 5, standard: 8 },
};
export const RS_MID_BAND_FACET = {
  key: 'rs_mid_band',
  field: 'rs_percentile',
  label: '相対力 中位帯',
  labelShort: 'RS中位',
  tooltip: '相対力 (RS) が中位帯 (下限〜75)。既に高RSの完成株でなく、市場を上回り始めた出遅れ回復株を拾う帯。',
  unit: '', tier: 'free', category: 'timing', delta: false,
  bandMax: 75, // 上限固定。pass で範囲判定 (下限は精度連動 grades)。renderCrow は band を custom 描画。
  // 下限: 緩45 / 標55。厳・最厳は clampLevel で standard(55) に寄る (件数は clamp で 45/55/55/55 と不変)。
  grades: { loose: 45, standard: 55 },
};
export const ROE_LENIENT_FACET = {
  key: 'roe_lenient',
  field: 'roe',
  label: 'ROE',
  labelShort: 'ROE',
  tooltip: '自己資本利益率 (ROE)。自社株買いで株主資本がマイナスの銘柄はデータなしとなり、この条件では許容します。',
  unit: '%', tier: 'free', category: 'quality', delta: false,
  allowNull: true, // ROE null (株主資本マイナス) を AND 除外しない (MAR/HLT 救済・null許容必須)。
  grades: { loose: 10, standard: 15, strict: 20 }, // 緩標≥10 / 厳≥15 / 最厳≥20
};
export const EPS_YOY_MID_FACET = {
  key: 'eps_yoy_mid',
  field: 'eps_yoy_pct',
  label: 'EPS成長(四半期)',
  labelShort: 'EPS↑',
  tooltip: '直近四半期の 1 株利益 (EPS) の前年同期比成長率。',
  unit: '%', tier: 'free', category: 'quality', delta: true,
  grades: { loose: 10, standard: 15 }, // 緩標≥10 / 厳最厳≥15 (object マッピングで段階解決)
};
// ─── 上昇トレンドフィルタ (A軸 = 下降トレンド除外) facet (SPEC_2026-07-02 screener-uptrend-filter) ──
// 「静かな強さ」(quiet_quality) の落ちるナイフ/下降トレンド汚染 (PBR 等) を除外する opt-in override。
//   真因 = RS 高止まり。PBR は反落中でも RS=80 で quiet_quality を通過 → post-spike falling knife が化ける。
// 2026-07-02 追記: 「市場をリードし始めた銘柄」(market_leading) にも同型リスクを確認 (user 指摘)。
//   rs_mid_band (RS中位帯 45-75) + vs_spy (直近6ヶ月の対SPY超過) はいずれもトレーリング (過去参照) 指標
//   のため、数ヶ月前に急騰しその後下降トレンドに転じた銘柄でも 6ヶ月窓の超過リターンはプラスのまま残り
//   通過し得る (quiet_quality の RS 高止まりと同じ穴)。pv50/sl50 は preset 非依存 (銘柄自身の直近 50日線
//   位置/傾きのみ) のため、同じ facet 定義を market_leading にも opt-in override として再利用する。
// signal: pv50 (価格の50DMA乖離%) + sl50 (50DMAの傾き%・21営業日)。compound facet:
//   pv50 の下限閾値 (grades) を base に、厳/最厳は sl50 gate を custom pass で AND する。
// ★ FUNDA_FACETS には入れない (activeFacets grade 行への誤露出回避・NEW_HIGH_SIGNAL_FACET と同型)。
//   ★ PRESET_PREDICATES.quiet_quality / market_leading の grades にも入れない = default OFF
//     (cold-start 安全・ゼロ回帰)。user がスイッチ ON で override 経由算入。renderCrow guard で
//     quiet_quality / market_leading の 2 preset のみ描画 (他 preset には非露出)。
// grades = pv50 下限%。annotMap = 段毎の honest ラベル (厳/最厳の pv50 閾値は同値 ≥0 のため sl50 gate の
//   差を明示して mseg 重複表示を回避・gradeAnnot 経由)。§38: pv50/sl50 は「50日線との位置・傾き」の
//   観測事実。色 polarity なし・将来断定なし。null (nightly scan 前/履歴不足) = AND 除外 (honest)。
export const UPTREND_FACET = {
  key: 'uptrend',
  field: 'pv50',
  label: '上昇トレンド (50日線)',
  labelShort: '上昇T',
  tooltip: '株価が50日移動平均線に対してどの位置にあるか（乖離%）と50日線の傾き。緩/標は50日線からの下方乖離の許容幅（−8%/−3%以内）、厳/最厳は「50日線の上」かつ傾きが横ばい以上/上向きで、下降トレンド（落ちるナイフ）を除外します。',
  unit: '%', tier: 'free', category: 'timing', delta: false,
  grades: { loose: -8, standard: -3, strict: 0, severe: 0 },
  annotMap: { loose: '50線−8%内', standard: '50線−3%内', strict: '50線上・傾横', severe: '50線上・傾↑' },
};
// ─── 過熱除外フィルタ (B軸) facet (SPEC_2026-07-02 screener-overheat-exclusion-b-axis) ──
// quiet_quality/market_leading に混入する「過熱後の急反落」銘柄 (MU/WDC/STX/STRL 等) を除外する
// opt-in override。A軸 (uptrend) の姉妹 facet — 同じ落ちるナイフ問題だが、A軸の pv50/sl50 は
// 「現時点のスナップショット」のため既に高値から-18〜42%崩れた銘柄を捕捉できず (B cohort は現時点で
// pv50/sl50 が共にプラスに回復済み・実測済)、履歴を持つ新 signal dd60/runup60 が必要と判定 (SPEC §9 論点1)。
// signal: dd60 (直近60営業日高値からの下落率%) + runup60 (その高値までの直近60営業日上昇率%)。
//   compound: 「大きく吹き上げてから大きく崩れた」パターンのみを dd60<X AND runup60>=Y の AND で捕捉。
//   dd60 単独 (S-1) では健全な深い調整 (APA 等) と分離不可能なことを Sprint 1 実データ較正で確認済み。
// ★ FUNDA_FACETS には入れない (uptrend と同型)。★ PRESET_PREDICATES の grades にも入れない = default OFF
//   (cold-start 安全・ゼロ回帰)。renderCrow guard で quiet_quality / market_leading の 2 preset のみ描画。
// grades = dd60 上限% (主軸)。runup60 側の閾値は OVERHEAT_RUNUP_THR (段毎)。annotMap で両軸を honest 表示。
// Sprint 1 実データ較正 (2026-07-02, 本番 quiet_quality/market_leading[標準] 118銘柄) で確定:
//   known B-cohort (MU/WDC/STX/STRL) dd60=-14.9〜-21.9% / runup60=+160〜+277% を厳段で全捕捉。
// §38: dd60/runup60 は「高値からの下落率」「高値までの上昇率」の観測事実。断定・最上級表現なし。
// null (nightly scan 前/履歴不足) = AND 除外 (honest、A軸と同じ規約)。
export const OVERHEAT_EXCL_FACET = {
  key: 'overheat_excl',
  field: 'dd60',
  label: '過熱後の反落 除外',
  labelShort: '反落除外',
  tooltip: '急騰後に高値から大きく反落した銘柄を除外します（高値までの上昇率と、そこからの下落率を組み合わせて判定）。段階を上げるほど、より軽い反落も除外の対象になります。',
  unit: '%', tier: 'free', category: 'timing', delta: false,
  grades: { loose: -20, standard: -16, strict: -14, severe: -12 },
  annotMap: {
    loose: '急騰+140%↑で-20%割れ除外',
    standard: '急騰+140%↑で-16%割れ除外',
    strict: '急騰+140%↑で-14%割れ除外',
    severe: '急騰+80%↑で-12%割れ除外',
  },
};
// runup60 側の閾値 (段毎)。dd60 (facet.grades) と AND で「除外」を判定する第2軸 (compound signal)。
export const OVERHEAT_RUNUP_THR = { loose: 140, standard: 140, strict: 140, severe: 80 };
export const FACET_MAP = Object.fromEntries(
  [...FUNDA_FACETS, NEW_HIGH_SIGNAL_FACET, BUY_ZONE_G_FACET,
   VS_SPY_FACET, RS_MID_BAND_FACET, ROE_LENIENT_FACET, EPS_YOY_MID_FACET, UPTREND_FACET,
   OVERHEAT_EXCL_FACET].map((f) => [f.key, f])
);
// preset の CORE 4 metric。volume/inst_holders は preset off、override で追加 (Pass 3c)。
export const PRESET_CORE_KEYS = ['eps_yoy_pct', 'eps_cagr_3y', 'roe', 'rs_percentile'];
export const PRESET_LABELS = { loose: '緩い', standard: '標準', strict: '厳しい', severe: '最厳' };
// 「絞り込み条件」見出しの動的サマリー用 preset 日本語名 (StrategyPresetBar STRATEGY_PRESETS と一致)。
export const PRESET_LABEL_JP = { earnings_pass: '決算合格', new_high_break: '新高値ブレイク', hot_sector: '旬のセクター', sector_leader: 'セクター別リーダー', quiet_quality: '静かな強さ', market_leading: '市場をリードし始めた銘柄' };
// 個別緩急 mini-segment 用の短縮ラベル (幅節約・原則1)。
export const GRADE_LABELS_SHORT = { floor: '床', loose: '緩', standard: '標', strict: '厳', severe: '最厳' };
// grade の強弱順 (clamp / 並び順の SSOT)。
export const GRADE_ORDER = ['loose', 'standard', 'strict', 'severe'];
// facet に定義された有効段のみを順序付きで返す (eps_cagr_3y は loose 段なし)。
export function facetLevels(facet) {
  return GRADE_ORDER.filter((l) => facet?.grades?.[l] != null);
}
// 要求 level を facet の定義域にクランプ (loose 要求×定義なし → 最小段、severe 要求×定義なし → 最大段)。
// RS<70 ハードフロア等、定義域外の override を下限/上限へ寄せる安全装置 (§2.1 注)。
export function clampLevel(facet, level) {
  const lv = facetLevels(facet);
  if (lv.length === 0) return null;
  if (facet.grades[level] != null) return level;
  const idx = GRADE_ORDER.indexOf(level);
  const defined = lv.map((l) => GRADE_ORDER.indexOf(l));
  const lo = Math.min(...defined), hi = Math.max(...defined);
  return GRADE_ORDER[idx < lo ? lo : hi];
}
// mini-segment の閾値併記 (例 "+25%" / "≥80" / "≤20%")。§38: 数値は data 由来、色 polarity なし。
export function gradeAnnot(facet, lvl) {
  const thr = facet?.grades?.[lvl];
  if (thr == null) return '';
  // annotMap: 段毎の custom ラベル (compound facet の honest 表示・uptrend の sl50 gate 可視化等)。
  //   既存 facet は annotMap 未定義 = 無影響 (additive・SPEC_2026-07-02)。
  if (facet.annotMap && facet.annotMap[lvl] != null) return facet.annotMap[lvl];
  if (facet.cmp === 'lte') return `≤${thr}${facet.unit || ''}`; // 上限型 (出来高 静か等)・以下で合致
  return `${facet.delta ? '+' : '≥'}${thr}${facet.unit || ''}`;
}

// ─── 営業CFマージン: label/labelshort 保持 const (grade SSOT は FUNDA_FACETS の ocf_margin_pct) ─────
// S2 P1-a (user 承認 2026-06-25): 旧「grades に統合しない=質的閾値」決定を更新し、可変 grade [10/15/25] へ昇格。
//   業種により正常 CF マージンが異なるため固定 15% gate は硬直 (金融: 業種中立性)。標準=15% で件数中立。
//   本 const は labelShort 表示 (寄与ラベル等) 用に残置。threshold(15) は legacy(grade 移行で未使用)。
export const OCF_MARGIN_FACET = {
  key: 'ocf_margin_pct',
  field: 'ocf_margin_pct',
  label: 'キャッシュ創出力 15%以上',
  labelShort: 'CF創出力',
  tooltip: '営業キャッシュフロー ÷ 売上高 ≥ 15%。銀行・保険・REIT 等は業種特性によりデータなし。',
  threshold: 15,
  tier: 'free',
  category: 'quality',
};

// ─── Phase1 S3: #1 営業CF>純利益 (利益の質) binary facet (§0-1 free / §0-3) ──────
// TTM 営業キャッシュフロー > TTM 純利益 の bool (粉飾フィルタ・利益の質)。null = AND 除外。
// sector guard (銀行/保険/REIT/証券) + 外貨ADR は backend _compute_one で null 保存済 (§0-3)。
// tier: 'free' (§0-1①、ファンダの質は ocf_margin と同列で無料)。category: 'quality'。
// §38: 「投資不適格」等の断定でなく「利益の質の目安」「警戒されるとされる」の第三者手法描写に留める。
export const OCF_GT_NI_FACET = {
  key: 'ocf_gt_netincome',
  field: 'ocf_gt_netincome',
  label: '営業CF>純利益',
  labelShort: '利益の質',
  tooltip: '直近1年の営業キャッシュフローが純利益を上回る = 利益の質が高い目安。米国成長株手法では下回る銘柄を警戒するとされる。銀行・保険・REIT 等は業種特性によりデータなし。',
  tier: 'free',
  category: 'quality',
};

// ─── Phase1 S3: #3 買い場圏 (pivot 近接) binary facet (§0-1 Premium / §0-4) ──────
// pivot (直近の節目) から 0〜+5% 以内 = 買い場圏。null (cup 未形成) = AND 除外。
// §0-4: buy zone = 0 ≤ distance ≤ 5。pivot 下 (distance<0=ブレイク前) は買い場圏に含めない。
// 閾値 +5% は KB が正 (trading.md:178/1206)・実装都合で変えない。
// tier: 'premium' (§0-1①、タイミング系は cup/breakout と同列)。free user には locked chip
//   (universe.locked_facets に 'pivot_distance' が含まれ pivot_distance_pct=None マスク、§A 案)。
// category: 'timing'。§38: 「買い場圏」(状態語) は可・「買い場」(断定) は禁止。
export const BUY_ZONE_FACET = {
  key: 'buy_zone',
  field: 'pivot_distance_pct',
  label: '買い場圏 (節目近接)',
  labelShort: '買い場圏',
  tooltip: '直近の節目 (pivot) から 0〜+5% 以内。米国成長株手法では +5〜10% 超は遅い (高値づかみ) とされる。節目未形成の銘柄はデータなし。',
  zoneMin: 0,
  zoneMax: 5,
  tier: 'premium',
  category: 'timing',
};

// ─── 52週高値更新 binary facet (§0-1 Premium / breakout freshness) ──
// is_new_52w_high (bool): 直近終値が過去52週高値を更新 = true。null = Premium マスク / 欠落 = AND 除外 (honest)。
// tier: 'premium'。breakout 鮮度キー: universe.freshness.breakout。
// category: 'timing'。§38: 「更新」(観測語) は可・「上がります」(断定) は禁止。
export const NEW_HIGH_52W_FACET = {
  key: 'new_high_52w',
  field: 'is_new_52w_high',
  label: '52週高値を更新',
  labelShort: '52週高値',
  tooltip: '直近の終値が過去52週の高値を更新。米国成長株手法では新高値更新が上昇トレンドの起点とされる。節目未形成・データ欠落の銘柄はデータなし。',
  tier: 'premium',
  category: 'timing',
};

// ─── Phase1 S4: #8 A/D 出来高の質 (上昇引け優勢) binary facet (§0-1 Premium / §0-2) ──
// 13週(65営業日)の「上昇引け日 volume 合計 ÷ 下落引け日 volume 合計」が >1 = 買い優勢。
// backend (cup-scan) で算出し cup payload 同梱 → universe で読むだけ (§0-5 追加 fetch ゼロ)。
// coverage = pivot_distance (#3) と同源 (cup-detected ≈618 ticker)。null = AND 除外 (honest)。
// ★ Trust Cliff §3-2: A/D は出来高 up/down 集計であって 13F「機関保有」データそのものではない。
//   ラベルは中身忠実に「出来高の質 (上昇引け優勢)」。機関保有は inst_holders_qoq_pct の別軸。
// tier: 'premium' (§0-1、cup 由来の需給系 → pivot_distance と同列)。free user は locked chip。
// category: 'demand'。§38: 「買い優勢」(出来高事実の観測語) は可・「買いです」(断定) は禁止。
export const AD_VOLUME_FACET = {
  key: 'ad_volume',
  field: 'ad_volume_ratio',
  label: '出来高の質 (上昇引け優勢)',
  labelShort: '出来高の質',
  tooltip: '直近13週の上昇引け日の出来高合計 ÷ 下落引け日の出来高合計 > 1。米国成長株手法で機関の継続買いの目安とされる。13F の機関保有比率とは別軸 (出来高の up/down 集計)。節目未形成の銘柄はデータなし。',
  threshold: 1,
  tier: 'premium',
  category: 'demand',
};

// ─── Phase B-1: PRESET_CONDS 単一条件レジストリ (count==list の述語 SSOT) ─────────────
// 目的: FUNDA_FACETS(grade 型) + binary facets を 1 つの条件レジストリへ統合し、
//   itemPasses / countPreset / applyStrategyImpl の「条件の二重・三重管理」を脱して
//   単一 SSOT を参照する土台を作る ([[feedback_facet_filter_count_integrity]] Trust Cliff C-2)。
// B-1 は「UI 不変・数値不変の内部 refactor」: 既存 facet 定義はそのまま参照し、挙動を完全一致させる。
//   - kind 'grade'  : activeGrades({key:level}) 経由。pass(item, lvl)。FACET_MAP の facet を参照。
//   - kind 'binary' : extra[flag] が ON の時だけ pass(item) を AND (閾値/範囲型 binary facet)。
//   - kind 'flag'   : extra[flag] が ON の時だけ pass(item) を AND (bool flag・facet オブジェクトなし)。
// 後続 sprint の土台 (B-1 では未付与): levels(精度スライド値配列=B-2) / group・gate・states(B-2/B-3) /
//   tier・available(準備中 disabled=B-3) / preset→conds 配列(B-4)。B-1 時点の 12 条件はすべて現行で機能中。
export function gradePass(facet, item, lvl) {
  const v = item[facet.field];
  if (v == null) return false;            // 測定外は AND で除外 (honest)
  const thr = facet.grades[lvl];
  if (thr == null) return true;           // 未定義段は no-op (clamp 済のため通常到達しない)
  if (facet.cmp === 'lte') return v <= thr; // 上限型 (出来高 静か ≤20% 等)・低いほど合致
  if (v < thr) return false;              // 既定 ≥ 型 (既存 facet・挙動不変)
  return true;
}
// cup screener が通す cup_state 集合 (backend _CONSENSUS_CUP_STATES と一致: main.py:17907)。
//   breakout_extended は backend 側で v148 の 3 ゲート (50DMA乖離/上昇率/market gate) 済み。
//   free/pro は backend が cup_state=null マスク (Premium 限定) → pass=false (件数に影響しない)。
export const CUP_PASS_STATES = new Set(['breakout_pending', 'breakout_confirmed', 'breakout_extended']);
// cup「型」状態トグル (新高値ブレイク preset・Premium 限定)。mockup p2 .th.state の React 移植
//   (SPEC_2026-06-25 cup-state-toggle / mockup:250 states 定義)。
//   default 'all' = 件数不変の「任意の絞り込み」(gate1 2026-06-25 user 確定)。特定 stage 選択時のみ AND 絞り込み。
//   breakout_extended (過熱) は mockup 原典どおり全 bucket から除外 (mockup:253 「+5%超は過熱として除外」)。
//   各 cup_state 生値は backend main.py の cup detection 出力 (Sprint 0 grep 裏取り)。
export const CUP_STATE_ORDER = ['confirmed', 'handle', 'cup', 'all']; // クリック循環順 (ブレイク確定→取っ手→カップ→すべて)
export const CUP_STATE_LABEL_JP = { confirmed: 'ブレイク確定', handle: '取っ手形成中', cup: 'カップ形成中', all: 'すべて' };
export const CUP_STATE_MATCH = {                          // mockup 状態語 → backend cup_state 生値 (1:1)
  confirmed: new Set(['breakout_confirmed']),      // main.py:13759 (pivot 上抜け + 出来高確認)
  handle:    new Set(['formation']),               // main.py:13754 (cup+handle 完成・pivot 待機)
  cup:       new Set(['cup_completing']),          // main.py:13880 (カップ右側形成中・取っ手未形成)
};
// seasonchip: 各 preset の「対象範囲」を gold pill で 1 個表示 (mockup v8 .seasonchip / p.season)。
//   原則5 (認知コスト低減): preset 切替時に「この一覧が何を対象にしているか」を 2 秒で伝える。
//   静的 dict (LLM 非経由) = Hallucination Guard 4 層不要。CUP_STATE_LABEL_JP / STATE_LABEL_JP と同型。
//   ⚠️ Trust Cliff (gate1 2026-06-26 user 確定): 動的具体値 (「過去90日」「2026 Q1」等の四半期/日数) は
//      frontend に ground truth が無いため載せない。決算カレンダーが進むと「表示=先期/実体=今期」の
//      信頼崖になる。preset の pass 述語と 1:1 で時間が経っても矛盾しない不変文言のみを記す。
//      決算期混同の機械的防止 (item の決算報告日で直近シーズン窓外を除外/降格) は別 backend SPEC で対応。
//   neutral=true は決算非依存 preset (sector_leader) を gray で意味分離 (mockup seasonNeutral)。
export const SEASON_LABEL = {
  earnings_pass:  { text: '対象: 主に直近の決算シーズン' },        // 動的値除去 + 「主に」で最新のみの暗黙保証を回避 (機械ガード未着地のため・qa gate2)
  new_high_break: { text: '対象: 直近のブレイク／形成' },          // 未検証の「5営業日」を除去 (honest)
  hot_sector:     { text: 'セクター別RS（対SPY）・直近改善順' },   // rs_vs_spy_pct で裏取り済 = 検証可
  sector_leader:  { text: '対象: 全ユニバース（決算非依存・常時）', neutral: true },
  // 逆張り「静かな強さ」(SPEC_2026-06-28 §10 Sprint3)。RS≥(床) × 出来高静か≤ × 機関殺到なし≤ × 利益の質≥ の
  //   4 軸を中立フレームで描写。決算非依存・常時のため neutral (gray)。§38: 「お宝/割安/上がる」断定なし。
  quiet_quality:  { text: '対象: RS上位 × 出来高が静か × 機関未殺到 × 利益の質', neutral: true },
  // 市場をリードし始めた銘柄 (SPEC_2026-06-28 market_leading): 個別の相対力が市場(SPY)を上回り始めた中位帯の
  //   出遅れ回復株。決算非依存でなく「直近決算ビート」を gate に持つが、シーズン窓に依存しない常時 preset のため
  //   neutral (gray)。§38: 「対SPY超過 / 中位帯 / 決算ビート」は全て観測事実、将来上昇の断定・示唆なし。
  market_leading: { text: '対象: 対SPY超過 × 相対力 中位帯 × 直近決算ビート', neutral: true },
};
export const PRESET_CONDS = [
  // ── grade 条件 (精度連動・activeGrades 経由) ──
  { key: 'eps_yoy_pct',          kind: 'grade', facet: FACET_MAP.eps_yoy_pct,          pass: (item, lvl) => gradePass(FACET_MAP.eps_yoy_pct, item, lvl) },
  { key: 'eps_cagr_3y',          kind: 'grade', facet: FACET_MAP.eps_cagr_3y,          pass: (item, lvl) => gradePass(FACET_MAP.eps_cagr_3y, item, lvl) },
  { key: 'roe',                  kind: 'grade', facet: FACET_MAP.roe,                  pass: (item, lvl) => gradePass(FACET_MAP.roe, item, lvl) },
  { key: 'rs_percentile',        kind: 'grade', facet: FACET_MAP.rs_percentile,        pass: (item, lvl) => gradePass(FACET_MAP.rs_percentile, item, lvl) },
  { key: 'volume_surge_pct',     kind: 'grade', facet: FACET_MAP.volume_surge_pct,     pass: (item, lvl) => gradePass(FACET_MAP.volume_surge_pct, item, lvl) },
  // volume_quiet: 出来高 静か (上限型 cmp:'lte')。FACET_MAP.volume_quiet.grades[lvl] 以下で合致 (≤50/≤20/≤0)。
  //   逆張り中核軸B (SPEC_2026-06-28 §5 Sprint 1)。null = AND 除外 (honest)。gradePass が cmp で ≤ 判定。
  { key: 'volume_quiet',         kind: 'grade', facet: FACET_MAP.volume_quiet,         pass: (item, lvl) => gradePass(FACET_MAP.volume_quiet, item, lvl) },
  { key: 'inst_holders_qoq_pct', kind: 'grade', facet: FACET_MAP.inst_holders_qoq_pct, pass: (item, lvl) => gradePass(FACET_MAP.inst_holders_qoq_pct, item, lvl) },
  // inst_qoq_calm: 機関 殺到なし (上限型 cmp:'lte')。FACET_MAP.inst_qoq_calm.grades[lvl] 以下で合致 (≤30/≤20/≤10)。
  //   accumulation vs crowding gating (SPEC §5 Sprint2)。null = AND 除外 (honest)。gradePass が cmp で ≤ 判定。
  { key: 'inst_qoq_calm',        kind: 'grade', facet: FACET_MAP.inst_qoq_calm,        pass: (item, lvl) => gradePass(FACET_MAP.inst_qoq_calm, item, lvl) },
  // ── binary / flag 条件 (extra フラグ経由・順序は旧 itemPasses の AND チェック順を踏襲) ──
  // funda_pass: 5 条件達成 flag (facet オブジェクトなし)。true のみ通す。
  { key: 'funda_pass',       kind: 'flag',   flag: 'fundaPassOnly',  pass: (item) => item.funda_pass === true },
  // ocf_margin: 営業CFマージン ≥15% (§0-1③)。null = AND 除外 (honest)、上限カットなし。
  //   None-preserve: 0.0 は有効値だが閾値 15 未満なので自然に落ちる。
  // S2 P1-a: binary gate → grade (精度連動 ≥10/15/25)。activeGrades 経由で itemPasses が走査。
  { key: 'ocf_margin_pct',   kind: 'grade',  facet: FACET_MAP.ocf_margin_pct, pass: (item, lvl) => gradePass(FACET_MAP.ocf_margin_pct, item, lvl) },
  // ocf_gt_netincome: 営業CF>純利益 bool (§0-3)。null (sector guard / 外貨ADR / 欠落) = AND 除外。
  { key: 'ocf_gt_netincome', kind: 'flag',   flag: 'ocfGtNiOnly',    facet: OCF_GT_NI_FACET,    pass: (item) => item[OCF_GT_NI_FACET.field] === true },
  // buy_zone: 買い場圏 0 ≤ pivot_distance_pct ≤ 5 (§0-4)。null / pivot 下 / 過熱 (>5) = AND 除外。
  { key: 'buy_zone',         kind: 'binary', flag: 'buyZoneOnly',    facet: BUY_ZONE_FACET,     pass: (item) => { const d = item[BUY_ZONE_FACET.field]; return d != null && d >= BUY_ZONE_FACET.zoneMin && d <= BUY_ZONE_FACET.zoneMax; } },
  // new_high_52w: 52週高値更新 bool。null (Premium マスク / 欠落) = AND 除外。
  { key: 'new_high_52w',     kind: 'flag',   flag: 'newHigh52wOnly', facet: NEW_HIGH_52W_FACET, pass: (item) => item[NEW_HIGH_52W_FACET.field] === true },
  // ad_volume: A/D 出来高の質 ratio > 1 (§0-2)。null (cup 未形成 / Premium マスク) = AND 除外。
  { key: 'ad_volume',        kind: 'binary', flag: 'adVolumeOnly',   facet: AD_VOLUME_FACET,    pass: (item) => { const r = item[AD_VOLUME_FACET.field]; return r != null && r > AD_VOLUME_FACET.threshold; } },
  // sector_leader: セクター内 RS 上位 flag (is_sector_rs_leader)。null / undefined / false = 除外。
  { key: 'sector_leader',    kind: 'flag',   flag: 'sectorLeaderOnly', pass: (item) => item.is_sector_rs_leader === true },
  // beat/cfps Phase 2 (SPEC_2026-06-25): 決算の継続性 trio (任意トグル・default OFF・段階UIなし)。
  //   bool|None フィールド (=== true で None/false 除外)。freshness は funda 同源 (Sprint 1 で付与済)。
  { key: 'eps_3y_rising',    kind: 'flag',   flag: 'eps3RisingOnly',   pass: (item) => item.eps_3y_rising  === true },
  { key: 'rev_3y_rising',    kind: 'flag',   flag: 'rev3RisingOnly',   pass: (item) => item.rev_3y_rising  === true },
  { key: 'cfps_3y_rising',   kind: 'flag',   flag: 'cfpsRisingOnly',   pass: (item) => item.cfps_3y_rising === true },
  // 条件5 CFPS>EPS (cfps_eps_ratio): 直近年 CFPS/EPS 比 > 1.0 で達成。numeric のため != null && > 1.0 で判定。
  //   null (sector guard 金融/REIT・外貨ADR・EPS≤0 clamp・データ欠落) = AND 除外 (honest)。backend PR#141 配線済。
  { key: 'cfps_eps_ratio',   kind: 'flag',   flag: 'cfpsEpsRatioOnly', pass: (item) => item.cfps_eps_ratio != null && item.cfps_eps_ratio > 1.0 },
  // beat/cfps Phase 2 (Sprint 3): 直近決算ビート (new_high_break の gate「必須」)。=== true で None/false 除外。
  { key: 'latest_beat',      kind: 'flag',   flag: 'beatOnly',         pass: (item) => item.latest_beat === true },
  // cup: Cup-with-Handle 形成 (Premium 限定・backend が free/pro は cup_state=null マスク)。
  //   CUP_PASS_STATES に属する state のみ pass。Sprint 1 では cupOnly flag を誰も ON にしない =
  //   count/list 不参加 (件数不変・Trust Cliff C-2 露出ゼロ)。applied gate 化は Sprint 2 (Premium 限定)。
  { key: 'cup',              kind: 'flag',   flag: 'cupOnly',          pass: (item) => item.cup_state != null && CUP_PASS_STATES.has(item.cup_state) },
  // 新高値ブレイク gate 修正 (SPEC_2026-06-25): grade 条件として count==list 機構に乗せる (custom pass)。
  // new_high_signal: is_new_52w_high===true (実ブレイク) OR near_high_pct_scaled >= grades[lvl] (高値圏)。
  //   strict=999 で near 経路を無効化 = 実ブレイクのみ。null フィールドは false (honest AND 除外)。
  { key: 'new_high_signal',  kind: 'grade',  facet: NEW_HIGH_SIGNAL_FACET, pass: (item, lvl) => item.is_new_52w_high === true || (item.near_high_pct_scaled != null && item.near_high_pct_scaled >= NEW_HIGH_SIGNAL_FACET.grades[lvl]) },
  // buy_zone_g: pivot_distance_pct 0〜+5% (買い場圏)。grades={strict:5} = 厳段のみ activeGrades に算入。
  //   lvl は range 判定のため無視。null (cup 未形成 / Premium マスク) = AND 除外 (honest)。
  { key: 'buy_zone_g',       kind: 'grade',  facet: BUY_ZONE_G_FACET,      pass: (item) => { const d = item.pivot_distance_pct; return d != null && d >= 0 && d <= 5; } },
  // ── 「市場をリードし始めた銘柄」(market_leading) 専用 grade 条件 (SPEC_2026-06-28) ──
  //   vs_spy / eps_yoy_mid は generic ≥ (gradePass)。null = AND 除外 (honest)。
  { key: 'vs_spy',           kind: 'grade',  facet: FACET_MAP.vs_spy,       pass: (item, lvl) => gradePass(FACET_MAP.vs_spy, item, lvl) },
  { key: 'eps_yoy_mid',      kind: 'grade',  facet: FACET_MAP.eps_yoy_mid,  pass: (item, lvl) => gradePass(FACET_MAP.eps_yoy_mid, item, lvl) },
  // rs_mid_band: 範囲 [下限(精度連動), 75]。下限は grades[lvl]、上限は bandMax 固定。null = AND 除外。
  //   gradeAnnot (≥型) では上限75 が隠れフィルタ化するため renderCrow は band を custom 描画 (Trust Cliff)。
  { key: 'rs_mid_band',      kind: 'grade',  facet: FACET_MAP.rs_mid_band,  pass: (item, lvl) => { const v = item.rs_percentile; const lo = FACET_MAP.rs_mid_band.grades[lvl]; return v != null && lo != null && v >= lo && v <= FACET_MAP.rs_mid_band.bandMax; } },
  // roe_lenient: ROE null 許容 (株主資本マイナス銘柄 = MAR/HLT を AND 除外しない)。null → pass、値あり → ≥ 閾値。
  { key: 'roe_lenient',      kind: 'grade',  facet: FACET_MAP.roe_lenient,  pass: (item, lvl) => { const v = item.roe; if (v == null) return true; const thr = FACET_MAP.roe_lenient.grades[lvl]; return thr == null || v >= thr; } },
  // ── 上昇トレンドフィルタ (A軸) compound grade 条件 (SPEC_2026-07-02 screener-uptrend-filter) ──
  //   pv50 下限 (grades) + 厳/最厳の sl50 gate を AND。null (pv50 測定外 = nightly scan 前/履歴不足) = 除外 (honest)。
  //   quiet_quality の opt-in override (default OFF・PRESET_PREDICATES 非登録) のため cold-start でも既存挙動に無影響。
  { key: 'uptrend',          kind: 'grade',  facet: FACET_MAP.uptrend,      pass: (item, lvl) => {
    const pv = item.pv50;
    if (pv == null) return false;                                        // 測定外 = AND 除外 (honest)
    const thr = FACET_MAP.uptrend.grades[lvl];
    if (thr == null) return true;                                        // 未定義段は no-op (clamp 済)
    if (pv < thr) return false;                                          // pv50 下限 (緩−8 / 標−3 / 厳最厳 0)
    if (lvl === 'strict') return item.sl50 != null && item.sl50 >= -2;   // 50日線上 かつ 傾き横ばい以上
    if (lvl === 'severe') return item.sl50 != null && item.sl50 >= 1;    // 50日線上 かつ 傾き上向き
    return true;                                                         // 緩/標 は pv50 のみ
  } },
  // ── 過熱除外フィルタ (B軸) compound grade 条件 (SPEC_2026-07-02 screener-overheat-exclusion-b-axis) ──
  //   除外条件: dd60 < grades[lvl] (段毎の下落率上限) AND runup60 >= OVERHEAT_RUNUP_THR[lvl]。
  //   両方を満たす (大きく吹き上げてから大きく崩れた) 場合のみ除外 (pass=false)。null (dd60/runup60 測定外
  //   = nightly scan 前/履歴不足) = 除外 (honest、A軸 uptrend と同じ規約)。
  //   quiet_quality/market_leading の opt-in override (default OFF・PRESET_PREDICATES 非登録) のため
  //   cold-start でも既存挙動に無影響。Sprint 1 実データ較正 (SPEC §12) で確定した4段階グリッド。
  { key: 'overheat_excl',   kind: 'grade',  facet: FACET_MAP.overheat_excl, pass: (item, lvl) => {
    const dd = item.dd60;
    const ru = item.runup60;
    if (dd == null || ru == null) return false;                          // 測定外 = AND 除外 (honest)
    const ddThr = FACET_MAP.overheat_excl.grades[lvl];
    const ruThr = OVERHEAT_RUNUP_THR[lvl];
    if (ddThr == null || ruThr == null) return true;                     // 未定義段は no-op (clamp 済)
    if (dd < ddThr && ru >= ruThr) return false;                         // 急騰後の急反落パターン = 除外
    return true;
  } },
];
export const COND_MAP = Object.fromEntries(PRESET_CONDS.map((c) => [c.key, c]));
// binary/flag 条件のみ (extra フラグ経由で AND・itemPasses が走査)。grade は activeGrades 経由で別ループ。
export const BINARY_CONDS = PRESET_CONDS.filter((c) => c.kind === 'binary' || c.kind === 'flag');

/** 実効 grade map: CORE は preset level、overrides で個別上書き ('off' で除外) */
// locked facet 和名マップ (Pass 3c: 静的 dict、module scope に配置して毎 render 再作成を回避)
export const LOCKED_FACET_LABELS = {
  cup: 'カップ・ウィズ・ハンドル',
  breakout: '新高値ブレイク',
  near_high: '新高値圏',
  both: 'カップ+RS複合',
  oneill: 'オニール統合',
  // Phase1 S3: #3 買い場圏 (pivot_distance) は free user に locked chip で見せる (§A 案・cup/breakout と同列)。
  pivot_distance: '買い場圏 (節目近接)',
  // Phase1 S4: #8 A/D 出来高の質 (ad_volume) も free user に locked chip (§A 案・cup/breakout と同列)。
  ad_volume: '出来高の質 (上昇引け優勢)',
};
// Pass B: ヒット理由バッジ用の短縮ラベルマップ (module scope で毎 render 再作成を回避)
export const FACET_SHORT_LABEL = {
  eps_yoy_pct: 'EPS↑',
  eps_cagr_3y: 'EPS3年',
  roe: 'ROE',
  rs_percentile: 'RS高',
  volume_surge_pct: '出来高急増',
  volume_quiet: '出来高 静か',
  inst_holders_qoq_pct: '機関↑',
  inst_qoq_calm: '機関 静',
  ocf_margin_pct: 'CF創出力',
  ocf_gt_netincome: '利益の質',
  buy_zone: '買い場圏',
  ad_volume: '出来高の質',
};

// ─── Phase B-2: .crow 統一レンダラ用メタ (mockup v8 忠実化) ───────────────────────
// binary 条件を mockup の .crow (トグル + ラベル + 値チップ) として描画する表示メタ。
// PRESET_CONDS の pass ロジックは不変 — 表示の可否と中身のみ (§6 物理隔離)。
//   label/th(閾値型のみ・bool は null)/freshness(未取得→非表示)/locked(Premium→非表示・B-3でlock crow化)
export const CROW_BINARY_META = {
  funda_pass:       { label: '最新決算で5条件達成', th: null,     freshness: 'funda_pass' },
  ocf_gt_netincome: { label: '営業CF>純利益',        th: null,     freshness: 'ocf_gt_netincome', tooltip: OCF_GT_NI_FACET.tooltip },
  buy_zone:         { label: '買い場圏',             th: '0〜+5%', freshness: 'pivot_distance',   locked: 'pivot_distance', tooltip: BUY_ZONE_FACET.tooltip },
  new_high_52w:     { label: '52週高値を更新',        th: null,     freshness: 'breakout',         locked: 'breakout',       tooltip: NEW_HIGH_52W_FACET.tooltip },
  ad_volume:        { label: '出来高の質',           th: '>1',     freshness: 'ad_volume',        locked: 'ad_volume',       tooltip: AD_VOLUME_FACET.tooltip },
  // cup: free/pro は locked_facets に 'cup' が入る (backend マスク) → lock crow で Premium 解錠を広告。
  //   Premium の applied gate 表示は Sprint 2 (freshness.cup or gate 経路)。Sprint 1 は lock crow のみ。
  cup:              { label: 'カップ・ウィズ・ハンドル', th: null,     freshness: 'cup',              locked: 'cup',             tooltip: 'オニールのカップ・ウィズ・ハンドル形成。ベース完成からのブレイク初動の型（Premium で解錠）' },
  // beat/cfps Phase 2: 決算の継続性 trio (locked なし=free・th: null=段階表現なし・bool トグル)。
  eps_3y_rising:    { label: 'EPS 連続増',       th: null, freshness: 'eps_3y_rising',  tooltip: '1 株利益 (EPS) が直近 3 期連続で増加した銘柄。' },
  rev_3y_rising:    { label: '売上 連続増',      th: null, freshness: 'rev_3y_rising',  tooltip: '売上高が直近 3 期連続で増加した銘柄。' },
  cfps_3y_rising:   { label: 'CFPS 連続増(4期)', th: null, freshness: 'cfps_3y_rising', tooltip: '1 株あたり営業キャッシュフロー (CFPS) が直近 4 期連続で増加した銘柄。' },
  // 条件5 CFPS>EPS (cfps_eps_ratio): locked なし=free・th: null=段階表現なし・numeric ratio bool トグル。
  cfps_eps_ratio:   { label: 'CFPS>EPS', th: null, freshness: 'cfps_eps_ratio', tooltip: '1株あたり営業CF (CFPS) が1株利益 (EPS) を上回る銘柄。利益にキャッシュの裏付けがある目安。銀行・REIT・赤字企業等は対象外。' },
  // beat/cfps Phase 2 (Sprint 3): 直近決算ビート (gate・locked なし=free)。None 注記 tooltip。
  latest_beat:      { label: '直近決算ビート', th: null, freshness: 'latest_beat', tooltip: '直近の決算で 1 株利益 (EPS) が市場予想を上回った銘柄。直近決算の EPS 予想が非公表の銘柄は対象外となります。' },
  // S3: セクター別リーダーの定義条件 is_sector_rs_leader を可視化 (preset名と表示の乖離=Trust Cliff 解消)。
  //   gate 専用 (binBindings 非登録)=custom/他 preset では renderCrow null。freshness は 'rs' (backend が付与)。
  sector_leader:    { label: 'セクター内で相対力トップ', th: '上位3位', freshness: 'rs', tooltip: '所属セクター内で相対力 (RS) が上位 3 位以内（有効 5 銘柄以上のセクターのみ判定）。「セクター別リーダー」戦略の定義条件。' },
};
export const CROW_LAYOUT = [
  // eps_yoy_mid / roe_lenient は market_leading 専用 (renderCrow が market_leading 限定で描画・他 preset 非露出)。
  //   ≥型 eps_yoy_pct / null除外 roe と field 共有・別 key (件数 SSOT 無影響)。RENDERABLE 要件で本 layout に登録。
  { group: '品質',       sub: '利益・キャッシュの質', keys: ['funda_pass', 'ocf_margin_pct', 'ocf_gt_netincome', 'cfps_eps_ratio', 'eps_yoy_pct', 'eps_yoy_mid', 'eps_cagr_3y', 'roe', 'roe_lenient'] },
  // beat/cfps Phase 2: 決算の継続性 trio を grade 条件と視覚分離 (精度スライダー非連動の binary トグル)。
  { group: '品質',       sub: '決算の継続性（連続増）', keys: ['eps_3y_rising', 'rev_3y_rising', 'cfps_3y_rising'] },
  // beat/cfps Phase 2 (Sprint 3): 直近決算ビート。new_high_break で gate「必須」描画 (PRESET_GATE_CONDS)。
  //   binBindings 非登録のため custom/他 preset では renderCrow が null → group 非表示 (gate 専用)。
  { group: '品質',       sub: '決算の裏付け',         keys: ['latest_beat'] },
  // 新高値ブレイク gate 修正 (SPEC_2026-06-25): new_high_signal/buy_zone_g は new_high_break 専用 custom crow
  //   (renderCrow が activePreset !== 'new_high_break' で null・custom mode の全 keys 露出を防ぐ)。
  // volume_quiet (出来高 静か ≤) は逆張り「静かな強さ」(quiet_quality) 専用。renderCrow が
  //   activePreset!=='quiet_quality' で null を返すため、他 preset / custom mode には露出しない
  //   (≥型 volume_surge_pct と ≤型が並ぶ矛盾を構造的に回避・Trust Cliff)。RS の直後に置き RS→出来高静か の順。
  // rs_mid_band (範囲帯・custom 描画) / vs_spy (≥) は market_leading 専用 (renderCrow guard で他 preset 非露出)。
  // uptrend (上昇トレンドフィルタ A軸) も quiet_quality 専用 (renderCrow guard で他 preset 非露出)。RS の直後に置き
  //   RS床→上昇トレンド→出来高静か の順で「強いのに落ちてない静かな株」の意味流れを作る (SPEC_2026-07-02)。
  // overheat_excl (過熱除外フィルタ B軸) も quiet_quality/market_leading 専用 (renderCrow guard で他 preset
  //   非露出)。uptrend の直後に置き「下降除外 (A軸) → 過熱除外 (B軸)」の意味流れを作る (SPEC_2026-07-02 B軸)。
  { group: 'タイミング', sub: '値動き・勢い',         keys: ['new_high_signal', 'buy_zone_g', 'buy_zone', 'new_high_52w', 'cup', 'rs_percentile', 'uptrend', 'overheat_excl', 'rs_mid_band', 'vs_spy', 'sector_leader', 'volume_surge_pct', 'volume_quiet'] },
  // inst_qoq_calm (機関 殺到なし ≤) も quiet_quality 専用 (renderCrow guard 同上)。≥型 inst_holders_qoq_pct と非並置。
  { group: '需給',       sub: '機関の動き',           keys: ['ad_volume', 'inst_holders_qoq_pct', 'inst_qoq_calm'] },
];
// B-3: crow conds が inline lock crow として提示する locked_facets key 集合 (= CROW_BINARY_META.locked)。
//   v2 では (2f) 別 section から除外して二重表示を防ぐ ({pivot_distance, breakout, ad_volume})。
export const CROW_INLINE_LOCKED_KEYS = new Set(
  Object.values(CROW_BINARY_META).map((m) => m.locked).filter(Boolean)
);

// ─── Phase B-4: preset→conds 表示レジストリ (mockup v8 PRESETS[].conds 忠実化・表示専用) ──────
// 目的: 全 preset 一律の CROW_LAYOUT を、選択中 preset (activePreset) に意味のある条件だけへ絞って
//   表示する (原則1: 読み手の負担を減らす)。**pass 述語 (PRESET_CONDS/itemPasses) は一切不変** —
//   ここで決めるのは「どの crow を描くか」だけで、件数 (count==list) には無影響 (SPEC §5 Sprint 1)。
// 値は CROW_LAYOUT に存在する cond key のみ。beat/cfps Phase 2 (SPEC_2026-06-25) で
//   eps3/rev3/cfps3 を配線済 (freshness 付与=Sprint 1)。残る cfpsgt 等は引き続き defer
//   (嘘の南京錠/空表示を作らない・SPEC §3/§9)。
//   cup は Premium 限定 facet として CROW_LAYOUT + 本 map に追加済 (free は lock crow 経由・件数不変)。
// activePreset が null (preset 未選択 = フリーフォーム custom) または本 map に無い key の場合は、
//   従来通り CROW_LAYOUT 全条件を表示する (legacy 挙動・後方互換)。
export const PRESET_DISPLAY_CONDS = {
  // 決算合格: 定義条件(funda_pass=最新決算5条件) + 成長性 (EPS) + 収益の質 (CF マージン/CF>純利益/ROE) + モメンタム (RS)
  //   ocf_gt_netincome は gate (§B-3.5) なので display にも含める (南京錠で必ず可視化)。
  //   funda_pass は extra.fundaPassOnly で適用されるが crow パネル (本 map) に欠落していた。
  //   ※適用条件バー (screener-applied-bar L1935) には「決算5条件達成」チップで表示・除去可能 = 厳密な
  //     隠れフィルタ (Trust Cliff) ではないが、invariant 案A「適用条件は crow パネルにも全て出す」保守的
  //     方針に合わせ①にも可視化 (件数不変・3 体 review 全員 keep 推奨。2026-06-26)。
  earnings_pass:  ['funda_pass', 'eps_yoy_pct', 'eps_cagr_3y', 'ocf_margin_pct', 'ocf_gt_netincome', 'cfps_eps_ratio', 'roe', 'rs_percentile', 'eps_3y_rising', 'rev_3y_rising', 'cfps_3y_rising'],
  // 新高値ブレイク: 型/タイミング (買い場圏/52週高値) + 需給 (出来高急増) + RS + EPS YoY 床。
  //   eps_yoy_pct は P0 修正で述語に算入する床条件 (≥0%) のため必ず可視化 (隠れフィルタ禁止・Trust Cliff)。
  new_high_break: ['latest_beat', 'new_high_signal', 'cup', 'volume_surge_pct', 'rs_percentile', 'eps_yoy_pct'],
  // 旬のセクター: 定義条件(funda_pass=最新決算5条件) + 成長性(EPS YoY/3年) + 収益の質(ROE) + RS。
  //   PRESET_PREDICATES.hot_sector.grades は eps_yoy_pct/eps_cagr_3y/roe/rs_percentile (標準=25/25/25/80) を
  //   述語に適用するが funda_pass はこれらを内包しない (backend で裏取り: _get_annual_funda_pass_map →
  //   compute_annual_evaluation_for_ticker main.py:4236-4267 の 5 条件 = CFM≥15% + EPS/CFPS/売上の3年連続
  //   "増加" (>0 のみ・≥25% でない) + CFPS>EPS。ROE/RS 条件は皆無)。funda_pass のみ表示は隠れフィルタ
  //   (sector_leader L416 と同型・Trust Cliff)。4 grade を表示専用で可視化 (pass 述語不変・件数 count==list 無影響)。
  hot_sector:     ['funda_pass', 'eps_yoy_pct', 'eps_cagr_3y', 'roe', 'rs_percentile'],
  // セクター別リーダー (S3 P1-b・user 承認 2026-06-27): 定義条件(セクター内RSトップ=南京錠) + 収益の質(CF創出力/ROE)
  //   + RS + 機関の動き(機関保有増=南京錠 必須)。eps_yoy/eps_cagr は mockup p4 に無い隠れフィルタのため
  //   述語(PRESET_PREDICATES.grades)・表示の両方から除去 (Trust Cliff 解消)。表示=述語適用条件と 1:1
  //   (隠れフィルタ禁止 invariant・L411 earnings/new_high と同じ不変条件)。
  sector_leader:  ['sector_leader', 'ocf_margin_pct', 'roe', 'rs_percentile', 'inst_holders_qoq_pct'],
  // 静かな強さ (SPEC_2026-06-28 §10 Sprint3): モメンタム(RS床) + タイミング(出来高静か≤) + 需給(機関殺到なし≤)
  //   + 収益の質(CF創出力/ROE)。gate なし (全 5 軸トグル可)。述語(PRESET_PREDICATES.quiet_quality.grades)と
  //   1:1 で隠れフィルタなし (invariant: applied ⊆ display)。volume_quiet/inst_qoq_calm は CROW_LAYOUT に
  //   追加済 = RENDERABLE (renderCrow が quiet_quality 限定で描画)。
  //   uptrend (上昇トレンドフィルタ A軸・SPEC_2026-07-02): opt-in override (default OFF・PRESET_PREDICATES 非登録)
  //     のため applied ⊆ display invariant を壊さない (display に載せるが未適用時は AND に不参加)。RS 床の直後に配置。
  //   overheat_excl (過熱除外フィルタ B軸・2026-07-02): 同じく opt-in override (default OFF)。uptrend の直後に配置。
  quiet_quality:  ['rs_percentile', 'uptrend', 'overheat_excl', 'volume_quiet', 'inst_qoq_calm', 'ocf_margin_pct', 'roe'],
  // 市場をリードし始めた銘柄 (SPEC_2026-06-28 market_leading): 述語適用6条件と 1:1 (隠れフィルタなし invariant)。
  //   rs_mid_band(範囲 gate 相当・必須) + vs_spy + ocf_margin_pct + roe_lenient + eps_yoy_mid (grades) + latest_beat (beatOnly gate)。
  //   uptrend (上昇トレンドフィルタ A軸・2026-07-02 追記): quiet_quality と同じ opt-in override を再利用
  //     (rs_mid_band/vs_spy がトレーリング指標のため落ちるナイフを見落とす同型リスク・user 指摘)。
  //   overheat_excl (過熱除外フィルタ B軸・2026-07-02 追記): 同じく quiet_quality と同じ opt-in override を再利用。
  market_leading: ['rs_mid_band', 'vs_spy', 'ocf_margin_pct', 'roe_lenient', 'eps_yoy_mid', 'latest_beat', 'uptrend', 'overheat_excl'],
};

// ─── D-8 sort (SPEC_2026-06-25): 結果リストのユーザー制御 sort ──────────────────────
// default = 'relevance' (合致度順 = 既存 sortedItems) を維持 (user gate 1 確定 2026-06-25)。
//   mockup line 270 は 'mcap' default だが、BeatScanner は意図的に合致度順を default にする
//   (スクリーナーの本質 = 戦略合致順、原則4 と整合・I-1〜I-6 と同種の意図的 deviation)。
// 「主要指標の高い順」の "主要指標" は preset により意味が変わる (mockup r.m)。各 preset の主指標を
//   PRESET_DISPLAY_CONDS / mockup r.m 意味論から確定 (earnings_pass=EPS YoY% / new_high_break=
//   ブレイク乖離% / sector_leader=CF マージン%)。hot_sector は master-detail で sort 非表示のため不要。
//   未マップ (custom / activePreset null) は metric sort を合致度順に fallback (component 側)。
export const PRESET_METRIC_KEY = {
  earnings_pass: 'eps_yoy_pct',
  new_high_break: 'pivot_distance_pct',
  sector_leader: 'ocf_margin_pct',
  market_leading: 'rs_vs_spy_pct', // 主要指標 = 対SPY超過 (6ヶ月) の降順
};

// sortRows: filteredItems を sortKey で並べ替える純関数 (集合不変・順序のみ = Trust Cliff C-2)。
//   None 値は常に末尾固定 (欠損を 0 扱いで上位に出さない = 数値の honest 表示)。tiebreak は ticker 昇順。
//   mcap/vol/metric は降順、sector は和名 localeCompare('ja') 昇順 (mockup L335 忠実)。
//   'relevance' は呼ばない (component が既存 sortedItems を返す)。
export function sortRows(items, sortKey, activePreset) {
  const arr = [...items];
  const byNumDesc = (key) => (a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return a.ticker.localeCompare(b.ticker);
    if (av == null) return 1;   // None 末尾
    if (bv == null) return -1;
    return bv - av || a.ticker.localeCompare(b.ticker);
  };
  if (sortKey === 'mcap') arr.sort(byNumDesc('mcap'));
  else if (sortKey === 'vol') arr.sort(byNumDesc('volume'));
  else if (sortKey === 'metric') {
    const mk = PRESET_METRIC_KEY[activePreset];
    if (mk) arr.sort(byNumDesc(mk));
  } else if (sortKey === 'sector') {
    arr.sort((a, b) =>
      sectorLabelJp(a.sector || '').localeCompare(sectorLabelJp(b.sector || ''), 'ja')
      || a.ticker.localeCompare(b.ticker));
  }
  return arr;
}

// sort select の option (mockup L217-218 忠実 + 先頭に合致度順 = user gate 1 確定)。
export const SORT_OPTIONS = [
  { value: 'relevance', label: '合致度順' },
  { value: 'mcap', label: '時価総額の大きい順' },
  { value: 'vol', label: '出来高の大きい順' },
  { value: 'metric', label: '主要指標の高い順' },
  { value: 'sector', label: 'セクター順' },
];

// ─── Phase B-3.5: gate 条件レジストリ (preset 毎の「常時 ON・トグル不可」死守条件) ──────────
// 目的: mockup v8 `o.gate:true` 条件を南京錠 (lockicon + 「必須」pill・トグル UI なし) で固定し、
//   「変えられる/変えられない」の階層を視覚分離する (原則3・SPEC §5 Sprint 2)。
// 死守ルール (Trust Cliff C-2): gate は当該 preset で必ず pass に算入される条件のみを列挙する。
//   ここに載せる key は applyStrategyImpl + PRESET_PREDICATES.extra の両方で当該 preset 選択時に
//   常時 ON である flag に対応していること (count==list を壊さない)。
// gate-1 決定 (Q2=(a) 件数不変): ocf 系は earnings_pass / sector_leader で既に applyStrategyImpl が
//   ON にしている (= 件数不変)。これらを南京錠化し、旧 screener-gate-list の別 section 二重表示を解消。
// beat は populate 済 (Sprint 1 で freshness 付与) のため new_high_break の gate「必須」化済 (本 SPEC Sprint 3)。
// defer (嘘の南京錠を作らない・SPEC §3/§9): cfpsgt (実データ無し) と cup/buy_zone/new_high_52w/
//   ad_volume (Premium マスクで free は cup_state/pivot_distance_pct 等が null・main.py:20456-20484) は
//   free で applied gate にすると全滅するため gate に含めない。データ整備 / Premium 専用化は別 sprint。
export const PRESET_GATE_CONDS = {
  earnings_pass: ['ocf_gt_netincome'], // S2 P1-a: ocf_margin は grade 化で gate から外れた (精度連動 crow)
  sector_leader: ['sector_leader', 'inst_holders_qoq_pct'], // S3 P1-b: 定義条件(RSトップ) + 機関保有増(QoQ≥0) を南京錠「必須」化 / ocf_margin は grade
  new_high_break: ['latest_beat'],                       // beat populate 済 (Sprint 1)・PRESET_PREDICATES + applyStrategyImpl で常時 ON = 件数算入
  market_leading: ['latest_beat'],                       // 直近決算ビートを南京錠「必須」(beatOnly 常時 ON = 件数算入)。rs_mid_band は custom 描画 gate のため非登録
};

// ─── 合否理由 静的dict (§38安全・LLM不使用・STATE_LABEL_JP 方式) ────────────────
// 「なぜ合致したか」を事実言い換え。数値は data 由来で、LLM 数値計算・narration なし
// ([[feedback_llm_calc_separation]] / [[feedback_diagram_quality_guard]])。
// 全 facet は「閾値以上」条件 (itemPasses: v < grades[lvl] で fail)。
// name = 正式名 (FACET_SHORT_LABEL の省略形より読み手負担が低い・原則1)。
export const MATCH_REASON_JP = {
  eps_yoy_pct:          { name: 'EPS成長(四半期)', unit: '%' },
  eps_cagr_3y:          { name: 'EPS成長(3年)',    unit: '%' },
  roe:                  { name: 'ROE',            unit: '%' },
  rs_percentile:        { name: 'RS(相対強さ)',     unit: ''  },
  volume_surge_pct:     { name: '出来高急増',       unit: '%' },
  inst_holders_qoq_pct: { name: '機関保有増',       unit: '%' },
};

/**
 * buildMatchReason — facet の実値・閾値を「事実言い換え」テキストへ変換 (静的テンプレ)。
 * @returns {{ valueText: string, reason: string } | null}
 *   valueText = 行内コンパクト表示用 (例 "+28%")、reason = tooltip/aria 用完全文。
 */
export function buildMatchReason(key, value, threshold) {
  const d = MATCH_REASON_JP[key];
  if (!d || value == null) return null;
  const rounded = Math.round(value * 10) / 10;
  // % 系は符号付きで「成長/増加」の事実を明示 (色 polarity なし §38)。RS percentile は符号なし。
  const valTxt = d.unit === '%'
    ? `${rounded > 0 ? '+' : ''}${rounded}%`
    : `${rounded}`;
  const reason = threshold != null
    ? `${d.name} ${valTxt}（基準 ${threshold}${d.unit}以上）`
    : `${d.name} ${valTxt}`;
  return { valueText: valTxt, reason };
}
// preset 別 grade セット (count==list SSOT・mockup v8 「preset ごとに条件が違う」忠実化)。
//   presetKey 指定時: PRESET_PREDICATES[key].grades を base に展開。
//     値 'auto' = 精度 (precision) 連動 (緩/標/厳 で閾値スライド)。
//     明示 level (例 'floor') = 精度に依らず固定 (EPS YoY≥0 床等)。
//   presetKey が null/未登録 (custom フリーフォーム): 従来通り全 PRESET_CORE_KEYS を precision 連動。
//   どちらも overrides で個別上書き ('off' で除外)。
// countPreset (tile) と filteredItems (list) が同一 presetKey+precision を渡す限り count==list を保証。
export function buildActiveGrades(presetKey, precision, overrides) {
  const g = {};
  const spec = presetKey ? PRESET_PREDICATES[presetKey]?.grades : null;
  if (spec) {
    for (const [k, lv] of Object.entries(spec)) {
      // lv 解決: 'auto'=精度連動 / object={loose,standard,strict} 段階別 (値 null=その段で非適用) / 文字列=固定 level。
      let level;
      if (lv === 'auto') level = precision;
      else if (lv && typeof lv === 'object') level = lv[precision] ?? null;
      else level = lv;
      if (level == null) continue; // この精度では当該 facet を適用しない (緩段で出来高を見ない等)
      const clamped = clampLevel(FACET_MAP[k], level);
      if (clamped) g[k] = clamped;
    }
  } else {
    for (const k of PRESET_CORE_KEYS) {
      const lvl = clampLevel(FACET_MAP[k], precision); // eps_cagr_3y は loose→standard へクランプ
      if (lvl) g[k] = lvl;
    }
  }
  for (const [k, lvl] of Object.entries(overrides || {})) {
    if (lvl === 'off') { delete g[k]; continue; }
    const f = FACET_MAP[k];
    g[k] = f ? clampLevel(f, lvl) : lvl; // RS<70 等の定義域外 override を下限へクランプ
  }
  return g; // { facetKey: level }
}

/** 単一 predicate — count も list も必ずこれを通す (Trust Cliff C-2 の根拠)。
 *  Phase B-1: PRESET_CONDS レジストリ駆動に移行 (挙動は refactor 前と完全一致・数値不変)。
 *  grade 条件は activeGrades({key:level}) 経由、binary/flag 条件は extra フラグ経由で、
 *  すべて同一 cond.pass を通す (FUNDA_FACETS / binary facets の二重管理を単一 SSOT へ統合)。
 *  各 binary の否定は旧実装と論理一致 (例: !(m!=null && m>=15) ≡ m==null || m<15)。 */
export function itemPasses(item, activeGrades, extra) {
  // grade 条件 (精度連動・activeGrades = {facetKey: level})
  for (const [k, lvl] of Object.entries(activeGrades)) {
    const c = COND_MAP[k];
    if (!c || c.kind !== 'grade') continue; // grade 以外/未登録 key は no-op (旧 FACET_MAP[k] 不在 continue と等価)
    if (!c.pass(item, lvl)) return false;
  }
  // binary / flag 条件 (extra フラグが ON のものだけ AND・順序は旧実装踏襲で結果不変)
  for (const c of BINARY_CONDS) {
    if (extra?.[c.flag] && !c.pass(item)) return false;
  }
  // cup「型」状態トグル: 特定 stage 選択時のみ cup_state を AND 絞り込み ('all'/未指定 = 件数不変)。
  //   free/pro は cup_state=null マスク + new_high_break は Premium gate (line 2157) のためトグル到達不可
  //   = cupState は常に 'all' に留まる (R3 Premium マスク漏れを構造的に回避)。
  if (extra?.cupState && extra.cupState !== 'all') {
    const allowed = CUP_STATE_MATCH[extra.cupState];
    if (!allowed || item.cup_state == null || !allowed.has(item.cup_state)) return false;
  }
  // sector / mcap フィルタ (preset 非依存・旧実装そのまま)
  if (extra?.sectors?.length && !extra.sectors.includes(item.sector)) return false;
  if (extra?.mcapBands?.length && !extra.mcapBands.includes(item.mcap_band)) return false;
  return true;
}

// ─── Phase A: プリセット述語 SSOT ────────────────────────────────────────────
// Trust Cliff 整合: タイル件数と list が必ず同一 predicate を通すための SSOT。
// [[feedback_facet_filter_count_integrity]] に準拠。
// grades: preset 別 grade セット (mockup v8 「preset ごとに条件が違う」)。'auto'=精度連動。
//   earnings_pass: S2 P1-c で eps_cagr_3y を必須 grade から除去 (eps_3y_rising と A軸二重カウント・
//     mockup p1 に無し)。S2 P1-a で ocf_margin を binary gate→可変grade化 (user 承認・標準=15%件数中立)。
//     残る core は eps_yoy/roe/rs/ocf_margin。eps_cagr は PRESET_DISPLAY_CONDS で任意トグルに降格。
//   sector_leader (S3 P1-b・user 承認 2026-06-27 / 0件問題で A=健全化 再承認): mockup p4 (AUDIT L91-96) に寄せる。
//     gate(必須・南京錠) = is_sector_rs_leader + 機関保有増 QoQ≥0 (PRESET_GATE_CONDS)。eps_yoy/eps_cagr は
//     mockup p4 に無い隠れフィルタのため grade/display 両方から除去 (Trust Cliff)。可変 grade(精度連動) =
//     rs(緩70/標80/厳90 常時) + roe/ocf_margin。⚠️実データで is_sector_rs_leader はモメンタム偏重(低/負ROE)
//     のため roe/ocf を緩段で適用すると 0 件 (snap 実測: roe≥17 すら 0/15)。よって UX 指針「default 緩で
//     件数多め」(AUDIT L99) に従い roe/ocf を緩段=非適用(null)、default 精度=緩 (PRESET_DEFAULT_PRECISION) と
//     し default ~15 件を確保。標/厳へ締めると roe/ocf が透過的に効く。mcap cap(中型↑/大型) は extra。
//     count==list は countPreset も同 default 精度で算出して担保。
//   new_high_break は EPS≥25/eps_cagr/ROE≥25 の隠れ過剰フィルタを除去し、gate (beat/buy_zone/new_high)
//     は緩いまま固定、精度 3 段で「市況ロバストに」締める (金融合議 2026-06-25・活況の件数膨張対策)。
//     RS だけだと相対指標ゆえ活況で膨張 → 市況非依存の出来高を厳段で重ねるのが要 (最重要キャップ):
//       RS (≥70/80/90 精度連動) + ブレイク出来高 (緩=非適用 / 標+25% / 厳+50%) +
//       EPS YoY (緩≥0床 / 標≥25% / 厳≥50% 加速)。型/決算ビートは extra の gate。
//     ※ 買い場圏のタイト化 (+5/+3/+2%) は binary facet の段階閾値=別機構のため follow-up (本 sprint defer)。
export const PRESET_PREDICATES = {
  earnings_pass:  { grades: { eps_yoy_pct: 'auto', roe: 'auto', rs_percentile: 'auto', ocf_margin_pct: 'auto' }, extra: { fundaPassOnly: true, ocfGtNiOnly: true } },
  // 新高値ブレイク gate 修正 (SPEC_2026-06-25・0件根治 + 微調整 3体合議): 旧 flag を grade cond へ置換。
  //   new_high_signal=is_new OR near_high (緩90/標95/厳97)。厳=97 化で実ブレイク手前も拾い 0件恒常化を回避。
  //   rs_percentile: 緩=標=standard(≥80・オニール L 最低ライン)/厳=strict(≥90)。旧 'auto' は緩≥70 でノイズ膨張(215件)。
  //   買い場圏(buy_zone_g)は撤去: near≥97 が extended 回避(pivot近接)を構造的に代替するため 厳の重複 gate を解消。
  //   volume_surge: 厳=standard(40) に緩和 (旧 strict=50)。Premium 実測で厳=1件だったため follow-up
  //     (金融推奨の最小緩和: vol は市況依存で quality 信号でないため最初に緩める。EPS は CANSLIM の C で最後)。
  //   beatOnly は gate 維持。count==list は buildActiveGrades+itemPasses で自動保証。
  new_high_break: { grades: { rs_percentile: { loose: 'standard', standard: 'standard', strict: 'strict' }, volume_surge_pct: { loose: null, standard: 'loose', strict: 'standard' }, eps_yoy_pct: { loose: 'floor', standard: 'standard', strict: 'strict' }, new_high_signal: 'auto' }, extra: { beatOnly: true } },
  sector_leader:  { grades: { rs_percentile: { loose: 'loose', standard: 'standard', strict: 'strict' }, roe: { loose: null, standard: 'loose', strict: 'standard' }, ocf_margin_pct: { loose: null, standard: 'standard', strict: 'strict' }, inst_holders_qoq_pct: 'loose' }, extra: { sectorLeaderOnly: true, mcapBands: ['mega', 'mid'] } },
  // hot_sector: セクター算出は topSectorsByRs で計算 (sectorTopN=5 相当)
  hot_sector:     { grades: { eps_yoy_pct: 'auto', eps_cagr_3y: 'auto', roe: 'auto', rs_percentile: 'auto' }, sectorTopN: 5, extra: { fundaPassOnly: true } },
  // 静かな強さ (SPEC_2026-06-28 §10 Sprint3・件数 gate1 確定 2026-06-28 = Option A「thesis 型」緩48/標28/厳11):
  //   逆張りの肝は中核2軸 (出来高静か / 機関殺到なし) を精度連動 (auto) で締めること。RS と ROE は「相対力の
  //   床」「利益の質の床」として全精度固定 (loose=≥70/≥17) し、スライダーは『どれだけ静か/不人気か』を制御する。
  //   ※ mockup の均一表示 (全条件 levels[target]) は実データで標準6件/厳0件に破綻 (sector_leader/new_high_break が
  //     苦しんだ 0件問題)。RS/ROE を床固定にすることで標準=28 (§9 ground-truth) を保ちつつ厳=11 と健全に逓減。
  //   標準 = RS≥70 × 出来高静か≤20 × 機関殺到なし≤20 × CF創出力≥15 × ROE≥17 = 28件 (universe 2552 で検証)。
  //   gate なし (mockup p5 は全条件トグル可)。count==list は buildActiveGrades+itemPasses で構造保証。
  quiet_quality:  { grades: { rs_percentile: 'loose', volume_quiet: 'auto', inst_qoq_calm: 'auto', ocf_margin_pct: { loose: 'loose', standard: 'standard', strict: 'standard' }, roe: 'loose' }, extra: {} },
  // 市場をリードし始めた銘柄 (SPEC_2026-06-28 market_leading・件数 gate1 確定 2026-06-28 = 緩75/標59/厳38/最厳28):
  //   個別の相対力が市場(SPY)を上回り始めた中位帯の出遅れ回復株。精度 4 段 (緩/標/厳/最厳) — 本 preset のみ最厳を持つ
  //   (PRESET_PRECISION_LEVELS)。本番 universe 2553 で実測 (≥規約・rs_vs_spy_pct/rs_percentile/ocf/roe/eps_yoy/latest_beat)。
  //   rs_mid_band: 範囲 [下限45/55, 75] (上限固定・下限のみ精度連動)。vs_spy: ≥5/8/8/8。
  //   ocf_margin_pct: 既存 facet の loose(≥10) を全精度固定 (標準15 だと MAR/HLT 脱落を実測)。
  //   roe_lenient: ≥10/10/15/20 (null 許容・厳最厳で締める)。eps_yoy_mid: ≥10/10/15/15。
  //   gate = 直近決算ビート (beatOnly・PRESET_GATE_CONDS)。default 精度 = standard(59)。
  //   ※ object マッピングで最厳(severe)に独自閾値を与える (roe_lenient severe='strict'=20 が最厳の絞りレバー)。
  market_leading: { grades: { rs_mid_band: 'auto', vs_spy: 'auto', ocf_margin_pct: 'loose', roe_lenient: { loose: 'loose', standard: 'loose', strict: 'standard', severe: 'strict' }, eps_yoy_mid: { loose: 'loose', standard: 'loose', strict: 'standard', severe: 'standard' } }, extra: { beatOnly: true } },
};

// preset 別の精度段数 (S4 market_leading で 4 段目「最厳」を導入)。未登録は 3 段 (緩/標/厳)。
//   ★ 既存 5 preset は 3 段のまま不変 (精度セグメント / presetCounts の UI 段数を preset 毎に切替)。
//   GRADE_ORDER は元から severe を含み facetLevels/clampLevel が対応済 = 段数だけを per-preset で可変化する。
export const PRESET_PRECISION_LEVELS = { market_leading: ['loose', 'standard', 'strict', 'severe'] };
export function presetPrecisionLevels(presetKey) {
  return PRESET_PRECISION_LEVELS[presetKey] || ['loose', 'standard', 'strict'];
}

// preset 別 default 精度 (S3 P1-b)。未登録は 'standard'。sector_leader は AUDIT L99「default 緩で件数多め」+
//   roe/ocf が緩段=非適用のため、緩 default で健全件数を出す。countPreset(tile) と applyStrategyImpl(list) の
//   両方が同一 default 精度を使うことで count==list を担保する。
export const PRESET_DEFAULT_PRECISION = { sector_leader: 'loose' };
export function presetDefaultPrecision(presetKey) { return PRESET_DEFAULT_PRECISION[presetKey] || 'standard'; }

/**
 * topSectorsByRs — sector_rs_median 上位 topN セクター名を返す純関数。
 * countPreset (件数) と applyStrategyImpl (list の sector filter) の両方から呼び、
 * hot_sector の count==list 整合を担保する ([[feedback_facet_filter_count_integrity]])。
 * sector_rs_median は同一 sector 内で全銘柄同値だが、欠損は 0 扱いで max を採る。
 * @returns {string[]} 上位 topN セクター名 (RS 降順)
 */
export function topSectorsByRs(items, topN = 5) {
  const medianBySector = {};
  for (const it of (items || [])) {
    const sec = it.sector;
    if (!sec) continue;
    const v = it.sector_rs_median ?? 0;
    if (medianBySector[sec] == null || v > medianBySector[sec]) medianBySector[sec] = v;
  }
  return Object.entries(medianBySector)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([sec]) => sec);
}

/**
 * sectorTone — セクター行の色 tone を返す純関数 (SPEC_2026-06-27 U-1・色は 3 値固定)。
 * 最上位かつ対 SPY 超過 (sr>0) = 主戦場(amber) / sr>=0 = 上位(緑) / sr<0 = 劣後(赤)。
 * rank は sectorSummary の sr 降順 index (0 = 最上位)。
 * @returns {'hot'|'up'|'neg'}
 */
export function sectorTone(sr, rank) {
  if ((sr ?? 0) < 0) return 'neg';
  if (rank === 0 && (sr ?? 0) > 0) return 'hot';
  return 'up';
}

// 「横ばい」中立帯のしきい (対 SPY 超過 pt)。色は 3 値固定 (U-1) のまま tag テキストだけ nuance を補う。
//   mockup の「+3.0 横ばい」に倣い、小幅プラス (0〜SR_NEUTRAL) は up(緑) でも「横ばい」と表示。
export const SR_NEUTRAL = 5;

/**
 * sectorTagJp — セクターの相対力 tag を静的 dictionary で返す純関数 (LLM 不使用・§4)。
 * §38 厳守: 過去/現在の相対力の「事実記述」のみ。将来上昇の断定・示唆を入れない
 *   ([[feedback_section38_buy_signal_boundary]])。SPEC §5 例の「改善中」は sr スナップショットに
 *   時系列差分が無く trend 主張を裏取りできないため不採用 (検証可能な事実ラベルに限定)。
 *   - sr<0           → 「劣後」       (対 SPY を下回る事実)
 *   - 0<=sr<NEUTRAL  → 「横ばい」     (対 SPY とほぼ同等・色は up 緑のまま nuance のみ補完)
 *   - 最上位(rank0)  → 「相対力 トップ」 (最大 RS セクターである事実。主戦場 chip は別途)
 *   - それ以外の上位 → 「相対力 上位」
 * @returns {string}
 */
export function sectorTagJp(sr, rank) {
  const tone = sectorTone(sr, rank);
  if (tone === 'neg') return '劣後';
  if (tone === 'hot') return '相対力 トップ';
  return (sr ?? 0) < SR_NEUTRAL ? '横ばい' : '相対力 上位';
}

/**
 * fmtSr — セクター RS を符号付き整数で表示 (SPEC_2026-06-27 U-4・単位無印)。
 *   "+14" / "-1" / "0"。対 SPY 超過 pt の符号 (超過/劣後) を一目で示す。
 * @returns {string}
 */
export function fmtSr(sr) {
  const n = Math.round(sr ?? 0);
  return (n > 0 ? '+' : '') + n;
}

/**
 * buildSectorSummary — 「旬のセクター」master-detail の集計を行う純関数 (Phase C 正規 view の SSOT)。
 * U-2=(b): master の sector 集合 = 全 universe のセクター相対力俯瞰 (劣後含む全セクター)。
 *   sr (sector_rs_median) は allItems から、count/top3 (好決算) は filteredItems から振り分ける。
 * ★ C-2 不変: 各 sector 行 count の総和 = (sector を持つ) filteredItems 数 = preset 件数。
 *   件数 SSOT (PRESET_PREDICATES / itemPasses / topSectorsByRs) は一切変えず、ここは集計のみ。
 * @param {Array} allItems       — universe.items (sr 俯瞰の母集団)
 * @param {Array} filteredItems  — preset 絞り込み済 (count/top3 の母集団)
 * @returns {Array<{sn:string,label:string,sr:number,count:number,top3:Array}>} sr 降順 → count 降順
 */
export function buildSectorSummary(allItems, filteredItems) {
  const all = allItems || [];
  if (all.length === 0) return [];
  // (1) 全 universe を sector 集約して sr を得る (= 俯瞰、劣後もここで拾う)。
  const srMap = {};
  for (const it of all) {
    const sec = it.sector;
    if (!sec) continue;
    const sr = it.sector_rs_median ?? 0;
    if (srMap[sec] == null || sr > srMap[sec]) srMap[sec] = sr;
  }
  // (2) 好決算 (filteredItems) を sector 別に → count/top3 (件数 SSOT 整合)。
  const passBySector = {};
  for (const it of (filteredItems || [])) {
    const sec = it.sector;
    if (!sec) continue;
    (passBySector[sec] = passBySector[sec] || []).push(it);
  }
  return Object.keys(srMap)
    .map((sec) => {
      const pass = passBySector[sec] || [];
      return {
        sn: sec,
        label: sectorLabelJp(sec),
        sr: srMap[sec],
        count: pass.length,
        top3: [...pass]
          .sort((a, b) => (b.rs_percentile ?? -1) - (a.rs_percentile ?? -1) || a.ticker.localeCompare(b.ticker))
          .slice(0, 3),
      };
    })
    .sort((a, b) => b.sr - a.sr || b.count - a.count);
}

/**
 * countPreset — プリセットキーに対応する件数を universe.items から算出。
 * ScreenerMaster がタイル件数表示に利用 (list の itemPasses と同一述語)。
 * @param {Array}  items    — universe.items (空配列/null なら null を返す)
 * @param {string} presetKey
 * @returns {number|null}
 */
export function countPreset(items, presetKey) {
  if (!items || items.length === 0) return null;
  const cfg = PRESET_PREDICATES[presetKey];
  if (!cfg) return null;

  // tile 件数は preset の default 精度で算出 (preset クリック直後の精度と一致 → count==list)。
  //   S3 P1-b: sector_leader は default='loose' (roe/ocf 緩段=非適用で健全件数)。他は 'standard'。
  const grades = buildActiveGrades(presetKey, presetDefaultPrecision(presetKey), {});

  if (presetKey === 'hot_sector') {
    // 上位 sectorTopN セクター (sector_rs_median 降順) ∩ funda_pass を集計。
    // applyStrategyImpl も同一 topSectorsByRs を使うため count==list が保証される。
    const topSectors = topSectorsByRs(items, cfg.sectorTopN ?? 5);
    if (topSectors.length === 0) return null;
    const extra = { ...cfg.extra, sectors: topSectors };
    return items.filter((it) => itemPasses(it, grades, extra)).length;
  }

  // その他プリセット: PRESET_PREDICATES.extra をそのまま使う。
  return items.filter((it) => itemPasses(it, grades, cfg.extra)).length;
}
