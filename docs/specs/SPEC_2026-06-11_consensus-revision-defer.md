# DEFER-SPEC 2026-06-11: 来期コンセンサスの「前回比 (上方/下方修正)」併記

> **状態**: DEFER (autopilot で無監視 ship せず、user 判断 + 6体合議 gate 待ち)。
> **起点**: user 要望 2026-06-11「コンセンサス予想について、もし前回からの変更 (上方修正・下方修正) があれば併記頂きたい」(決算ハイライトの来期行に対して)。
> **関連 memory**: [[project_guidance_history_foundation]] (§38 境界の核心) / [[feedback_transcript_guidance_38_guards]] / [[feedback_citation_required]]。

## 1. 要望の解釈

決算ハイライト「来期」行は現状「コンセンサス EPS $X・売上 $Y (前年比 +N%)」を表示。これに **「アナリストのコンセンサス予想自体が前回から上方/下方修正されたか」** を併記したい (例:「コンセンサス EPS $1.89 ↑ 30日前比 +2.1%」)。

## 2. なぜ即実装しないか (2 つの blocker)

### blocker A — データが未成熟 (構造的、時間が解決)
- 「コンセンサスの前回比」 には **過去時点のコンセンサス snapshot** が必要。`consensus_snapshots` テーブルは **2026-06-06 蓄積開始** ([[project_guidance_history_foundation]])。
- 大半の銘柄で「前回と今回」 の 2 点が揃うのは蓄積から数週間後。今実装しても **当面ほぼ全銘柄で非表示** (available:false) になり、 価値が出るのは時間経過後。
- FMP は現在値のみ (point-in-time API なし) なので過去遡及は不可。蓄積を待つしかない。

### blocker B — §38 境界の再確認が必要 (6体合議 gate)
- **company guidance の前回比** (= 会社が自ら数値を変えた) は事実として §38 OK (既存 `GUIDANCE_REVISION_JP`、pre-commit Check 7 ホワイトリスト)。
- **consensus の前回比** は「アナリスト集団が予想を変えた」 という**第三者の行動の事実**。会社ガイダンス比とは別物。
  - ✅ 安全側: 「アナリスト予想 前回比 ↑」 を**中立の事実**として淡々と提示 (我々の予測でない、断定でない)。consensus-now vs consensus-then は同一指標同士の比較で、 v200 で問題化した「会社ガイダンス vs 現コンセンサス」 の**時点ミックス誤読は起きない** (より安全)。
  - ⚠️ 注意: 「上方修正」 の語 + 目立つ表示が「強気momentum → 買い」 を暗示しないか。語彙は会社ガイダンス用 `GUIDANCE_REVISION_JP` を**流用せず**、consensus 専用の中立 dict (例「アナリスト予想 ↑ 前回比」) を別途用意。色なし ↑↓ 維持。
- → **6体合議 (金融 + マーケ + Anthropic) で §38 framing を verdict してから実装**。

## 3. 実装の骨子 (データ成熟 + 6体合議 通過後)

- **backend**: `consensus_snapshots` から対象銘柄の (a) 最新 consensus (b) N 日前 (例 30 日 or 前四半期発表時) の consensus を取得し、 Python で `delta_pct` + `direction (raised/maintained/lowered)` を計算。tolerance は guidance_history の `classify_guidance_revision` (相対±2% AND 絶対フロア) を流用。forward.next_q に `consensus_revision` として同梱。
- **frontend**: 来期行に中立バッジ/サフィックス「アナリスト予想 ↑ 前回比 +N.N%」。available:false / stale は非表示 (捏造しない)。専用中立 dict (修正語を会社ガイダンス用と分離)。
- **§38 ガード**: 静的 dict のみ、判断語なし、色なし、出典 = consensus_snapshots の as_of 日付を明示。

## 4. user 判断事項 (起床/帰宅後)

1. **方針**: consensus 前回比を「アナリスト予想の客観的変化」 として中立提示する方向で良いか (推奨)。それとも company guidance 前回比 (既に guidance_pit バッジで実装済) で十分か。
2. **比較基準**: 「30 日前比」 か「前四半期発表時比」 か (後者は決算イベント単位で意味が明快だが snapshot 密度に依存)。
3. **着手タイミング**: consensus_snapshots が 1-2 ヶ月蓄積して複数銘柄で 2 点揃ってから (それまでは作っても非表示)。

## 5. 推奨

**蓄積を待ちつつ、次に 6体合議を回すタイミング (例: 部門別/v2 デザインの本採用判断時) に §38 framing を同時 verdict** → データ成熟後に backend+frontend を 1-2 sprint で実装。今は本 DEFER-SPEC を残し、 consensus_snapshots の蓄積を継続するのみ。
