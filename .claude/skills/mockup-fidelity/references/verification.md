# 検証手法 (computed-style diff & ground-truth)

> SKILL.md Phase 1b / 4 / 5 の詳細。3 体レビュー (検証技術) の失敗モード対策を反映。
> harness 例外 4 条件 (headless / 60s hard timeout + finally close / `.visual/` 出力 / 本番URL or file:// のみ) は CLAUDE.md を遵守。

## 目次
- 基本: 2 ページ実測比較
- color/transform/数値の正規化と許容誤差
- 失敗モード対策 (context汚染 / DPR / アニメ / cache / auth / sentinel)
- harness の使い方
- Phase 4 検証手順
- Phase 5 preview-before-ship

---

## 基本: 2 ページ実測比較

mockup (file://) と実装 (本番) を **別々の browser context** で開き、element-map の対応要素ごとに `getComputedStyle` の resolved 値を実測比較する。コード読みが見逃す差分を ground-truth で捕捉し、token 間接参照による false positive を排除する。

取得フィールド (最低限): `boxShadow / color / backgroundColor / borderColor / borderRadius / fontSize / fontWeight / lineHeight / letterSpacing / padding / gap / transitionDuration / transitionDelay / transform / zIndex / position / overflow`。

---

## color/transform/数値の正規化と許容誤差

ブラウザ環境で serialization 形式が変わる (`color(srgb r g b)` ⇔ `rgb()` ⇔ `rgba()`)。`color-mix`/`oklch` の resolved 値も環境依存。**比較前に正規化**:

- **color**: CSS Color 4 全形式を `[r,g,b,a]` の 0-1 float へパースして比較。許容誤差 **±0.005** (≒1.3/255)。形式差だけの false positive を排除
- **transform**: `new DOMMatrix(value)` で `scaleX/scaleY/translateX/translateY` に分解。許容 scale **±0.002** / translate **±0.5px**
- **spacing/radius/font**: サブピクセル丸め吸収で **±1px** (DPR2 は ±0.5px)。**2px 以上の差は有意差**として記録
- **duration/delay**: GC ジッターで ±5ms ブレる → **3-run 中央値**。color/spacing/radius はアナログ値で 1-run 十分

これらの正規化は harness script に実装済 (下記)。

---

## 失敗モード対策

- **context 汚染**: mockup と本番を**別 `browser.newContext()`** で開く (localStorage 注入が file:// に漏れるのを遮断)。`deviceScaleFactor` は両 context で統一
- **DPR**: 既定 `deviceScaleFactor: 1`。DPR 依存 media query を見る時のみ 2、その際 mockup 側にも同 DPR 想定 CSS があるか確認
- **アニメ途中**: 固定 `waitForTimeout` を避け、`transitionDuration` を読んでから `duration*1.5+100ms` 待つ。keyframe は Web Animations API `getAnimations()→commitStyles()` で final 値。`newContext({ reducedMotion: 'no-preference' })` を明示 (環境の reduce 設定で transition が即完了し duration=0s になるのを防ぐ)
- **cache**: Phase 4 では snap 前に **bundle hash 変化を assert** (`curl | grep index-*.css`)。`newContext({ extraHTTPHeaders: { 'Cache-Control': 'no-cache' } })` + `goto(..., { waitUntil: 'networkidle' })`
- **auth 失効**: Supabase JWT は ~1h TTL。Phase 1→4 が長時間なら snap 直前に `getAuthInjection()` を再取得。file:// への localStorage 注入は `addInitScript` でなく `page.evaluate(()=>localStorage.setItem(...))` が確実
- **データ未ロード**: 要素存在 (`waitFor`) でなく element-map の `data_sentinel` を `waitForFunction` で待ってから取得

---

## harness の使い方

reusable script: `frontend/scripts/snap-mockup-diff.mjs` (config 駆動・実在 SSOT)。
```bash
cd frontend && set -a && . ./.env && set +a   # auth (DOGFOOD_TEST_*) を環境へ
node scripts/snap-mockup-diff.mjs <config.json>
```
config.json (screen 固有): `{ mockupUrl(file://), prodUrl, viewports[], auth(bool), pairs[{name, mockupSel, prodSel, sentinel?, states?[]}] }`。
出力: `frontend/.visual/csdiff-<screen>.json` に pair × viewport × state ごとの mockup/prod 値 + 正規化 diff 判定。**SKILL.md Phase 1b/4 の ground-truth はこの JSON**。

画面固有の到達操作 (mode 切替・accordion 展開・hover 等) が要る場合は、本 script を雛形に `frontend/scripts/snap-<screen>-*.mjs` を派生作成可 (visual harness 例外内)。

---

## Phase 4 検証手順 (deploy 後)

1. bundle hash が deploy 前後で変化したか assert (`curl`+grep)
2. bundle grep で修正文字列 (JP ラベル / token 名) が反映
3. `snap-mockup-diff.mjs` 再実行 → 修正対象 pair が mockup と許容誤差内
4. 全 render path (testid 全 state) に反映 (`feedback_testid_all_render_paths`)
5. copy occurrence 単一 (`grep -n '<文言>'`)

1 つでも fail → Phase 3 へ戻る。「修正したつもりで効いていない」を 1+3 で確実に捕捉。

---

## Phase 5 preview-before-ship (条件付き)

**対象**: `display/grid/flex/position/width/height` 変更 / `.panel-card`/`.bs-panel`/`.surface-card` 系への追記 / 2+ component 波及 / sticky・fixed・z-index 変更。pure text/color token 置換は skip 可。

**前提**: Phase 3 の `design-system-check` + 発光 exit-condition が PASS 済 (preview は layout 確認専用。token 違反の解消は Phase 3-4 で完了)。

**手順**: snap で本番ページに候補 CSS を `page.addStyleTag({content})` 注入 → 対象 viewport で screenshot + computed 再測定 → 折返し/破綻が無いことを確認してから commit→deploy。`addStyleTag` は specificity が最高になりがちなので、preview 通過を design-system-check 代替にしない。
