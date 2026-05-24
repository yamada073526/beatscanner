# PGE loop 落とし穴詳細

SSOT: `memory/feedback_pge_loop_pitfalls.md` (v86 で初遭遇した記録)。
本 file はその skill 運用面 (verify command / hotfix pattern) を補完。

## 目次

- 落とし穴 1: worktree 非累積
- 落とし穴 2: Evaluator L3 selector hallucination
- 落とし穴 3: ES module top-level return
- 落とし穴 4: getAnimations().finish() で infinite animation

---

## 落とし穴 1: 各 sprint worktree は main から独立 branch するため累積しない

`git worktree add` で新規 branch (`claude/<spec>-sprint<N>`) を **main から fresh に切る**。 sprint N+1 の worktree には sprint N の uncommitted 変更が **継承されない**。

**事例**: Sprint 2 で `Hero.jsx` / `SectionDivider.jsx` に data-testid を追加 → Sprint 3 Generator は main から fresh branch したため見えず → 手動 grep + cp で抜け落ち判明。

**対策**:

1. SPEC が複数 sprint で **同一 file を触る場合**、 各 sprint 完了時に **必ず main に consolidate (commit)** してから次 sprint 起動
2. Generator に「前 sprint の変更を継承」 と指示しても無理 (worktree が main から切られる)
3. Planner 段階で「同一 file を複数 sprint で触る計画」 を検出 → SPEC に「sprint 間 commit 必須」 を明記

**Planner 起動前 check**:

```bash
# SPEC.md が複数 sprint で同一 file を編集予定なら警告
grep -A 5 "sprint" docs/specs/<spec>.md | grep -oE 'frontend/src/[^ ]+\.(jsx|js|css|mjs)' | sort | uniq -c | sort -rn | head -5
# 同 file が 2+ sprint に出てきたら「sprint 間 commit 必須」 を SPEC に追記
```

---

## 落とし穴 2: Evaluator L3 「selector 不在」 が機能していない

Evaluator L3 「source 照合 PASS」 が grep ベース文字列マッチで、 **component 名 ≠ className** の暗黙前提に気付かず通る。 production DOM に該当 class 名が存在せず dogfood で全 fallback 失敗。

**事例**: Sprint 1 で Generator が `pane3-selectors.mjs` に `.five-conditions-card` 等を primary selector として配置 → Evaluator L3 「selector ソースコード照合 PASS」 と判定 → 検証実態は React component 名 (`FiveConditionsCard.jsx`)、 className ではない → step 6 dogfood で全 fallback 失敗で発覚。

**対策**:

1. selector / class 名を扱う場合、 **production HTML を curl で取って grep する** verify step を必ず追加
2. **primary selector は必ず `data-testid`** ルール化 (実装側でも追加コストが低く、 grep 簡単)

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

## 落とし穴 3: ES module top-level `return` は SyntaxError

ES modules は **top level で `return` 不可**。 try ブロック内でも module 直下なら不可。 Generator 単体 syntax check 通したが node 実行時に `Illegal return statement` で死亡。

**事例**: `try { ... if (no images) { ...; return; } ... } finally { ... }` のように try 直下に return が混入。

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

## 落とし穴 4: `getAnimations().forEach((a) => a.finish())` は infinite animation で throw

無限ループ animation (`animation-iteration-count: infinite`、 例: EarningsRing 呼吸 / pulse) は `.finish()` で `InvalidStateError: Cannot finish Animation with an infinite target effect end`。

**事例**: Generator が `snap-active.mjs` の pattern を踏襲 → snap-active は `profile.selector` 限定で発光系を含まず、 vision-regression は `[class]` で全 element を巡回 → 無限 animation を hit → script crash。

**対策**:

1. `a.finish()` は必ず **`try/catch` でラップ**、 infinite animation を skip
2. snap-active.mjs と vision-regression の **scope 差** を Generator が見落とすケースを明示
3. `memory/feedback_press_feedback_delta.md` の「animation forwards fill 罠」 と double anchor

**hotfix pattern**:

```javascript
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
