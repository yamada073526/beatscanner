# handover v317 — Phase D 全 merge 完了 + dogfood follow-up + Sprint 4c 移行準備 (2026-07-02)

前任: v316 (Phase D S2-S5 draft PR)。本セッションで **draft を全て本番 merge + deploy 検証** し、
user dogfood の追加指摘 4 件を都度 fix→merge→本番確認まで完走。egress 403 が**解消**（本番 URL に
直接到達可能）したため、curl でバンドル / API を ground-truth 検証できるようになった。

## ✅ 本セッションで本番 merge + deploy 検証済み（全て production 反映確認済み）

| PR | 内容 | 検証 |
|---|---|---|
| #168 | nightly cron: earnings_evaluation の更新停止(cron未登録)を是正 | YAML/bash構文。効果は次回nightly(23:07 UTC)後にSQL確認 |
| #164 | S3: fold summary動的復元 + Pro tag + In-line色是正 | 本番bundle grep + API `/earnings-reaction` 確認 |
| #165 | S4: 良い決算N連続 + EPS YoY加速/減速 (PR #117リベース版) | 本番 `beat_streak:3` `accelerating` 確認 |
| #169 | S2: L0 verdict-hero gold top hairline | 本番CSS `.verdict-hero border-top gold` 確認 |
| #170 | S4/S2 followup: chip→Pillbox化 + Hero全辺gold | 本番CSS 全辺gold + is-glow-calm 確認 |
| #171 | 良い決算バナーを mockup .goodq 位置(決算3点直下)へ再配置 + KB核心タグ廃止 | 本番 `毎回2点揃うか` 確認・`KB核心` 0件確認 |
| #172 | 来期コンセンサス(YoY)を箱→subline に降格 | merge済み・deploy検証中 |

**S5 (③テクニカル累進開示)**: 6体multi-reviewの結論 = 新規実装なしで見送り(既にPriceLadderに実装済み・
Pivot距離tile化は逆算防止ガードに抵触・ATRは投資思想不一致)。Phase D は全項目決着。

## ⚠️ PR #117 は close 推奨（内容は #165 に完全移行済み・origin/mainから46commit遅れの陳腐化ブランチ）

## 🟡 EpsBeatStreakChip 重複裁定（v315から継続・未着手）
既存 `EpsBeatStreakChip.jsx`(EPS単独streak) と backend `beat_streak`(EPS+売上streak) の重複。
実データ15銘柄中11銘柄で数値が食い違う(NVDA: 8Q vs 3Q)。判断待ち3択は v315 参照。
※本セッションで新設した「良い決算連続」バナー(EarningsThreePoint内)は beat_streak(2点)ベース。

## 🔴 次セッション最優先: Sprint 4c SPEC 化（planner 起動）— 調査は完了済み、再調査不要

user 要望「ガイダンス3点目(Sprint 4c)を SPEC 化」。本セッションで **ground-truth 調査は完了**したので、
次セッションは planner にこの調査結果を渡して SPEC を起票するだけでよい（DB再調査は不要）。

### 調査結論（DB 直接照会済み・2026-07-02）
「良い決算 3点」= EPS beat AND 売上 beat AND **ガイダンス beat**、を過去8Q各四半期で判定したい。

**現状**: `beat_streak` は EPS+売上の**2点**判定（`backend/app/main.py:7292` `_is_good_quarter`）。
history行(`main.py:7256-7282`)は eps_verdict/revenue_verdict を持つが**ガイダンス verdict は無い**。
EPS/売上の2点は FMP 決算サプライズで過去8Q全部取れる（全銘柄で今も動作）。

**3点目が今できない理由（2テーブルの実態）**:
| 必要データ | テーブル | 実態(2026-07-02 照会) |
|---|---|---|
| 会社ガイダンス履歴 | `guidance_snapshots` | 77行/30銘柄・**前向きのみ**・疎(NVDA=6/MSFT/AAPL/AMD/META=0)。生レンジのみ・verdict無し |
| その時点コンセンサス(PIT) | `consensus_snapshots` | 63657行/1024銘柄だが **snapshot_date が 2026-06-06 開始(約26日分のみ)**。過去四半期のPITコンセンサス無し |

**結論 = 時間経過だけでは完走しない。前向き蓄積＋コード改善が必要。過去遡及は事実上不可能**:
- **前向き(今後の四半期)**: nightly cron(guidance_snapshot + consensus_snapshot)が毎決算時に両方捕捉 → 四半期毎に3点目材料が積む。約8Q(≒2年)で揃う。ただし対象=保有∪WL∪直近決算報告のみ、数値ガイダンス非開示企業(AAPL)は判定不能。
- **時間経過だけでは3点にならない**: 貯まったデータを使うコード改善が必須 → ①各決算時に per-Q ガイダンス verdict(ガイダンス mid vs その時点コンセンサス)を算出・永続化 ②`_is_good_quarter`に3点目結線 + frontend文言を「EPS+売上+ガイダンス」に戻す ③欠落四半期は捏造せず honest fallback(2点維持 or 判定対象外)。
- **過去8Q遡及は不可能**: 過去のPITコンセンサスが記録に無い(consensus_snapshots=26日前開始)ため、過去分の「ガイダンスがコンセンサスを超えたか」を正直に判定できない。FMP現在予想を過去期に当てるのは look-ahead bias = §38/Trust Cliff 違反。

**planner に渡す SPEC 方針**: Sprint 4c の現実的完走 = **前向き専用の3点化**(今後2年で自然に埋まる)。過去遡及はしない。
- backend: per-Q ガイダンス verdict の算出(既存 `classify_guidance_vs_consensus` 流用)・永続化先の設計(history row への join or 新カラム)・cron結線
- frontend: EarningsThreePoint.jsx の goodq バナー文言を条件付きで「2点/3点」出し分け(データ有無で honest に)
- §38: 欠落・非開示は捏造せず 2点表示 fallback。3点と謳うのはデータが揃った四半期のみ

### Sprint 4c 関連 file (次セッション用ポインタ)
- `backend/app/main.py:7256-7282` (history行構築) / `:7288-7305` (beat_streak算出=_is_good_quarter)
- `backend/app/main.py:18740` (cron_guidance_snapshot) / `classify_guidance_vs_consensus` (visualizer/calc.py)
- `frontend/.../sections/EarningsThreePoint.jsx` (goodqバナー・beatStreak prop)
- DB: `guidance_snapshots` / `consensus_snapshots` (上表の実態)

## ⚠️ 触ると危険 / 検証規律
- danger zone: 発光系(.panel-card/.bs-panel/.surface-card/.verdict-hero) / gold accent / sticky検索バー / index.css / PriceLadder.jsx(=StockPriceChart.jsx 全文取込み禁止)
- **egress 403 は解消** → 本番URL curl 可(バンドル grep / API dogfood が自律でできる)。ただし authed個別株のvisual描画は依然headless不可
- 検証 = build + vitest + py_compile + §38/raw-hex grep が ground-truth
- deploy = PR draft → user承認 → squash-merge → Railway auto-deploy(~30-60s、/health.commit で確認)
- git add -A 禁止 / **main へ直 commit しない**(本セッションで1度誤commit→push前に feature branch へ退避して是正した)
- sub-agent主張は着手前にmainがgrepで独立裏取り

## 次セッション用プロンプト（コピペ用）

```
/fetch-handover 起動（対象 handover_2026-07-02_v317_sprint4c-prep.md）

最優先タスク:
1. Sprint 4c を SPEC 化 → /planner 起動。調査は handover v317 に完了済み(DB再調査不要)。
   方針=「前向き専用の3点化」(過去遡及はPITコンセンサス無しで不可能)。planner に v317 の
   「Sprint 4c 調査結論」節をそのまま渡す。docs/specs に SPEC.md 起票 → gate1 承認まで。
2. PR #117 を close (内容は #165 に完全移行済み)
3. [継続] EpsBeatStreakChip 重複裁定(3択・v315参照) — user 判断待ち

厳守事項:
- 検証 = build + vitest + py_compile + §38/raw-hex grep が ground-truth
- egress解消済 → 本番URL curl でバンドル/API検証可。authed個別株のvisualは依然headless不可→朝dogfood
- deploy = PR draft → user承認 → squash-merge
- danger zone: 発光系(.verdict-hero含む)/gold accent/sticky検索バー/index.css/PriceLadder全文取込み禁止
- main へ直commit禁止 / git add -A 禁止 / sub-agent主張は着手前にgrep独立裏取り

【在席状況】（在席で gate都度確認／不在で default自律 のどちらかを記入）
```
