# BeatScanner ファネル定義

```
LP (showLP=true)
  ├─ Hero: キャッチコピー + CTA (未ログイン時のみ、 表示条件 !result && !user)
  ├─ SampleAnalysisSection: gainers → PASS 5/5 → 4/5 → static fallback
  ├─ ProTeaser: 「市場の声」 mockup の代替、 Premium 解禁訴求
  └─ 銘柄クリック → handleLPTickerClick (demo モード対応)
        ↓
分析実行 (IP ベース rate limit、 数値は backend/app/main.py 参照)
  ├─ prefetchAll (CLAUDE.md「プリフェッチ運用」参照)
  ├─ 結果 cache: useRef(Map) で短時間 TTL
  └─ 結果表示 (workspace mode Pane 3)
        ↓
Pro 課金 (Stripe、 動作確認は test mode)
  ├─ ProTeaser onUpgrade コールバック
  ├─ Premium 機能 (Cup-Handle / 通知 / 過去 backtest 等)
  └─ 価格は `frontend/src/components/ProTeaser*.jsx` および LP の価格表示が SSOT
```

## 必須 invariant

実装変更時に必ず保つ規則:

- LP の銘柄クリックは必ず `handleLPTickerClick` 経由 (`runAnalyze` 直接呼びは demo モード破壊)
- Hero ブロックの表示条件は `!result && !user` (`showLP` でなく `user` で判定)
- 結果 cache (useRef Map TTL) は F5 で消える設計、 SSR 化禁止
- 動的 ticker クリックは `handleLPTickerClick` (CLAUDE.md「Trust Cliff」 必須要件)

## 数値・閾値の SSOT

| 項目 | SSOT |
|---|---|
| prefetch endpoint 数・対象 | CLAUDE.md「プリフェッチ運用」 |
| 結果 cache TTL | `frontend/src/App.jsx` の `useRef(new Map())` 初期化箇所 |
| rate limit (req/IP/day) | `backend/app/main.py` の `/api/analyze` 実装 |
| Pro 価格 | `frontend/src/components/ProTeaser*.jsx` |
| Sample Pass cache TTL / fallback policy | `memory/feedback_sample_pass_design.md` |

skill 内に数値ベタ書きしない。 SSOT 側更新で stale 化するため。
