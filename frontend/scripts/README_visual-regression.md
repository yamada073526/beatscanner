# Visual Regression 検査スクリプト

Pane 3 主要 5 section を headless capture し、Claude Vision API で 5 軸スコア + baseline 比較を行う。

## 使い方

```bash
# 初回: baseline を記録
cd frontend && node scripts/snap-visual-regression.mjs --baseline-init

# 通常実行 (baseline 比較)
cd frontend && node scripts/snap-visual-regression.mjs

# ローカルビルド後
cd frontend && SNAP_URL=file://$(pwd)/dist/index.html node scripts/snap-visual-regression.mjs
```

## rubric 5 軸 + 重み

| 軸 | 重み | 説明 | 80+/50-79/50未満 |
|---|---|---|---|
| `typography_grid` | 0.25 | Stat (fw700) / Label (fw500) 2 層 + Hero 32px+ | 階層明確 / 部分的 / 一律フォント |
| `spacing_ratio` | 0.25 | section 間 --space-6 以上 + first-fold 5-7 要素 + 上下バランス | 呼吸感 / 部分的 / Bloomberg 的 |
| `color_hierarchy` | 0.20 | 緑↑/赤↓/amber 警告/cyan ブランド + baseline cyan 禁止 | 完全遵守 / 一部違反 / 色が混乱 |
| `motion_timing` | 0.15 | LIVE indicator / EarningsRing glow / skeleton 寸法一致 (静止画 proxy) | 動き感 / 部分的 / 静的感強い |
| `aman_vs_bloomberg` | 0.15 | 驚き/豪華さ/興奮/洗練さ/楽しい の全体印象 | Aman 級 / 中間 / Bloomberg 的 |

overall = 重み付き平均 (JS 側で計算)。

## exit code

| code | 状態 | 条件 |
|---|---|---|
| `0` | PASS | overall >= 70 かつ baseline 比 -5pt 以内 |
| `0` | PASS (API key なし) | `ANTHROPIC_API_KEY` 不在 → capture のみ、CI は落ちない |
| `1` | WARN | overall < 70 (閾値未達) |
| `1` | REGRESSION | overall >= 70 だが baseline 比 -5pt 以上の劣化 |
| `2` | TIMEOUT/ERROR | 120s 超過 または capture 致命的失敗 |

## ANTHROPIC_API_KEY の設定

ローカル: `frontend/.env.local` に `ANTHROPIC_API_KEY=sk-ant-xxx` を追加 (gitignore 済)。

GitHub Actions: Settings → Secrets → Actions → `ANTHROPIC_API_KEY` を追加。

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## タイムアウト設定: HARD_TIMEOUT_MS = 120s と CLAUDE.md 60s の差異

CLAUDE.md § Visual Diagnostic Harness Exception の「60 秒以内」は capture のみの単発スクリプトが対象。
本スクリプトは PC + mobile capture (~30s) + Vision API call (p95 ~25s) を含み 60s を超えるため 120s に設定。
SPEC §5 Sprint 3 `HARD_TIMEOUT_MS` note で合意済み。

## baseline 更新ポリシー

- 初回: `--baseline-init` → `frontend/scripts/vision-baseline.json` に保存 → git commit して PR
- 更新: `--update-baseline` → **必ず PR で人間が承認してから実行**
- 自動更新は行わない (スコア改善時も PR review 必須)

## mobile baseline の扱い

workspace mode では Pane 3 が mobile で非表示になる場合あり (仕様)。
baseline は **PC (1440×900) を主、mobile を補助** として運用。
mobile は `sectionFound: false` でフィルタされ Vision eval 対象外になる。

## 触ってはいけない領域

`SPEC_2026-05-19_vision-dogfood-agent.md §6` が SSOT。本スクリプトは capture/評価のみ、`frontend/src/` は改変しない。
