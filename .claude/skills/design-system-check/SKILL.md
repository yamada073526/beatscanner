---
name: design-system-check
description: |
  デザインシステム違反 (raw hex / raw shadow / 未許可 !important / 発光バグ再発の兆候) を検査する。
  「デザインチェック」「design system check」「リリース前デザイン検査」「トークン違反」
  などの指示で呼び出す。
  本番デプロイ前 (release-check skill の中) でも自動的に呼び出されるべき。
---

# design-system-check スキル

## 目的

`docs/references/design_system.md` / `design_recipes.md` / `elevation_scale.md` で定めたデザインシステムが**コードと本番バンドルで遵守されているか**を機械的に検査する。

v54-v59 で 6 セッションを溶かした「発光バグ」を再発させないための最終防衛線。

---

## チェック項目

### 1. ローカル CSS / JSX の token 違反

```bash
# raw hex (#xxxxxx) を grep
grep -rEn '#[0-9a-fA-F]{6}' frontend/src/index.css frontend/src/components/ \
  | grep -vE 'var\(--' \
  | grep -vEf <(grep '^ALLOWED-HEX:' docs/references/elevation_scale.md | awk '{print $2}')

# raw box-shadow (token 経由でない)
grep -rEn 'box-shadow:\s*[0-9]' frontend/src/index.css \
  | grep -vE 'var\(--shadow-' \
  | grep -vEf <(grep '^ALLOWED-SHADOW:' docs/references/elevation_scale.md | sed 's/^ALLOWED-SHADOW: //')
```

違反があれば `design_system.md` 該当 token を提案して exit 2。

### 2. !important 増殖検査

```bash
grep -rn '!important' frontend/src/index.css frontend/src/**/*.{jsx,css} \
  | grep -vEf <(grep '^ALLOWED-IMPORTANT:' docs/references/elevation_scale.md | sed 's/^ALLOWED-IMPORTANT: //;s/  *#.*$//')
```

許可リストにない使用は warn。

### 3. 発光バグ兆候

```bash
# contain: paint が glow host に付いていないか
grep -rEn '(\.panel-card|\.bs-panel|\.surface-card)[^{]*\{[^}]*contain:\s*paint' frontend/src/

# overflow: hidden が surface-card に
grep -rEn '\.surface-card[^{]*\{[^}]*overflow:\s*hidden' frontend/src/

# :has(.is-arriving) 親抑制 (v54 で削除済、再発検知)
grep -rEn ':has\([^)]*is-arriving' frontend/src/

# .is-arriving:hover が compound されていない可能性
# (新規 .new-card.is-arriving が追加されたが .new-card.is-arriving:hover が無い)
# このチェックは AST 必要、簡易には警告のみ
```

該当があれば exit 2 + design_recipes.md §C-1 / §C-2 / §C-4 の該当節を案内。

### 4. Chip primitive 違反検査 (round 7 + round 8 + round 9 追加)

round 9 (6 体合議): rollup と個別 item の階層分離は `<ChipGroup.Separator />` で実装。
rollup chip は `role='rollup'` を付け、直後に Separator を置く。

```bash
# round 9: rollup + 個別 item が divider なしで並んでいる疑い
# isRollup フラグ直近に Chip があり、次の Chip までに Separator が無いケース
grep -rEnA3 "isRollup.*true" frontend/src/ \
  | grep -vE "ChipGroup\.Separator|components/ui/Chip\.jsx"
```


handover v69 round 7 で `frontend/src/components/ui/Chip.jsx` に chip 系 UI を SSOT 化済。
round 8 で `add` variant 追加、add-action は必ず `<Chip variant="add">` 経由。
inline style + `.ds-chip` class の組み合わせで新規 chip を作るパターンは禁止。

```bash
# inline style で chip っぽい要素を作っている疑い
# - className="ds-chip" + style 内 padding が同居している箇所
grep -rEnB1 'className=`?["{][^"`}]*ds-chip[^"`}]*["`}]' frontend/src/ \
  | grep -E 'padding:\s*[0-9]' \
  | grep -vE 'components/ui/Chip\.jsx'

# .ds-chip class を直接書いている (新 Chip primitive 未使用)
grep -rEn 'className=`?["{][^"`}]*ds-chip' frontend/src/ \
  | grep -vE 'components/ui/Chip\.jsx|features/judgment/primitives/Chip\.jsx'

# round 8: Plus icon を <Chip variant="add"> 経由でなく使っている疑い
# (lucide Plus を import している file で Chip variant="add" を import していない)
grep -rEn 'lucide-react.*Plus|<Plus\s' frontend/src/ \
  | grep -vE 'components/ui/Chip\.jsx' \
  | grep -vEf <(grep '^ALLOWED-PLUS-ICON:' docs/references/elevation_scale.md | awk '{print $2}')

# round 8: dashed border + transparent bg + circular の inline (add chip 候補)
grep -rEnB1 "border.*dashed.*border" frontend/src/ \
  | grep -E "background:\s*'?transparent" \
  | grep -vE 'components/ui/Chip\.jsx'
```

該当があれば warn (新規 chip-like / add-action UI を作る場合は必ず `<Chip>` primitive 経由)、
`memory/chip_primitive_canonical.md` を案内。

許可例外は `docs/references/elevation_scale.md` に `ALLOWED-CHIP:` / `ALLOWED-PLUS-ICON:` 行で whitelist。

### 5. 本番バンドル検査 (deploy 後)

```bash
BUNDLE_HASH=$(curl -s https://beatscanner-production.up.railway.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.css' | sort -u)
curl -s "https://beatscanner-production.up.railway.app/assets/${BUNDLE_HASH}" > /tmp/prod.css

# 本番に raw hex / raw shadow / !important が含まれていないか
# (vite が token を inline 展開する場合は許可、grep の matcher を調整)
```

### 6. 「Aman/Ritz-Carlton ロビー級」5 基準の自己レビュー

ユーザーに以下 5 点を提示して self-check を促す:

1. Hover Ring 強度 (arrival 0.36 → hover 0.60、dark は 0.50-0.62 → 0.75-0.80)
2. Stagger 順次遅延 (40ms × n、8 件で総 320ms 以内)
3. Font Weight Contrast (Stat fw700 : Label fw500 = 1.4×)
4. Line-height 比率 (Stat ≤1.1 : Label ≥1.3 = 1.18×)
5. Focus 区別 (Hover cyan / Focus-visible gold)

---

## 出力フォーマット

```
🟢 PASS / 🟡 WARN / 🔴 FAIL [カテゴリ] : 内容
  → 案内: design_system.md §X / design_recipes.md §Y
  → 修正案: var(--color-gain) を使う
```

---

## 関連ファイル

- `docs/references/design_system.md` — トークン Single Source of Truth
- `docs/references/design_recipes.md` — 適用パターン (§C-1 〜 §C-10)
- `docs/references/elevation_scale.md` — whitelist (本 skill が grep で読む入力)
- `.claude/skills/release-check/` — deploy 前の包括 skill (本 skill を呼ぶ)
