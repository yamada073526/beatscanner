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

## 本日 v138 commit (1 commit)

| ver | commit | 内容 |
|---|---|---|
| v138 | (本 commit) | Phase 2 SPEC v2 ($99/月 課金回避) + LP subtitle「部門別売上や予想比較まで日本語で」 + handover v138 |

**累計 v130-v138**: 10 commit、 v138 で「過大見積もり SPEC を audit で実態に修正 + 既存実装活用」 の運用 SSOT 確立。
