# SPEC 2026-06-04: Premium/login gate コンテンツの headless 視覚検証ハーネス (autopilot 完全自律化)

> **status**: 提案。 user 要望 (autopilot が Premium gate を視覚検証 → 改善起案 → 修正 → 2 周目検証 を人手 dogfood なしで連鎖したい)。
> **一回限りの human 前提タスクあり** (テスト Premium アカウント作成 + env 投入)。 それ以降は完全自律。
> **対象**: `frontend/scripts/lib/auth-helper.mjs` (新規) + 既存 `snap-*.mjs` / `snap-pdca-loop.mjs` / `snap-vision-eval.mjs` への組込。 **production app は不変** (既存の Supabase auth + Pillar2 flag を流用)。

## 1. 真因 / 現状把握 (調査済)
- headless Playwright (snap-*.mjs) は **未ログイン** → 認証必須コンテンツが demo/未ログイン表示になる (これが「Premium gate 視覚検証不可」 の正体、 技術的限界ではない)。
- **既に動く部分**:
  - スクリーナータブ = `isPillar2Pane1()` (`WorkspaceHeader.jsx`/`Workspace.jsx`) は **URL `?pillar2_pane1=1` or localStorage** で ON、 **認証不要**。
  - tier 模擬 = `snap-cup-handle.mjs` が `localStorage bs_pro=1` をセット (frontend gating の一部に効く、 ただし backend mask は Authorization header 依存なので不完全)。
  - `BYPASS_TOKEN` = demo rate limit (3 req/IP/day) skip 済 ([[feedback_bypass_token]])。
- **Premium 判定の本流** (`useSubscription.js` + `App.jsx`): `isSubscribed` = Supabase `subscriptions` テーブルの status∈{active,trialing} / `isProUser=isSubscribed` / `isPremiumUser = isSubscribed && subscription.tier==='premium'`。 = **要 (a) ログイン user + (b) subscriptions 行**。
- backend Cup mask は Authorization header (user JWT) で判定 → **ログインすれば frontend+backend 両方の gate が解ける**。

## 2. 解決策: テスト Premium user の Supabase session を headless に注入
標準 E2E 認証パターン。 **bypass flag ではなく実在テストアカウントの実セッション** = security hole なし (production に `?force_premium` の類を一切足さない、 Trust Cliff ゼロ)。

### 共有ヘルパー `frontend/scripts/lib/auth-helper.mjs` (新規)
- env から test creds: `DOGFOOD_TEST_EMAIL` / `DOGFOOD_TEST_PASSWORD` (+ 既存 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)。
- `@supabase/supabase-js` の `signInWithPassword(email, password)` → session 取得 (毎回 fresh login で token 期限切れ回避)。
- 返却: localStorage key = `sb-<project-ref>-auth-token` (ref は VITE_SUPABASE_URL から抽出) + value = session JSON。
- 失敗時 (creds 未設定) は `null` を返し、 呼出側は「未認証 = demo 検証に fallback」 (graceful、 既存挙動維持)。

### snap-*.mjs / snap-pdca-loop / snap-vision-eval への組込
```js
import { getAuthInjection } from './lib/auth-helper.mjs';
const auth = await getAuthInjection(); // null なら demo モード
if (auth) await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [auth.key, auth.value]);
// 既存: ?pillar2_pane1=1 を URL に付与 (スクリーナータブ表示)、 BYPASS_TOKEN header も従来通り
```
- `--premium` / `--authed` フラグ (or env) で「認証あり検証」 を明示選択。 default は既存の demo 検証 (後方互換)。

## 3. 一回限りの human 前提タスク (autopilot 着手前に user が実施)
1. **専用テスト Premium アカウント作成** (user 本人の実アカウントは使わない): 任意 email + password で Supabase Auth に signup。
2. **subscriptions 行を INSERT** (SQL Editor、 GRANT 注意 [[feedback_supabase_grant_bug]]):
   ```sql
   insert into subscriptions (user_id, status, tier)
   values ('<test-user-uuid>', 'active', 'premium');
   ```
   (実際の列は subscriptions schema に合わせる。 Stripe 連携列があれば NULL 可かを確認 = SPEC §要確認)。
3. **env 投入**: ローカル snap 用に `frontend/.env` (gitignore 済) + cron/CI 用に Railway env または GH Actions secret に `DOGFOOD_TEST_EMAIL` / `DOGFOOD_TEST_PASSWORD`。 **絶対に commit しない**。

## 4. 検証 (autopilot が実施)
- `auth-helper.mjs` 単体: signInWithPassword 成功 → session 取得を console 確認。
- snap で `?pillar2_pane1=1` + auth 注入 → スクリーナーが **Premium 表示** (Cup 全件 unmask / ProTeaser 非表示 / ウォッチ追加済 state) で描画されることを screenshot 確認。
- vision-eval (Pane3 3 run mean) + snap-pdca-loop が gated view を採点・PASS/FAIL 判定できることを確認。
- ⚠️ visual harness 4 条件遵守 (headless / 60s teardown / .visual 出力 / preview server 起動なし)。

## 5. これで autopilot が連鎖できるループ
1. 実装 → 2. headless 認証 snap で gated view を vision-eval 採点 → 3. FAIL なら root_cause_hint で改善起案 → 4. 修正 → 5. 2 周目 snap 採点 → PASS まで loop。 人手 dogfood は「最終 sanity の保険」 に格下げ (cycle 停止による時間損失を解消)。

## 6. scope / リスク
- **production app 変更ゼロ** (既存 Supabase auth + Pillar2 flag を流用)。 harness infra のみ。
- security: 実テストアカウントの実 session = bypass でない。 token は env のみ (非 commit)。 BYPASS_TOKEN (rate-limit) とは別物・補完。
- 限界: LLM を呼ぶ詳細分析 (図解生成等) は実 API cost + latency が出る (BYPASS_TOKEN で rate-limit は skip 可、 cost は実発生)。 vision-eval は静止 PNG なので motion 軸は 3 run mean 必須 ([[feedback_vision_api_noise]])。

## 7. 要 user 確認
1. subscriptions テーブルの実 schema (Stripe 連携列の NULL 許容 / tier 列名)。
2. テストアカウントを user が作るか、 autopilot に作らせるか (Auth signup は API 可だが email 確認フローがあると headless で詰まる → user 作成が確実)。
3. env 投入先 (ローカルのみ先行 / Railway / GH Actions secret)。

## 関連
- [[visual_harness_exception]] (snap-*.mjs 4 条件) / [[feedback_bypass_token]] (rate-limit skip) / [[feedback_ai_diagram_visual_harness]] (DiagramCard preview build) / [[feedback_vision_api_noise]] (3 run mean) / `scripts/snap-pdca-loop.mjs` (PDCA harness) / `scripts/snap-vision-eval.mjs`。
