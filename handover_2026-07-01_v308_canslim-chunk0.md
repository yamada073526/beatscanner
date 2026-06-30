# Handover v308 — canslim chunk-0 mega-cap coverage fix 完全着地（PR #146 merge + 本番検証済）

> 作成 2026-07-01。branch = `claude/handover-2026-07-01-v308`（handover 専用・出先再開用）。
> 前セッション v307 の SPEC（`docs/specs/SPEC_2026-07-01_canslim-chunk0-megacap-coverage.md`）を
> 実装 → 6体 gate ×2 → PR #146 merge → 本番検証まで完走した**完了記録**。

## このセッションの成果（chunk-0 fix 完全着地・確定）

### 🎯 PR #146 merge 済（main HEAD `330c13d`）+ 本番検証 4 gate 達成
- **真因**: chunk 0（market-cap top250 = AAPL/MSFT/NVDA 等 mega-cap）が `_fetch_market_cap_top_n` の
  **cache miss**（FMP screener fetch + sp500 anchor union）を per-ticker と同じ Railway ~5min gateway 窓で
  背負い 502 → mega-cap 全カラム欠落（南京錠フィルタで silent 除外 = Trust Cliff）。offset≥250 は cache hit で完走。
  ※ ②③ batch pre-fetch は chunk slice 後 250件に走るため chunk 0 でも重さ同じ = **fix のターゲットは ① cache miss**。
- **修正**（6体 design review 着手前+ship前 gate 通過・**両回とも反対ゼロ**）:
  1. **warmup endpoint** `/api/cron/canslim-warmup`（chunk loop 前に universe cache prime・`main.py` +49/0 既存不変）
  2. `nightly_scan.yml`: warmup step（cup-scan 前）+ canslim chunk retry（上限1・二重加算回避・linear backoff）
     + freshness gate に mega-cap cfps non-null hard-fail（6銘柄 AAPL/MSFT/NVDA/GOOGL/AMZN/META・≥4 null で fail）
     + timeout 90→120min
- **本番検証（deploy 後 ground truth・全て実測）**:
  1. ✅ warmup `elapsed_sec` = **2.07s**（5min 予算の 1/145・方針 A 根治確定・「warmup も 502」懸念を否定）
  2. ✅ chunk 0 完走 = **HTTP 200・processed 250・upserted 249・212s**（旧: 502/processed 0）
  3. ✅ DB 直 SELECT（calc_date=2026-06-30）: mega-cap 全6 cfps **non-null + null_reasons クリーン**
     （AAPL 0.996 / MSFT 1.337 / NVDA 0.855 / GOOGL 1.246 / AMZN 1.797 / META 1.915・起動 ground truth と一致）
  4. ✅ Trust Cliff payload 論理保証: MSFT/GOOGL/AMZN/META が南京錠（cfps>1.0）通過、AAPL/NVDA は<1.0 で**正しく除外**
- cfps_nonnull 件数: deploy 前 mega-cap 群 0 → 復活（universe payload 全体で 1278 件・南京錠通過 1131 件）。

### 🚧 残タスク（本 PR 範囲外・推奨着手順）
1. **frontend 南京錠トグルの視覚確認（authed snap）** 〔gated: 視覚は user gate〕
   - `frontend/scripts/snap-cfps-eps-toggle-prod.mjs` は**未ログインで rows=0**（screener が demo/auth gate で結果テーブル未描画、
     or screener_v2 の row selector 不一致）。トグル off→on は効く・console_errors=0。
   - → auth harness（memory `feedback_auth_harness_vision_eval`）経由で **MSFT が南京錠 ON で画面に出るか**を視覚 gate。
     v306「朝の視覚 gate」の領域。データ層（payload で mega-cap 南京錠通過）は確定済なので残りは見え方の裏取りのみ。
2. **次回 nightly（08:07 JST）後の確認** 〔1-shot で観察〕
   - GHA run で warmup `elapsed_sec` + canslim chunk 0 `http=200` + **freshness gate mega-cap chk PASS** を確認
     （手動 scan でなく nightly 経路で warmup が効くか・in-memory cache が同一 process で共有されるか）。
3. **follow-up TODO（SPEC §9.8・実害ほぼゼロ・任意）**
   - GOOGL/GOOG fallback: freshness gate sentinel を `select(.ticker=="GOOGL" or .ticker=="GOOG")` に
     （universe に GOOGL 存在を payload で確認済 + 過半数判定≥4 が吸収のため実害ほぼゼロ）
   - 能動通知（Slack/PagerDuty）+ mega-cap 欠落率 historical tracking（業界水準への次の改善）
   - canslim-scan russell3000 default 1000→3000 統一（任意・別 PR・per-ticker endpoint を触る）

## 厳守事項
- **entanglement**: pane3 = `claude/technical-buy-zone-l4-vdxl5d` 並行・**触らない**（JudgmentDetail.jsx / index.css / buyZone*）
- `git add -A` 禁止（特定ファイルのみ stage）/ push はブランチ明示 / deploy=PR squash→Railway auto→/health commit+bundle grep
- 検証=ground truth（pytest + DB 直確認 + 実 run）。LLM 判定 / grep ヒット / processed_count を「機能した」証拠にしない
- 6体 multi-review（重要設計の着手前+ship前）/ §38 色ルール・件数 SSOT 不変 / aggregator は LLM 不可
- pytest は venv 必須（`cd backend && .venv/bin/python -m pytest`・既存 .venv あり）
- 重い文脈で effort max は崩壊リスク → 冒頭で `/effort max`、崩れたら英語数語+単一 tool

## 在席状況記入欄（次セッション開始時に user 記入）
- [ ] 在席で gate 都度確認
- [ ] 不在で default 自律（残タスク 1→2→3 の順、視覚 gate のみ user 判断待ちで保留）
