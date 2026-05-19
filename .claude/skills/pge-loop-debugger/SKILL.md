---
name: pge-loop-debugger
description: |
  BeatScanner PGE 3 体ループ (planner / generator / evaluator) の運用で繰り返し発生する
  落とし穴を機械的に防ぐスキル。
  「PGE loop が空回りする」「Generator の成果が次 sprint に継承されない」
  「Evaluator L3 が PASS なのに本番で動かない」「ES module top-level return SyntaxError」
  「getAnimations().finish() で infinite animation error」
  「snap-*.mjs が timeout する」と依頼された際、 または PGE 自律 loop 起動前後に使用する。
  v86 で初遭遇した 4 件の落とし穴を SSOT 化。
---

# pge-loop-debugger スキル

## 目的

PGE 3 体自律 loop (`planner` / `generator` / `evaluator`) で **v86 dogfood で初遭遇した 4 件の落とし穴** を機械的に防ぐ。

PGE 自律性を信用しすぎない。 v86 で 2 SPEC + 6 hotfix commit / c5e4479 着地に至った教訓を skill 化。

---

## いつ呼び出すか

- `/planner <要望>` で sprint 群を生成する前 (落とし穴 1 の sprint 越し file 触り判定)
- `/generator <SPEC> <sprint>` 起動前 (落とし穴 1 の前 sprint consolidation 確認)
- `/evaluator <sprint>` 結果が PASS なのに dogfood で fail した時
- `frontend/scripts/snap-*.mjs` を新規追加 / 編集する時
- production HTML を curl + grep で selector 不在を発見した時
- ブラウザ console で `Illegal return statement` / `InvalidStateError: Cannot finish Animation` を見た時

---

## 4 つの落とし穴 (v86 SSOT)

### 落とし穴 1: 各 sprint worktree は main から独立 branch するため累積しない

`git worktree add` で新規 branch (`claude/<spec>-sprint<N>`) を **main から fresh に切る**。 sprint N+1 の worktree には sprint N の uncommitted 変更が **継承されない**。

**v86 事例**: Sprint 2 で `Hero.jsx` / `SectionDivider.jsx` に data-testid を追加 → Sprint 3 Generator は main から fresh branch したため見えず → 手動 grep + cp で抜け落ち判明。

**対策**:

1. SPEC が複数 sprint で **同一 file を触る場合**、 各 sprint 完了時に **必ず main に consolidate (commit)** してから次 sprint 起動
2. Generator に「前 sprint の変更を継承」 と指示しても無理 (worktree が main から切られる)
3. Planner 段階で「同一 file を複数 sprint で触る計画」 を検出 → SPEC に「sprint 間 commit 必須」 を明記
4. PGE skill 自体に hook 追加候補 (sprint 完了時 auto-merge to main + commit)

**Planner 起動前 check**:

```bash
# SPEC.md が複数 sprint で同一 file を編集予定なら警告
grep -A 5 "sprint" docs/specs/<spec>.md | grep -oE 'frontend/src/[^ ]+\.(jsx|js|css|mjs)' | sort | uniq -c | sort -rn | head -5
# 同 file が 2+ sprint に出てきたら「sprint 間 commit 必須」 を SPEC に追記
```

---

### 落とし穴 2: Evaluator L3 「selector 不在」 が機能していない

Evaluator L3 「source 照合 PASS」 が grep ベース文字列マッチで、 **component 名 ≠ className** の暗黙前提に気付かず通る。 production DOM に該当 class 名が存在せず dogfood で全 fallback 失敗。

**v86 事例**: Sprint 1 で Generator が `pane3-selectors.mjs` に `.five-conditions-card` / `.section-divider` / `.earnings-history-chart` を primary selector として配置 → Evaluator L3 「selector ソースコード照合 PASS」 と判定 → 検証実態は React component 名 (`FiveConditionsCard.jsx L92`)、 className ではない → step 6 dogfood で全 fallback 失敗で発覚。

**対策**:

1. selector / class 名を扱う場合、 **production HTML を curl で取って grep する** verify step を必ず追加
2. **primary selector は必ず `data-testid`** ルール化 (実装側でも追加コストが低く、 grep 簡単)
3. v86 hotfix で実装したのは 2 (data-testid 化)

**Generator 完了時 verify command**:

```bash
# production HTML で selector が実在するか確認
curl -s https://beatscanner-production.up.railway.app/ > /tmp/prod.html
for selector in $(grep -oE "'\.[a-z-]+'" frontend/scripts/snap-*.mjs | sort -u); do
  class_name="${selector//\'/}"
  class_name="${class_name//./}"
  if ! grep -q "class=\"[^\"]*${class_name}" /tmp/prod.html; then
    echo "MISSING: ${selector} not in production HTML"
  fi
done
```

---

### 落とし穴 3: ES module top-level `return` は SyntaxError

ES modules は **top level で `return` 不可**。 try ブロック内でも module 直下なら不可。 Generator 単体 syntax check 通したが node 実行時に `Illegal return statement` で死亡。

**v86 事例**: Sprint 4 で `try { ... if (no images) { ...; return; } ... } finally { ... }` のように try 直下に return が混入。

**対策**:

1. Generator が `frontend/scripts/*.mjs` を編集する場合、 Evaluator L1 で **`node --check <path>` を必須化**
2. ES module top level の制約 (`return` / `await` の文脈) を Generator prompt に明示
3. hotfix pattern: `try` 内 cleanup を `await browser.close(); clearTimeout(killer); process.exit(N);` で process.exit に置換

**Evaluator L1 inject すべき check**:

```bash
# 全 mjs に対して node --check
for f in $(git diff --name-only HEAD~1 HEAD | grep '\.mjs$'); do
  node --check "$f" || { echo "SYNTAX ERROR: $f"; exit 2; }
done
```

---

### 落とし穴 4: `getAnimations().forEach((a) => a.finish())` は infinite animation で throw

無限ループ animation (`animation-iteration-count: infinite`、 例: EarningsRing 呼吸 / pulse) は `.finish()` で `InvalidStateError: Cannot finish Animation with an infinite target effect end`。

**v86 事例**: Generator が `snap-active.mjs` の pattern を踏襲 → snap-active は `profile.selector` 限定で発光系を含まず、 vision-regression は `[class]` で全 element を巡回 → 無限 animation を hit → script crash。

**対策**:

1. `a.finish()` は必ず **`try/catch` でラップ**、 infinite animation を skip
2. snap-active.mjs と vision-regression の **scope 差を Generator が見落とすケース** を明示
3. [feedback_press_feedback_delta.md](memory/feedback_press_feedback_delta.md) の「animation forwards fill 罠」 と double anchor

**hotfix pattern (verbatim)**:

```javascript
// frontend/scripts/snap-*.mjs
document.getAnimations().forEach((a) => {
  try {
    if (a.effect && a.effect.getTiming().iterations !== Infinity) {
      a.finish();
    }
  } catch (e) {
    // infinite animation skip
  }
});
```

---

## 横展開 3 verify (Evaluator L1 inject 候補)

PGE 3 体ループで生成された **未検証 script** は、 1 回目の実 dogfood で必ず:

1. **`node --check <path>`** — ES module syntax (落とし穴 3)
2. **`production curl + grep <selector>`** — selector 整合 (落とし穴 2)
3. **実行 → console 監視** — infinite animation / timeout / API key 漏れ (落とし穴 4 + その他)

これら **3 verify を Evaluator L1 に inject すべき**。 v87 以降の PGE loop で実装候補。

---

## CLAUDE.md「Visual Diagnostic Harness Exception」 との整合

`frontend/scripts/snap-*.mjs` 例外 4 条件 (CLAUDE.md):

1. ✅ 名前が `snap-*.mjs`
2. ✅ `chromium.launch({ headless: true })` 固定
3. ✅ 60 秒以内 + `setTimeout(... process.exit(2))` hard timeout + `finally { await browser.close() }`
4. ✅ 出力は `frontend/.visual/` のみ、 HTTP / preview server 起動禁止

PGE Generator が新規 snap-*.mjs を作成する場合、 **上記 4 条件 + 落とし穴 3 / 4 対策を全て満たす**。

---

## Planner 起動前 checklist

- [ ] SPEC が **同一 file を複数 sprint で触る** 計画か grep で確認 (落とし穴 1)
  - 該当ありなら SPEC に「sprint 間 commit 必須」 を明記
- [ ] selector / className を扱う sprint か確認 (落とし穴 2)
  - 該当ありなら「primary selector は data-testid」 を SPEC に明記
- [ ] `frontend/scripts/*.mjs` を編集する sprint か確認 (落とし穴 3 + 4)
  - 該当ありなら「ES module top-level return 禁止 + `a.finish()` try/catch ラップ必須」 を SPEC に明記

## Generator 完了時 checklist

- [ ] 変更 file に `.mjs` 含むなら `node --check <path>` を全 file 通す (落とし穴 3)
- [ ] selector / className を追加したなら production curl + grep で実在確認 (落とし穴 2)
- [ ] `getAnimations().finish()` を呼ぶ箇所があれば try/catch + iterations check 確認 (落とし穴 4)
- [ ] 前 sprint で同 file を触っていたなら、 前 sprint の変更が含まれているか手動 verify (落とし穴 1)

## Evaluator 完了時 (L4 通過後の dogfood) checklist

- [ ] L3 PASS でも production HTML / console で再 verify
- [ ] selector 不在は L3 fail として扱う (curl + grep 実装まで semi-trust)
- [ ] dogfood で fail したら 4 落とし穴の grep を全件走らせる

---

## 関連 memory / docs

- [feedback_pge_loop_pitfalls.md](memory/feedback_pge_loop_pitfalls.md) — SSOT (v86 で初遭遇した 4 件)
- [feedback_press_feedback_delta.md](memory/feedback_press_feedback_delta.md) — animation forwards fill 罠との double anchor
- [visual_harness_exception.md](memory/visual_harness_exception.md) — snap-*.mjs 4 条件
- [CLAUDE.md](../../CLAUDE.md) §「Visual Diagnostic Harness Exception (preview 禁止の限定例外)」

## 関連 skill

- `planner` — SPEC 生成、 起動前 checklist
- `generator` — sprint 実装、 完了時 checklist
- `evaluator` — L1-L4 検査、 3 verify inject 候補
- `design-system-check` — selector 不在検出は L3 の責務、 design system 違反は別 skill
