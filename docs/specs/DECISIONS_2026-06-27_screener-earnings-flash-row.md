# DECISIONS — スクリーナー結果行「決算速報ハイブリッド」(2026-06-27)

planner SPEC 起票の入力。本ファイルは**確定済みの決定事項**。planner はこれを正本に SPEC.md へ展開する。
正本モックアップ: [`docs/specs/mockups/screener-result-table-v10.html`](mockups/screener-result-table-v10.html)（詳細/簡素トグル付き・file:// で確認可）。

## 0. 目的 / 北極星
- 「決算合格」等のスクリーン結果行が「RS しか出ない／薄い」問題を解消し、**じっちゃま決算速報の指標**を結果行に出す。
- 原則1(2秒)/原則4(人力の代替=決算速報の確認を肩代わり)。Pane3 EarningsFlashSummary の「スキャン用コンパクト版」を結果行に置き、行クリック→Pane3 で深掘り。

## 1. KB 原典グラウンディング (investment-knowledge-base 調査済)
- **三拍子**（良い決算の定義）= EPS・売上高・ガイダンス が全て vs コンセンサス beat（`transcripts/structured/lives/2019-10-31` 他）。
- **必ず記載**: 売上高＋**YoY 成長率**（毎回）、EPS（**継続事業ベース=Adjusted**）、来期ガイダンス（コンセンサス比・**事実の転記**＝§38 整合）。
- **重視順**: ① 売上高+YoY → ② ガイダンス → ③ グロスマージン → ④ EPS(Adj) → ⑤ セグメント別。質基準は定性（三拍子✓/一部未達/利益警告）、数値しきい値は原典に明示なし。

## 2. 確定スコープ
- **frontend + backend の本格機能**（earlier の「frontend先行(ROE/CF)」は撤回。ROE/CF は根拠薄として不採用）。
- 実装先は **screener_v2 行（ScreenerRow / 構造化 metrics）**。screener_v2 は default OFF（`?screener_v2=1` dogfood）。**legacy 行は A-1 物理隔離で不触**。screener_v2 の default ON 昇格は別 gate（本 SPEC の対象外）。
- 進め方: 本 SPEC → 計画レビュー(6体合議: §38/ADR/Trust Cliff/新backend/レイアウトの軸 active) → user 承認 → 実装（実装段階のレビューは不要 = user 方針）。

## 3. 確定列構成（earnings_pass・正本=v10 mockup）
**詳細モード（評価7列・default）**: 識別=左／評価=右に集約（視線移動削減）。見出し1回・値整列・欠損「—」。
| 区分 | 列 | 内容 |
|---|---|---|
| 識別(左) | 銘柄 | ロゴ＋ティッカー＋**決算日(直近Q)**＋社名 |
| 過去実績 | 売上 YoY | 前年比%（中立 deltaColor）＋ **vs予想 beat/miss glyph**（surpriseColor 緑↑/赤↓/琥珀− in-line） |
| 過去実績 | EPS YoY | 同上（Adjusted/継続事業ベース） |
| 収益の質 | 粗利率 | グロスマージン%（**中立=§38水準**・sector-gate→「—」） |
| 収益の質 | FCF率 | FCFマージン%（中立・sector-gate→「—」） |
| 将来(§38) | 来期売上 | 来期売上ガイダンスのコンセンサス比%（**絶対中立**・将来ゾーン hairline 分離） |
| 将来(§38) | 来期EPS | 来期EPSガイダンスのコンセンサス比%（絶対中立・**ADR非USDは「—」抑止**） |
| モメンタム | RS | 自己ラベル（数値） |

**簡素モード（初心者向け・トグル切替）**: 銘柄 ｜ 決算の総合（三拍子verdictバッジ ✓/一部未達/利益警告 = SURPRISE_VERDICT_JP）｜ 売上YoY（beat/miss glyph なし）｜ RS。default は**詳細**。将来 localStorage 記憶＋初回簡素誘導は検討項目。

## 4. backend universe payload 追加（nightly scan で populate）
| フィールド | 出所 | 既存? | ADR | §38/sector |
|---|---|---|---|---|
| `rev_yoy_pct`（直近Q売上YoY%） | income-statement 四半期（/earnings-details で算出済ロジック流用） | 新規 | 比率=安全 | 過去実績=色OK |
| `eps_yoy_pct`（直近Q EPS YoY%・Adjusted） | earnings_surprises | 既存だが**ADRガード未適用** | **`_guard_eps_currency_mismatch` を universe へ移植**（非USD |surprise|≥70%→None） | 過去実績 |
| `rev_beat`（売上 vs予想 beat/miss/inline） | earnings_surprises/estimates | 新規 | 安全 | surpriseColor |
| `eps_beat`（EPS vs予想 beat/miss/inline） | earnings_surprises | 新規 | ADR は EPS 抑止時 null | surpriseColor |
| `gross_margin_pct`（粗利率） | grossProfitRatio×100（EarningsFlash Phase2 ロジック流用） | 新規(universe) | 比率=安全 | **sector-gate**(銀行/REIT/保険/証券/公益→null) |
| `fcf_margin_pct`（FCF率） | 既存 universe フィールド | **既存** | 既存ADRガード | sector-gate |
| `guidance_rev_surprise_pct`（来期売上ガイダンス vs コンセンサス%） | _compute_forward_outlook 流用 | 新規 | 比率=安全 | **絶対中立(§38)** |
| `guidance_eps_surprise_pct`（来期EPSガイダンス vs コンセンサス%） | _compute_forward_outlook | 新規 | **非USD→null 抑止**（forward EPS share-base） | 絶対中立(§38) |
| `tri_verdict`（三拍子: ok/part/bad） | 上記 beat 3点の集約（売上beat&EPS beat&ガイダンス beat→ok 等） | 新規 | — | 静的判定（LLM不使用） |

- **aggregator/ に LLM import 禁止**（pre-commit Check）。tri_verdict 等は数値物理層で静的算出。
- 全フィールドに per-source namespace + 欠損は None（捏造禁止）。

## 5. §38 / 色規律（EarningsFlashSummary surpriseColor SSOT と一貫）
- **過去確定実績の beat/miss**（売上/EPS vs予想）= surpriseColor（緑/赤/琥珀）OK（§38射程外・Bloomberg/Refinitiv 同様）。**ただし数値(前年比)自体は中立**（deltaColor）。glyph のみ色。
- **来期/ガイダンス = 絶対中立**（§38 断定的予測回避）。将来ゾーンを hairline で視覚分離。
- **粗利率/FCF率 = 水準=中立**（方向でないため色NG）。
- **リスト文脈の免責バンド必須**（合格リストに緑↑が並ぶ「全部買い」誤認防止）: 「↑予想超・↓予想未達・−予想どおり（過去実績）。来期は中立。買い推奨ではありません」（ui-designer must-fix）。
- beat/miss glyph = **`var(--text-caption)` 12px**（10px は最小トークン違反・WCAG 不足 = glyph診断で確定）＋ **`aria-label`**（色弱/SR 対応）。in-line 琥珀はコントラスト境界 → SPEC で「中立muted寄り調整 or aria必須」を検討。

## 6. ADR 規律（[[feedback_foreign_currency_adr_guards]]）
- **EPS 由来（現EPS YoY・来期EPSガイダンス）は非USD reporter で「—」抑止**（GAAP-ordinary×non-GAAP-ADS の share-base 混在で偽値 BABA -91%/+489%）。
- **売上系・粗利率・FCF・売上ガイダンスは比率/集計値で通貨非依存→算出可**（BABA も出る）。
- universe payload に reportedCurrency 由来の抑止フラグを通す（frontend 再計算禁止・backend 値を読む）。

## 7. frontend 実装方針（designing-workspace-ui 規律）
- レイアウト = **CSS Grid + sticky 見出し行**（真の table でなく div/grid・testid/checkbox/Chip/ロゴ温存）。preset 切替で列が動的（grid-template-columns を data-preset/CSS var で）。
- token厳守・raw hex/shadow/!important 禁止・発光系不触。§38中立色は既存 token。
- 欠損「—」整列（見出しがあるので skip-null でなく整列が誠実・読みやすい）。
- **詳細/簡素トグル**（簡素は relief valve）。**狭幅(~360px Pane2) は簡素 fallback or 横スクロール**（@container 等）。
- skeleton も grid 化（CLS ゼロ）。

## 8. per-preset 列マップ + invariant
- **earnings_pass / hot_sector** = 決算速報列（上記）。**new_high_break** = 出来高/RS 等（技術系・定義準拠）。**sector_leader** = RS/CF創出力/機関 等（#38 後定義: sector_leader/ocf_margin_pct/roe/rs/inst）。各 preset 列は当該 `PRESET_DISPLAY_CONDS` ⊆（隠れ表示禁止）。
- **invariant test 拡張**: 「行表示指標(PRESET_ROW_*) ⊆ DISPLAY_CONDS」を機械強制（既存 9 + 行表示 invariant を維持/拡張）。件数 count==list 不変（PRESET_PREDICATES 不触）。

## 9. 同梱の別件 quick fix
- **アドバンスド条件トグルスイッチの切替アニメーション付与**（非アドバンスドトグルには既にある transition を、アドバンスド側にも）。CSS transition の局所修正。

## 10. 検証規律（実装時・ground truth）
- `npm run build` / `npm run test:unit`（invariant 緑維持・行表示 invariant 追加）/ `design-system-check`。
- 実データ = **file://dist + Premium 認証注入 + /api PROD proxy snap**（`snap-screener-b2-local.mjs` パターン）で各 preset 行を計測（null率・ADR銘柄で偽EPS非表示・「—」整列・glyph可読）。
- mockup-fidelity: v10 mockup を正本に drift 監査。

## 11. 既収集の sub-agent verdict（再利用）
- 3体（ui/frontend/qa）: 行表示 invariant・pivot除外・sane bound・skip→「—」整列。
- ui-designer ×2: sticky header grid 推奨・§38免責バンド・simple/full・狭幅fallback・EarningsFlash一貫性。
- glyph 診断: 10px→12px(token)・aria・surpriseColor/deltaColor分離維持。

## 12. planner で詰める残論点
1. **列の並び順**: KB厳密順(売上→ガイダンス→粗利率→EPS) vs grouped(過去まとめ＋将来右・現mockup)。§38将来ゾーン分離と両立する順を確定。
2. backend 各フィールドの算出式・cache key・nightly scan 結線の詳細、partial_failure 時の挙動。
3. tri_verdict の厳密判定ロジック（beat 3点の AND/閾値・データ欠損時）。
4. in-line(−) の色（琥珀維持 vs 中立muted）最終決定。
5. 他 preset（sector_leader/new_high_break/hot_sector）の列セット確定値。
6. Sprint 分割（backend→frontend or 並行）・DoD・blast radius・rollback。
