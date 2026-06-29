# SPEC: Pane3 改善 実装（mockup v4 準拠）

- 作成: 2026-06-29
- 正本 mockup: `docs/specs/mockups/pane3-full-v4.html`（user 承認済）
- 設計判断の根拠: 3視点サブエージェントレビュー（UX認知負荷 / frontend一貫性 / 投資家dogfood、全員一致）+ KB（`investment-knowledge-base/.../trading.md`）
- 実装規律: 自分で実装（委託しない）/ origin/main 基点 worktree / build+lint(no-unused-vars 0)+vitest / deploy=PR経由（merge は user 承認 gate）/ §38 色信号OK・買い推奨NG / 投資業界色 / 発光系 danger zone は触らない

## 確定した設計判断
1. **時系列の向き = 直近=右で統一**（成長トレンド・5条件履歴・§②sparkline）。株価チャートと同方向。直近バーを強調 + 「8Q前→直近」明示。
2. **§② 推移 = 常時 sparkline + hover で各Q値、指標で出し分け**。推移必須（成長率・マージン・加速度）=sparkline / 単一値（ROE 等、KB「構造は変わらない」）=値+矢印のみ。クリック展開は不採用（screener→Pane3 で手間）。既存 `ConditionSparkline` 再利用。
3. **WS2 8Q tooltip = 3点 beat（EPS/売上/ガイダンス）+ 良い決算判定**（KB「3点すべてコンセンサス超えで良い決算、1つでも下回れば悪い決算」）。tier: free=YoY+Beat/Miss、数値詳細(実績/予想/surprise)=Premium。
4. **クリック affordance = 控えめ hover（bg-hover + border-strong、lift/glow なし）** を判定サマリー bucket/mini・5条件行・nav に一貫適用。
5. **RS = IBD 数字のみ**（対SPY% fallback 廃止）。
6. **5条件 展開グラフ = hover で各Q値+根拠 tooltip**。

## ⚠️ レビューで判明した「非バグ」（実装時に壊さない）
- **ConditionSparkline は既に直近=右**: Lens B は「reverse 漏れで直近=左」と主張したが、backend ground-truth 確認の結果、newest-first は `screener_fundamentals` の series（main.py:23464）であって **Pane3 の condition.series ではない**。ConditionSparkline の内部ロジック（TrendChip コメント「2期前→直近」/ lastValidIdx=最新点）は oldest-first 前提で整合 → 既に直近=右。**触らない**。post-deploy で実描画を snap 確認のうえ、万一 直近=左 なら別途修正。
- **hero セクターchip 間隔**: real Hero（Hero.jsx:240-258）は sector pill を id-meta 行（カウントダウンと並列）に既に適切配置。「間隔不自然」は **mockup 固有のアーティファクト**（mockup v2 で修正済）。real は変更不要。

## Sprint 分割
- **Sprint 1（本 PR・frontend 即効）**: RS 表記を IBD 数字のみに統一（`L1SummaryBuckets.jsx`）。
- **Sprint 2（frontend）**: クリック affordance（判定サマリー bucket/mini・5条件行）。inline style のため hover は JS state か CSS class 化を要検討（inline bg は class :hover に勝つ点に注意）。nav は実装済。
- **Sprint 3（frontend・既存データ）**: WS2 8Q tooltip（EPS/売上 YoY + Beat/Miss、quarterly-history 既取得）/ §② sparkline 出し分け（既存データ分: 機関保有4Q trend は backend 返却済・未活用、OCF 4Q）/ 直近バー強調 + 向き明示 / 5条件展開 hover tooltip。
- **Sprint 4（backend 依存）**: guidance_verdict per Q（3点 beat の「ガイダンス」+「良い決算連続」）/ screener_fundamentals を §② へ配線（eps_yoy/rev_yoy/ocf_margin/gross_margin/eps_cagr_3y/ocf_gt_netincome）/ §② 8Q 履歴 / 成長加速度。screener セッションと条件名を 1:1 同期。
- **Sprint 5（frontend・既存 component の磨き）**: ⑤その他 各 fold の collapsed 要約動的化 + 展開内容拡充（AnalystPanel/InsightsPanel/EarningsReactionPanel/InsiderPanel/ContextSection は実装済、要約・period 等の補強）。③テクニカルは実装が既にリッチ（PriceLadder/ReturnGrid 等）= mockup を実装に寄せて確認のみ。

## 各 Sprint の受け入れ条件（共通）
- build OK / eslint no-unused-vars 0 / vitest pass / design-system-check 違反0（token 経由・raw hex/shadow/未許可!important なし）
- post-deploy: 本番 authed snap で該当箇所を実測 + screenshot 目視（§38 色・投資業界色の確認含む）
