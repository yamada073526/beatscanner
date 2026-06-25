# AUDIT: スクリーナー mockup v8 ↔ 実装 cosmetic drift (2026-06-25)

> 正本: `docs/specs/mockups/screener-strategy-presets-v8.html`
> 対象: cosmetic / copy / visual のみ (semantic/条件ロジックの乖離は既存 AUDIT 参照)
> 既出 audit: `AUDIT_2026-06-25_screener-mockup-implementation-divergence.md` (P3-9〜P3-11 は既出として除外)

---

## サマリー

| 種別 | 件数 |
|---|---|
| 事故 drift (mockup 寄せ推奨) | **10件** |
| 意図的変更 (要維持) | **6件** |
| 既出 (再掲しない) | **3件 (P3-9/P3-10/P3-11)** |
| Grey-zone (要 user 確認) | **3件** |

---

## 完全な乖離表

### 事故 drift (mockup 寄せ推奨)

| # | mockup 該当 | 実装 該当 | カテゴリ | 意図性判定 | 根拠 |
|---|---|---|---|---|---|
| D-1 | **L196**: `<h1>スクリーナー</h1>` + `<p class="sub">戦略を選ぶ → 「絞り込み条件」で精度を調整。...` | `CustomScreenerPanel.jsx:1273` `<h3 class="section-label">銘柄スクリーナー</h3>` + L1275 「条件を組み合わせて絞り込む」 | copy | 事故 drift | `git log -S '銘柄スクリーナー' --oneline -5 -- CustomScreenerPanel.jsx` で導入 commit に「mockup と変える」理由記録なし。CustomScreenerPanel は旧 Pane2 コンポーネントの継続で、v8 mockup 採択前のテキストが残った可能性が高い |
| D-2 | **L82〜83**: `.customtag { display:none } .customtag.show { display:inline-block }` + L206「カスタム」 (color: var(--gold-mid)、background: rgba(212,175,55,.12)、border: rgba(212,175,55,.3)) | `index.css:13803-13813` `.screener-custom-tag { color: var(--text-muted); background: var(--bg-subtle); border: 1px solid var(--border); }` | color | 事故 drift | `git log -S 'screener-custom-tag' --oneline -5` → commit `6db4844`「#2 slice 2-b〜2-e アドバンスド」。message に「gold に変える / 変えない」の意図記録なし。mockup は gold (強調) だが実装は neutral (埋没)。Gold アクセントが「個別変更の存在を知らせる」信号として機能しなくなっている |
| D-3 | **L91**: `.lockbar { ...border-radius: var(--r-sm) }` = 8px | `index.css:13865` `.screener-lockbar { border-radius: var(--radius-md); }` = 12px | spacing (radius) | 事故 drift | `git log -S 'screener-lockbar' --oneline -5 -- index.css` で該当 commit に理由なし。`--r-sm:8px` (mockup) → `--radius-md:12px` (実装) で 50% 大きい。mockup との視覚差は軽微だが cosmetic 乖離 |
| D-4 | **L201**: accordion ヘッダー `.fh .lbl` 「絞り込み条件」 (h1 の下の refine パネル header)。mockup は `<span class="lbl">絞り込み条件</span>` | `CustomScreenerPanel.jsx:1271-1276` コントロールバーに「詳細」ボタン (L1504) のみ。「絞り込み条件」というラベル名は UI 上に存在しない | copy | 事故 drift | 実装では accordion label が「詳細」ボタンに縮小され、mockup の「絞り込み条件」というセクション header が消えている。`git log -S '絞り込み条件' --oneline -- CustomScreenerPanel.jsx` でコミット記録なし |
| D-5 | **L204〜205**: 精度 seg ラベル `<button data-i="0">緩い</button><button data-i="1">標準</button><button data-i="2">厳しい</button>` (3 段)。mockup は「精度」ラベル (`<span class="ctrl-lab">精度</span>`) が seg の左に併記 | `CustomScreenerPanel.jsx:1384` `<div class="screener-precision-seg" aria-label="精度">` — aria-label のみで視覚的な「精度」ラベルは非表示 | copy (label) | 事故 drift | mockup では「精度」という文字が精度 seg の左に常時表示される (L77 `.ctrl-lab { font-size:12px; color:var(--text-muted) }`)。実装では aria-label に落としただけで visual label が消えた。v2 実装時に取り漏らした可能性 |
| D-6 | **L327〜330**: `.fhint { font-size:11px; color:var(--text-muted); margin-top:var(--s4); line-height:1.6 }` + コンテンツ「データ: FMP（直近決算シーズン）・必須ゲートは戦略の死守条件のため変更不可」など preset 別ヒント | `CustomScreenerPanel.jsx` に fhint 相当の section が存在しない (grep して未検出) | layout (要素の有無) | 事故 drift | mockup では条件パネル下部にヒント文（データ出典・操作説明）が常時表示される。実装では tooltip (crow の title attribute) で代替しているが、常時可視の fhint は未実装。取り漏らし |
| D-7 | **L223**: `<div class="disclaimer">これらは買い推奨ではなく、各戦略の<strong>条件に合致した銘柄の一覧</strong>です。最終的な投資判断はご自身で行ってください。</div>` — スクリーナー全体の底部固定免責 | `CustomScreenerPanel.jsx:1367` 「スクリーニング結果であり投資推奨ではありません。」 — 結果ヒーロー内の小テキスト (font-size 0.6875rem) に埋め込み。bottom-of-page placement なし | copy + layout | 事故 drift | 文言が短縮され位置も異なる (mockup: 全体底部・目立つ border-left amber / 実装: 結果内微小テキスト)。意図的変更の commit 記録なし |
| D-8 | **L216〜221**: 結果パネル header `<h2 id="m-title">結果</h2>` + `<select class="sortsel">` (時価総額の大きい順 / 出来高の大きい順 / 主要指標の高い順 / セクター順) + 詳細パネル `<h2 id="d-title">詳細</h2>` | `CustomScreenerPanel.jsx` の result list には sort UI なし。ソートは hardcoded (合致度降順)。detail パネルも master-detail 構造でなく inline row | layout | 事故 drift | master-detail UI と sort select は mockup の主要 UX 要素。実装では sort select が「合致度TOP3」ヒーロー表示に代替されており、sort オプション (時価総額順等) は消えた。ただし実装の「合致度 TOP3」は新たな UX 価値を持つため grey-zone とも言えるが、sort select の**消滅**は drift |
| D-9 | **L68〜69**: `.refine .fh .live { font-size:13px; color:var(--text-secondary) }` + `.fh .live b { font-size:20px; font-weight:700; color:var(--gold-mid) }` — フィルタ accordion header に「該当 **X** 銘柄」と gold 数字で表示 | `CustomScreenerPanel.jsx:1354-1357` 「**{filteredItems.length}**件ヒット」— `text-sm font-medium text-[var(--text-secondary)]` のみ。gold color なし、font-size も 14px 相当 | typography + color | 事故 drift | mockup は gold bold 20px で件数が主役。実装は text-secondary 14px で埋没。pulse アニメ (L69 `.fh .live b.pulse`) も未実装 |
| D-10 | **L115**: `.fhint { ...line-height:1.6 }` + `<div class="fhint">` に「左でセクターを選ぶと、右にそのセクターの好決算銘柄 Top3 が表示されます。」(p3 旬のセクター時) | `CustomScreenerPanel.jsx` の旬のセクター preset で同等ヒントなし (grep で「左でセクターを選ぶ」未検出) | copy | 事故 drift | 旬のセクターの操作説明ヒントが実装に存在しない |

---

### 意図的変更 (要維持)

| # | mockup 該当 | 実装 該当 | カテゴリ | 判定根拠 |
|---|---|---|---|---|
| I-1 (旧 P3-9) | **L248**: `desc: 'カップ・ウィズ・ハンドル等のベースから上放れた銘柄'` | `StrategyPresetBar.jsx:38` `desc: '52週高値圏（高値圏〜実ブレイク）の好決算銘柄'` | copy | `git show 3045faa -- StrategyPresetBar.jsx` で `desc` が明示的に変更されている。commit message「新高値ブレイク 0件根治 — gate を near_high 段階OR」に対応し、実装が near_high 段階OR 方式に変わったため desc を整合させた意図的変更 |
| I-2 (旧 P3-10) | **L244**: `cond('cfpsgt','CFPS > EPS（粉飾防止）',...)` | `CROW_BINARY_META.ocf_gt_netincome.label = '営業CF>純利益'` | copy | 既存 AUDIT P3-10 記載済。数学的等価 (CFPS>EPS ⟺ OCF>NI)、§38 観点で「粉飾防止」という断定表現を避けた意図的変更。維持推奨 |
| I-3 (旧 P3-11) | mockup「CFPS の連続性」(`cfps3`) | 実装「CFPS 連続増(4期)」 | copy | 既存 AUDIT P3-11 記載済。backend が 4 期で実装されているため実測値の正直な反映 |
| I-4 | **L618**: `detailOpen=true` (accordion が open 起動) mockup `document.getElementById('refine').classList.add('open')` L352 | `CustomScreenerPanel.jsx:618` `const [detailOpen, setDetailOpen] = useState(false)` — closed 起動 | micro-interaction (default state) | `git log -S 'detailOpen' --oneline -5` で commit `6db4844` 「#2 slice 2-b: アドバンスド個別緩急」に対応。Sprint 2 の 3 体合議追記条件に「件数デフォルト不変 SAFE を優先」「追加条件を default-OFF で締まる」方針 (既存 AUDIT P2-b) があり、accordion closed = additive 方式の裏返し。screener_v2 設計方針として意図的 |
| I-5 | **L266**: `let active='p1'` — preset が最初から選択済み | `ScreenerMaster.jsx:172` `const [activeStrategy, setActiveStrategy] = useState(null)` — null 起動 (未選択) | layout (initial state) | `git log -S 'activeStrategy' --oneline -5 -- ScreenerMaster.jsx` で昇格 commit `a48e640`「戦略プリセットを画面トップへ昇格」に対応。IA 昇格 SPEC §IA L144「1クリック → custom surface へ誘導」の設計で、null 起動は意図的 (クリック前は全件表示) |
| I-6 | **L238**: `const INT=[{n:'緩い',m:1.9},{n:'標準',m:1.0},{n:'厳しい',m:.42}]` — piece-count 倍率をベース件数に乗算する mockup 計算方式 | `CustomScreenerPanel.jsx:561-562` `countPreset` = `buildActiveGrades(presetKey,'standard',{})` → 実 universe データに実際の predicates を適用して算出 | layout (architecture) | `git log -S 'buildActiveGrades' --oneline -5 -- CustomScreenerPanel.jsx` で複数 commit に渡る設計。mockup の倍率計算は demo 用フィクション。実データに predicates を適用する実装の方が正確で Trust Cliff 的に優れた意図的変更 |

---

### Grey-zone (要 user 確認)

| # | 内容 | 理由 |
|---|---|---|
| G-1 | **accordion の開閉アニメ方式**: mockup `grid-template-rows: 0fr↔1fr` (L72-73 `.refine .fb`) / 実装も同じ `screener-adv-rows` (`index.css:13817`)。ただし mockup の refine panel は **常に展開済みレンダリング** (`L352: refine.classList.add('open')`) で、実装は詳細ボタン click で開閉。accordion の存在自体 (詳細ボタン vs 常時展開) は意図的変更 (I-4) だが、**「詳細」ボタンのアイコン変化の有無** (mockup: caret ▼ が rotate 180deg / 実装: ChevronDown が rotate) は一致している。確認不要だが念のため記載 | mockup との構造差が大きく、詳細面の visual は「一致」と言えるが、全体 UX 設計の変更が大きい |
| G-2 | **sort select の代替**: D-8 に記載の通り、mockup の sort select (4 オプション) が実装では「合致度TOP3 + 件数ヒット表示」に置き換わった。合致度降順はユーザー価値がある新機能だが、時価総額順・セクター順などのユーザー制御 sort が消えた。これは事故 drift か意図的代替か判断が難しい | 実装の「合致度 TOP3」は mockup にない新機能だが、sort select 消滅の意図性が確認できない commit がない |
| G-3 | **`screener-strategy-bar` の background**: mockup の `.presets` は `body` の `radial-gradient` 背景 (L23-24) に載るだけで panel background なし。実装の `.screener-strategy-bar` は `background: var(--bg-subtle)` (L14590) が付いた帯状の背景を持つ | 実装の bg-subtle は screener v2 の toolbar との境界明確化として commit `a48e640` 「IA昇格」で追加。コメントに「toolbar と content の中間領域を semantic token で着色」と記載あり → 意図的の可能性が高いが explicit な「mockup から変える」記録なし |

---

## 修正優先度 (事故 drift 10件 の推奨順)

| 優先度 | ID | 工数目安 | 理由 |
|---|---|---|---|
| 高 | D-2 | 5分 | カスタムタグが neutral で埋没 → 精度変更状態の視認性ゼロ。1 行 CSS 変更で解消 |
| 高 | D-9 | 15分 | 件数ヒット表示が gold でなく埋没 → 「精度を変えるとリアルタイムで件数が変わる」体験が弱い。件数 b 要素に `color: var(--color-gold-mid)` + font-size 大型化で mockup 準拠 |
| 高 | D-7 | 20分 | 免責が微小テキストに埋没 → 景表法§5/§38 観点で mockup の bottom-of-page amber border 免責が強い。位置・文言両方の修正 |
| 中 | D-5 | 5分 | 「精度」視覚ラベルが消えた → aria-label のみでは視覚的に精度 seg の意味が不明。`<span class="ctrl-lab">精度</span>` を seg 左に追加 |
| 中 | D-1 | 10分 | section header 「銘柄スクリーナー」+ sub テキストが mockup の h1「スクリーナー」+ 「戦略を選ぶ → ...」から乖離。screener_v2 の IA 昇格後は ScreenerMaster が h1 相当を担うべき |
| 中 | D-4 | 10分 | 「絞り込み条件」という見出しラベルが実装にない → 詳細 accordion に label を追加 |
| 低 | D-3 | 2分 | lockbar の border-radius が 12px (実装) vs 8px (mockup)。軽微な視覚差 |
| 低 | D-6 | 30分 | fhint (preset 別ヒント文) が未実装。tooltip で代替済みだが常時可視性は低い |
| 低 | D-10 | 10分 | 旬のセクターの操作説明ヒント未実装 |
| 後回し | D-8 | 大 | sort select の復活は master-detail 全体の再設計を伴う。G-2 の user 確認後に判断 |

---

> 注: 既存 AUDIT (P3-9 / P3-10 / P3-11) は意図的変更として確認済みのため本表から除外。
> 本表は cosmetic/copy/visual のみを対象とし、semantic 乖離 (P0/P1/P2) は既存 AUDIT に委ねる。
