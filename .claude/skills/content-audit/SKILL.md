---
name: content-audit
description: |
  BeatScanner の分析出力 (AI要約 / 市場の声 / 5条件 / ガイダンス / AI図解 / 詳細レポート 等) の
  content・data バグ (Trust Cliff / 事実誤り / hallucination) を backend endpoint を curl して
  系統的に検出する DETECTIVE スキル。
  「コンテンツを精査して」「分析の数字がおかしい」「出力の品質監査」「Trust Cliff になる表示がないか」
  「ペイウォール内の content も確認して」「リリース前の content チェック」と依頼された際に使用する。
  hallucination-guard (PREVENTIVE: prompt/sanitize) の双子。 known-pitfall を記録し再発を防ぐ SSOT。
---

# content-audit スキル

## 目的

分析出力の content・data バグを **backend endpoint を curl して系統的に検出** する。
hallucination-guard が「LLM に誤りを出させない」 (PREVENTIVE) のに対し、 本 skill は
「出てしまった誤りを系統的に見つける」 (DETECTIVE)。 finance リテラシーの高い user
(じっちゃまプロトコル前提) は数字の誤りに敏感 → 1 件で Trust Cliff 直撃。

## ⚠️ ペイウォール (Pro/Premium) は frontend gate — backend は curl で監査できる

Pro/Premium の lock (ProTeaser / PremiumLock / blur) は **frontend の表示ゲート**。
backend endpoint (`/api/visualize` `/api/summary/detail/stream` `/api/conference` `/api/technical` 等)
は **login 不要で curl 取得可能**。 → ペイウォール内の content も未ログイン content と同じ方法で監査できる。
「未ログインで見える範囲しか確認できない」 は誤解。

## いつ呼び出すか

- リリース前の content 検査 (release-check の content 軸)
- 新しい data source / 計算ロジック / LLM endpoint 追加後
- user dogfood で「数字がおかしい」「この表示は誤りでは」 報告が来た時
- 既知 pitfall の回帰確認 (下記レジストリの ticker で再 curl)

## 監査 method (3 軸)

### 1. test ticker (edge case を必ず含める)
| 区分 | ticker 例 | 狙う pitfall |
|---|---|---|
| LP samples | NVDA / AAPL / MSFT 等 | dogfood 頻度最高、 第一印象 |
| 伝統的銀行 | **JPM / WFC / C** | 売上の集計基準ミスマッチ ([[feedback_revenue_basis_mismatch]]) |
| 投資銀行/地銀 | GS / BAC | 上記の control (正常なはず) |
| 小型株 (near-zero EPS) | INTC 等 | EPS surprise % が暴れる (_verdict が cap 済か) |
| ETF / 直近 IPO / SPAC | 任意 | データ欠落 → 5 条件適用外の graceful 表示 |
| 高成長 | 任意 | 数値捏造 (BAD-3) / 最上級 (BAD-6) |

### 2. endpoint × content フィールド (curl 一覧)
- `/api/guidance/{t}` `/api/guidance/{t}/basic`: revenue/eps の verdict・surprise_pct・date・fiscal_period
- `/api/summary/brief/stream` `/api/summary/detail/stream`: POST {analysis, guidance} → 要約本文
- `/api/insights/{t}`: 市場の声 (個人名ガード・ticker 完全一致)
- `/api/visualize/{t}` (Pro): **LLM narration (steps) だけでなく `trends[].data[].beatMargin` も確認**
- `/api/conference/{t}` (Pro): CC コール分析
- `/api/analyst/{t}`: アナリスト consensus

### 3. known-pitfall checklist (発見のたび追記、 これが「過去の修正を記録し再発を防ぐ」 価値)
| 症状 | 検出方法 | 修正 SSOT |
|---|---|---|
| 売上サプライズ +45〜87% (一部銀行) | guidance/summary/visualize trends の rev surprise が非現実的 | [[feedback_revenue_basis_mismatch]] (v144-8/9、 \|surprise\|>40 で保留) |
| 年次 EPS と四半期サプライズ混在 | 要約②で「EPS $20 (予想$5 を +8% Beat)」 等の桁不一致 | 要約 prompt が「四半期ベース」 明示 (v144-8 で改善) |
| 次期ガイダンスに遠い未来期 (例 2028年) | 要約③に実 fiscal_period と乖離した期 | guidance guard + 注記で context 改善 (v144-8) |
| 個人名 (じっちゃま/氏/アナリスト主語) | insights/要約に [[feedback_diagram_quality_guard]] BAD-1〜6 | hallucination-guard (sanitize layer) |
| 断定的将来予測 / 最上級 | §38/景表法 (BAD-5/6) | hallucination-guard (NEGATIVE_EXAMPLES + BLOCKLIST) |

## 重要な落とし穴 (横展開時)

1. **frontend 再計算の罠**: backend で verdict/surprise を直しても、 `GuidanceCard.jsx` の ScorecardCell
   等は **フロントで raw actual/estimated から再計算** する → backend guard だけでは表示が変わらない。
   frontend 側も同閾値で mirror 必須 (blocklist と同じ backend/frontend mirror 構造)。
2. **LLM 出力上書きの罠**: `/api/visualize` の trends は最新期の beatMargin を **LLM 出力で上書き** する。
   入力 data を直しても LLM が raw 数値から再生成しうる → **最終 parsed の choke point で post-guard** が確実
   (v144-9 = `parsed["trends"]` 確定後に null 化)。
3. **viz cache key flaw**: `_viz_cache` の key は `ticker::years` (body 非依存、 [[feedback_viz_cache_key_flaw]])。
   診断 curl は本番 cache を汚染しうるので注意。 deploy で in-memory reset される。
4. **検証の二重化**: backend (curl で response 確認) + frontend (snap で表示確認) の両方。 backend が直っても
   frontend 再計算で残る場合がある (落とし穴 1)。

## 修正後の検証 (deploy-verify-discipline 準拠)
- backend: `curl /health | jq -r .commit` で反映確認 → 該当 endpoint を edge ticker で再 curl
- frontend: `?layout=workspace&ticker=JPM` 直 URL + snap で表示確認 ([[feedback_deploy_verify_discipline]])
- in-memory cache (`_viz_cache` 等) は `/api/insights/cache/clear` 系 or deploy reset で warm-path も確認

## 自動化 — 「誤った出力を 100% ゼロ」 の正しい仕組み (3 層)

スキルは agent/user が呼ぶもので本番リクエスト経路には居られない。 「100% ゼロ」 を実現するのは
**本番コードの runtime guard** であり、 スキル自動発動ではない。 正しい三層:

1. **runtime guard (本命・毎リクエスト 100%)**: 発見した pitfall を本番コードに埋め込む
   (例 `_guard_revenue_basis_mismatch` / hallucination-guard sanitize layer)。 既知パターンは
   人も skill も介さず毎リクエストで抑止される。 **これが唯一の「100% ゼロ」 機構**。
2. **自動回帰ネット (機械検出)**: `scripts/content-audit-check.sh` が known-pitfall を本番に対し assert。
   - **release-check の Step 3.3** (deploy 前ゲート): exit 1 ならブロック
   - **nightly cron** (任意、 data drift 監視): railway.toml から定期実行 + 失敗時 alert
   guard が壊れた / data source が drift した瞬間に機械検出 (silent 通過ゼロ)。
3. **発見 (本 skill)**: agent が定期的に LLM 判断で**未知の新パターン**を発掘 → ①②へ落とす。

**正直な限界**: 既知パターンは①で 100% ゼロ。 **未知の新パターンは機械的 100% 保証は不可能**
(未知だから)。 ③で発見するたび①に落とし網が狭まる。 「修正」 は判断を要するコード変更なので
全自動化しない (検出は完全機械化、 修正は agent/human)。

**pitfall 追加時の同期**: 新 pitfall 発見 → ① runtime guard 追加 → ② `content-audit-check.sh` に
assert 1 件追加 → 本 skill の known-pitfall レジストリに 1 行追加。 3 点セットで同期。

## 関連 skill / memory
- `hallucination-guard` — PREVENTIVE 双子 (prompt/sanitize 4 重防御)
- `release-check` — 本 skill を content 軸として内包推奨
- `multi-review` — 大規模 content 設計変更時の合議
- memory: [[feedback_revenue_basis_mismatch]] / [[feedback_diagram_quality_guard]] /
  [[feedback_deploy_verify_discipline]] / [[feedback_viz_cache_key_flaw]]
