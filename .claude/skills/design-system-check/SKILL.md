---
name: design-system-check
description: |
  デザインシステム違反 (raw hex / raw shadow / 未許可 !important / 発光バグ再発の兆候 / chip primitive 違反) を機械的に検査する。
  「デザインチェック」「design system check」「リリース前デザイン検査」「トークン違反」
  などの指示で呼び出す。
  本番デプロイ前 (release-check skill の中) でも自動的に呼び出される。
---

# design-system-check スキル

## 目的

`docs/references/design_system.md` / `design_recipes.md` / `elevation_scale.md` で定めたデザインシステムが **コードと本番バンドルで遵守されているか** を機械的に検査する。 過去の発光バグ (v54-v59 で 6 セッション溶けた) を再発させないための最終防衛線。

## 依存

- `docs/references/design_system.md` — token (色 / spacing / radius / elevation / motion) の SSOT
- `docs/references/design_recipes.md` — 適用パターン (card layering / glow host / staleness UI 等)
- `docs/references/elevation_scale.md` — 機械的 whitelist (raw hex / raw shadow / !important / chip / Plus icon 例外行)
- `frontend/src/index.css` / `frontend/src/components/` — 検査対象 source
- `frontend/src/components/ui/Chip.jsx` — chip primitive SSOT
- 本番 URL: `https://beatscanner-production.up.railway.app/` (production bundle 検査)
- memory `glow_elevation_postmortem.md` — 発光バグ root cause + 症状別 quick reference
- memory `chip_primitive_canonical.md` — chip 系 UI の SSOT
- memory `css_specificity_gotchas.md` — `.is-arriving` compound 4 セットの解説
- memory `design_token_enforcement.md` — 本 skill が block する内容の概要
- skill `release-check` — deploy 前の包括 skill (本 skill を内包呼出)
- skill `designing-workspace-ui` — UI 編集前の規律 skill (本 skill と pair)

## いつ呼び出すか

- 「デザインチェック」「design system check」 と user が依頼した時
- 本番デプロイ前 (`release-check` skill 内から自動呼出)
- `frontend/src/index.css` / 新規 component を追加 / 編集した直後の self-review として
- 発光バグ / 突然の真っ白事故 / chip 揃わずの違和感を検知した時

## チェック項目

### 1. token 違反 (raw hex / raw shadow)

```bash
# raw hex (#xxxxxx) を grep、 whitelist 除外
grep -rEn '#[0-9a-fA-F]{6}' frontend/src/index.css frontend/src/components/ \
  | grep -vE 'var\(--' \
  | grep -vEf <(grep '^ALLOWED-HEX:' docs/references/elevation_scale.md | awk '{print $2}')

# raw box-shadow (token 経由でない) を grep
grep -rEn 'box-shadow:\s*[0-9]' frontend/src/index.css \
  | grep -vE 'var\(--shadow-' \
  | grep -vEf <(grep '^ALLOWED-SHADOW:' docs/references/elevation_scale.md | sed 's/^ALLOWED-SHADOW: //')
```

違反があれば `design_system.md` 該当 token を提案して exit 2。

### 2. `!important` 増殖検査

```bash
grep -rn '!important' frontend/src/index.css frontend/src/**/*.{jsx,css} \
  | grep -vEf <(grep '^ALLOWED-IMPORTANT:' docs/references/elevation_scale.md | sed 's/^ALLOWED-IMPORTANT: //;s/  *#.*$//')
```

許可リストにない使用は warn。

### 3. 発光バグ兆候

過去 6 セッション溶けた発光バグの再発を grep で検知:

```bash
# contain: paint が glow host に付いていないか (発光が clip される)
grep -rEn '(\.panel-card|\.bs-panel|\.surface-card)[^{]*\{[^}]*contain:\s*paint' frontend/src/

# overflow: hidden が surface-card に付いていないか
grep -rEn '\.surface-card[^{]*\{[^}]*overflow:\s*hidden' frontend/src/

# :has(.is-arriving) 親抑制 (削除済、 再発検知)
grep -rEn ':has\([^)]*is-arriving' frontend/src/
```

該当があれば exit 2 + `design_recipes.md §C-1 / §C-2 / §C-4` の該当節を案内。 詳細症状 → 対策 mapping は `memory/glow_elevation_postmortem.md` を参照。

**注**: 新規 `.X.is-arriving:hover` の compound 4 セット欠落は AST 必要のため簡易チェック不可。 `memory/css_specificity_gotchas.md` 参照のうえ手動 review。

### 4. Chip primitive 違反検査

`memory/chip_primitive_canonical.md` が chip 系 UI の SSOT。 新規 chip-like / add-action UI を作る場合は必ず `frontend/src/components/ui/Chip.jsx` の `<Chip>` primitive 経由とする。

grep 検査の詳細 (rollup separator / inline style ds-chip / lucide Plus icon の whitelist 確認 等) は `references/chip_check.md` を参照。 違反検出時は memory の SSOT を案内。

許可例外は `docs/references/elevation_scale.md` に `ALLOWED-CHIP:` / `ALLOWED-PLUS-ICON:` 行で whitelist。

### 5. 本番バンドル検査 (deploy 後)

```bash
BUNDLE_HASH=$(curl -s https://beatscanner-production.up.railway.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.css' | sort -u)
curl -s "https://beatscanner-production.up.railway.app/assets/${BUNDLE_HASH}" > /tmp/prod.css

# 本番に raw hex / raw shadow / !important が含まれていないか
# (Vite が token を inline 展開する場合は許可、 grep matcher を調整)
```

### 6. ブランド世界観 self-review (主観 gate)

CLAUDE.md「ブランド世界観」 (Aman/Ritz-Carlton 級) と `docs/references/design_system.md §-1` を SSOT として、 user に self-check を促す。 評価 5 軸 (Hover Ring 強度 / Stagger 順次遅延 / Font Weight Contrast / Line-height 比率 / Focus 区別) の具体的数値・閾値は `docs/references/design_system.md` / `design_recipes.md` を参照 (skill に値をベタ書きしない、 token 変更で stale 化するため)。

## 出力フォーマット

```
🟢 PASS / 🟡 WARN / 🔴 FAIL [カテゴリ] : 内容
  → 案内: design_system.md §X / design_recipes.md §Y / memory anchor
  → 修正案: var(--color-gain) を使う / Chip primitive を使う / 等
```

カテゴリ:
- `[token-hex]` / `[token-shadow]` — 項目 1 違反
- `[important]` — 項目 2 違反
- `[glow]` — 項目 3 違反 (発光バグ兆候)
- `[chip]` — 項目 4 違反
- `[prod-bundle]` — 項目 5 違反
- `[brand]` — 項目 6 self-review 結果
