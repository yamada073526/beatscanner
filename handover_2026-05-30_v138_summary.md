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

### v138.6 + R1 + R2 hotfix commit
| ver | commit | bundle | 内容 |
|---|---|---|---|
| v138.6 | 1a8118e | `index-usR8f65Q.js` | 物理層分離 SSOT 復活 + sparkline 窓統一 + AI 要約 sec_guidance 配線 |
| v138.6 R1 hotfix | 0f459bf | `index-CQ1gC-IA.js` | payload key naming mismatch / ③ 復旧 / CFPS-EPS adaptive threshold |
| v138.6 R2 hotfix | 63173ca | `index-DrerytzW.js` | SummaryBrief 2-phase race / EPS BEAT FMP 未来 entry skip / 5条件 click affordance |

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
