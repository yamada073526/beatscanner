# BeatScanner Handover v125 — Summary (lazy load 用、 30 行 SSOT)

> **作成日**: 2026-05-28 (full version: handover_2026-05-28_v125.md 783 行参照)
> **fetch-handover skill**: 本 summary のみで context 復元可能 (~5% context cost)
> **next session 詳細必要時**: handover_2026-05-28_v125.md (783 行) を Read

## 着地内容 (Pillar 2 戦略再設計、 33 commit + 16 deploy)

- **Sprint 1+4+5+6 + R1+R2+R3 hotfix**: AnalystTargetCard + SellZoneCard + Chart 4 本 ReferenceLine + 静的 dictionary (LLM 排除)
- **Phase 4-A Sprint 2.5 + 4-A-1〜4-A-4**: Pane 1 「スクリーナー」 Pane 完全実装 (default OFF flag `?pillar2_pane1=1` 下)
  - Sprint 2.5: rs_ratings.delta_1d_percentile backend + migration SQL
  - Sprint 4-A-1〜4: nav 追加 + ScreenerPane (Hero 3 section fetch + chip filter + demo blur + ProTeaser + error UI + retry)
  - WorkspaceHeader 既存 screener button flag-gated hide (entry 1 本化準備)
- **P5-1 unified endpoint** `/api/cron/scan-all`: cup_scan + rs_scan を asyncio.gather 並列 (24s/20 銘柄、 sequential vs 40% 時間短縮、 smoke test PASS)
- **testid audit 全完了**: 11 component に統一 (R3 hotfix lesson 横展開、 QA selector 安定化)
- **6 体合議 verdict 集約**: SPEC §11 patch 11 件 (Phase 4 着手前 user gate 3 待ち)

## user 帰宅後 即実行タスク (優先度順)

1. **本番 dogfood**: `https://beatscanner-production.up.railway.app/?layout=workspace&pillar2_pane1=1&tab=screener`
2. **Supabase migration apply** (必須): `docs/migrations/2026-05-28_rs_ratings_delta_1d.sql`
3. **`/api/cron/scan-all` user 確認** (P7-1 smoke test PASS、 production 動作確認済)
4. **railway.toml cron 統合判断** (P5-1 移行任意)
5. **Phase 4 着手判断 (gate 3)** + flag default ON 化判断
6. **A/B 件名 + マーケ launch punch line 選定**

## 復元手順 (任意 revert)

```bash
git reset --hard pre-pillar2-redesign-2026-05-28   # v124 完了時点
railway up
```

Tag: `pre-pillar2-redesign-2026-05-28` (b8380bf) + backup branch `backup/pre-pillar2-2026-05-28` (origin push 済)

## 新規 memory anchor (5 件、 永続化済)

- [[pillar2-technical-redesign]] (v125 全体 SSOT)
- [[feedback-sell-zone-static-dict]] (LLM 排除一択ルール)
- [[feedback-screener-hero-3sections]] (Pane 1 Hero 設計)
- [[feedback-diagram-card-remount-cache]] (mount 維持 / prompt cache 破壊予防)
- [[feedback-testid-all-render-paths]] (testid 全 state SSOT)

## 触ると危険 (v125 追加分)

- ScreenerPane.jsx の `isPillar2Pane1()` flag 関数 + Workspace.jsx / WorkspaceHeader.jsx 3 ファイル mirror
- backend cron_rs_scan + /api/scanner/rs の delta_1d_percentile fallback logic (migration 適用前後で挙動切替)
- /api/cron/scan-all は既存 cup-scan + rs-scan endpoint を await、 既存 cron entry 完全維持で risk 0

production bundle (P7-1 R1 hotfix 後): index-bXxCdCXp.js (frontend) + backend datetime import 修正済。
