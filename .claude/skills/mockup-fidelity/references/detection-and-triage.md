# 検出網羅 & triage 詳細

> SKILL.md Phase 0-2 の詳細。3 体レビュー (工程完全性 / 安全性) の指摘を反映。
> 用語・色ルール・§38 BAD pattern・token 値は **コピーせず** CLAUDE.md / design SSOT / hallucination-guard を参照する。

## 目次
- Inputs フォーマット & pre-flight
- demo-only スキャン (Phase 0)
- 検出網羅 checklist (Phase 1)
- §38 / 色ルール スキャン (Phase 1→2)
- triage 分類ルール (Phase 2)
- preserve-list anchor 規約
- embedded↔standalone 判定

---

## Inputs フォーマット & pre-flight

**element-map** (Input 3) — 行ごとに:
```
mockup_selector | impl_selector | role(1行) | effective_container_width | data_sentinel
```
- `effective_container_width`: 実装でその要素が実際に表示される幅 (ペイン半幅等)。viewport でなくこれで responsive を評価。
- `data_sentinel`: データ表示完了の判定式 (例 `.screener-table tbody tr の数 > 0`)。computed-style 取得前に待つ。
- mockup にあって実装に対応が無い要素 → `excluded: demo-only` 行として記録。

**preserve-list** (Input 4) — 各項目:
```
<対象> | anchor: commit <hash> + <SSOT §節 or docs/specs/FOO.md> | 理由(1行)
```
pre-flight: 起動時に user が element-map と preserve-list を**確認・承認**。承認前に Phase 1 へ進まない。autopilot 等 user 不在時は preserve-list を事前確定し実行中追加を禁止。

---

## demo-only スキャン (Phase 0)

mockup を盲目的に写すと Trust Cliff になるデモ専用要素を機械抽出 → 移植禁止リスト化 + user 確認。

```bash
grep -rniE "mock|demo|seed|placeholder|sample|bypass|dummy|lorem|固定|ダミー" <mockup.html>
# 加えて目視で: plan picker (Free/Pro 手動トグル) / ハードコード銘柄リスト (AAPL/MSFT/NVDA 等) /
#   固定日付・固定 EPS/決算値 / loginStatus 固定分岐 / mode='demo' 専用 banner
```
抽出物は「実装に写さない」。実装に同等機能が**本物の data/auth で**存在する場合のみ採用。判断は user gate。

---

## 検出網羅 checklist (Phase 1)

静止状態だけ見ると最頻バグ (発光・状態差) を取りこぼす。以下を**全て**確認:

- [ ] **静止状態**: typography / color / spacing / radius / layout / border
- [ ] **インタラクション状態**: `:hover` / `:focus-visible` / `:active` / disabled を `page.hover()/focus()` で強制遷移後に diff。特に発光 compound (`.X.is-arriving:hover` 等) が静止≠hover で意図通り変化するか (`glow_elevation_postmortem` 参照)
- [ ] **状態 UI**: loading/skeleton / empty (該当0件) / error (API失敗 fallback)。mockup に定義が無ければ「mockup 対象外」と明記
- [ ] **responsive**: viewport でなく element-map の `effective_container_width` 相当で評価 (`feedback_snap_catches_layout_context_breaks`)。代表幅 3 点 + breakpoint 境界。`@container`/media query の発火を確認
- [ ] **dark/light**: `data-theme` 切替後も diff (mockup が light のみなら dark は `design-system-check`/`dark-mode` に委ね、本スキル対象外と明記)
- [ ] **icon 形状**: computed-style では SVG path 差を取れない → snapshot の icon 領域を `vision-eval`/Haiku で「mockup と同形か」採点 (形状は 1-run で十分・`feedback_vision_api_noise`)。品格は `feedback_icon_brand_consistency`
- [ ] **stacking/clip**: `z-index` / `position` / `isolation` / `overflow` / `clip-path` (sticky/portal/blur overlay)。クリッピングは `feedback_clipping_root_cause_chain`
- [ ] **条件分岐 copy**: `plan === 'x' ? A : B` 等で出し分く文言は全 branch を列挙して照合
- [ ] **copy occurrence**: 同一文言が複数ファイルに無いか grep (`feedback_edit_replace_all_drift`)

---

## §38 / 色ルール スキャン (Phase 1→2)

mockup 文言・配色を写す前に法務・色規律を機械スキャン (詳細ルールは `hallucination-guard` / CLAUDE.md 投資業界の色ルール を参照、ここでは検出手順のみ):

- **断定的将来予測 (金商法§38)** / **最上級 (景表法§5)**: mockup 内全テキストノードを正規表現でフラグ (上昇する/下落する/買い/最高/No.1/唯一/確実/業界初 等)。該当は user gate + `hallucination-guard` の BAD pattern 照合
- **色の意味誤用**: mockup の 緑/赤/シアン/amber 使用要素を列挙し意味と照合。**シアンが「上昇」、赤が「下落以外」で使われていたら重大 Trust Cliff → 即 user gate** (mockup が破っていても写さない)

---

## triage 分類ルール (Phase 2)

git log は **意図性の参考情報** であり証拠でない。各 drift を:

| ラベル | 条件 | 扱い |
|---|---|---|
| **I 意図的 (保全)** | preserve-list 該当 **かつ** SSOT §節/SPEC に設計根拠が明文化 | mockup に戻さない |
| **X demo-only** | Phase 0 の demo-only リスト該当 | 移植しない |
| **構造差 (judgment)** | embedded≠standalone 由来 (下記判定) | user gate |
| **§38/Trust-Cliff/pricing** | §38スキャン該当 / LP訴求隣接 / tier gate | `hallucination-guard`/`funnel-cro` 経由 → user gate |
| **過剰追加** | mockup に accent 有・実装に無 (accent の「追加」) | **自動修正禁止**・user gate (`feedback_gold_accent_continuity`/`feedback_minimalism_over_additive`)。4-5 section 超の accent 拡大は一律 BLOCK |
| **F 事故 drift (修正)** | 上記いずれにも該当せず・純 cosmetic・同要素・同位置 | Phase 3 で mockup 値へ修正 |
| **意図不明** | git log に理由なし・preserve-list 未登録・mockup と差 | **accidental と決め打ちせず user gate** |

逆誤判定 (意図的を事故と誤認して revert) が最も危険。**保全には SSOT §節参照を必須**、参照先が無い保全は user gate へ。

### computed-style diff 結果の解釈 (初回適用で実証した落とし穴)

実測 diff は「差がある」だけで「修正すべき」を意味しない。以下は **drift でなく除外**:

- **mockup 生値 vs app token 差**: 例 `--border` = mockup `rgba(255,255,255,.08)` / app `rgb(51,65,85)`。実装が**正しい semantic token を使っている**なら、resolved 値が mockup の生値と違っても **app token が SSOT**。mockup の生値へ寄せない (user が「mockup の見た目そのもの」を明示要望した時のみ token 側を検討)。判定: 実装の該当 CSS が `var(--*)` を使っているか確認 → 使っていれば「token 差」として除外
- **コンテナ継承 font のノイズ**: タイル等の**コンテナ**要素で `fontSize`/`lineHeight` を測ると、意味ある文字は子 (label) にあるのに継承値を拾い false drift になる。typography 系は element-map で**文字を持つ要素**を pair に指定する (コンテナでなく `.tile__label` 等)
- これらを除いた上で残る差 (box-shadow / radius / spacing / 位置 / 文言) が真の fix 対象。

---

## preserve-list anchor 規約

各項目に `commit <hash>` + SSOT §節 (or `docs/specs/`) を付与。次回 audit で anchor の有効性を確認し、SPEC 削除・節番号変更で失効した項目は再評価。理由を 1 行で書けない保全はそもそも怪しい (削除候補)。

---

## embedded↔standalone 判定

mockup=単一フルページ / 実装=workspace 内ペインのため、以下は「事故 drift」でなく構造差 (user gate):
- ページ h1 → ペイン内見出し (タイトルの居場所)
- mockup 全幅 4 列 → 半幅ペインで折返し (responsive は `effective_container_width` で評価)
- mockup 底部固定要素 (免責等) → どのペイン底に置くか

computed-style 差が出た要素は、ancestor に media/`@container` rule があれば「responsive 差分」として自動フラグ → 修正でなく user 確認。
