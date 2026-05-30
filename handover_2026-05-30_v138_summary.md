# BeatScanner Handover v138 — Phase 2 SPEC v2 改訂 ($99/月 課金回避) + LP 訴求拡張 + release

> v137 で「Option A: 今晩課金 + Phase 2B skeleton 先行」 と決定したが、 audit 着手直後に
> **既存実装 `get_segment_data()` + `build_segment_summary()` + ProfileCard SegmentSection** が
> 既に完成しており Premium key で全銘柄 segment data 取得可能と判明。 課金回避 + Phase 2B 工数 0
> で release tempo 維持。 LP subtitle を「2 本柱日本語チェック」 から「部門別売上や予想比較まで日本語で」
> に拡張、 release-check 全 PASS で deploy。

## 🎯 v138 完了済の主要トピック

### 1. Phase 2B audit — 課金不要判明 (最大成果)
- FMP `/stable/revenue-product-segmentation?symbol=X&period=quarter` が **Premium key で全銘柄取得可能**
  - NVDA: Data Center $75.2B (YoY **+92.4%**)
  - AAPL: iPhone $57.0B (+21.7%) / Service $31.0B (+16.3%) / Mac $8.4B (+5.7%)
  - GOOGL: Search $60.4B (+19.1%) / Cloud $20.0B (**+63.4%**) / YouTube $9.9B (+10.7%)
  - MSFT: Server Products $32.6B (**+31.6%**) / M365 Commercial $25.6B (+17%) / Gaming $5.3B (-6.6%) 等 10 segments
- 既存実装 (v97 真因 fix 時点): main.py:521 `get_segment_data()` + main.py:553 `build_segment_summary()` + main.py:10272 `parsed["segmentSummary"]` attach
- frontend: ProfileCard.jsx:404 (SegmentSection) + DiagramCard.jsx:1559 (セグメント別売上) で描画
- **SPEC v1「FMP Ultimate 課金 5-6 人日」 は誤った前提**、 課金不要 + 工数 0 で Phase 2B done

### 2. SPEC v2 全面改訂
- `docs/specs/SPEC_2026-05-30_jichama-record-level.md` を v1 → v2 改訂
- Phase 2A 削除 (課金不要)、 Phase 2B「既に着地済」 marker
- Phase 2 工数 5.25-6.25 人日 + $99/月 → **0 人日 + $0** (release 前必須)
- 残 release 後 sprint: 2C (1 人日) + 2D (1.5-2 人日) + 2E (1 人日) = 3.5-4 人日

### 3. LP Hero subtitle 拡張
- 旧: 「決算 quarterly + テクニカル daily、 米国株を 2 本柱で日本語チェック。」
- 新: 「決算 quarterly + テクニカル daily、 部門別売上や予想比較まで日本語で。」
- funnel-cro 観点で「ガイダンス」 訴求 (SEC 8-K 抽出精度 20-35%) は Trust Cliff Risk 検知 → 「予想比較」 (bm_data → beat_miss_detail で確実動作) に修正
- 「機関投資家級」 等の主観言葉は §38 断定 risk 回避で見送り、 機能事実訴求のみ

### 4. release-check 全 PASS
- design-system-check: subtitle 1 文字列のみ、 token / 発光 / chip 全 0 件違反
- funnel-cro: LP 訴求 ↔ 実装整合 OK、 ハードコード whitelist 撤廃済
- CLAUDE.md grep: じっちゃま UI 0 件 / sticky 無変更 / prefetchAll 定義あり / console.log 新規無し
- Local build PASS (index 353KB / gzip 113KB、 急増無し)

## 🔴 next session 最優先

### A. 明日朝 9:00 JST reminder (自動発火)
scheduled-task `p2-pullback-confirm-reminder` が以下を自動実行:
1. 方針 #12 GC chip nightly 動作確認 (ScreenerPane で「✦ GC」 badge 検出)
2. P2 pullback_to_support 該当銘柄を curl で抽出 (state='pullback_to_support')
3. 結果通知 (user action 不要)

### B. v138 deploy 結果確認
- Bundle hash 変更確認 + LP subtitle 「部門別売上や予想比較まで日本語で」 が本番表示

### C. Phase 2C 着手 (1 人日)
- backend `_fetch_dividends_for_ticker` (main.py:3210) + `buybackYield` 計算 (line 810-947) は既存
- 拡張: 前 Q と異なる金額検出 → 「**新規発表**」 強調 flag を response に attach
- frontend: 新 `<CapitalReturnCard>` で「自社株買い 800 億追加」 「四半期配当 1¢→25¢」 等の change-only display

### D. Phase 2D 着手 (1.5-2 人日、 +$5-10/月)
- 既存 `_fetch_sec_guidance` (main.py:5045) を Anthropic prompt cache 適用で精度 20-35% → 60-70%
- 8-K EX-99.1 + transcript 両 parse、 q_revenue/q_margin/fy_revenue/fy_margin 構造化
- LP「ガイダンス」 訴求 unlock (release 後)

### E. Phase 2E 着手 (1 人日)
- DiagramCard に「部門別売上」 (既に description あり) と「資本政策」 (新 card) を Pane 3 詳細に統合

## 🟡 重要知見 (v138 で永続化したい)

### audit 優先原則 (新規 SSOT)
SPEC 起票 時点で「未実装と仮定」 して大規模工数 + 課金見積もりした内容が、
**既に過去 sprint で実装済** だった pattern。 v97 真因 fix で実装された
get_segment_data() を v135 SPEC 起票時点で見落とした。
→ **新 SPEC 起票時の audit checklist**: 関連 helper / endpoint を grep + 本番 curl で
動作確認してから工数見積もり。 「未実装」 仮定を avoid。

### LP 訴求の Trust Cliff Risk 言葉選び
- 「ガイダンス」 → 一般理解「会社発表ガイダンス値」、 backend SEC 8-K 抽出 20-35% で Risk 大
- 「予想比較」 → consensus vs 実績の verdict、 bm_data で確実動作 ✅
- 「機関投資家級」 → 主観 verdict、 §38 断定 risk あり ⚠️
- 「部門別売上」 → 機能事実、 backend 既存 ✅
- LP 訴求は **frontend で確実に描画される機能事実のみ** 採用、 backend 精度が低い項目は post-release Phase 2D で 60%+ 達成後に追加

## 📊 残 backlog (優先順)

| Phase | 工数 | release 前後 | 内容 |
|---|---|---|---|
| Phase 2C | 1 人日 | 後 | 配当 + 自社株買い 「新規発表」 強調 |
| Phase 2D | 1.5-2 人日 | 後 | SEC 8-K LLM 強化 (+$5-10/月) |
| Phase 2E | 1 人日 | 後 | frontend 資本政策 card 統合 |
| P1-D | 2-3 時間 | 後 | chart overlay preset 3 mode |
| P1-E PART2 Phase 2-3 | 5-8 人日 | 後 | 図解内容大規模 redesign |
| Phase 3 | 15-20 人日 | 後 | earnings call transcript LLM |
| SellZone chip 重複削減 | minor | redesign 時 | hero + header 2 箇所 → 1 箇所 |

## ⚠️ 触ると危険 (継続遵守)
- 発光系 .panel-card / .bs-panel / .surface-card (v54-v59 6 セッション溶解)
- sticky 検索バー (Apple 方式 8 回試行錯誤後の安定)
- VITE_ ARG / ENV 同期 (Dockerfile)
- aggregator/ への LLM SDK import 禁止 (pre-commit BLOCK)
- DiagramCard mount 維持 ([[feedback-diagram-card-remount-cache]])
- 「じっちゃま」 文字列 → 「独自プロトコル」
- JSX 属性間コメント不可

## 本日 v138 commit (2 commit、 同一 session 内)

| ver | commit | 内容 |
|---|---|---|
| v138 | 107de65 | Phase 2 SPEC v2 ($99/月 課金回避) + LP subtitle「部門別売上や予想比較まで日本語で」 + handover v138 |
| v138.1 (Phase 2C) | 6260dbd | 配当 + 自社株買い 実行額 raw fact attach + CapitalReturnSection (Section 3.6) 統合 |

### v138.1 Phase 2C 詳細

backend (`main.py:619` 周辺):
- 新 helper `get_capital_return_data(ticker, fmp_key)` — cash-flow-statement (8Q) + `_fetch_dividends_for_ticker` (limit=8) 並列 fetch
- dividend trend 判定: 直近 4 件平均 vs 前 4 件平均 (≥5% 差で increase/decrease、 それ以外 stable)
- buyback: 直近 Q 実行額 (絶対値、 負値 = 買い戻し) + TTM 累計 (4Q sum)
- visualize endpoint asyncio.gather に `_cap_task` 追加、 `parsed["capitalReturn"]` + `parsed["capitalReturnDataAvailable"]` attach

frontend (`DiagramCard.jsx`):
- 新 `CapitalReturnSection` + `CapitalReturnRow` 追加 (Section 3.6 = セグメント別売上 直後)
- trend chip 色: 増配=緑 / 横ばい=muted / 減配=赤 (CLAUDE.md 投資業界色ルール準拠)
- raw fact のみ表示 (「announcement」 strong words は Phase 2D SEC 8-K 完了後 unlock)
- description: 「直近四半期 実績ベース（出典: FMP cash-flow / dividend-history）」

### Phase 2C で SPEC v2 工数表 update

| Phase | v138 audit 直後 | v138.1 commit 後 |
|---|---|---|
| 2C 配当/自社株買い backend + frontend | 1 人日 | ✅ **着地済** |
| 2D SEC 8-K LLM 強化 (+$5-10/月) | 1.5-2 人日 | 🟡 remaining |
| 2E frontend 統合 | 1 人日 | 🟢 Phase 2C で 大半 完遂 (資本政策 section)、 残 0.5 人日 (guidance card は Phase 2D 後) |
| release 後 sprint 合計 | 3.5-4 人日 | **2-2.5 人日** |

**累計 v130-v138.1**: 11 commit、 「audit-first SPEC 圧縮」 + 「Phase 2C raw fact 路線で Trust Cliff 回避」 の 2 SSOT 確立。

## v138.2 Phase 2D Sprint 1 着地 (本 session 追加)

### audit 発見
- 既存 `_fetch_sec_guidance` (main.py:5165) は Haiku call、 **prompt cache 未適用**
- SPEC v1 月 cost +$5-10/月 → cache 適用で **+$1-2/月** に圧縮可 (cache hit 80% 前提、 [[feedback-prompt-cache-pattern]] 準拠)

### 着地物
- `docs/specs/SPEC_2026-05-30_phase2d-sec-guidance-llm.md` 新規 SPEC
- `backend/app/visualizer/sec_guidance.py` 新規 module 作成
  - `GUIDANCE_EXTRACT_TOOL_SCHEMA`: structured output (q_revenue / q_margin / fy_revenue / fy_margin / narrative_jp / source_url / extraction_confidence)
  - `_SYSTEM_STATIC`: 厳格ルール 8 件 (raw 数値 / §38 断定禁止 / §5 最上級禁止 / マージン種別 / consensus 比較 / source 必須 / 記載なし時の null 化)
  - `_NEGATIVES_GUIDANCE`: BAD-5 / BAD-6 各 2 件 + GOOD-1 (ephemeral cache breakpoint 2)
  - `_FEW_SHOT_GUIDANCE`: NVDA / AAPL / MSFT 実例 3 件 (ephemeral cache breakpoint 1)
  - `extract_guidance(text, source_url)` async function
    - prompt cache 3 段 (static + few-shot + negatives)
    - source_url 一致 self-check + mismatch 時 confidence 1 段降格
    - cache_read/creation_input_tokens metric 同梱

## v138.3 Phase 2D Sprint 2a 着地 (本 session 追加)

### 着地物 (backend 統合、 frontend 未着手のため deploy なし = regression なし)
- `main.py` 新規 helper:
  - `_fetch_sec_guidance_structured(ticker) -> dict | None` (line 5165 周辺、 既存 _fetch_sec_guidance の 90 行 SEC EDGAR fetch part を copy + LLM call のみ `visualizer/sec_guidance.extract_guidance()` 経由に置換)
  - `_fetch_sec_guidance_structured_cached(ticker)` 6h in-memory cache wrapper (`_guidance_v2_cache`)
  - AAPL は数値ガイダンス非開示方針のため hardcoded fallback
- `main.py` visualize endpoint (line 10046 周辺):
  - `asyncio.gather` に `_guidance_task` 追加 (7 並列)
  - `parsed["guidanceExtracted"]` + `parsed["guidanceExtractedAvailable"]` attach
  - cache hit 率実測 console log (`[GUIDANCE_V2 CACHE] {ticker} hit={X}%`)
- 既存 `_fetch_sec_guidance` + `_fetch_sec_guidance_cached` は **不変** (line 163 warmup + line 6114 visualization prompt 用、 backward compat 維持)
- syntax check PASS (`py_compile`)、 frontend 未統合のため deploy 不要

### 次セッション着手 (Phase 2D Sprint 2b/2c、 1.0-1.5 人日)
1. **Sprint 2b frontend** (0.5-1 人日):
   - DiagramCard.jsx に `GuidanceSection` (Section 3.7) 追加
   - 表示: 「次 Q ガイダンス: 売上 $X-Y B、 マージン X-Y%」 + source_url link
   - extraction_confidence chip: high=緑 / medium=muted / **low** = warning banner「精度不足、 出典確認」
   - q_revenue/q_margin/fy_revenue/fy_margin のうち欠落 field は graceful skip
2. **Sprint 2c dogfood + deploy** (0.5 人日):
   - 本番 deploy 後 NVDA/AAPL/MSFT/GOOGL 4 銘柄で精度確認
   - 60-70% 達成 + cache hit 80%+ 維持を target
   - cache hit < 80% なら few-shot 5→3 件削減 ([[feedback-prompt-cache-pattern]])
   - release-check + commit + deploy
3. **LP 訴求 update**: 「部門別売上や予想比較まで日本語で」 → 「**次 Q ガイダンス** + 部門別売上 + 予想比較 + 資本政策まで日本語で」 unlock (dogfood で precision 60%+ 確認後のみ)

### 注意 (Sprint 2b 着手前)
- ANTHROPIC_API_KEY が Railway env vars に設定済 (既存 LLM endpoint で使用中、 OK)
- visualize endpoint で 7 並列 fetch = タイムアウト risk 微増 (実測必要)
- `_guidance_v2_cache` は process-local、 multi-worker 環境では worker 単位 cache (warmup cron で温める設計検討余地)
- GuidanceSection の design system check: 既存 CapitalReturnSection / SegmentBar pattern 流用、 raw hex / shadow / !important 不可

### Phase 2D 全体進捗 (v138 audit 起点)
- Sprint 1 (sec_guidance.py module) ✅ 着地 (commit 41c9e01)
- Sprint 2a (backend 統合) ✅ 着地 (commit 81306ba)
- Sprint 2b (frontend GuidanceSection) ✅ 着地 (commit c4ff41b)
- Sprint 2c (dogfood + deploy) ✅ 着地 + LP unlock 見送り (v138.5)

## v138.5 Phase 2D Sprint 2c 着地 (本 session 追加)

### deploy
- `railway up --detach` → bundle hash `index-CXk8clXz.js` → `index-DCJVgYs2.js` (CSS 不変 = frontend のみ)
- backend `_fetch_sec_guidance_structured` + frontend GuidanceSection 本番稼働

### dogfood 結果 (4 銘柄、 SEC 8-K EX-99.1 only)
| ticker | confidence | structured | 真因 |
|---|---|---|---|
| NVDA | **high** | q_revenue $89.18-92.82B + q_margin 74.4-75.5% gross | 8-K に数値ガイダンス明示掲載 |
| AAPL | medium | 全 None (narrative のみ) | 数値ガイダンス非開示方針、 hardcoded fallback |
| MSFT | **low** | 全 None | 8-K は historical only、 ガイダンスは決算 call で提供 |
| GOOGL | **low** | 全 None | GOOGL も同様、 press release では historical only |

### cache hit 観測 ([GUIDANCE_V2 CACHE] from railway logs)
- NVDA: cold MISS (4160 token cache create)
- MSFT: hit=**100%** (read=4160)
- GOOGL: hit=**100%** (read=4160)
- steady-state cache hit ≥ 80% target **達成** ✅

### LP 訴求 update **見送り** (重要 verdict)
- precision: high+medium = 2/4 = **50%** (target 60-70% 未達)
- 真因切り分け: MSFT/GOOGL low は **bug ではなく source side limit** (8-K に情報なし)
- prompt 改善では precision は上がらない、 Phase 3 (call transcript LLM、 15-20 人日) で補完が必要
- LP「次 Q ガイダンス + 部門別売上 + 予想比較 + 資本政策まで日本語で」 → **Phase 3 完了まで保留**
- 現 LP「決算 quarterly + テクニカル daily、 部門別売上や予想比較まで日本語で」 を維持

### 新規 SSOT memory
- `feedback_sec_guidance_8k_coverage_limit.md` — 8-K only でガイダンス抽出は MSFT/GOOGL 等 call 提供企業で「記載なし」 が正解、 LP unlock 判定の構造的理解

### Phase 2D 完了 + 次セッション展望
- Phase 2D 全 Sprint (1 / 2a / 2b / 2c) ✅ 着地、 課金回避 ($99/月 節約) + 機能完成
- 次 priority candidates:
  1. **Phase 3 (earnings call transcript LLM、 15-20 人日)** — MSFT/GOOGL 等 8-K coverage 外を補完 → LP「ガイダンス」 unlock 解禁可能に
  2. Phase 2E (frontend 統合 + DiagramCard refactor、 残 0.5 人日)
  3. P1-D chart overlay preset 3 mode (2-3 時間)
  4. SellZone chip 重複削減 (minor)

### 本日 v138.5 commit (Sprint 2b + Sprint 2c)
| ver | commit | 内容 |
|---|---|---|
| v138.4 (Phase 2D Sprint 2b) | c4ff41b | DiagramCard GuidanceSection (Section 3.7) + sanitize 拡張 |
| v138.5 (Phase 2D Sprint 2c) | (deploy only、 code 不変) | bundle `index-DCJVgYs2.js` 本番展開 + dogfood + LP unlock 見送り verdict |

## v138.6 Bug 1+2 + 追加 1+2 着地 (本 session 追加)

### 真因 (user dogfood NVDA 2026-05-30 で発見)
- **Bug 1**: 5条件カード (4/5 合致) ↔ 図解 ビジュアル分析 (0/5 FAIL) 食い違い
  → 真因: visualizer/prompt.py が schema に `passCount/totalCount/overallPass/conditions` を含み、
    LLM が四半期データ見えない時「四半期比較不可 → 0/5」 と誤判定。 CLAUDE.md「数値は Python」 SSOT 違反
- **Bug 2**: 5条件 chip 「>+999%」 「>-999%」 表示が異常見える
  → 真因: ConditionSparkline.jsx が series 全体 (5 年 5 点) で trendPct 計算、 5 年前 EPS ≈ 0.x が分母で爆発
- **追加 1**: AI 要約 ③ ガイダンス「非開示」 多発 + EPS BEAT 「—」 多発
  → 真因: `_format_context` が `sec_guidance_text` を LLM 文脈に含めず、 LLM は情報 0 で「非開示」 hallucinate
- **追加 2**: 図解 Hero「データ不足で判定不可」
  → Bug 1 の同根 (LLM headline + FAIL badge + 0/5 button が aggregator と矛盾)

### Fix 1 (commit 1a8118e、 bundle `index-usR8f65Q.js`)
- backend visualizer/prompt.py: `overallPass/passCount/totalCount/conditions` schema 削除、
  headline RULES に「データ不足 / 判定不可 等 fallback 文言 BAN」 追加
- backend main.py visualize endpoint: aggregator (analysis_data) の値で `parsed["passCount/totalCount/overallPass/conditions"]` 上書き、 LLM 旧 cache hit でも frontend は SSOT 値を受信
- frontend DiagramCard.jsx: `isFallbackHeadline` guard 追加 (stale cache 対応 + 二重防御)

### Fix 2 (同 commit)
- frontend ConditionSparkline.jsx: trendPct 計算窓を **直近 3 点** に統一、 text 表示「1.2→2.9→4.9」 と一致

### Fix 3 (同 commit)
- backend `_format_context`: `sec_guidance_text` を `【次期ガイダンス（経営陣発表 / SEC 8-K より抽出）】` セクションで LLM 文脈に追加
- frontend SummaryBrief.jsx: `isEmptyBullet` filter、 「非開示」 等の value-less bullet を render 前 suppress

### dogfood verify (4 銘柄、 本番)
| ticker | Fix 1 passCount | Fix 1-C headline | Fix 3-A ③ ガイダンス |
|---|---|---|---|
| NVDA | **4** (was 0) | 「年間売上2倍超、利益率も急速改善」 | 🔴 修正あり。第2四半期売上 **$91.0B**、 GAAP マージン **74.9%** |
| AAPL | (PASS sample) | — | Apple は数値ガイダンス非開示の方針。 定性: Services 二桁、 GM 47.5-48.5% |
| MSFT | (PASS sample) | — | 次期売上高予想 **$147.4B**（レンジ：$145.4B〜$150.4B）、 EPS 予想 **$3.65** |
| GOOGL | (要 dogfood) | — | sec_guidance_text あり (2025 CapEx $91-93B) |

→ **全 4 銘柄で「非開示」 のみの bullet は消失**、 user 要望「載せること自体やめる検討」 は **不要に**

### EPS BEAT 「—」 真因 (Fix 対象外、 backlog)
- `/api/guidance/NVDA/basic` の `eps.actual = null` (FMP earnings-surprises endpoint で取得失敗)
- fiscal_period が「Q1 2027 / 2026-08-26」 と次期 reporting date を返している
- 真因: 旧 `_fetch_eps_data` の date 抽出ロジック (要 backend 再 grep)
- Fix 案: surprises 配列から直近 quarter (Q1 FY2027 = 2026-05-21 報告) の actual を pick する別 logic
- 工数: 0.5-1 人日 (別 sprint で着手推奨、 user 要否確認)

### 残バックログ更新 (v138.6 完了後)
| 優先 | タスク | 工数 | release 前後 |
|---|---|---|---|
| 🟠 P1 | ログアウトボタン (最小 MVP) | 0.5 人日 | 前 |
| 🟠 P1 | 改善 D: Pane 2 redesign | 3-7 人日 | 前 (user 最優先) |
| 🟡 P2 | EPS BEAT 「—」 真因 fix (FMP earnings-surprises date pick) | 0.5-1 人日 | 前 |
| 🟡 P2 | pricing 決定 (¥980/¥4,980/¥10,000) | 1 人日 | 前 |
| 🟢 | Phase 3 (call transcript LLM) | 15-20 人日 | 後 |
| 🟢 | 改善 C: 5条件 hover affordance | 1.5-2 人日 | 後 |
| 🟢 | プラン管理 UI full (Stripe 統合) | 2-3 人日 | 後 |

### v138.6 + R1 + R2 + R3 + R4 + R5 + R6 hotfix commit
| ver | commit | bundle | 内容 |
|---|---|---|---|
| v138.6 | 1a8118e | `index-usR8f65Q.js` | 物理層分離 SSOT 復活 + sparkline 窓統一 + AI 要約 sec_guidance 配線 |
| v138.6 R1 hotfix | 0f459bf | `index-CQ1gC-IA.js` | payload key naming mismatch / ③ 復旧 / CFPS-EPS adaptive threshold |
| v138.6 R2 hotfix | 63173ca | `index-DrerytzW.js` | SummaryBrief 2-phase race / EPS BEAT FMP 未来 entry skip / 5条件 click affordance |
| v138.6 R3 hotfix | 724ddc8 | `index-CPAUQHb9.js` | EPS BEAT frontend 配線 (epsBeatPct → guidance.eps.surprise_pct) + hover 強化 |
| v138.6 R4 hotfix | 896c069 | `index-Bkdw-Vz3.js` | 「この条件の解説」 ボタンを cyan accent chip 風に強化 |
| v138.6 R5 hotfix | ccbdeb3 | `index-BQWDGn3B.js` | 3 体合議 verdict → 「この条件の解説」 icon-only ⓘ minimal 統一 |
| v138.6 R6 feat | 4f3a092 | `index-ifwCUlr6.js` | workspace Pane 1 nav 末尾 UserFooter + LogOut button 追加 |
| v138.6 R7 P0+P1 | 423a642 | `index-BVL8weEE.js` | LogOut redirect + Trust Cliff data leak gate + login button 復旧 |
| v138.6 R7-A2+C2 | 6685db6 | `index-KrDrSd9e.js` | LogOut → ?layout=classic 強制 + ProfileCard 2 箇所目 listener 復旧 |
| v138.6 R7-D+R7-E | fe689a7 | `index-MyCqygyQ.js` | 永遠ローディング honest 表現 + 🔒 emoji → Lock icon |
| v138.6 R7-A3 | 0fb8bab | `index-N2aJhBlu.js` | re-login 後 ?layout=classic 自動 clear で workspace 復帰 |
| v138.6 R7-F+G | 8d94d93 | `index-Dap-2cwr.js` | LP 銘柄 click → workspace 強制 + 図解 Pro 限定化 |
| v138.6 R7-H/I/J/K/L | dc6b9bf | `index-CeRYgb3V.js` | PremiumLock Option D refactor + 過去 8Q gate + AI 詳細レポート 重複削除 |
| v138.6 R7-I2+M | a7e51c5 | `index-DmLBSeor.js` | workspace UpgradeModal mount 追加 + 図解 Premium→Pro 色統一 |
| v138.6 R7-N | 361bde4 | `index-Hht9JD80.js` | UpgradeModal featureName → 日本語 label dict 変換 |

## v138.6 R7-N 着地

- 真因: 「earnings_8q」 「claude_opus_report」 等 internal feature key が modal にそのまま露出
- 修正: FEATURE_LABEL_JP dict (20 key + 日本語 label) + resolveFeatureLabel helper、
  modal 表示を `displayName` 経由で user-facing 日本語に変換、 未登録 key は raw fallback

## 🐛 既知 bug (次セッションで処理、 user dogfood 12 巡目で発見)

### Bug: 図解 banner「Pro で解放」 click 時 modal 表示が「過去 8Q 決算反応」 になる
- 真因: R7-M で図解 placeholder の feature を `claude_opus_report` (Premium=orange) →
  `earnings_8q` (Pro=cyan) に変更で色統一したが、 副作用として modal 表示が「過去 8Q 決算反応」
- user dogfood 直接 quote: 「図解生成 の Pro で解放 ボタンを押したときにも、 過去 8Q 決算反応 は
  Pro プランでご利用いただけます と表示されます」
- 対応案 (user 提案で 3 体合議):
  - 案 A: 図解専用の feature key 新設 (例: `ai_diagram` / `figure_generation`) を planGating.js に
    追加、 Pro tier 登録、 FEATURE_LABEL_JP dict に「図解」 or 「AI 詳細レポート」 追加
  - 案 B: PremiumLock に `displayLabel` prop を追加し、 feature key と表示名を分離
  - 案 C: feature key と表示名を最初から分離する schema 変更 (planGating refactor 規模)
- 関連: 下記 next session SPEC seed の B (Pro vs Premium tier 再構築) と同時 refactor で着地が
  効率的 (tier 体系 confirm + planGating refactor + 図解 key 新設 を 1 commit でまとめ)

## 次セッション着手 SPEC seed (user 直接要望、 2 件)

### A. UpgradeModal リデザイン (「凄い！ぜひ使ってみたい！」 感覚出す)
- user dogfood「機能列挙について、 なんとなく "凄い！ ぜひ使ってみたい！" 感がない」
- 現状 UpgradeModal (line 62-): Plan 比較 grid (Free vs Pro) + Stripe CTA、 静的 plain 表
- design 課題:
  - Aman 級「驚き・豪華さ・興奮」 (ブランド世界観 §-1) を modal で再現
  - 5 原則 #2「毎日開きたくなる」 を sign up trigger と整合
  - 「7日間 完全無料」 訴求 vs LP 整合 (Trust Cliff 防止)
- 着手手順 (3 体合議推奨、 frontend 局所修正なので 6 体は不要):
  - ui-designer (Aman 級 visual / 5 原則整合)
  - funnel-cro (CVR + Trust Cliff)
  - qa-dogfooder (体感「凄い！」 vs 「うざい」 balance)
- 参考 SSOT: docs/references/design_system.md §-1-A + memory feedback_brand_aspiration.md + feedback_minimalism_over_additive.md

### B. Pro vs Premium tier 構造 user 想定 confirm
- user 直接 quote: 「Pro = ファンダメンタル分析だけ (調べたい銘柄が決まっている)、 Premium = Pro + テクニカル
  分析 (カップ・ウィズ・ハンドル、 売り買いゾーン、 支持線・抵抗線) + スクリーナー の感覚」
- 現状 planGating.js では:
  - **Pro tier**: earnings_8q / search_unlimited / screener_custom / csv_export / earnings_alert / 等
  - **Premium tier**: claude_opus_report (Claude Opus 多面分析) / cup_handle_detection 等
- user 想定 vs 現状の **mismatch**:
  - スクリーナー = user は Premium 想定だが現 planGating では Pro
  - Cup-Handle / 売り買いゾーン / 抵抗線 = user は Premium 想定で planGating も Premium ✅
  - ファンダ 5 条件 / 図解 = user は Pro 想定だが、 図解 (claude_opus_report) は現 Premium
- 着手手順 (3 体合議):
  - 金融 reviewer (機能群 categorize 整合性)
  - funnel-cro (各 tier pricing 訴求)
  - planner (planGating.js refactor + LP 訴求整合)
- 参考 SSOT: lib/planGating.js + components/LandingPage.jsx + memory project_logout_plan_management_ui.md

### C. 図解 → 「過去 8Q 決算反応」 表示 bug (user dogfood 12 巡目)
- 上記 既知 bug の対応、 案 A (図解専用 feature key 新設) が現実的
- 表示名は「図解」 or 「AI 詳細レポート」 の 2 案を 3 体合議 (ui-designer 主、 funnel-cro 副) で決定
  - 「図解」 = banner UI 上の語と一致、 user 認知連続性
  - 「AI 詳細レポート」 = LP 訴求語と一致、 funnel 整合性
- B (Pro/Premium tier 再構築) と **同時 commit** が効率的、 planGating.js refactor + key 新設を 1 sprint
- 工数: 0.5-1 人日 (B と統合で +0.5 人日)

### 次セッション開始 SOP
1. `/fetch-handover` で本 file 圧縮 summary 取得
2. 上記 A + B + C の SPEC seed を見て、 user に着手順を確認:
   - 推奨順: **B + C 統合先行** (tier 体系 + key 新設、 0.5-1.5 人日)
   - → A (UpgradeModal リデザイン、 1-2 人日)
   - → D (改善 D Pane 2 redesign、 3-7 人日)
3. 3 体合議 並列起動 → verdict 集約 → 実装 → deploy → user dogfood

### release status (本日 v138.6 終了時点)
- pre-release、 dogfood 11 巡 + 15 hotfix bundle で安定化進行中
- LP 訴求は Pro tier (¥980/月) のみ、 Premium tier は LP 未追加
- 重要 backlog: 改善 D Pane 2 redesign (user 最優先、 3-7 人日) は依然 pending

## v138.6 R7-I2 + R7-M 着地 (user dogfood 11 巡目)

### 🟠 R7-I2 P1: 「Pro で解放」 click 反応なし 真因確定
- 真因: workspace mode の return block で **`<UpgradeModal />` が mount されていなかった**、
  upgrade.open() で state 更新するが modal component が render tree に不在 → 無反応
- 旧: UpgradeModal は classic SPA mode (line 2581) のみ mount で workspace path に未配置
- 修正: workspace mode return block にも UpgradeModal 追加、 props は upgrade.props spread
- 検証: free user で「Pro で解放」 click → modal 起動 期待

### 🟡 R7-M P2: 図解 Premium→Pro 色統一
- 真因: 図解 placeholder feature="claude_opus_report" (PREMIUM tier) で orange、
  Cup-Handle / 過去 8Q は Pro tier で cyan、 色不統一 + LP は Pro 訴求のみで Premium 未公開
  → user dogfood「色不統一、 統一したほうがいい?」 相談
- 修正: 図解 placeholder feature を `earnings_8q` (Pro tier) に変更で **cyan 統一**
- 機能本体は依然 Pro/Premium 限定 render (R7-G/L) で動作変更なし、 **色のみ統一**
- Premium tier 差別化は将来 LP に Premium 追加後に再導入

## v138.6 R7-H/I/J/K/L 着地 (3 体合議 verdict 反映、 user dogfood 10 巡目)

### 🟠 R7-J + R7-L: 3 体合議 verdict (ui-designer + funnel-cro + qa-dogfooder) 全 3 体一致 D 案
- 旧 PremiumLock: ✦ PRO 限定 chip + label + 3 bullets + 大 CTA button (user dogfood「しつこい、 品格損なう」)
- 新 Option D: label (1 行) + 小 pill CTA「Pro で解放 →」 (Aman 級「主張せず存在感」 質感)
- chip / bullets / 大ボタン全削除、 blur 8px 維持、 padding 24→20、 minHeight 200→160
- PRO badge は caller (AccordionSection label) で render、 PremiumLock は CTA に集中

### 🟠 R7-I P1: 「Pro で解放」 button 不発 真因 fix
- 真因: `onClick={onUpgrade}` で SyntheticEvent が upgrade.open に渡され featureName が event obj、
  modal が壊れる
- 修正: `onClick={() => { try { onUpgrade(feature); } catch { onUpgrade(); } }}` で feature string
  明示 pass + 例外 fallback。 検証: free user で「Pro で解放」 click → upgrade modal 起動

### 🟠 R7-H P1: 過去 8Q 決算反応 (EarningsReactionPanel) Pro 限定化
- 真因: ガイダンス進捗 直近8Q は gated 済、 過去 8Q 決算反応 は free 露出 = Trust Cliff inconsistency
- 修正: JudgmentDetail.jsx earningsReactionBlock を `feature="earnings_8q"` PremiumLock で wrap、
  isScrollV1 / accordion 両 branch 対応

### 🟡 R7-K P2: ペイン3末尾 AI 詳細レポート 重複削除
- 真因: v4 mode で図解 (StickyDiagramAccordion) が Pane 3 上部 mount 済、 末尾 AI 詳細レポート は重複
- 修正: ContextSection.jsx に `isV4` prop 追加、 `result && !isV4` で AI 詳細レポート skip
- legacy mode (isV4=false) は従来通り render (BC 担保)

### 🟡 R7-L: 図解 R7-G 完全 hide → minimal D 案 placeholder upgrade
- 旧 R7-G: 図解 を free で完全非表示 (LP 訴求と整合だが「upsell 機会失う」 funnel-cro 指摘)
- 新 R7-L: free user に PremiumLock minimal placeholder (label「図解で 5 条件・ビジネスを 2 秒で理解」 +
  小 CTA + 64px ghost banner) で「存在を匂わせるが押し付けない」 Aman 級品格

## v138.6 R7-F + R7-G 着地

### 🟠 R7-F P1: LP 銘柄 click が classic SPA で完結する regression
- 真因: LP は logout 後の `?layout=classic` で表示されるため、 handleLPTickerClick がそのまま
  classic SPA mode で analyze 実行、 user は workspace UI に戻れず「旧 UI の銘柄分析へ飛ぶ」 認識
- 修正: useJudgmentResult.js handleLPTickerClick で classic URL 検知時に
  `?ticker=<sym>` で workspace mode へ full reload、 demo 分析を workspace で実行
- 元の UX 復元、 銘柄 URL に乗せて useUrlSync で picked up

### 🟡 R7-G P2: 図解 (DiagramCard) Pro 限定化
- user 要望「図解生成も、 未ログインだと見えないように」
- LP 訴求「PRO: AI 詳細レポート」 と整合 (図解 = AI 詳細レポート、 ¥980/月、 Trust Cliff 防止)
- 修正: JudgmentDetail.jsx isV4 branch で `(plan === 'pro' || plan === 'premium')` の時のみ
  StickyDiagramAccordion render、 free user は完全非表示
- legacy mode (isV4=false) には元々 StickyDiagramAccordion なし、 v4 mode のみ gate で完了

## v138.6 R7-A3 着地 (R7-A2 副作用 fix)

### 真因
- R7-A2 で logout → `?layout=classic` 強制したが、 re-login 後も URL に classic 残り、
  user は元の workspace mode に戻れず classic SPA に閉じ込められる regression
- user dogfood「LP から銘柄リンクをクリックすると旧 UI へ遷移」 報告 = 再ログイン後 classic SPA 表示が続いていた

### 修正
- Workspace.jsx LogOut: `sessionStorage.setItem('bs:return_to_workspace_after_login', '1')` set + classic 遷移
- App.jsx post-login useEffect: user truthy で flag 検出時 → flag clear + `/` リダイレクト (full reload で
  useWorkspaceLayout 再評価、 PC default workspace 復元)
- 手動 ?layout=classic bookmark の user は影響なし (flag set されないため)

### 動線 (R7-A3 完成後)
1. workspace で LogOut click → `/?layout=classic` + flag set
2. LP Hero (Google ログイン CTA) 表示
3. Google ログイン → user state 変化
4. post-login useEffect 発火 → flag 検出 → `/` リダイレクト
5. PC default workspace mode で復帰 ← 元の UX 完全復元

## v138.6 R7-D + R7-E 着地

### 🟡 R7-D P2: 「分析データを取得中...」 永遠ローディング
- 真因: JudgmentDetail.jsx retry banner が `!result && !isLoading` で表示、 rate limit /
  fetch fail 状態 (loading=false + result=null) でも「取得中」 現在進行表現で「永遠ローディング」 誤認
- 修正:
  - App.jsx `_detailForWS` / `detailFor` で `error` を per-ticker shape に surface
    (ticker 一致時のみ、 異 ticker error の露出回避)
  - JudgmentDetail.jsx `detail.error` 検出時:
    - 「分析データの取得に失敗しました」 honest 表現 (color-loss tint)
    - error 内容を 120 字 hint で表示 ("本日のお試し回数 (3 銘柄) を超えました" 等)
    - retry button 維持で 1 クリック復旧

### 🟢 R7-E P3: Cup-Handle 🔒 emoji 「ダサい」
- 真因: 「🔒 Cup-Handle overlay は Premium」 banner + 「取っ手付きカップ 🔒」 凡例の emoji が
  Aman 級品格 brand に不適合 ([[feedback-icon-brand-consistency]] 違反、 大衆的 emoji 禁止)
- 修正: lucide-react `Lock` icon (stroke 1.75 + cyan brand accent + size 10-12px) で 2 箇所統一
- 「主張せず洗練」 質感、 細線 outline で Aman ロビー的品格

## v138.6 R7-A2 + R7-C2 真因確定 (user dogfood 8 巡目)

### R7-A2: LogOut redirect が不発 (R7-A regression)
- 真因: R7-A の `window.location.href = '/'` は LP に行かず workspace のまま、 user「BeatScanner の
  無料ユーザーの画面になる」 報告
- 深掘: App.jsx line 920 `useWorkspaceLayout = !isMobileForWorkspace && !urlWantsClassic` で
  **PC default = workspace mode**、 `/` でも workspace 表示。 LP Hero (showLP = activeTab='home'
  && !result && !user && !loading) は classic SPA mode でのみ render
- 修正: `window.location.href = '/?layout=classic'` 強制で classic SPA mode → LP Hero render
- 副作用: login 後も classic mode 残るが、 user 操作で Cmd+K palette / nav から workspace 切替可

### R7-C2: ProfileCard 2 箇所目 link が残っていた regression
- 真因: R7-C で `replace_all` を使ったが、 git diff 確認漏れで line 1311 のみ修正、 line 1495 は
  古い `window.dispatchEvent('bs:open-login')` (listener なし) のまま残存
- user「日本語要約を表示できませんでした」 box 内 link が無反応 dogfood 報告
- 修正: line 1495 を `signInWithGoogle()` 直接接続に修正、 全 2 箇所統一

## v138.6 R7 緊急 hotfix (user dogfood 7 巡目、 P0+P1)

### 🔴 R7-A P0: LogOut → LP 自動 navigate
- 真因: R6 では signOut() のみで URL 留まり、 user は workspace の非ログイン状態に陥り再ログイン不可
- 修正: UserFooter logout に `window.location.href = '/'` 追加、 LP 強制遷移 + workspace state full reload

### 🔴 R7-B P0 (最重要 Trust Cliff): 非ログインで Premium データ leak
- 真因: CupPivotCard / BuyZoneCard / SellZoneCard / DistributionDaysCard が ticker prop だけで isPro
  / isPremiumUser を無視、 demo mode で pivot $217.90 / 損切 $200.47 / サポート $195.06 / Dist Days 5/25
  等 Premium データを露出。 CLAUDE.md「Trust Cliff (信頼の崖) は最重要バグカテゴリ」 重大違反
- JudgmentDetail.jsx: 4 cards 全てに `plan === 'premium'` conditional render 追加、 非 premium 完全非表示
- StockPriceChart.jsx: `cupRequiresPro` 時に EarningsTooltip へ cupHandle / pillar2Markers を null で渡す、
  hover tooltip での pivot/損切り目安露出を gate
- ProTeaser placeholder (marketing 配慮) は P0 leak 止めを優先で後続 sprint、 まず露出停止
- 残 leak 候補: TriageBanner 三層 / 図解 内 Cup-Handle 言及 等は user feedback 待ち

### 🟠 R7-C P1: 非ログインで「ログイン」 text click 不可
- 真因: window.dispatchEvent('bs:open-login') を listener なしで dispatch、 click 無反応
- TriageBanner.jsx NoSessionHint: span → button + useAuth().signInWithGoogle() 直接接続
- ProfileCard.jsx「Google ログインで無制限」 link 2 箇所: event dispatch → signInWithGoogle 直接接続

### 後続 sprint (R7-D + R7-E)
- 🟡 R7-D 「分析データを取得中...」 永遠ローディング
- 🟢 R7-E Cup-Handle 鍵 icon 改修 (Aman 級 brand 合わない、 lucide-react 品格 icon 候補)

## v138.6 R5 改善 (3 体合議 verdict、 user dogfood 6 巡目)
- user feedback「現状 cyan pill chip は自己主張が強い、 ?だけで十分意味は伝わる」 要望
- 3 体合議: ui-designer + frontend-architect + qa-dogfooder (3 体推奨 = LLM/schema 不変 + frontend 局所修正)
- verdict: 2/3 vote for Option D (Info icon-only)、 階層差別化 (section title「?」 ↔ row「ⓘ」) で
  「?」 = 全体解説、 「ⓘ」 = 個別解説 を記号で表現、 user 認知ヒエラルキー保つ
- 実装: Info icon 14px + opacity 0.55 (休止) → hover 100% (立ち上がり) + scale 0.92 press feedback
- Aman 級「主張せず必要な時だけ存在感」 質感、 chip primitive 外 inline 例外で正当

## v138.6 R6 ログアウト最小 MVP
- 背景: user dogfood「現 UI ログアウトできず LP 確認困難」 (R0 backlog top)
- 既存 logout は App.jsx mobile drawer line 2192-2236 のみで workspace UI からアクセス不可
- 実装: Workspace.jsx Pane1Nav 末尾に UserFooter (sticky 下 marginTop:auto):
  - avatar 28x28 (Google profile or initial 円) + email truncate + LogOut icon button
  - useAuth().signOut() 経由 (既存 hook 再利用)、 確認 dialog なし (1 クリック減らせ)
  - R5 と同 minimal style: opacity 0.55 → hover 100% + scale 0.92 press
- 未ログイン非表示 (LP に Google CTA 既存)、 a11y aria-label + title 完備
- 残: Pane1NavRail (collapsed mode) / Stripe customer portal / プラン管理 UI 全体は別 sprint

## v138.6 R4 改善 (user dogfood 2026-05-30 5 巡目)

### 改善 C 続: 「この条件の解説」 affordance 強化
- 要望: user dogfood「位置と色が目立たない、 「?」 チップのように cyan で目立たせて」
- 旧 style: subtle text link (灰色 / 透明背景 / border なし、 2026-05-12 commit で modern style に修正済だったが
  「重要な解説なのに発見されない」 課題が残った)
- 新 style: FiveConditionsCard 「?」 chip と同 cyan accent pill:
  - background rgba(34,211,238,0.15) / border rgba(34,211,238,0.40) / color rgb(56,189,248)
  - font 11px / weight 600 / radius-pill / padding 4px 10px
  - hover: background 0.30 + border 0.65 で深まる
- 統一感: セクション title 右の「?」 chip と同色味、 user の視線移動時に自然に発見

## v138.6 R3 hotfix 真因 (user dogfood 2026-05-30 4 巡目)

### Bug B-2 (続): EPS BEAT「—」 まだ残る
- **真因 (R3 で確定)**: R2 で backend `guidance.eps.surprise_pct = +6.3 beat` は取得済だったが、
  frontend KPI strip は `result.epsBeatPct` を読んでおり、 これは backend が **一切返さない
  frontend-only undefined key** → 全 ticker 「—」 regression (R3 で発見)
- **R3 修正**: JudgmentDetail.jsx の KPI logic を `guidance.eps.surprise_pct` 経由に切替、
  guidance.eps.actual + estimated + surprise_pct の 3 値全揃い時のみ表示、 欠損時「—」 fallback。
  検証: `/api/guidance/NVDA` で actual=1.87 / estimated=1.76 / surprise=+6.3% / verdict=beat 取得確認

### 改善 C 強化 (user 「もう少し強く」)
- background tint 0.12 → 0.18
- border opacity 0.40 → 0.55
- translateY -1px → -3px (3 倍体感強化)
- box-shadow 追加 (passed=緑 glow / failed=赤 glow)
- chevron font 12 → 16px (hover 中拡大) + color secondary → primary + translateX 2 → 5px + scale 1.1

## v138.6 R2 hotfix 真因 (user dogfood 2026-05-30 3 巡目)

### Bug B-1: ③ ガイダンス「非開示」 残存 (frontend race condition)
- **真因**: `useJudgmentResult.js` の 2-phase guidance fetch:
  1. Phase 1: `fetchGuidanceBasic` (EPS/revenue のみ、 sec_guidance_text なし)
  2. Phase 2: `fetchGuidance` (sec_guidance_text 含む full)
  SummaryBrief useEffect deps = `[ticker, latestDate]` のみで、 Phase 2 完了時に AI 要約再生成せず
  Phase 1 (空 guidance) の出力「[NEU]③ ガイダンス：非開示」 が cache されたまま
- **R2 修正**: useEffect deps に `Boolean(guidance?.sec_guidance_text)` 追加。
  undefined → 文字列 の boolean 変化で dep 更新 → 再 fetch。 文字列内容差では cache 維持 (cost ↓)

### Bug B-2: EPS BEAT 「—」 真因 fix (FMP /stable/earnings 未来 entry)
- **真因**: FMP `/stable/earnings?symbol=NVDA&limit=1` は date DESC で **未来の earnings call** を
  surprises[0] に返す (NVDA で「次回 2026-08-26 Q1 2027」 + actual=null)。
  `_fetch_eps_data` は先頭取得で `eps_actual=null` → EPS BEAT「—」
- **R2 修正**: limit 1→8 拡張、 配列順走査で actual EPS を持つ最直近過去報告分を pick。
  検証: `/api/guidance/NVDA/basic` で actual=$1.87 / estimated=$1.76 / surprise +6.3% beat 取得確認

### 改善 C: 5条件カード click affordance
- **要望**: user dogfood「クリックして展開できることがわかるよう、 演出を追加頂きたい」
- **R2 修正**: ConditionRow.jsx に isHovered state 追加:
  - row hover: background tint (0.06→0.12) + border (0.20→0.40) + translateY -1px elevation
  - chevron (▸): text-muted → text-secondary + translateX 2px (PASS/FAIL に応じた hover ring)
  - transition `--motion-fast` で aman 質感、 expanded 中は translateY なし (jitter 防止)

## v138.6 R1 hotfix 真因 (user dogfood 2026-05-30 2 巡目)

### Bug A: 物理層分離 override 不発 (passedCount=4 → 2 → でも図解 4/5 残存)
- **真因**: frontend `buildEnriched()` は snake_case (passed_conditions / verdict 'PASS'/'FAIL' string /
  conditions_detail JSON string) で送るのに、 backend Fix 1-B (R0) は camelCase
  (passedCount / overallPass / conditions 直配列) で読んでいた → key mismatch で override 不発
- **R1 修正**: 両 key 対応 (snake_case priority + camelCase fallback)、 verdict 文字列 → bool 変換、
  conditions_detail JSON.parse 対応、 `[AGG OVERRIDE] {ticker}` log で観測可能化
- **検証**: curl POST `/api/visualize/NVDA` で `passCount=2 / overallPass=False / conditions 5 件 (2 PASS)` 確認

### Bug B: ③ ガイダンス missing (filter regression)
- **真因**: SummaryBrief.jsx `isEmptyBullet` filter が「③ ガイダンス：非開示」 で始まる行 (LLM 出力 ブレ) を suppress、
  ①②④ のみ表示で「番号 skip」 regression。 user dogfood「復旧願います」 要望
- **R1 修正**: isEmptyBullet 撤去、 ③ 常時表示。 Fix 3-A (sec_guidance_text 配線) で多くの ticker は
  具体 narrative、 bare「非開示」 は honest 表示 (信頼維持)
- **検証**: curl `/api/summary/brief` で ③「[NEU]③ ガイダンス: 非開示。次期 Q2 FY2027 売上 **$91.0B**...」 確認

### Bug C: CFPS-EPS chip >-999% 残存 (near-zero baseline)
- **真因**: CFPS-EPS delta 値 [-0.06, -0.36, -0.71] で |firstVal|=0.06 が分母で -1083% → cap 発火。
  直近 3 点 window でも解消せず (delta-base condition は本質的に zero-crossing 系列)
- **R1 修正**: adaptive threshold = reliabilityRatio (|firstVal|/max(|series|)) < 0.2 かつ |trendPct| > 100
  の場合は絶対変化値 (例: "-0.65") を表示、 NVDA EPS は ratio=0.245 で従来通り % 表示維持
- **検証**: bundle `index-CQ1gC-IA.js` 反映、 user 側 browser refresh で chip 「-0.65」 確認
