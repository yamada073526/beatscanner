# Chip primitive 違反検査の詳細 grep

`memory/chip_primitive_canonical.md` が chip 系 UI の SSOT。 本 file はその skill 運用面 (grep command) を補完。

## 検査 1: inline style + `.ds-chip` 重複 (Chip primitive 未使用)

```bash
# className="ds-chip" + style 内 padding が同居する箇所
grep -rEnB1 'className=`?["{][^"`}]*ds-chip[^"`}]*["`}]' frontend/src/ \
  | grep -E 'padding:\s*[0-9]' \
  | grep -vE 'components/ui/Chip\.jsx'
```

該当があれば warn。 新規 chip は必ず `<Chip>` primitive 経由とする。

## 検査 2: `.ds-chip` class を直接記述 (新 Chip primitive 未使用)

```bash
grep -rEn 'className=`?["{][^"`}]*ds-chip' frontend/src/ \
  | grep -vE 'components/ui/Chip\.jsx|features/judgment/primitives/Chip\.jsx'
```

## 検査 3: lucide Plus icon を `<Chip variant="add">` 経由でなく使用

```bash
# lucide Plus を import している file で Chip variant="add" を import していない
grep -rEn 'lucide-react.*Plus|<Plus\s' frontend/src/ \
  | grep -vE 'components/ui/Chip\.jsx' \
  | grep -vEf <(grep '^ALLOWED-PLUS-ICON:' docs/references/elevation_scale.md | awk '{print $2}')
```

`add-action` UI は必ず `<Chip variant="add">` を経由する (`memory/chip_primitive_canonical.md` 規定)。

## 検査 4: dashed border + transparent bg + circular inline (add chip 候補の自作)

```bash
grep -rEnB1 "border.*dashed.*border" frontend/src/ \
  | grep -E "background:\s*'?transparent" \
  | grep -vE 'components/ui/Chip\.jsx'
```

該当は「add chip を自作している」 疑い、 `<Chip variant="add">` 経由を提案。

## 検査 5: rollup chip + 個別 item が divider なし

```bash
# isRollup フラグ直近に Chip があり、 次の Chip までに Separator が無いケース
grep -rEnA3 "isRollup.*true" frontend/src/ \
  | grep -vE "ChipGroup\.Separator|components/ui/Chip\.jsx"
```

rollup と個別 item の階層分離は `<ChipGroup.Separator />` で実装する規約。

## 違反検出時の案内

- `memory/chip_primitive_canonical.md` を user に提示 (chip 系 UI 全ての SSOT)
- 該当 component を `<Chip>` primitive 経由に書き換え案を提示
- 必要なら `frontend/src/components/ui/Chip.jsx` に新 variant を追加して対応 (variant 追加方針は `designing-workspace-ui` skill 参照)

## 許可例外

`docs/references/elevation_scale.md` の以下 prefix で whitelist:

- `ALLOWED-CHIP:` — chip-like inline style の例外箇所
- `ALLOWED-PLUS-ICON:` — lucide Plus を Chip 経由でなく使ってよい例外箇所
