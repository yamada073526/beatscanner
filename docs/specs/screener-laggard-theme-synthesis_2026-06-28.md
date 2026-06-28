# 設計サマリー: スクリーナー新プリセット「テーマ・セクター先導株（仮）」

> **位置づけ**: planner が SPEC を起票するための設計インプット（診断 + 6体合議 + Sprint0実測 + user決定の統合）。本ファイルは正本でなく、planner が SPEC.md に昇華する前の作業統合。
> **発端**: じっちゃまライブ言及「KYIV がチャートポイントに来てる/ブレイクアウト」「DAL(Delta)は戦争終結で上がってる、半導体じゃなくても上がってる銘柄いくらでもある」「ホテル株も上がってる」を BeatScanner screener で検出できるようにする。

---

## 1. 課題（本番データ診断で確定）

じっちゃま言及 KYIV / DAL / MAR / HLT / H が screener_v2 の5プリセット全てで検出されない。

- **universe には全員入っている**（FMP company-screener 2553銘柄、時価総額$5億超）。「universe外」ではない。
- 落ちる根本原因 = **全プリセットが「RSが既に高い株」狙い**で、じっちゃまが見る「最近上がり始めた出遅れ/テーマ株」の軸が無い。
  - DAL/MAR/HLT/H: `funda_pass=False`（決算3年連続増gate、コロナ打撃業種に構造的不利）+ RS中位（56-75）
  - KYIV: RS=50（中央値）+ `eps_yoy/funda_pass=null`（ウクライナADRの年次データ欠落）

---

## 2. 6体合議の収束結論（全員「条件付賛成」）

1. **当初案「短期モメンタム新カラム(return_1m/3m)」は却下**: Supabaseに存在せず migration+nightly改修で2-3人日+検証待ち。→ **既存カラムの組み替えで組む**（追加カラム0、0.5-1人日）。
2. **決算gate無し → 「決算ミス除外gate（latest_miss=False）必須」**（金融）。じっちゃまの鉄則「決算ミス銘柄は対象外」。beat任意加点・miss足切りの非対称設計。
3. **KYIV型(bo_pending)は新プリセットから分離**: bo_pending は screener DB に原理的に非保存（瞬間状態）。→ KYIVは別経路（FMP年次修正 or 個別詳細）。
4. **§38**: narrationは静的dict（LLM生成BAN、condition pulse の STATE_LABEL_JP 方式）。プリセット名「出遅れ反転」は「反転」が将来断定で**§38/景表法抵触 → 改名必須**。観測事実語彙（「相対力が上向いた」「52週高値の○%以内」）のみ。
5. **tier（マーケ）**: 完全Premiumより「件数Free / 詳細Premium」のフリーミアム分割（集客フックを死蔵しない）。
6. **UI**: 6枚目で grid を 3列×2行（repeat(3,1fr)、カードCSS無変更）。アイコン Sunrise系、サブラベルで「静かな強さ」と差別化。色は緑不使用・シアン+中立ラベル。検出日タイムスタンプ併記（揮発性=鮮度）。
7. **memory整合（Anthropic）**: `project_jijima_contrarian_quality_pattern` の**パターン2B「見直され待ち優良大型(RS45-75)」= 未着手・別SPEC** スロットに収まる計画済みの次打ち。`project_screener_condition_expansion` Phase2「成長×ローテ」と役割分担を1行明文化。

---

## 3. Sprint0 実測結果（本番 GET /api/scanner/universe、2026-06-28、2553銘柄）

### 3-1. 5銘柄実値

| ticker | sector | mcap | rs_pct | vs_spy% | near_high% | latest_beat | roe | ocf_margin% | eps_yoy% | funda_pass |
|--------|--------|------|--------|---------|-----------|-------------|-----|-------------|----------|------------|
| DAL | Industrials | mega | 75 | +25.3 | **97.30** | true | 23.14 | 12.88 | 39.1 | false |
| MAR | Consumer Cyc | mega | 64 | +14.2 | 91.81 | true | **null(株主資本−)** | 12.88 | 17.2 | false |
| HLT | Consumer Cyc | mega | 56 | +8.3 | 92.98 | true | **null(株主資本−)** | 18.69 | 16.9 | false |
| H | Consumer Cyc | mega | 63 | +13.5 | 95.56 | **null** | null | **null** | null | false |
| KYIV | Comm Svc | mid | 50 | +3.8 | 89.50 | true | 15.95 | 37.01 | **null** | **null** |

### 3-2. 確定した事実

- **near_high 向き = 仮説A（高い=高値接近）が正解**。5銘柄とも 89.5〜97.3% の高域に実在。「高値から遠い出遅れ」(仮説B)は否定。
- **near_high 単独では絞れない**: 強気相場で universe の **67〜75%** が既に near_high≥88%。シグナルにならない。
- **件数試算**（base: vs_spy>0 AND RS 45-75 AND latest_beat AND ocf>10 AND (roe>10 OR null)）:
  - near_high無=155 / ≥88%=106 / ≥90%=101 / ≥93%=80
  - +inst_qoq>0 追加: 78 / 75 / 57
  - **いずれも目標5-30件に未到達**。セクター限定(Consumer Cyc+Industrials) or RS下限引き上げ(55+) が要る。
- **4銘柄全拾いには near_high≥88% が必要**（≥90%でKYIV脱落、≥93%でMAR/HLT脱落）。
- **ROE null（MAR/HLT）**: 自社株買いで株主資本マイナス → `_roe_equity_guard` が null化。**ROE条件は null許容必須**（さもないとMAR/HLT除外）。
- **H は latest_beat も ocf_margin も null**（FMP年次OCF revenue欠落）→ 標条件から自動除外。構造的欠損。
- **near_high は Pro-locked**（free=null、`locked_facets`）。FMP quoteから手計算は可能だが、「件数Free」設計と干渉。
- **KYIV年次データ欠落の根**: `prev_eps≈0`(Q3 2024 = -0.0001) が YoYガード(`abs(prev_eps)>=0.05`、main.py:7126)で null化 + `earnings_annual_evaluation` に通期評価行なし（FMPで通期取得不可/上場浅い）。

---

## 4. user 決定（gate済）

1. **検出ロジック**: まず①既存カラム組み替え → その後②短期モメンタム新カラム（段階実装）
2. **KYIV**: FMP年次データ修正を今回スコープに含める
3. **tier**: 件数Free / 詳細Premium

---

## 5. 実測が突きつけた設計修正（planner が SPEC で必ず解くべき論点）

実測で「near_high/RS中位だけでは106件で絞れない、セクターが鍵」と判明し、当初の個別指標主軸から**セクター軸主軸**へ転換が必要。

1. **主軸の確定**: 「資金が向かい始めたセクター（セクターRS上位/改善）× セクター内で決算ミスなし × 高値接近 × RS中位許容」を主軸にするか。件数を5-30に収束させる絞り込み（セクター上位N or RS下限）をどう設計するか。**セクター限定のハードコード(航空/ホテル)は one-off になるため不可**（汎用化必須、Anthropic指摘）。
2. **「旬のセクター」との差別化**: 旬のセクター=決算優良(funda_pass=3年連続増)×セクター上位。新案=決算ミスなし(緩)×セクター改善×高値接近×RS中位(出遅れ回復株)。差別化を SPEC に明記。
3. **near_high の tier 問題**: near_high は Pro-locked(free=null)。「件数Free」を成立させるには件数計算を backend 側で free でも near_high を計算する（表示のみ locked）か、件数フィルタは vs_spy+セクター+決算ミス除外+RS帯で行い near_high は詳細(Premium)表示に留めるか。
4. **ROE null許容**: 必須（MAR/HLT が株主資本マイナスで null）。質フィルタは ocf_margin>10 + 流動性 + 時価総額を主、ROE は null許容の任意加点。
5. **命名（§38セーフ）**: 「出遅れ反転」NG。候補: 「動意フラッシュ」(マーケ)/「市場をリードし始めたセクター株」(金融)/観測事実型。検出日タイムスタンプ併記。
6. **KYIV FMP修正のスコープ**: 「年次データ取得(earnings_annual_evaluation 行生成)」+「YoY計算 prev≈0 edge case 対応」の両方。別ドメイン・工数大。別Sprintに切り出し。new プリセットの near_high≥88% でも KYIV(89.5%)は拾える(Sprint0確認)ので、FMP修正は決算系での確実拾い用。
7. **Sprint分割案**（設計/開発/Anthropic収束）:
   - S1: 既存カラムのみで新プリセット（vs_spy>0 + RS45-75 + near_high≥88 + 決算ミス除外 + セクター絞り + ROE null許容 + ocf>10 + 流動性）+ 件数Free/詳細Premium gate + UI(3×2 grid) + §38静的narration。**件数を5-30に収束させる閾値を本番curlで確定**。
   - S2: 短期モメンタム新カラム(return_1m/3m)を nightly scan + migration（別fetch分離、`feedback_paged_select_missing_column_trap`）。効果検証後に追加。
   - S3（別SPEC）: KYIV FMP年次データ修正（annual行生成 + prev≈0 edge case）。

---

## 6. 制約・danger zone

- **§38/景表法**: 静的dict narration、観測事実語彙、緑不使用(シアン+中立)、最上級禁止、検出日タイムスタンプ。
- **Trust Cliff**: 件数Free/詳細Premium、モメンタム揮発性は「鮮度」として演出（「消えた=正常」）。
- **件数SSOT不変**: 新key追加のみ（既存5プリセットの予測件数は一切動かさない）。閾値の数値はuser承認gate。
- **worktree隔離必須**: 現ローカルに並行セッション(B2 crow)の未コミット4ファイル（design_system.md / elevation_scale.md / ScreenerGridTable.jsx / index.css）。混入回避のため origin/main から worktree を切って実装（`feedback_parallel_session_commit_entanglement`）。
- **実装場所**: 条件=`frontend/src/components/customScreenerModel.js`(PRESET_PREDICATES)、universe=`backend/app/main.py`(_build_universe_payload/_fetch_screener_base_universe)、UI=`frontend/src/features/workspace/`。
- **memory anchor**: `project_jijima_contrarian_quality_pattern`(パターン2B) / `reference_jijima_investment_criteria`(RS帯45-75/ROE/機関QoQ) / `project_screener_condition_expansion`(Phase2重複確認) / `feedback_condition_pulse_pattern`(静的dict) / `feedback_facet_filter_count_integrity`(facet count整合)。
- **検証規律**: build + 既存テスト + 本番curl(件数SSOT不変確認) + authed snap。sub-agent委託は schema強制 + main独立裏取り。
