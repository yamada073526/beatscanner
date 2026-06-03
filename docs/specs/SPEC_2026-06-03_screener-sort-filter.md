# SPEC 2026-06-03: スクリーナ結果の 並び替え + 絞り込み

> **status**: 3体合議 (UX/frontend/finance §38 全員 条件付き賛成) → **Phase 1 = RS スクリーナ並び替え ship 済** (v158, commit 1468986)、 **Phase 2 = sector/時価総額 絞り込み ship 済** (v159, autopilot 3体合議 SHIP-WITH-MINOR)。
> **Phase 1b = 見送り継続** (下記 §3)。
> 実装状況:
> - ✅ **Phase 1 (RS sort)**: RsScannerResults に並び替え dropdown (RSスコア順/SPY比順/RS変化順) + §38 中立 disclaimer。 deploy 済。
> - ⏸ **Phase 1b (他画面 sort)**: O'Neil (月5-15件&masked で値薄) / ファンダ passing (全5/5 で passedCount sort 無意味) / Cup (masked) は ROI 低く **見送り** → user が「全タブに欲しい」 なら別途。
> - ✅ **Phase 2 (sector/時価総額 filter)**: `/api/screener/universe-meta` endpoint 新設 (純データ・24h cache・LLM 非経由) + RS スクリーナに折りたたみ filter panel + sector chip (結果存在 sector の top6 data-driven + その他) + mcap帯 chip (大型≥$10B/中型$2-10B/小型<$2B, 各 count + 数値 tooltip + 基準日表記)。 3体 verdict 反映済 (UX: 折りたたみ default 閉 / finance: 0件明示 + 時価総額基準日 tooltip + 中立色 / frontend: module-scope memory cache + tab 切替 unmount reset)。 autopilot 3体合議 SHIP-WITH-MINOR で minor 3件 (count整合/0件chip非活性/reset comment) 反映後 ship。
>   - **scope 判断**: 絞り込みは RS スクリーナ限定 (~600件で navigability 最大課題)。 Cup/O'Neil は Premium mask で ticker 不可視 → 絞り込み不可、 ファンダは~15件で不要。 全タブ展開は user 希望時に別途。
> **trigger**: user 要望「スクリーナ機能拡張 (絞り込み/並び替え)」 + 当日の russell3000 universe 拡大
> (3000銘柄・小型株24%) で結果を navigable にする必要が顕在化。
> **対象**: `frontend/src/components/CustomScreenerPanel.jsx` (+ backend 軽量 endpoint 1 本)。

## 1. 背景 / データ在庫 (実装側調査済)
現スクリーナは signal種別タブ (funda/cup/breakout/rs/both/oneill) のみで、 **結果の sort も sector/時価総額 filter も無い**。
scan 結果の保持 field (Supabase 由来、 grep 確認):
- **RS** (`/api/scanner/rs`): ticker / rs_vs_spy_pct / universe_percentile / self_percentile / delta_1d_percentile / period_months
- **Fundamental** (`/api/custom-screener`): ticker / companyName / conditions / passedCount / latestDate / currency
- **Cup** (`/api/scanner/cup-handle`): ticker / pattern_type / pivot 等
- ⚠️ **sector / marketCap はどの結果にも無い** (rs_ratings / pattern_signals / earnings_evaluation に列が無く、 追加は Supabase migration=user SQL が必要)。

## 2. 設計 (2 part)

### Part A: 並び替え (SAFE-SHIP — 既存 field、 client-side、 backend 変更なし)
各 result type に sort control (chip or dropdown):
- **RS**: RS強い順 (universe_percentile desc, default) / RS急上昇順 (delta_1d_percentile desc) / SPY比大きい順 (rs_vs_spy_pct desc)
- **Fundamental**: 合致条件数順 (passedCount desc, default) / 決算が新しい順 (latestDate desc) / ticker abc順
- **Cup**: 検出が新しい順 (default) / pivot 近い順
- 実装: items 配列を `useMemo` で sort、 既存 state pattern。 §38/色ルール 無関係 (中立操作)。

### Part B: セクター / 時価総額 絞り込み (要 backend-additive endpoint、 migration 不要)
sector/mcap は結果に無いので **universe-meta endpoint** で供給:
- **新 endpoint** `GET /api/screener/universe-meta` → `{ "AAPL": {"sector": "Technology", "mcapBand": "mega"}, ... }` (company-screener の sector/marketCap を 24h cache、 universe 全銘柄分)。 schema 変更なし・LLM 非経由・純データ。
- frontend は起動時 1 回 fetch して map 化、 結果 ticker に join。 sector chip (Tech/Healthcare/Financial/Industrials/Energy/その他) + mcap帯 chip (大型$10B+/中型$2-10B/小型<$2B) で client-side filter。
- mcapBand 閾値: mega ≥$10B / mid $2-10B / small <$2B。

## 3. SAFE-SHIP vs DEFER 判定 (autopilot)
- **Part A (sort)**: SAFE-SHIP。 既存 field・client-side・低リスク・中立。 build+grep 検証 + 朝 dogfood (Premium gate で視覚は headless 不可)。
- **Part B (sector/mcap filter)**: 新 endpoint は backend-additive で curl 検証可だが、 chip 群の UX/レイアウトは設計判断 → **3体合議で査読**、 収束すれば ship、 懸念あれば DEFER。

## 4. §38 / Trust Cliff
- sort/filter は中立操作。 §38/景表法 risk なし。 marketing claim なし。
- ⚠️ filter 後「該当 0 件」 表示は既存 empty state を踏襲 (壊れない)。

## 5. 検証
- backend universe-meta: curl で sector/mcap 件数・cache 確認。
- frontend: build + 本番 chunk grep (sort label / filter chip の JP 文字列) + 朝 dogfood (Premium screener で sort/filter 動作目視)。

## 6. 関連
- SPEC_2026-05-27_russell3000-expansion.md (universe 3000 化、 本 SPEC の前提)
- screener skill / CustomScreenerPanel.jsx
