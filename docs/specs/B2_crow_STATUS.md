# B-2「.crow 統一」現状ステータス（autopilot 中断・clean session で仕上げ）

更新: 2026-06-23 深夜 autopilot。**実装は適用済み・build 通過まで検証済み**。残りは視覚/設計検査と user 承認 commit。
次セッションは **clean context で本ファイル + `B2_crow_impl_ready.md` を読んで再開**。

## ✅ 検証済み（autopilot で確認した事実）
- sub-agent（general-purpose/sonnet, agentId **af59ee9f9dc9e0dda**）が `B2_crow_impl_ready.md` の Edit 1-5 を**実際に適用**。
- `cd frontend && npm run build` → **`BUILD_EXIT=0`（通過）**。ログ: `/tmp/b2_build.log`。
- 適用痕跡 grep: `CROW_BINARY_META`=1 / `renderCrow`=3 / `index.css` の `screener-conds`=4。→ JSX + CSS 両方入っている。

## ⚠️ 未検証（次セッションが clean context でやること）
1. **git diff 精査**: `git diff -- frontend/src/components/CustomScreenerPanel.jsx frontend/src/index.css` を読み、`B2_crow_impl_ready.md` の意図通りか確認。特に:
   - screenerV2 パス本体(旧 1161-1379)が `.screener-conds` 構造へ正しく置換され、**adv toggle bar と lockbar が残っている**か
   - 旧 binary chips / 旧 adv-rows / 旧 category 見出しが**重複して残っていない**か
   - refine ヘッダーの「該当 N 銘柄」live count の ml-auto 競合が解消されているか
   - gate badge が adv ON 時に残っているか（B-2 現状維持）
2. **legacy 不変確認**: legacy パス（`legacy (screenerV2=false` ・旧 1380-1428 付近）が無改変か git diff で確認（**最重要・触ったら NG**）。
3. **design-system-check** skill: raw hex / 未許可 !important / 発光バグ兆候 / `color-mix(var(--color-accent) 32%)` が許容されるか。
4. **snap 視覚確認**: `frontend/scripts/snap-screener-*.mjs` 群で screener_v2 ON（Free/Pro 両方）。`.crow` 2列グリッド・トグル・値チップ・grouphd trailing line が mockup v8 通りか。本番 or `file://dist/index.html`。**preview server 禁止**。
5. **§38/色チェック**: 値チップ・ラベルに polarity 色や「買い」断定がないか（「買い場圏」状態語は OK）。

## 仕上げ DoD
- 上記 1-5 をパス → **git diff を user に提示 → 承認 → 単一 commit**（明示 path `git add frontend/src/components/CustomScreenerPanel.jsx frontend/src/index.css`・`git add -A` 禁止）。
- **commit メッセージ案**: `feat(screener): B-2 全条件を .crow トグル+値チップ 2列グリッドへ統一（mockup v8 忠実）`（co-author 行付き）。
- deploy は `git push origin main`（Railway auto-deploy）だが **user 承認後**。

## 次の Phase（参考・handover v256）
- B-3: adv ON で grade `.crow` に mseg 展開 + gate 南京錠 + 準備中条件グレー化（funnel-cro verdict 必須）
- B-4: preset→conds 動的切替 + 件数連動 + extra 6箇所配線（effort max 推奨）

## 触らない（厳守）
- `itemPasses`/`PRESET_CONDS`/`PRESET_PREDICATES`/`buildActiveGrades`（数値物理層）/ legacy パス / sticky 検索バー / 発光系。

## 教訓（permanent 化候補・feedback_toolcall_plaintext_corruption.md へ追記検討）
1960行級ファイルを offset/limit 違いで多数回 Read + 複雑 Bash echo を重ねると main context 過重で tool-call が崩壊する。**大ファイル中核改修は最初の調査段階から sub-agent に委譲し、main は SPEC とサマリーだけ保持する**のが正解（handover「main 直接実装が安全」は context に余裕がある前提）。今回は崩壊後に sub-agent 委譲へ切替えて着地できたが、最初からそうすべきだった。
