# Release 準備 Runbook (2026-06-04 autopilot 作成)

user が実行する release-blocker タスクの手順書。 **朗報: Stripe Premium も GA4/Clarity も infra は実装済**で、 大半は「コンソールで ID を取得 → Railway env に入れる → redeploy」 で完了する。

---

## 1. Stripe Premium 配線 (Trust Cliff blocker、 最優先)

### 現状 (autopilot 調査済)
- **backend**: `backend/app/main.py` L16760 `_STRIPE_PRICE_ENV` が既に `(premium, monthly) → STRIPE_PREMIUM_MONTHLY_PRICE_ID` / `(premium, yearly) → STRIPE_PREMIUM_YEARLY_PRICE_ID` を mapping 済。
- **frontend**: `startCheckout(plan, tier)` が tier 引数対応済 (`useSubscription.js` L64)。 `startCheckout('monthly', 'premium')` で Premium checkout が起動する (BacktestPage で実例稼働中)。
- **webhook**: `/api/stripe/checkout` + webhook (L16696) + `subscriptions.tier` 更新は稼働中。
- ⇒ **不足は env の price ID のみ** (+ LP の price 表示更新)。

### 手順
1. **価格を最終決定** (下記 §4 の推奨を参照)。
2. **Stripe Dashboard** で Premium product を作成 → monthly / yearly の price を作成 → `price_xxx` を 2 つ取得。
   - (test mode で先に作り、 動作確認後 live mode に複製推奨)
3. **Railway Service Variables** に追加:
   - `STRIPE_PREMIUM_MONTHLY_PRICE_ID = price_xxx`
   - `STRIPE_PREMIUM_YEARLY_PRICE_ID = price_yyy`
   - (Pro 用 `STRIPE_PRO_MONTHLY_PRICE_ID` / `STRIPE_MONTHLY_PRICE_ID` は既設のはず。 `STRIPE_SECRET_KEY` も既設)
4. **LP の Premium 列価格を更新**: 現在 `¥1,800` 表示 (LandingPage.jsx)。 決定額に変更 + 「近日公開」 teaser を外して実購入可能に。 ⚠️**LP 表示 = planGating = Stripe price を完全一致**させる (Trust Cliff)。
5. **planGating.js** の premium コメント/feature 確認 (現状 free/pro/premium の 3 tier 定義済、 premium 機能 gate は設定済)。
6. **redeploy** (`railway up`) → test mode で checkout → success redirect → `subscriptions.tier=premium` 反映を確認。
7. 動作確認後 live price ID に差し替え。

### ⚠️ 順序制約 (funnel-CRO Opus verdict)
- **Stripe 配線が物理的に先 → その後で screener/Cup-Handle の gate を強める** (D-2)。 逆順だと「lock されたが買えない」 dead-end Trust Cliff。
- Premium に機関データ (FMP Ultimate $99/月 必要) を載せるなら原価回収を意識 (過去合議: 機関データは Signature 専有案)。

---

## 2. Signature ¥10,000 tier (これは code 変更が必要)

⚠️ Premium と違い **Signature は未実装** (`planGating.js` に `PLAN.SIGNATURE` enum なし、 `_STRIPE_PRICE_ENV` に signature mapping なし、 LP に列なし)。 config だけでは動かない。
- 必要作業 (~1-1.5 人日、 過去合議 SSOT): `PLAN.SIGNATURE` + `_PLAN_RANK` rank=3 追加 / Supabase tier enum 拡張 / `_STRIPE_PRICE_ENV` に signature price 追加 / LP 列追加 / 各 feature gate 見直し。
- **推奨**: pre-release では Signature は **招待制 waitlist** で意向計測 (公開課金は DAU100 等の解除トリガー後)。 launch 時は Free/Pro/Premium の 3 (+Free=4) tier で十分。

---

## 3. GA4 / Microsoft Clarity 計測キー設定 (release 前必須、 計測は遡及不可)

### 現状 (autopilot 調査済)
- **コード実装済**: `frontend/src/lib/analytics.js` が `VITE_GA4_ID` / `VITE_CLARITY_ID` を読み、 設定時のみ load (未設定=no-op)。
- **Dockerfile 準備済**: L16-17 ARG + L29-30 ENV で VITE_GA4_ID / VITE_CLARITY_ID を build stage に橋渡し済 (VITE_ は build-time 変数のため必須、 既に対応済)。
- ⇒ **不足は Railway env の値のみ**。

### 手順
1. **GA4**: Google Analytics でプロパティ作成 → 測定 ID `G-XXXXXXXX` を取得。
2. **Clarity**: Microsoft Clarity でプロジェクト作成 → プロジェクト ID を取得。
3. **Railway Service Variables** に追加:
   - `VITE_GA4_ID = G-XXXXXXXX`
   - `VITE_CLARITY_ID = xxxxxxxxxx`
4. **redeploy** (`railway up`) — ⚠️VITE_ は build-time 展開のため env を入れただけでは反映されず、 **必ず再ビルド (railway up) が必要**。
5. 確認: 本番で `frontend/scripts/snap-analytics-runtime.mjs` (既存) or ブラウザ DevTools Network で gtag/clarity の load を確認。

---

## 4. 価格 = ✅確定 (user 承認 2026-06-04)

**Free / Pro ¥980 / Premium ¥3,980 / Signature ¥9,800** で確定 (funnel-CRO Opus review 推奨案 = 過去合議案に user 承認)。
- 採用理由: ¥3,980(中間) が Signature(¥9,800) の anchoring/decoy を効かせる + ¥9,800 は「1万円の壁」回避 (左桁効果)。
- **反映状況 (autopilot)**:
  - ✅ LP Premium 列表示 ¥1,800 → **¥3,980** 是正済 (「近日公開予定」 disabled のまま、 購入路なし=Trust Cliff 安全)。
  - ✅ planGating.js コメント更新済。
  - ⏳ Stripe Premium price は ¥3,980/月 で作成 (§1 手順)。 yearly は 2ヶ月 free なら **¥39,800/年** (user 確認推奨)。
  - ⏳ Signature ¥9,800 列は LP 未新設 (§2、 招待制 waitlist 推奨。 4列レイアウト + tier 実装は別 sprint)。
- **価格論より優先すべき CVR 本丸**: ①Free 内で AI図解を1回体験させる Aha 前倒し (現状 trial 弱点) ②件数表示+銘柄名 blur の飢餓感 gate (但し買える状態が前提=Stripe 先)。
- 詳細は handover v165 「価格/集客 review」 section 参照。

---

## 5. 法務 (専門家確認推奨)
autopilot scan 結果: §38 ガード (blocklist 45 regex + backend BAD-5/6) 稼働、 明白な景表法/§38 違反は source になし。 ただし **以下は専門家 sign-off 推奨**:
- LP 訴求コピー全般 (優良誤認)。
- 将来の Signature「自動執行 Co-Pilot」 positioning (§38 投資一任/助言 誤認 risk)。
- AI 生成 narration の edge case。
- 利用規約 / プライバシーポリシー。
