# SPEC 2026-05-22: Pane 3 Phase 3 #3 Phase B — 会社概要 LLM 和文化

> **Status**: **v2** 起票 (6 体合議 verdict must-fix 12 件反映、 autonomous mode)
> **想定 sprint 数**: 4 (B.0 SPEC v2 起票 / B.1 実装 / B.2 6 体合議 / B.3 dogfood)
> **工数**: 2.2 人日 (B.0 = 0.2 / B.1 = 0.8 / B.2 = 0.6 / B.3 = 0.6)
> **6 体合議**: **必須** (3 軸全 active、 §7 参照)、 v1 で **実施済 verdict** を本 v2 に inject 済
> **autonomous_implementation**: false (user 起床後に Generator 起動判断)
> **v2 改訂日**: 2026-05-22 (handover v94 §記録、 6 体合議 must-fix 12 件反映)

---

## 1. Context

### user prompt 原文
> 「handover v92 §7 / v93 §2 で記録済の Phase 3 #3 Phase B (会社概要 LLM 和文化) を SPEC.md 起票してほしい。」
> (v2 追記) 「6 体合議 verdict の must-fix 12-14 件を SPEC 本文に inject してほしい。」

### なぜ今やるか (根拠)

1. **継続要望 (4 回目 dogfood / 5 回目 dogfood で連続)**: handover v92 §5-b、 v93 §2 で user 「**和文にしてほしい**」 が 2 セッション連続で計上、 4 回目 dogfood 5 件の唯一の LLM 案件
2. **Phase 2.8 deploy 完了済**: handover v93 で visual hotfix 5 件着地、 4 件は visual fix で完走、 残った 1 件 (5-b) が本 SPEC で対応する LLM 和文化
3. **Trust Cliff (重大)**: LP「AI による日本語詳細分析」 と実装「英文 FMP description 直表示」 が乖離。 user が会社概要を開いた時の最初の体験が「**英語の壁**」 で読み手の負担を増やしており、 5 原則 §1 (読み手に負担をかけない) に直接違反
4. **既存資産活用**: Phase 4 (DiagramCard) で確立した 4 重防御 + few-shot cache + citation 強制 pattern を再利用、 ゼロから設計しなくて済む
5. **(v2) 6 体合議 verdict 取得済**: handover v94 §記録、 must-fix 12 件 + polish 2 件を SPEC 本文に inject、 Sprint B.1 実装前に SPEC 確定

### 期待される成果 (5 原則のどれに貢献するか)

- **§1 (読み手に負担をかけない、 2 秒理解)**: 英文 → 和文要約で「英語を読む」 認知負担を撤廃 (最強の貢献)
- **§3 (シンプルかつリッチ)**: 機械翻訳ではなく、 要点 3 行 + 主力事業 + 収益モデルの「**リッチで読みやすい和文**」
- **§5 (図解で認知コストを下げろ)**: 文字でなく構造化 (主力事業 / 収益モデル / 競合 / 顧客) でテキストの認知負担を下げる

### ブランド世界観 (Aman/Ritz-Carlton 級) との照合

ホテルロビーで「**英語のメニューだけ渡される**」体験が現状。 和文要約 + citation chip により「**日本語で完璧に説明してくれるコンシェルジュ**」 に昇格。 brand aspiration 「驚き・洗練さ」 に直接貢献。

### 必読 memory (本 SPEC の前提)

- `feedback_brand_aspiration.md` (修正禁止 anchor、 §-1 不変)
- `feedback_citation_required.md` (出典 URL 必須、 confidence=low 15% で破棄再生成)
- `feedback_prompt_cache_pattern.md` (system + few-shot を ephemeral cache、 cache hit 80%+ で月 $4.5 維持)
- `feedback_diagram_quality_guard.md` (BAD 1-6 pattern + Trust Cliff DoD)
- `feedback_data_completeness_guard.md` (sources schema + per-source data namespace)
- `feedback_llm_calc_separation.md` (aggregator/ は LLM SDK import 禁止、 visualizer/ に分離)
- `feedback_pre_release_priority.md` (BeatScanner は pre-release、 マーケ施策より content 完成優先)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

### 直接貢献する感情語彙

- **洗練さ (sophistication)**: 機械翻訳の不自然な日本語 (「アップル社は設計し、 製造し、 マーケティングします」) ではなく、 LLM 要約で「Apple Inc. は iPhone・Mac・iPad を中心に、 ハードウェア + サービス (App Store / iCloud) の併用収益モデルで成長」 のような自然な日本語に
- **驚き (surprise)**: 英語に身構えていた user が和文 + 構造化された情報 (主力事業 + 顧客 + 収益モデル + 競合) を見て「**わ、ここまで日本語で説明されるのか**」 と感じる
- **楽しい (joy)**: 英文を頑張って読まなくて済む → ストレスフリーで毎日開きたくなる

### 5 原則 §3 「シンプルかつリッチ」 への適合

LLM 出力 schema は **構造化 4 セクション** (要点 / 主力事業 / 収益モデル / 顧客・競合) で固定。 ただの自由文翻訳ではなく、 中学生でも 2 秒で「何の会社か」 がわかるリッチな構造に。

### 修正禁止 anchor の保護

`feedback_brand_aspiration.md` §-1 (Aman/Ritz-Carlton 級) は破壊しない。 むしろ和文化で brand aspiration への到達度が上がる。

---

## 3. Trust Cliff チェックリスト

### LP 訴求文言との整合 (3 項目以上)

> **(v2 must-fix #12 反映)** LP 訴求文言の事前 audit 必須。 下記表の「LP 訴求」 列の実文言は **Sprint B.0 で `grep -rn "AI による\|AI が日本語\|日本語詳細" frontend/src/components/LandingPage.jsx` で実機 audit して確定** すること。 派生表現 (例: 「AI が日本語で解説」「日本語要約」 等) がある場合、 本 SPEC §3 と LandingPage.jsx の文言を **どちらかに統一**。 audit 結果は本 §3 表に追記。

| LP 訴求 (Sprint B.0 で grep 確定) | 実装 (現状) | 実装 (本 SPEC 後) | 整合性 |
|---|---|---|---|
| 「AI による日本語詳細分析」 (仮、 B.0 で確定) | 会社概要は **英文 FMP description 生表示** | LLM Haiku 和文要約 + 構造化 | ✅ 完全整合 (audit 後確定) |
| 「3 銘柄/日まで無料」 | demo endpoint 経由で動作 | 同じく demo endpoint 経由 (本 SPEC は新 endpoint だが、 demo 対応必要) | ✅ 保持 |
| 「登録不要」 | 未ログインで判定タブ閲覧可 | 同じく未ログインで profile-summary 閲覧可 (rate limit のみ) | ✅ 保持 |
| 「投資判断は IR 公式資料で再確認推奨」 | 全 LLM 出力に表記済 | citation chip + section footnote 二重表記 (v2 must-fix #11) | ✅ 強化 |

### 矛盾検査 (Trust Cliff 防止)

- [ ] 「無料で和文要約まで出すのか?」 → demo endpoint で 3 req/IP/day の rate limit 内なら OK
- [ ] 「Pro tier の機能じゃないのか?」 → Phase 1 では **未ログイン含む全 user に開放**、 Pro tier gate なし (handover v93 で Phase B は free tier 内と合意)
- [ ] 「LLM 和文要約は遅延あり?」 → 初回 5-10 秒、 cache hit 後は 1 秒以内 (UI 側 loading state で説明)

### 文末固定 citation (必須) — **(v2 must-fix #1 反映)**

> **v1 文言 (廃止)**: 「※ FMP company profile (英文) を Claude Haiku で要約。 投資判断は IR 公式資料で再確認推奨。」
>
> **v2 確定文言**: 「**※ FMP 提供の企業概要 (SEC 提出書類より作成) を AI が日本語要約。 一次資料は SEC EDGAR 10-K を参照推奨。**」

- 「Claude Haiku」 等の model 名は brand context で意味なく Trust Cliff risk (user は「Haiku って何?」 と混乱)
- 「AI が日本語要約」 で十分、 LP 訴求 (「AI による日本語詳細分析」) と文言整合
- SEC EDGAR への誘導で「一次資料優先」 stance を明示、 金商法 §38 防御を強化

ProfileCard.jsx 末尾に **必ず 12px / `var(--text-muted)`** で表示。 削除禁止 (Trust Cliff anchor)。

### citation chip 仕様 — **(v2 must-fix #10 反映)**

- plain text でなく `components/ui/Chip.jsx` の `variant="meta"` + `Sparkles` icon 16px 左寄せ
- 「LLM 出力サイン」 として視覚化、 chip 内テキストは「AI 要約 (SEC 由来)」 (10-12 字)
- `§C-citation` SSOT として `feedback_citation_required.md` に追記 (Sprint B.0 で memory 更新)

---

## 3.5. v2 must-fix 反映ログ (12 件 inject map)

> **(v2 新規追加セクション)** handover v94 §記録の 6 体合議 must-fix list を SPEC 本文のどこに inject したか map 化。 Generator は本 §3.5 を見て「どの章を読めば must-fix が反映されているか」 を一覧把握できる。

| # | must-fix 項目 | 提案 reviewer | inject 先 | 反映状態 |
|---|---|---|---|---|
| 1 | citation 文言再設計 ("Claude Haiku" → "AI が日本語要約 + SEC EDGAR") | UI Designer + Marketer + Finance | §3 文末固定 citation | ✅ 反映 |
| 2 | sanitize regex 拡張 (BAD-5/6 grey zone 7-10 表現追加) | Finance | §4 Layer 3 BLOCKLIST_REGEX + §5 Sprint B.0 | ✅ 反映 |
| 3 | loading state shimmer skeleton (spinner → 4 セクション 2 行 shimmer + caption) | UI Designer | §5 Sprint B.1 visual spec | ✅ 反映 |
| 4 | prefetch 設計明示 (lazy fetch + useRef Map 10 分、 prefetchAll 不含) | Frontend Architect | §5 Sprint B.1 cache 設計 | ✅ 反映 |
| 5 | AbortController + 3 state UI 仕様明示 | Frontend Architect + UI Designer | §5 Sprint B.1 Done Definition + §8 Risk 3 | ✅ 反映 |
| 6 | edge case 4 件 + roll-back 閾値定量化 (20字/5K字/和文混在/多言語 + 即 revert 閾値) | QA Dogfooder | §5 Sprint B.3 dogfood matrix + §8 Roll-back | ✅ 反映 |
| 7 | cache breakpoint 配置 + Sentry metric (system block {ticker} 禁止 + 2 段 breakpoint + daily metric) | Anthropic Engineer | §5 Sprint B.1 LLM call 仕様 + §8 Risk 2 | ✅ 反映 |
| 8 | 製品名 self-check 厳格化 (substring → 完全 token match + Tool schema 列挙) | Finance | §4 Layer 4 citation self-check + §5 Sprint B.1 schema | ✅ 反映 |
| 9 | 4 セクション visual hierarchy 確定 (h4 + body or dl 風 or chip rail、 Sprint B.1 着手前に固定) | UI Designer | §5 Sprint B.0 + §5 Sprint B.1 visual spec | ✅ 反映 |
| 10 | citation chip visual 定義 (Chip variant="meta" + Sparkles icon + §C-citation SSOT) | UI Designer | §3 citation chip 仕様 + §5 Sprint B.0 memory 更新 | ✅ 反映 |
| 11 | disclaimer 二重化 (citation chip + 4 セクション末尾 inline footnote) | Marketer | §3 LP 整合表 + §5 Sprint B.1 visual spec | ✅ 反映 |
| 12 | LP 訴求文言の事前 audit (grep 実機確認、 派生表現あれば統一) | Marketer | §3 audit 注記 + §5 Sprint B.0 | ✅ 反映 |

### polish 追加 (採用候補、 v2 では Sprint B.1 オプションとして記載)

| # | polish 項目 | 提案 reviewer | 採否 | inject 先 |
|---|---|---|---|---|
| P1 | 再生成ボタン (confidence=low 時 muted な「もう一度要約」 link) | UI Designer | **採用 (B.1 必須)** | §5 Sprint B.1 visual spec |
| P2 | cost spike Sentry alert (24h cache_read_ratio < 60% or 日次 cost > $1 で発火) | Anthropic Engineer | **採用 (B.1 オプション、 B.3 で daily metric 整備後)** | §5 Sprint B.3 + §8 Risk 2 |

---

## 4. Hallucination Guard 適合 (4 重防御)

### LLM 呼び出しを含むか
**YES** (Claude Haiku で英文 → 和文要約)

### 4 層防御の適用 (全層必須)

#### Layer 1: pre-commit hook
- 既存 `scripts/pre-commit-hook.sh` の Check 1 (prompt.py の LLM 数値計算指示 BLOCK) は本 SPEC の `profile_summary.py` には適用されない (profile_summary は数値非生成)
- 既存 Check 3 (`backend/app/aggregator/*.py` への LLM SDK import BLOCK) は本 SPEC で違反しない (新 file は `visualizer/profile_summary.py` 配下)
- **追加 Check 提案**: `visualizer/profile_summary.py` で `precomputed_metrics` を引用しない場合 OK (数値非生成のため)

#### Layer 2: system block NEGATIVE_EXAMPLES (BAD 1-6 全部適用)
- **BAD-1 英語混在**: 「Operating Income」 等の生英語を削除、 括弧併記 OK (例: 「主力事業 (iPhone)」)
- **BAD-2 detail 抽象**: 「業績好調」 等の形容詞のみ NG、 具体的事業内容を必須
- **BAD-3 数値捏造**: FMP description に無い数値 (「世界シェア 80%」 等) は **必ず削除**、 数値を出すなら FMP description に明記されているもののみ
- **BAD-4 step 不足**: 構造化 4 セクション (要点 / 主力事業 / 収益モデル / 顧客・競合) で 4 件以上を必須
- **BAD-5 断定的将来予測 (金商法 §38)**: 「今後成長する」「確実に拡大」「必ず伸びる」 → BLOCKLIST_REGEX で sentence 単位削除
- **BAD-6 最上級表現 (景表法 §5)**: 「業界最大手」「世界 No.1」「絶対的」「唯一無二」「最も優れた」 → BLOCKLIST_REGEX で sentence 単位削除

`backend/app/visualizer/prompt_negatives.py` を **流用** (新規追加なし、 既存 BAD 1-6 を import するだけ)。

#### Layer 3: frontend BLOCKLIST_REGEX (sentence 単位 sanitize) — **(v2 must-fix #2 反映)**

> **v2 追加**: BAD-5/6 grey zone 7-10 表現を `prompt_negatives.py` (backend) + `blocklist.js` (frontend) 1:1 mirror で追加。

##### 追加 grey zone pattern (BAD-6 系、 景表法 §5 への防御強化)

| 追加 pattern | カテゴリ | 削除根拠 |
|---|---|---|
| `圧倒的シェア\|圧倒的優位\|圧倒的な` | 最上級 | 「圧倒的」 は定量根拠なき優良誤認 |
| `他の追随を許さない\|追随を許さない` | 最上級 | 競合排除の断定 |
| `群を抜く\|群を抜いて` | 最上級 | 相対比較の根拠なき強調 |
| `leading\|dominant\|first-mover\|market leader` | 英語混在 + 最上級 | 英語術語を借りた優良誤認 |
| `市場リーダー\|業界リーダー` | 最上級 | 「リーダー」 の主観性 |

##### 追加 grey zone pattern (BAD-5 系、 金商法 §38 への防御強化)

| 追加 pattern | カテゴリ | 削除根拠 |
|---|---|---|
| `成長見込み\|成長が見込まれる\|成長が期待` | 断定的将来予測 | 「見込み / 期待」 は確度示唆 |
| `拡大基調\|拡大が続く\|拡大傾向` | 断定的将来予測 | 業績推移の楽観的断定 |
| `追い風\|追い風となる\|追い風が吹く` | 断定的将来予測 | 比喩を借りた優位性断定 |
| `中長期的に有望\|中長期的な成長\|長期的に有望` | 断定的将来予測 | 時間軸での断定 |

##### 1:1 mirror 検証 (Sprint B.1 Done Definition)

- backend `prompt_negatives.py` に 7-10 表現追加
- frontend `blocklist.js` の `BLOCKLIST_REGEX` に同じ 7-10 表現追加
- `node -e "..." ` で sanitize 動作確認 (§5 Sprint B.3 verify command 参照)
- ProfileCard.jsx で API response の `summary_jp` を render する直前に `sanitizeText(summary_jp)` を呼ぶ

#### Layer 4: sources schema + per-source data namespace — **(v2 must-fix #8 反映)**

- `/api/profile-summary/{ticker}` response は以下 envelope を返す:
  ```json
  {
    "ticker": "AAPL",
    "summary_jp": "...",
    "sections": {
      "main_business": "...",
      "revenue_model": "...",
      "customers": "..."
    },
    "product_names": ["iPhone", "Mac", "iPad", "Apple Watch", "AirPods", "App Store", "iCloud"],
    "sources": {"fmp_profile": "ok" | "empty" | "timeout" | "error"},
    "data": {"fmp_profile": {"description_en": "...", "fetched_at": "..."}},
    "signal_quality": "high" | "medium" | "low",
    "citation": "FMP 提供の企業概要 (SEC 提出書類より作成) を AI が日本語要約",
    "generated_at": "2026-05-22T...",
    "cache_read_input_tokens": 1234,
    "cache_creation_input_tokens": 0
  }
  ```
- frontend は `sources.fmp_profile === 'ok' && data.fmp_profile` の compound check で表示判定
- 出典欠落時は signal_quality 降格 + 数値削除 + 「データ取得失敗」 fallback

#### citation 必須 + 製品名 self-check 厳格化 — **(v2 must-fix #8 反映)**

> **v1 (廃止)**: 「`summary_jp` 内に固有名詞を含む場合、 FMP description に該当文字列が含まれるか self-check」 → substring match で「Apple Watch」 が「Apple」 で偽 PASS 出る issue
>
> **v2 確定**: **完全 token match + 製品名 list を Tool schema で列挙**

##### 厳格化仕様

1. **Tool schema で `product_names` 配列を明示列挙**: LLM に「FMP description から抽出した製品名 list」 を return させる (上記 envelope `product_names` field)
2. **self-check は完全 token match**: `summary_jp` 内の固有名詞 candidate (capitalize 単語 + アルファベット 3+ 字) を抽出 → `product_names` 配列との **完全 token 一致** (substring match 禁止)
3. **token 一致しない固有名詞は confidence=low に降格**: 該当 sentence を low_confidence_claims に追加
4. **confidence=low (FMP description に該当無し) が claims 全体の 15% 超 → 破棄して再生成 (max 2 周)**

##### 例 (Sprint B.1 unit test 必須)

```python
# OK: 完全 token match
summary_jp = "Apple Watch は健康管理機能を提供"
product_names = ["Apple Watch", "iPhone"]
# → "Apple Watch" が完全 token match で PASS

# NG: substring match では偽 PASS だった
summary_jp = "Apple は世界最大手"  # "Apple" が "Apple Watch" の substring で v1 では PASS
product_names = ["Apple Watch", "iPhone"]
# → v2 では "Apple" 単独 token は product_names に無いため confidence=low に降格
```

---

## 5. スプリント分割 (4 sprint) — **(v2 で B.0 追加、 計 4 sprint / 2.2 人日)**

### Sprint B.0: SPEC v2 起票 + 事前 audit (0.2 人日) — **(v2 新規追加)**

#### 目的

- 6 体合議 verdict の must-fix 12 件を SPEC v2 本文に inject 完了 (本 commit)
- Sprint B.1 着手前の事前 audit 3 項目を完了 (LP 文言 audit / 4 セクション visual mock / citation chip SSOT 整備)

#### 触るファイル

| ファイル | 操作 | 役割 |
|---|---|---|
| `docs/specs/SPEC_2026-05-22_pane3-phase3-llm-profile-summary.md` | **v1 → v2 update** | must-fix 12 件 inject + Sprint B.0 追加 |
| `memory/feedback_citation_required.md` | 追記 | `§C-citation` 章を追加、 chip variant + icon + 文言 SSOT 化 (must-fix #10) |
| (audit only) `frontend/src/components/LandingPage.jsx` | **grep のみ、 編集禁止** | LP 訴求文言 audit (must-fix #12) |

#### 事前 audit 3 項目 (Sprint B.1 着手前に完了)

##### 1. LP 訴求文言 audit (must-fix #12)

```bash
grep -rn "AI による\|AI が日本語\|日本語詳細\|日本語で解説\|日本語要約\|AI 要約" \
  /Users/yamadadaiki/Projects/beatscanner/frontend/src/components/LandingPage.jsx \
  /Users/yamadadaiki/Projects/beatscanner/frontend/src/features/landing/
```

- 該当文言の **実機リスト** を本 §3 表に追記
- 派生表現がある場合 (例: 「AI が日本語で解説」「日本語の要約」 等) は SPEC §3 文言と LandingPage.jsx の **どちらかに統一**
- 統一方針: LP 側を SSOT として SPEC 側を合わせる (LP の文言変更は Trust Cliff 高 risk のため避ける)

##### 2. 4 セクション visual mock 1 枚作成 (must-fix #9)

- 「主力事業 / 収益モデル / 顧客・競合」 (3 セクション + 全体要約 1 = 4) の hierarchy を以下 3 案から決定:
  - **案 A**: h4 (label) + body text (value) の二段、 縦 stack
  - **案 B**: `<dl>` 風 label/value 二段、 dt は muted small、 dd は base text
  - **案 C**: chip 4 個 rail (横 scroll、 主力事業 chip click で expand)
- **token 制約**: `--text-h4` / `--space-3` / `--space-4` のみ使用、 hex 直書き禁止
- 擬似 mock は `docs/specs/mocks/profile-summary-section-v2.md` に markdown で記載 (画像不要、 構造図でOK)
- **推奨**: 案 A (シンプルかつリッチ + brand aspiration §-1 「ホテルのロビー案内図」 比喩に最適合)、 ただし Sprint B.0 で確定

##### 3. citation chip SSOT 整備 (must-fix #10)

- `memory/feedback_citation_required.md` に **§C-citation** 章を追加:
  - chip 仕様: `components/ui/Chip.jsx` の `variant="meta"`
  - icon: `Sparkles` (lucide-react) 16px、 左寄せ
  - chip テキスト: 「AI 要約 (SEC 由来)」 (10-12 字)
  - chip 配置: ProfileCard.jsx の card header 右端 (TriagBanner pattern と整合)
  - 削除禁止 (Trust Cliff anchor)

#### 完了判定基準 (Done Definition)

- [ ] SPEC v2 本文 (本ファイル) commit 済
- [ ] LP 訴求文言 audit 完了、 派生表現あれば SPEC §3 表に追記
- [ ] 4 セクション visual mock 1 枚作成 (markdown 構造図でOK、 `docs/specs/mocks/` 配下)
- [ ] `memory/feedback_citation_required.md` に §C-citation 追加
- [ ] Sprint B.1 着手判断 (audit 結果に応じて Generator 起動)

---

### Sprint B.1: backend `profile_summary.py` + endpoint + frontend ProfileCard 接続 (0.8 人日)

#### 目的
- LLM 和文要約 endpoint `/api/profile-summary/{ticker}` を新規実装
- ProfileCard.jsx の description 表示を英文 → 和文要約 (構造化 4 セクション) に置換
- 4 重防御 (Layer 1-4) 全層通過
- **(v2)** must-fix 12 件 + polish 2 件全反映

#### 触るファイル (新規 + 既存変更)

| ファイル | 操作 | 役割 |
|---|---|---|
| `backend/app/visualizer/profile_summary.py` | **新規** | LLM Haiku call + system prompt + 4 セクション schema + product_names 完全 token match + citation self-check |
| `backend/app/visualizer/prompt_negatives.py` | **追加** (v2 must-fix #2) | BAD-5/6 grey zone 7-10 表現を追加 (backend / frontend 1:1 mirror) |
| `backend/app/main.py` | 追加 | `/api/profile-summary/{ticker}` endpoint 追加 + Sentry metric (cache_read_input_tokens) daily aggregate (v2 must-fix #7) |
| `frontend/src/api.js` | 追加 | `fetchProfileSummary(ticker)` 関数追加 + AbortController 対応 (v2 must-fix #5) |
| `frontend/src/lib/blocklist.js` | **追加** (v2 must-fix #2) | BAD-5/6 grey zone 7-10 表現を追加 (backend と 1:1 mirror) |
| `frontend/src/features/judgment/components/detail/ProfileCard.jsx` | 変更 | 和文要約 + 4 セクション構造化 + loading shimmer (v2 must-fix #3) + 3 state UI (v2 must-fix #5) + citation chip (v2 must-fix #10) + 再生成 button (v2 polish P1) + section footnote 二重化 (v2 must-fix #11) |

#### 呼ぶ既存 skill

- `hallucination-guard` (4 重防御 enforce + BAD 1-6 + citation 必須)
- `prompt-cache-optimizer` (system + few-shot を ephemeral cache、 cache hit 80%+ 維持)
- `designing-workspace-ui` (ProfileCard.jsx 編集前、 token / spacing 整合)
- `design-system-check` (実装後の機械的 enforcement check)

#### LLM call の詳細仕様 — **(v2 must-fix #7 + #8 反映)**

```python
# backend/app/visualizer/profile_summary.py (擬似コード)

# (v2 must-fix #7) system block で {ticker} 埋め込み禁止、 ticker は messages に分離
SYSTEM_PROMPT = """あなたは米国株企業の会社概要を日本語で要約する narration 専属 AI です。

# 役割
FMP の英文 company description を入力に、 中学生でも 2 秒で「何の会社か」 がわかる和文要約を生成。

# Hard Constraints (絶対遵守)
1. FMP description に無い数値 (シェア / 売上 / EPS) を捏造しない
2. 断定的将来予測 (「必ず成長」「確実に拡大」「成長見込み」「拡大基調」「追い風」「中長期的に有望」) を出さない → 金商法 §38
3. 最上級表現 (「世界 No.1」「業界最大手」「唯一無二」「圧倒的シェア」「他の追随を許さない」「群を抜く」「市場リーダー」) を出さない → 景表法 §5
4. 英語術語は括弧併記で日本語主体に (例: 「主力事業 (iPhone)」 OK、 「Operating Income +12%」 NG)
5. 数値・固有名詞を含む文は FMP description に該当箇所がある場合のみ採用
6. product_names は FMP description から抽出した固有名詞のみを列挙 (完全 token match のため)

# Output schema (4 セクション必須 + product_names + 信頼度)
Tool use 強制 (tool_choice={"type": "tool", "name": "render_profile_summary"})
"""

PROFILE_SUMMARY_TOOL_SCHEMA = {
    "name": "render_profile_summary",
    "description": "FMP 英文 description から構造化和文要約を生成",
    "input_schema": {
        "type": "object",
        "required": ["summary_jp", "sections", "product_names", "confidence"],
        "properties": {
            "summary_jp": {"type": "string", "minLength": 50, "maxLength": 100, "description": "全体要約 1-2 文 (50-100 字)"},
            "sections": {
                "type": "object",
                "required": ["main_business", "revenue_model", "customers"],
                "properties": {
                    "main_business": {"type": "string", "description": "主力事業 (1-2 文、 製品 / サービスを具体的に)"},
                    "revenue_model": {"type": "string", "description": "収益モデル (ハードウェア / サブスク / 広告 等の組み合わせ、 1 文)"},
                    "customers": {"type": "string", "description": "顧客 / 競合 (B2B/B2C 別 + 主要顧客 or 競合企業を 1-2 文)"}
                }
            },
            "product_names": {
                "type": "array",
                "items": {"type": "string"},
                "description": "FMP description から抽出した製品名 / サービス名の完全 list (substring match 防止のため列挙必須)"
            },
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
            "low_confidence_claims": {"type": "array", "items": {"type": "string"}, "description": "削除した文 list"}
        }
    }
}

# (v2 must-fix #7) Claude Haiku call、 cache_control 2 段配置
resp = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=1024,
    system=[
        {"type": "text", "text": SYSTEM_PROMPT},  # static、 cache 対象
        {"type": "text", "text": format_few_shot(FEW_SHOT_5_EXAMPLES),
         "cache_control": {"type": "ephemeral"}},  # breakpoint 1
        {"type": "text", "text": format_negative_examples(BAD_1_TO_6_WITH_GREY_ZONE),
         "cache_control": {"type": "ephemeral"}},  # breakpoint 2
    ],
    messages=[
        # (v2 must-fix #7) ticker は messages に、 system 内で {ticker} 埋め込み禁止 (cache 破壊防止)
        {"role": "user", "content": f"ticker={ticker}\ndescription_en={description_en}"}
    ],
    tools=[PROFILE_SUMMARY_TOOL_SCHEMA],
    tool_choice={"type": "tool", "name": "render_profile_summary"},
)

# (v2 must-fix #7) Sentry metric daily aggregate
sentry_sdk.set_measurement("profile_summary.cache_read_input_tokens", resp.usage.cache_read_input_tokens)
sentry_sdk.set_measurement("profile_summary.cache_creation_input_tokens", resp.usage.cache_creation_input_tokens)
# 24h aggregate で cache_read_ratio = read / (read + creation) を daily metric として送出
```

#### Few-shot 5 銘柄 (initial)
- **AAPL**: hardware + services (consumer)
- **MSFT**: enterprise software + cloud (b2b SaaS)
- **NVDA**: semiconductor + AI accelerator (b2b)
- **AMZN**: e-commerce + AWS (b2c + b2b hybrid)
- **JPM**: bank + investment (financial)

→ Phase 4 既存 5 業種 few-shot を流用可能 (cost 0 で済む)

#### cache 設計 — **(v2 must-fix #4 + #7 反映)**

##### backend cache
- Redis or memory dict、 `(ticker, fmp_description_hash)` を key、 **7 日 TTL** (FMP description は週次更新程度)
- Anthropic ephemeral cache (breakpoint 2 段) で system + few-shot + NEGATIVE を cache

##### frontend cache (v2 must-fix #4 明示)
- **prefetchAll に含めない** (現状 7 endpoints は据置、 profile-summary は ProfileCard mount 時 lazy fetch)
- 既存 `useRef(new Map())` の 10 分 TTL に乗せる (同 ticker 再訪で 0 秒化)
- 理由: profile-summary は ProfileCard 開いた時のみ必要、 全銘柄 prefetch すると初期 load 遅延 + API cost 増

##### AbortController (v2 must-fix #5 明示)
- `fetchProfileSummary(ticker, { signal })` で AbortController.signal を受ける
- ProfileCard.jsx の `useEffect` cleanup で `ac.abort()` 必須
- 高速 ticker 切替時の race condition 防止 (Phase 2.6 Evaluator FAIL-3 hotfix と同 pattern)

#### Visual spec (4 セクション + 3 state UI) — **(v2 must-fix #3 + #5 + #9 + #11 + polish P1 反映)**

##### 4 セクション hierarchy (Sprint B.0 で確定済の案を採用)

- 案 A 採用想定 (h4 label + body text 二段、 縦 stack)
- 各セクション末尾に **inline footnote** (v2 must-fix #11): 「※ FMP description 記載時点」 を 10px / `var(--text-muted)` で
- `revenue_model` / `customers` の末尾に必須 (`main_business` は全体 citation chip でカバー)

##### loading state shimmer skeleton (v2 must-fix #3)

- v1 仕様 (spinner 単独) は **廃止**
- v2 確定:
  - 4 セクション分 (主力事業 / 収益モデル / 顧客 / 競合) × 2 行の shimmer rect
  - shimmer は `var(--bg-surface-2)` → `var(--bg-surface-3)` の linear-gradient + 1.5s loop
  - caption 12px / `var(--text-muted)` で「**日本語で要約中**」 を shimmer 下に表示
  - shimmer は `prefers-reduced-motion: reduce` で固定背景に切替 (a11y)

##### 3 state UI (loading / error / partial_failure) (v2 must-fix #5)

| state | 表示 | citation chip |
|---|---|---|
| **loading** | shimmer 4 セクション + 「日本語で要約中」 caption | hidden |
| **success** | 和文要約 + 4 セクション + section footnote × 2 + citation chip + 再生成 button | visible |
| **error (sources.fmp_profile = error/timeout)** | 「会社概要を取得できませんでした」 + retry button (再 fetch) | hidden |
| **partial_failure (signal_quality = low)** | 和文要約 (低信頼マーク `Alert` icon) + 4 セクション + 「※ 信頼度低、 SEC EDGAR で確認推奨」 banner | visible (注意マーク付) |
| **fallback (英文)** | FMP description 英文生表示 (v1 互換) + 「翻訳に失敗しました、 英文表示中」 banner | hidden |

##### 再生成 button (v2 polish P1)

- confidence=low 時のみ表示
- muted な「もう一度要約」 link (text-button、 `var(--text-muted)` + underline hover)
- chip 隣に配置、 click で `fetchProfileSummary(ticker, { force_regenerate: true })`
- 「Aman のお替わりはいかがですか」 体験

##### citation chip 配置 (v2 must-fix #10)

- ProfileCard.jsx の card header 右端 (TriagBanner pattern と整合)
- `<Chip variant="meta" icon={<Sparkles size={16} />}>AI 要約 (SEC 由来)</Chip>`
- chip click で tooltip 表示: 「**※ FMP 提供の企業概要 (SEC 提出書類より作成) を AI が日本語要約。 一次資料は SEC EDGAR 10-K を参照推奨。**」

#### 完了判定基準 (Done Definition)

- [ ] `backend/app/visualizer/profile_summary.py` 新規作成、 4 セクション schema + Tool use 強制 + **product_names 完全 token match self-check (v2 must-fix #8)**
- [ ] `backend/app/visualizer/prompt_negatives.py` に BAD-5/6 grey zone **7-10 表現追加 (v2 must-fix #2)**
- [ ] `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX に **1:1 mirror で 7-10 表現追加 (v2 must-fix #2)**
- [ ] `/api/profile-summary/{ticker}` endpoint 動作確認 (AAPL/MSFT/NVDA/TSLA/GOOGL の 5 銘柄で 200 OK)
- [ ] response envelope に sources / data / signal_quality / citation / **product_names / cache_*_input_tokens** 含む
- [ ] ProfileCard.jsx に和文要約 + 4 セクション表示、 **loading shimmer (v2 must-fix #3) + 3 state UI (v2 must-fix #5) + citation chip (v2 must-fix #10) + 再生成 button (v2 polish P1) + section footnote 二重化 (v2 must-fix #11)** 完備
- [ ] BLOCKLIST_REGEX 適用、 BAD-5/6 + grey zone sentence 単位削除動作
- [ ] cache hit 80%+ (2 回目以降の同 ticker call で 1 秒以内応答、 `cache_read_input_tokens > 0` で確認)
- [ ] **AbortController cleanup 動作確認 (v2 must-fix #5)**: 高速 ticker 切替で古い response 上書きなし
- [ ] **Sentry metric daily aggregate 送出確認 (v2 must-fix #7)**: cache_read_input_tokens / cache_creation_input_tokens
- [ ] `cd frontend && npm run build` 成功
- [ ] `grep -rn "summary_jp\|profile-summary\|product_names" frontend/src` で参照箇所確認
- [ ] design-system-check 起動、 token / spacing / hex 直書きなし確認
- [ ] **prefetchAll に profile-summary を含めない (v2 must-fix #4)** 確認 (frontend/src/lib/prefetch.js or 該当 file で grep 確認)

---

### Sprint B.2: 6 体合議 verdict gate (0.6 人日)

> **(v2 注記)**: handover v94 §記録の 6 体合議 verdict は **既に v1 SPEC に対して取得済**、 must-fix 12 件は本 v2 SPEC で全反映。 Sprint B.2 は **v2 実装完了後の 2 度目の 6 体合議** (verdict 再確認 + 残余 fix 抽出) として実行。

#### 目的
- Sprint B.1 の実装 (v2 反映済) を 6 体合議に提出、 verdict を取得して必要修正を反映
- 3 軸全 active のため 6 体必須 (§7 参照)

#### 触るファイル
- `docs/specs/SPEC_2026-05-22_pane3-phase3-llm-profile-summary.md` (本 SPEC、 verdict コメント追記)
- 6 体合議の指摘に応じて Sprint B.1 のファイル群を局所修正

#### 呼ぶ既存 skill

- `multi-review` (6 体起動: ui-designer + frontend-architect + マーケター + 金融-verdict + Anthropic-engineer + qa-dogfooder)

#### 6 体の役割

| reviewer | 観点 | gating 基準 |
|---|---|---|
| **ui-designer** | ProfileCard.jsx の token / spacing / 4 セクション hierarchy / **shimmer loading / 3 state UI / citation chip visual / 再生成 button (v2 must-fix #3/#5/#9/#10/P1)** | brand aspiration §-1 適合 |
| **frontend-architect** | sanitize layer / per-source namespace / **AbortController cleanup / prefetch 設計 (v2 must-fix #4/#5)** / cache 設計 | Chart Overlay Safety 4 層 + race condition なし |
| **マーケター** | LP 訴求「AI 日本語分析」 との Trust Cliff、 **citation 文言 (v2 must-fix #1) / section footnote 二重化 (v2 must-fix #11) / LP 訴求文言 audit 結果 (v2 must-fix #12)** | LP 5 銘柄 (AAPL/MSFT/NVDA/TSLA/GOOGL) で違和感 0 |
| **金融-verdict** | 景表法 §5 + 金商法 §38 + **BAD-5/6 grey zone sentence 削除動作 (v2 must-fix #2) / 製品名完全 token match (v2 must-fix #8)** | 10 銘柄で BAD pattern 検出 0 |
| **Anthropic-engineer** | system prompt + few-shot + **cache_control breakpoint 2 段配置 / system block {ticker} 不使用 / Sentry metric (v2 must-fix #7)** + Tool use 強制 | cache hit 80%+ + 数値捏造 0 + confidence=low 15% 以下 |
| **qa-dogfooder** | 10 銘柄 dogfood + fallback / error state / loading 体感 + **edge case 4 件 (20字/5K字/和文混在/多言語) (v2 must-fix #6)** | 「英語の壁」 撤廃 + 体感 1 秒以内 (cache 後) + edge case で 200 OK + signal_quality 降格 |

#### 完了判定基準 (Done Definition)

- [ ] 6 体並列起動、 1 メッセージで 6 reviewer の verdict 取得
- [ ] verdict score 5/6 以上で **承認**、 修正 5 件以下なら反映して deploy
- [ ] verdict score 4/6 以下、 または修正 6 件以上 → **gate fail**、 設計見直し
- [ ] 修正反映後の bundle hash 記録 (handover v94+ に追記用)

---

### Sprint B.3: dogfood + production 反映 (0.6 人日)

#### 目的
- LP 5 銘柄 + 追加 5 銘柄 (TSLA/GOOGL/META/AMD/NFLX) で hallucination 0 / BAD-5/6 検出 0 / fallback 動作確認
- **(v2 must-fix #6)** edge case 4 件 (20字 / 5K字 / 和文混在 / 多言語) で 200 OK + signal_quality 降格動作確認
- Railway deploy + bundle hash 検証 + handover v94+ 起票

#### 触るファイル
- `handover_2026-05-23_v94+.md` 新規作成 (deploy 完了 + dogfood 結果記録)
- 必要に応じて Sprint B.1 のファイル群を局所 hotfix

#### 呼ぶ既存 skill

- `qa-dogfooder` (5 銘柄 + 5 銘柄追加 dogfood + 4 edge case)
- `evaluator` (L1-L5 評価指標 verify)
- `release-check` (本番 deploy 前の最終 gate)

#### dogfood matrix (10 銘柄 × 6 check) — **(v2 must-fix #6 反映、 5 → 6 check)**

| ticker | 和文表示 | 4 セクション | BAD-5/6 検出 | citation chip | section footnote × 2 | fallback (英文) |
|---|---|---|---|---|---|---|
| AAPL | □ | □ | □ (0 件期待) | □ | □ | □ |
| MSFT | □ | □ | □ | □ | □ | □ |
| NVDA | □ | □ | □ | □ | □ | □ |
| TSLA | □ | □ | □ | □ | □ | □ |
| GOOGL | □ | □ | □ | □ | □ | □ |
| META | □ | □ | □ | □ | □ | □ |
| AMD | □ | □ | □ | □ | □ | □ |
| NFLX | □ | □ | □ | □ | □ | □ |
| JPM | □ | □ | □ | □ | □ | □ |
| XOM | □ | □ | □ | □ | □ | □ |

#### edge case matrix (4 件 × 3 check) — **(v2 must-fix #6 新規追加)**

| edge case | 入力 | 期待 status code | 期待 signal_quality |
|---|---|---|---|
| **20字** (短すぎ) | description_en = "Apple makes phones." | 200 | low (信頼度降格) |
| **5K字** (長すぎ) | description_en = "..." (5000 chars) | 200 | high (truncate して処理) |
| **和文混在** | description_en = "Apple makes iPhones. アップルは電話を作ります。" | 200 | medium |
| **多言語** | description_en = "Apple fait des téléphones." (仏語) | 200 | low (英語以外は要約困難) |

各 edge case で:
1. HTTP 200 OK
2. response envelope に sources / signal_quality 含む
3. ProfileCard.jsx が正常 render (真っ白事故なし、 Chart Overlay Safety 4 層継承)

#### L1-L5 評価指標 (Evaluator)

- **L1 (build)**: `cd frontend && npm run build` 成功、 backend uvicorn 起動成功
- **L2 (lint / type)**: design-system-check 通過、 BLOCKLIST_REGEX 適用確認 (BAD-5/6 + grey zone 7-10 表現)
- **L3 (testid + DOM)**: `grep -rn "profile-summary\|profile-card-summary" frontend/dist/assets/index-*.js` で minified bundle に testid 残存
- **L4 (visual / 4 重防御)**: 10 銘柄 dogfood で BAD-5/6 検出 0 件、 hallucination 0 件 (数値捏造なし)、 **product_names 完全 token match で偽 PASS 0 件**
- **L5 (production verify)**: Railway deploy 後 `curl https://beatscanner-production.up.railway.app/api/profile-summary/AAPL` で 200 OK + 和文要約取得

#### verify command (sequential)

```bash
# 1. local build
cd /Users/yamadadaiki/Projects/beatscanner/frontend && npm run build

# 2. backend startup
cd /Users/yamadadaiki/Projects/beatscanner/backend && python -m uvicorn app.main:app --reload

# 3. local API smoke test
curl -s http://localhost:8000/api/profile-summary/AAPL | jq '.summary_jp, .sources, .signal_quality, .product_names'

# 4. BLOCKLIST_REGEX self-test (BAD-5/6 + grey zone sentence 削除確認)
node -e "import('./frontend/src/lib/blocklist.js').then(m => console.log(m.sanitizeText('Apple は業界最大手で必ず成長する企業です。 圧倒的シェアを持ち、 中長期的に有望。 主力商品は iPhone です。')))"
# 期待: 「主力商品は iPhone です。」 のみ残る (BAD-5/6 + grey zone 削除)

# 5. edge case test (v2 must-fix #6)
curl -s -X POST http://localhost:8000/api/profile-summary/AAPL?force_description="Apple%20makes%20phones." | jq '.signal_quality'
# 期待: "low"

# 6. Railway deploy
cd /Users/yamadadaiki/Projects/beatscanner && railway up

# 7. production verify
sleep 60 && curl -s https://beatscanner-production.up.railway.app/api/profile-summary/AAPL | jq '.summary_jp'

# 8. bundle hash 取得
curl -s https://beatscanner-production.up.railway.app/ | grep -oE '/assets/index-[a-z0-9]+\.js'

# 9. Sentry daily metric 確認 (v2 must-fix #7 + polish P2)
# Sentry dashboard で profile_summary.cache_read_input_tokens / cache_creation_input_tokens の 24h aggregate 確認
# cache_read_ratio = read / (read + creation) > 80% (allergic: < 60% で alert)
```

#### 完了判定基準 (Done Definition)

- [ ] 10 銘柄 × 6 check (60 cell) で fail 0 件
- [ ] **edge case 4 件 × 3 check (12 cell) で fail 0 件 (v2 must-fix #6)**
- [ ] cache hit ratio 80%+ (本番 Anthropic console + **Sentry daily metric (v2 must-fix #7)** で確認)
- [ ] 月 cost 試算 $10 以内 (cache hit 80% 前提、 100 ticker × 1 call × 1000 tok input × $0.30/Mtok read = $0.03/日 = $0.9/月)
- [ ] **Sentry alert 設定 (v2 polish P2)**: 24h cache_read_ratio < 60% or 日次 cost > $1 で発火
- [ ] handover v94+ 起票 (deploy 完了 + bundle hash + dogfood 結果記録 + edge case 結果)

---

## 6. 触ってはいけないファイル一覧 (Generator 禁止指示) — **(v1 継承 + v2 追記)**

| ファイル | 理由 | 該当 sprint |
|---|---|---|
| `backend/app/visualizer/prompt.py` | DiagramCard LLM 数値計算指示 BLOCK (pre-commit Check 1) | 全 sprint |
| `backend/app/aggregator/*.py` | LLM SDK import BLOCK (pre-commit Check 3、 数値物理層) | 全 sprint |
| `backend/app/visualizer/prompt_negatives.py` の **既存 BAD 1-6 anchor** | 景表法 / 金商法 anchor (本 SPEC で **grey zone 7-10 表現の追加のみ許可、 既存 anchor の編集禁止**) | 全 sprint (v2 must-fix #2 で追加のみ) |
| `frontend/src/lib/blocklist.js` の **既存 BLOCKLIST_REGEX** | backend / JS 1:1 mirror anchor (本 SPEC で **追加のみ許可、 既存 pattern の typo 修正は OK だが削除禁止**) | 全 sprint (v2 must-fix #2 で追加のみ) |
| `frontend/src/App.jsx` の sticky 検索 div | 8 回試行錯誤の安定領域 | 全 sprint |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | 発光バグ高リスク (v54-v59) | 全 sprint |
| `.claude/launch.json` | 人間用、 AI 使用禁止 | 全 sprint |
| `migrations/*.sql` | 本 SPEC は新 endpoint で migration 不要 | 全 sprint |
| `handover_*.md` (既存 v92/v93/v94) | read-only reference、 編集禁止 | 全 sprint (v95+ のみ新規作成 OK) |
| `railway.toml` cron 定義 | 不変 | 全 sprint |
| `frontend/src/components/LandingPage.jsx` / `SampleAnalysisSection*` / `ProTeaser*` | **LP 訴求文言不変 (Trust Cliff anchor)、 v2 must-fix #12 で grep audit は OK だが編集禁止** | 全 sprint |
| `feedback_brand_aspiration.md` § -1 | 修正禁止 anchor | 全 sprint |
| **(v2 追記) `prefetchAll` 関連 file** | profile-summary を prefetchAll に含めない (v2 must-fix #4)、 lazy fetch 維持 | Sprint B.1 |

---

## 7. multi-review 必要性判定

### 3 軸チェック

| 軸 | 判定 | 根拠 |
|---|---|---|
| **1. LLM 出力品質 (景表法 / 金商法 / hallucination risk)** | ✅ **active** | Claude Haiku で和文要約 → BAD-5/6 違反 risk + 数値捏造 risk + **v2 で grey zone 7-10 表現追加で防御強化** |
| **2. Trust Cliff (LP 訴求 vs 実装の整合)** | ✅ **active** | LP「AI による日本語詳細分析」 vs 現状「英文生表示」 の乖離を解消、 **v2 で citation 文言 + section footnote 二重化 + LP audit で整合性 enforce** |
| **3. 新 backend endpoint + RLS / 認証境界 + cache 設計** | ✅ **active** | `/api/profile-summary/{ticker}` 新規 + cache 設計 + per-source namespace + **v2 で AbortController + Sentry metric + prefetch 設計明示** (RLS 不要、 公開データ) |

→ **3 軸全 active**、 **6 体合議起動必須** (CLAUDE.md SSOT)

### 6 体合議推奨構成

- **ui-designer**: ProfileCard.jsx の brand aspiration §-1 適合、 4 セクション hierarchy、 shimmer loading、 3 state UI、 citation chip visual、 再生成 button
- **frontend-architect**: per-source namespace + Chart Overlay Safety + AbortController race condition + prefetch 設計
- **マーケター**: LP 訴求 vs 実装の Trust Cliff、 citation 文言、 section footnote 二重化、 LP audit 結果
- **金融-verdict**: 景表法 §5 + 金商法 §38 + BAD-5/6 grey zone sentence 削除動作 + 製品名完全 token match + IR/SEC EDGAR 併記
- **Anthropic-engineer**: system prompt + few-shot + cache_control breakpoint 2 段 + system block {ticker} 不使用 + Sentry metric + Tool use 強制 + cache hit 80%+
- **qa-dogfooder**: 10 銘柄 dogfood + edge case 4 件 + fallback + 体感 1 秒以内 (cache 後)

### verdict 集約 SSOT

- 5/6 以上承認 → 修正反映後 deploy
- 4/6 以下、 または修正 6 件以上 → 設計見直し、 Sprint B.1 やり直し

---

## 8. 想定リスク + roll-back plan — **(v2 must-fix #6 + #7 反映、 閾値定量化)**

### リスク 1: LLM 和文要約に hallucination 混入

#### 何が壊れるか
- 「Apple は世界最大手の半導体メーカー」 等の捏造 → 景表法 §5 違反 → brand 信頼毀損 6-12 ヶ月コスト

#### 検出方法
- BLOCKLIST_REGEX (BAD-5/6 + **grey zone 7-10 表現 v2 追加**) sentence 単位削除で防御 1 層
- **product_names 完全 token match self-check (v2 must-fix #8)** で防御 2 層
- citation self-check (confidence=low 15% 超で破棄再生成) で防御 3 層
- 6 体合議 (金融-verdict) で 10 銘柄 dogfood で検出 0 件確認

#### roll-back (v2 must-fix #6 で閾値定量化)
- **即 revert 閾値**: LP 5 銘柄 (AAPL/MSFT/NVDA/TSLA/GOOGL) で BAD-5/6 検出 1 件以上 → 即 `git revert <commit-hash>` + Railway redeploy
- **24h 監視 revert 閾値**: 本番 deploy 後 24h で Sentry sanitize 削除率 5% 超 → revert (sanitize layer が 5% 以上削除する状況は LLM 出力品質低下、 prompt 見直し要)
- 緊急: `feature flag` で `/api/profile-summary` を停止、 ProfileCard.jsx は英文 fallback に switch

### リスク 2: cache hit ratio 80% 切り、 月 cost 暴騰 — **(v2 must-fix #7 + polish P2 反映)**

#### 何が壊れるか
- few-shot 5 業種 + system が full price → 100 ticker × 5K tok × $3.75/Mtok = $1.9/日 = $57/月 (cache 無し試算)
- cache hit 80% で月 $11.4 (許容ライン)、 0% で月 $57

#### 検出方法
- **Anthropic console + Sentry daily metric (v2 must-fix #7)** で cache_read_input_tokens / cache_creation_input_tokens の比率を 24h aggregate
- **Sentry alert (v2 polish P2)**: 24h cache_read_ratio < 60% or 日次 cost > $1 で発火 (slack notify)
- 80% 切ったら `prompt-cache-optimizer` skill で few-shot 5→3 件削減検討

#### roll-back
- few-shot 5→3 件削減 (cache 効率改善)
- or model を Haiku の older version に固定して cache window を拡大
- 緊急時: `/api/profile-summary` を停止、 英文 fallback に switch

### リスク 3: ProfileCard.jsx の race condition (高速 ticker 切替で古い response 上書き) — **(v2 must-fix #5 反映)**

#### 何が壊れるか
- AAPL → NVDA 高速切替で AAPL の summary が NVDA の card に表示 → user の信頼破壊

#### 検出方法
- **既存 `AbortController` pattern を踏襲 (v2 must-fix #5 で明示)** (Phase 2.6 Evaluator FAIL-3 hotfix 同等)
- `useEffect` cleanup で `ac.abort()` 必須、 cleanup なしの実装は merge 禁止
- 6 体合議 (frontend-architect) で race condition test

#### roll-back
- AbortController 未実装の commit は即 revert
- `useEffect` cleanup を強制する eslint rule の検討 (Sprint B.3 で polish 検討)

### リスク 4: FMP description が空 / API 障害 + edge case 4 件 — **(v2 must-fix #6 反映)**

#### 何が壊れるか
- LLM 入力が空 → 「FMP description が取得できませんでした」 と表示 → user 体験低下
- **edge case (20字 / 5K字 / 和文混在 / 多言語) で 500 error or 真っ白事故 → user 信頼破壊**

#### 検出方法
- `sources.fmp_profile === 'empty' | 'timeout' | 'error'` の compound check
- signal_quality 降格 + 英文 description (Phase A 既存) へ fallback
- **edge case test (v2 must-fix #6)**: Sprint B.3 で 4 件 × 3 check (200 OK + signal_quality 降格 + ProfileCard 正常 render) を verify

#### roll-back
- 英文 description (FMP `profile/{ticker}` の `description` field) に自動 fallback、 user に「翻訳に失敗しました」 表示
- edge case で 500 error 発生時は Chart Overlay Safety 4 層 (ErrorBoundary) で真っ白事故防止

---

## 9. 採用 skill 一覧 (Generator 起動時に必須) — **(v2 で B.0 skill 追加)**

| skill | 起動 sprint | 役割 |
|---|---|---|
| `hallucination-guard` | B.1 | 4 重防御 enforce + BAD 1-6 + **grey zone 7-10 表現 (v2)** + citation 必須 |
| `prompt-cache-optimizer` | B.1 | ephemeral cache + cache hit 80%+ + **breakpoint 2 段配置 (v2)** |
| `designing-workspace-ui` | B.0 / B.1 | ProfileCard.jsx 編集前の token / spacing + **shimmer / 3 state UI / citation chip visual 設計 (v2)** |
| `design-system-check` | B.1 / B.3 | 機械的 enforcement (raw hex / shadow / !important whitelist) |
| `multi-review` | B.2 | 6 体並列起動 |
| `qa-dogfooder` | B.3 | 10 銘柄 dogfood + **edge case 4 件 (v2)** |
| `evaluator` | B.3 | L1-L5 verify |
| `release-check` | B.3 | 本番 deploy 前最終 gate |

---

## 10. autonomous mode 進行ルール

- 本 SPEC v2 は user 離席中の autonomous 起票、 **gate 1 skip** で v2 確定
- 実装 (Sprint B.1) は user 起床後に判断 (本 SPEC が「実装準備完了」 状態)
- Generator 起動時は本 SPEC v2 + 関連 memory anchor 7 件 + CLAUDE.md + design_system.md + design_recipes.md を必読 context として inject
- B.2 (6 体合議) は user の承認後に起動、 verdict 取得後に修正反映 + deploy

---

## 11. 関連 handover / memory anchor

### handover
- `handover_2026-05-21_v92.md` §5-b (会社概要英文 → 和文化要望 4 回目)
- `handover_2026-05-22_v93.md` §2 (Phase 3 #3 Phase B 着手判断、 Phase 2.8 deploy 完了)
- **`handover_2026-05-22_v94.md` §記録 (6 体合議 verdict must-fix 12 件 + polish 2 件、 v2 SPEC inject 元)**

### memory anchor (必読)
- `feedback_brand_aspiration.md` (§-1 不変 anchor)
- `feedback_citation_required.md` (出典 URL 必須 + confidence=low 15% + **§C-citation chip SSOT (v2 Sprint B.0 で追加)**)
- `feedback_prompt_cache_pattern.md` (ephemeral cache + 80% hit + **breakpoint 2 段配置 (v2)**)
- `feedback_diagram_quality_guard.md` (BAD 1-6 + Trust Cliff DoD + **grey zone 7-10 表現 (v2)**)
- `feedback_data_completeness_guard.md` (sources schema)
- `feedback_llm_calc_separation.md` (aggregator/ ≠ visualizer/)
- `feedback_pre_release_priority.md` (pre-release 順序)
- `feedback_subagent_japanese.md` (6 体合議に「日本語回答」 明示)
- `feedback_multi_review_3_panel_workflow.md` (6 体 vs 3 体判定)
- `project_pane3_visual_explainer_redesign.md` (Phase 4 既存実装の参照)

---

## 12. SPEC v2 sign-off

- **作成者**: Planner subagent (Claude Opus 4.7 1M)
- **v1 作成日**: 2026-05-22 (initial)
- **v2 改訂日**: 2026-05-22 (6 体合議 must-fix 12 件 + polish 2 件 inject)
- **gate 1 user 承認**: skip (autonomous mode)
- **次の action**: user 起床後に Generator 起動判断、 **Sprint B.0 (LP audit + visual mock + citation SSOT 整備) → B.1 → B.2 → B.3** 順次実行
- **must_fix_count_injected**: 12 (重複排除版)
- **polish_count_adopted**: 2 (P1 再生成 button 必須 + P2 Sentry alert オプション)
