# SPEC 2026-05-22: Pane 3 Phase 3 #3 Phase B — 会社概要 LLM 和文化

> **Status**: v1 起票 (autonomous mode、 gate 1 skip)
> **想定 sprint 数**: 3 (B.1 実装 / B.2 6 体合議 / B.3 dogfood)
> **工数**: 2.0 人日 (B.1 = 0.8 / B.2 = 0.6 / B.3 = 0.6)
> **6 体合議**: **必須** (3 軸全 active、 §7 参照)
> **autonomous_implementation**: false (user 起床後に Generator 起動判断)

---

## 1. Context

### user prompt 原文
> 「handover v92 §7 / v93 §2 で記録済の Phase 3 #3 Phase B (会社概要 LLM 和文化) を SPEC.md 起票してほしい。」

### なぜ今やるか (根拠)

1. **継続要望 (4 回目 dogfood / 5 回目 dogfood で連続)**: handover v92 §5-b、 v93 §2 で user 「**和文にしてほしい**」 が 2 セッション連続で計上、 4 回目 dogfood 5 件の唯一の LLM 案件
2. **Phase 2.8 deploy 完了済**: handover v93 で visual hotfix 5 件着地、 4 件は visual fix で完走、 残った 1 件 (5-b) が本 SPEC で対応する LLM 和文化
3. **Trust Cliff (重大)**: LP「AI による日本語詳細分析」 と実装「英文 FMP description 直表示」 が乖離。 user が会社概要を開いた時の最初の体験が「**英語の壁**」 で読み手の負担を増やしており、 5 原則 §1 (読み手に負担をかけない) に直接違反
4. **既存資産活用**: Phase 4 (DiagramCard) で確立した 4 重防御 + few-shot cache + citation 強制 pattern を再利用、 ゼロから設計しなくて済む

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

| LP 訴求 | 実装 (現状) | 実装 (本 SPEC 後) | 整合性 |
|---|---|---|---|
| 「AI による日本語詳細分析」 | 会社概要は **英文 FMP description 生表示** | LLM Haiku 和文要約 + 構造化 | ✅ 完全整合 |
| 「3 銘柄/日まで無料」 | demo endpoint 経由で動作 | 同じく demo endpoint 経由 (本 SPEC は新 endpoint だが、 demo 対応必要) | ✅ 保持 |
| 「登録不要」 | 未ログインで判定タブ閲覧可 | 同じく未ログインで profile-summary 閲覧可 (rate limit のみ) | ✅ 保持 |
| 「投資判断は IR 公式資料で再確認推奨」 | 全 LLM 出力に表記済 | citation chip に「FMP profile 機械翻訳 + Claude 要約。 IR 公式資料で再確認」 表記必須 | ✅ 強化 |

### 矛盾検査 (Trust Cliff 防止)

- [ ] 「無料で和文要約まで出すのか?」 → demo endpoint で 3 req/IP/day の rate limit 内なら OK
- [ ] 「Pro tier の機能じゃないのか?」 → Phase 1 では **未ログイン含む全 user に開放**、 Pro tier gate なし (handover v93 で Phase B は free tier 内と合意)
- [ ] 「LLM 和文要約は遅延あり?」 → 初回 5-10 秒、 cache hit 後は 1 秒以内 (UI 側 loading state で説明)

### 文末固定 citation (必須)

```
※ FMP company profile (英文) を Claude Haiku で要約。 投資判断は IR 公式資料で再確認推奨。
```

ProfileCard.jsx 末尾に **必ず 12px / `var(--text-muted)`** で表示。 削除禁止 (Trust Cliff anchor)。

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

#### Layer 3: frontend BLOCKLIST_REGEX (sentence 単位 sanitize)
- 既存 `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX を本 SPEC でも適用
- ProfileCard.jsx で API response の `summary_jp` を render する直前に `sanitizeText(summary_jp)` を呼ぶ
- backend と JS の 1:1 mirror を維持 (BAD-5/6 pattern の追加が必要なら両側同時更新)

#### Layer 4: sources schema + per-source data namespace
- `/api/profile-summary/{ticker}` response は以下 envelope を返す:
  ```json
  {
    "ticker": "AAPL",
    "summary_jp": "...",
    "sections": {"main_business": "...", "revenue_model": "...", "customers": "..."},
    "sources": {"fmp_profile": "ok" | "empty" | "timeout" | "error"},
    "data": {"fmp_profile": {"description_en": "...", "fetched_at": "..."}},
    "signal_quality": "high" | "medium" | "low",
    "citation": "FMP profile (英文) を Claude Haiku で要約",
    "generated_at": "2026-05-22T..."
  }
  ```
- frontend は `sources.fmp_profile === 'ok' && data.fmp_profile` の compound check で表示判定
- 出典欠落時は signal_quality 降格 + 数値削除 + 「データ取得失敗」 fallback

#### citation 必須 (feedback_citation_required.md SSOT)
- `summary_jp` 内に固有名詞 (製品名 / 顧客名) を含む場合、 FMP description に該当文字列が含まれるか self-check
- confidence=low (FMP description に該当無し) が claims 全体の 15% 超 → 破棄して再生成 (max 2 周)

---

## 5. スプリント分割 (3 sprint)

### Sprint B.1: backend `profile_summary.py` + endpoint + frontend ProfileCard 接続 (0.8 人日)

#### 目的
- LLM 和文要約 endpoint `/api/profile-summary/{ticker}` を新規実装
- ProfileCard.jsx の description 表示を英文 → 和文要約 (構造化 4 セクション) に置換
- 4 重防御 (Layer 1-4) 全層通過

#### 触るファイル (新規 + 既存変更)

| ファイル | 操作 | 役割 |
|---|---|---|
| `backend/app/visualizer/profile_summary.py` | **新規** | LLM Haiku call + system prompt + 4 セクション schema + citation self-check |
| `backend/app/visualizer/prompt_negatives.py` | 参照のみ (変更なし) | BAD 1-6 を import |
| `backend/app/main.py` | 追加 | `/api/profile-summary/{ticker}` endpoint 追加 (既存 `/api/profile-extended/{ticker}` の隣に配置) |
| `frontend/src/api.js` | 追加 | `fetchProfileSummary(ticker)` 関数追加 (既存 `fetchProfileExtended` の隣) |
| `frontend/src/lib/blocklist.js` | 参照のみ (変更なし) | sanitizeText 呼び出し |
| `frontend/src/features/judgment/components/detail/ProfileCard.jsx` | 変更 | description 表示部分を和文要約 + 4 セクション構造化に置換、 loading / error / fallback state 追加 |

#### 呼ぶ既存 skill

- `hallucination-guard` (4 重防御 enforce + BAD 1-6 + citation 必須)
- `prompt-cache-optimizer` (system + few-shot を ephemeral cache、 cache hit 80%+ 維持)
- `designing-workspace-ui` (ProfileCard.jsx 編集前、 token / spacing 整合)
- `design-system-check` (実装後の機械的 enforcement check)

#### LLM call の詳細仕様

```python
# backend/app/visualizer/profile_summary.py (擬似コード)
SYSTEM_PROMPT = """あなたは米国株企業の会社概要を日本語で要約する narration 専属 AI です。

# 役割
FMP の英文 company description を入力に、 中学生でも 2 秒で「何の会社か」 がわかる和文要約を生成。

# Hard Constraints (絶対遵守)
1. FMP description に無い数値 (シェア / 売上 / EPS) を捏造しない
2. 断定的将来予測 (「必ず成長」「確実に拡大」) を出さない → 金商法 §38
3. 最上級表現 (「世界 No.1」「業界最大手」「唯一無二」) を出さない → 景表法 §5
4. 英語術語は括弧併記で日本語主体に (例: 「主力事業 (iPhone)」 OK、 「Operating Income +12%」 NG)
5. 数値・固有名詞を含む文は FMP description に該当箇所がある場合のみ採用

# Output schema (4 セクション必須)
{
  "summary_jp": "全体要約 1-2 文 (50-100 字)",
  "sections": {
    "main_business": "主力事業 (1-2 文、 製品 / サービスを具体的に)",
    "revenue_model": "収益モデル (ハードウェア / サブスク / 広告 等の組み合わせ、 1 文)",
    "customers": "顧客 / 競合 (B2B/B2C 別 + 主要顧客 or 競合企業を 1-2 文)"
  },
  "confidence": "high | medium | low",
  "low_confidence_claims": ["削除した文 1", "削除した文 2"]
}
"""

# Claude Haiku call (cost 最小化)
resp = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=1024,
    system=[
        {"type": "text", "text": SYSTEM_PROMPT},
        {"type": "text", "text": format_few_shot(FEW_SHOT_5_EXAMPLES),
         "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": format_negative_examples(BAD_1_TO_6),
         "cache_control": {"type": "ephemeral"}},
    ],
    messages=[
        {"role": "user", "content": f"ticker={ticker}\ndescription_en={description_en}"}
    ],
    tools=[PROFILE_SUMMARY_TOOL_SCHEMA],
    tool_choice={"type": "tool", "name": "render_profile_summary"},
)
```

#### Few-shot 5 銘柄 (initial)
- **AAPL**: hardware + services (consumer)
- **MSFT**: enterprise software + cloud (b2b SaaS)
- **NVDA**: semiconductor + AI accelerator (b2b)
- **AMZN**: e-commerce + AWS (b2c + b2b hybrid)
- **JPM**: bank + investment (financial)

→ Phase 4 既存 5 業種 few-shot を流用可能 (cost 0 で済む)

#### cache 設計
- backend cache: Redis or memory dict、 `(ticker, fmp_description_hash)` を key、 7 日 TTL (FMP description は週次更新程度)
- frontend cache: 既存 `useRef(new Map())` の 10 分 TTL に乗せる (同 ticker 再訪で 0 秒化)

#### 完了判定基準 (Done Definition)

- [ ] `backend/app/visualizer/profile_summary.py` 新規作成、 4 セクション schema + Tool use 強制 + citation self-check
- [ ] `/api/profile-summary/{ticker}` endpoint 動作確認 (AAPL/MSFT/NVDA/TSLA/GOOGL の 5 銘柄で 200 OK)
- [ ] response envelope に sources / data / signal_quality / citation 含む
- [ ] ProfileCard.jsx に和文要約 + 4 セクション表示、 loading / error / fallback (英文へ) state 完備
- [ ] BLOCKLIST_REGEX 適用、 BAD-5/6 sentence 単位削除動作
- [ ] cache hit 80%+ (2 回目以降の同 ticker call で 1 秒以内応答)
- [ ] `cd frontend && npm run build` 成功
- [ ] `grep -rn "summary_jp\|profile-summary" frontend/src` で参照箇所確認
- [ ] design-system-check 起動、 token / spacing / hex 直書きなし確認

---

### Sprint B.2: 6 体合議 verdict gate (0.6 人日)

#### 目的
- Sprint B.1 の実装を 6 体合議に提出、 verdict を取得して必要修正を反映
- 3 軸全 active のため 6 体必須 (§7 参照)

#### 触るファイル
- `docs/specs/SPEC_2026-05-22_pane3-phase3-llm-profile-summary.md` (本 SPEC、 verdict コメント追記)
- 6 体合議の指摘に応じて Sprint B.1 のファイル群を局所修正

#### 呼ぶ既存 skill

- `multi-review` (6 体起動: ui-designer + frontend-architect + マーケター + 金融-verdict + Anthropic-engineer + qa-dogfooder)

#### 6 体の役割

| reviewer | 観点 | gating 基準 |
|---|---|---|
| **ui-designer** | ProfileCard.jsx の token / spacing / 4 セクション hierarchy / loading state | brand aspiration §-1 適合 |
| **frontend-architect** | sanitize layer / per-source namespace / AbortController / cache 設計 | Chart Overlay Safety 4 層 + race condition なし |
| **マーケター** | LP 訴求「AI 日本語分析」 との Trust Cliff、 citation chip 文言 | LP 5 銘柄 (AAPL/MSFT/NVDA/TSLA/GOOGL) で違和感 0 |
| **金融-verdict** | 景表法 §5 / 金商法 §38 / BAD-5/6 sentence 削除動作 | 5 銘柄で BAD pattern 検出 0 |
| **Anthropic-engineer** | system prompt / few-shot / cache_control / Tool use 強制 / Hallucination Guard | cache hit 80%+ + 数値捏造 0 + confidence=low 15% 以下 |
| **qa-dogfooder** | 5 銘柄 dogfood + fallback / error state / loading 体感 | 「英語の壁」 撤廃 + 体感 1 秒以内 (cache 後) |

#### 完了判定基準 (Done Definition)

- [ ] 6 体並列起動、 1 メッセージで 6 reviewer の verdict 取得
- [ ] verdict score 5/6 以上で **承認**、 修正 5 件以下なら反映して deploy
- [ ] verdict score 4/6 以下、 または修正 6 件以上なら **gate fail**、 設計見直し
- [ ] 修正反映後の bundle hash 記録 (handover v94 に追記用)

---

### Sprint B.3: dogfood + production 反映 (0.6 人日)

#### 目的
- LP 5 銘柄 + 追加 5 銘柄 (TSLA/GOOGL/META/AMD/NFLX) で hallucination 0 / BAD-5/6 検出 0 / fallback 動作確認
- Railway deploy + bundle hash 検証 + handover v94 起票

#### 触るファイル
- `handover_2026-05-23_v94.md` 新規作成 (deploy 完了 + dogfood 結果記録)
- 必要に応じて Sprint B.1 のファイル群を局所 hotfix

#### 呼ぶ既存 skill

- `qa-dogfooder` (5 銘柄 + 5 銘柄追加 dogfood)
- `evaluator` (L1-L5 評価指標 verify)
- `release-check` (本番 deploy 前の最終 gate)

#### dogfood matrix (10 銘柄 × 5 check)

| ticker | 和文表示 | 4 セクション | BAD-5/6 検出 | citation chip | fallback (英文) |
|---|---|---|---|---|---|
| AAPL | □ | □ | □ (0 件期待) | □ | □ |
| MSFT | □ | □ | □ | □ | □ |
| NVDA | □ | □ | □ | □ | □ |
| TSLA | □ | □ | □ | □ | □ |
| GOOGL | □ | □ | □ | □ | □ |
| META | □ | □ | □ | □ | □ |
| AMD | □ | □ | □ | □ | □ |
| NFLX | □ | □ | □ | □ | □ |
| JPM | □ | □ | □ | □ | □ |
| XOM | □ | □ | □ | □ | □ |

#### L1-L5 評価指標 (Evaluator)

- **L1 (build)**: `cd frontend && npm run build` 成功、 backend uvicorn 起動成功
- **L2 (lint / type)**: design-system-check 通過、 BLOCKLIST_REGEX 適用確認
- **L3 (testid + DOM)**: `grep -rn "profile-summary\|profile-card-summary" frontend/dist/assets/index-*.js` で minified bundle に testid 残存
- **L4 (visual / 4 重防御)**: 10 銘柄 dogfood で BAD-5/6 検出 0 件、 hallucination 0 件 (数値捏造なし)
- **L5 (production verify)**: Railway deploy 後 `curl https://beatscanner-production.up.railway.app/api/profile-summary/AAPL` で 200 OK + 和文要約取得

#### verify command (sequential)

```bash
# 1. local build
cd /Users/yamadadaiki/Projects/beatscanner/frontend && npm run build

# 2. backend startup
cd /Users/yamadadaiki/Projects/beatscanner/backend && python -m uvicorn app.main:app --reload

# 3. local API smoke test
curl -s http://localhost:8000/api/profile-summary/AAPL | jq '.summary_jp, .sources, .signal_quality'

# 4. BLOCKLIST_REGEX self-test (BAD-5/6 sentence 削除確認)
node -e "import('./frontend/src/lib/blocklist.js').then(m => console.log(m.sanitizeText('Apple は業界最大手で必ず成長する企業です。 主力商品は iPhone です。')))"
# 期待: 「主力商品は iPhone です。」 のみ残る (BAD-5/6 削除)

# 5. Railway deploy
cd /Users/yamadadaiki/Projects/beatscanner && railway up

# 6. production verify
sleep 60 && curl -s https://beatscanner-production.up.railway.app/api/profile-summary/AAPL | jq '.summary_jp'

# 7. bundle hash 取得
curl -s https://beatscanner-production.up.railway.app/ | grep -oE '/assets/index-[a-z0-9]+\.js'
```

#### 完了判定基準 (Done Definition)

- [ ] 10 銘柄 × 5 check (50 cell) で fail 0 件
- [ ] cache hit ratio 80%+ (本番 Anthropic console で確認)
- [ ] 月 cost 試算 $10 以内 (cache hit 80% 前提、 100 ticker × 1 call × 1000 tok input × $0.30/Mtok read = $0.03/日 = $0.9/月)
- [ ] handover v94 起票 (deploy 完了 + bundle hash + dogfood 結果記録)

---

## 6. 触ってはいけないファイル一覧 (Generator 禁止指示)

| ファイル | 理由 | 該当 sprint |
|---|---|---|
| `backend/app/visualizer/prompt.py` | DiagramCard LLM 数値計算指示 BLOCK (pre-commit Check 1) | 全 sprint |
| `backend/app/aggregator/*.py` | LLM SDK import BLOCK (pre-commit Check 3、 数値物理層) | 全 sprint |
| `backend/app/visualizer/prompt_negatives.py` | 景表法 / 金商法 anchor、 BAD 1-6 SSOT | 参照のみ OK、 編集禁止 |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | backend / JS 1:1 mirror anchor、 typo は OK だが pattern 追加は要承認 | 全 sprint (参照のみ OK) |
| `frontend/src/App.jsx` の sticky 検索 div | 8 回試行錯誤の安定領域 | 全 sprint |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | 発光バグ高リスク (v54-v59) | 全 sprint |
| `.claude/launch.json` | 人間用、 AI 使用禁止 | 全 sprint |
| `migrations/*.sql` | 本 SPEC は新 endpoint で migration 不要 | 全 sprint |
| `handover_*.md` (既存 v92/v93) | read-only reference、 編集禁止 | 全 sprint (v94 のみ新規作成 OK) |
| `railway.toml` cron 定義 | 不変 | 全 sprint |
| `frontend/src/components/LandingPage.jsx` / `SampleAnalysisSection*` / `ProTeaser*` | LP 訴求文言不変 (Trust Cliff anchor) | 全 sprint |
| `feedback_brand_aspiration.md` § -1 | 修正禁止 anchor | 全 sprint |

---

## 7. multi-review 必要性判定

### 3 軸チェック

| 軸 | 判定 | 根拠 |
|---|---|---|
| **1. LLM 出力品質 (景表法 / 金商法 / hallucination risk)** | ✅ **active** | Claude Haiku で和文要約 → BAD-5/6 違反 risk + 数値捏造 risk |
| **2. Trust Cliff (LP 訴求 vs 実装の整合)** | ✅ **active** | LP「AI による日本語詳細分析」 vs 現状「英文生表示」 の乖離を解消、 文言整合最重要 |
| **3. 新 backend endpoint + RLS / 認証境界 + cache 設計** | ✅ **active** | `/api/profile-summary/{ticker}` 新規 + cache 設計 + per-source namespace (RLS 不要、 公開データ) |

→ **3 軸全 active**、 **6 体合議起動必須** (CLAUDE.md SSOT)

### 6 体合議推奨構成

- **ui-designer**: ProfileCard.jsx の brand aspiration §-1 適合、 4 セクション hierarchy、 loading state
- **frontend-architect**: per-source namespace + Chart Overlay Safety + AbortController race condition
- **マーケター**: LP 訴求 vs 実装の Trust Cliff、 citation chip 文言、 demo / Pro tier 整合
- **金融-verdict**: 景表法 §5 + 金商法 §38 + BAD-5/6 sentence 削除動作 + IR 公式資料併記
- **Anthropic-engineer**: system prompt + few-shot + cache_control + Tool use 強制 + cache hit 80%+
- **qa-dogfooder**: 10 銘柄 dogfood + fallback + 体感 1 秒以内 (cache 後)

### verdict 集約 SSOT

- 5/6 以上承認 → 修正反映後 deploy
- 4/6 以下、 または修正 6 件以上 → 設計見直し、 Sprint B.1 やり直し

---

## 8. 想定リスク + roll-back plan

### リスク 1: LLM 和文要約に hallucination 混入

#### 何が壊れるか
- 「Apple は世界最大手の半導体メーカー」 等の捏造 → 景表法 §5 違反 → brand 信頼毀損 6-12 ヶ月コスト

#### 検出方法
- BLOCKLIST_REGEX (BAD-5/6) sentence 単位削除で防御 1 層
- citation self-check (confidence=low 15% 超で破棄再生成) で防御 2 層
- 6 体合議 (金融-verdict) で 10 銘柄 dogfood で検出 0 件確認

#### roll-back
- 緊急: `feature flag` で `/api/profile-summary` を停止、 ProfileCard.jsx は英文 fallback に switch
- `git revert <commit-hash>` で Sprint B.1 を巻き戻し、 Railway redeploy

### リスク 2: cache hit ratio 80% 切り、 月 cost 暴騰

#### 何が壊れるか
- few-shot 5 業種 + system が full price → 100 ticker × 5K tok × $3.75/Mtok = $1.9/日 = $57/月 (cache 無し試算)
- cache hit 80% で月 $11.4 (許容ライン)、 0% で月 $57

#### 検出方法
- Anthropic console で cache_read / cache_creation の比率を週次確認
- 80% 切ったら `prompt-cache-optimizer` skill で few-shot 5→3 件削減検討

#### roll-back
- few-shot 5→3 件削減、 or model を Haiku の older version に固定して cache window を拡大

### リスク 3: ProfileCard.jsx の race condition (高速 ticker 切替で古い response 上書き)

#### 何が壊れるか
- AAPL → NVDA 高速切替で AAPL の summary が NVDA の card に表示 → user の信頼破壊

#### 検出方法
- 既存 `AbortController` pattern を踏襲 (Phase 2.6 Evaluator FAIL-3 hotfix 同等)
- 6 体合議 (frontend-architect) で race condition test

#### roll-back
- `useEffect` cleanup で `ac.abort()` 必須、 cleanup なしの実装は merge 禁止

### リスク 4: FMP description が空 / API 障害

#### 何が壊れるか
- LLM 入力が空 → 「FMP description が取得できませんでした」 と表示 → user 体験低下

#### 検出方法
- `sources.fmp_profile === 'empty' | 'timeout' | 'error'` の compound check
- signal_quality 降格 + 英文 description (Phase A 既存) へ fallback

#### roll-back
- 英文 description (FMP `profile/{ticker}` の `description` field) に自動 fallback、 user に「翻訳に失敗しました」 表示

---

## 9. 採用 skill 一覧 (Generator 起動時に必須)

| skill | 起動 sprint | 役割 |
|---|---|---|
| `hallucination-guard` | B.1 | 4 重防御 enforce + BAD 1-6 + citation 必須 |
| `prompt-cache-optimizer` | B.1 | ephemeral cache + cache hit 80%+ |
| `designing-workspace-ui` | B.1 | ProfileCard.jsx 編集前の token / spacing |
| `design-system-check` | B.1 / B.3 | 機械的 enforcement (raw hex / shadow / !important whitelist) |
| `multi-review` | B.2 | 6 体並列起動 |
| `qa-dogfooder` | B.3 | 10 銘柄 dogfood |
| `evaluator` | B.3 | L1-L5 verify |
| `release-check` | B.3 | 本番 deploy 前最終 gate |

---

## 10. autonomous mode 進行ルール

- 本 SPEC は user 就寝中の autonomous 起票、 **gate 1 skip** で v1 確定
- 実装 (Sprint B.1) は user 起床後に判断 (本 SPEC が「実装準備完了」 状態)
- Generator 起動時は本 SPEC + 関連 memory anchor 7 件 + CLAUDE.md + design_system.md + design_recipes.md を必読 context として inject
- B.2 (6 体合議) は user の承認後に起動、 verdict 取得後に修正反映 + deploy

---

## 11. 関連 handover / memory anchor

### handover
- `handover_2026-05-21_v92.md` §5-b (会社概要英文 → 和文化要望 4 回目)
- `handover_2026-05-22_v93.md` §2 (Phase 3 #3 Phase B 着手判断、 Phase 2.8 deploy 完了)

### memory anchor (必読)
- `feedback_brand_aspiration.md` (§-1 不変 anchor)
- `feedback_citation_required.md` (出典 URL 必須 + confidence=low 15%)
- `feedback_prompt_cache_pattern.md` (ephemeral cache + 80% hit)
- `feedback_diagram_quality_guard.md` (BAD 1-6 + Trust Cliff DoD)
- `feedback_data_completeness_guard.md` (sources schema)
- `feedback_llm_calc_separation.md` (aggregator/ ≠ visualizer/)
- `feedback_pre_release_priority.md` (pre-release 順序)
- `feedback_subagent_japanese.md` (6 体合議に「日本語回答」 明示)
- `feedback_multi_review_3_panel_workflow.md` (6 体 vs 3 体判定)
- `project_pane3_visual_explainer_redesign.md` (Phase 4 既存実装の参照)

---

## 12. SPEC v1 sign-off

- **作成者**: Planner subagent (Claude)
- **作成日**: 2026-05-22
- **gate 1 user 承認**: skip (autonomous mode)
- **次の action**: user 起床後に Generator 起動判断、 B.1 → B.2 → B.3 順次実行
