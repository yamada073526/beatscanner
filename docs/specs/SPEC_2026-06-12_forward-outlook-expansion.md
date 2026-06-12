# SPEC: 来期コンセンサス/会社の見通し — 内容拡充 (売上・EPS 以外のガイダンス項目)

- 起票: 2026-06-12 (user 起床 feedback「今は製品売上高のみ。他にも記載できる事項はないか」→「慎重に進めて」)
- status: **✅ Phase 1a (粗利率、`3bc291f`) + Phase 1b (OpEx+capex、`497614d` live) 着地**。gate 1 承認済 (6体合議 6/6 + user)。詳細 verdict + 承認 scope は §7
- 想定工数: Phase 1a 完了 / Phase 1b 完了 (backend 抽出 schema + bp3 few-shot + per-item verify + frontend GuidanceExtraRow)
- **Phase 1b 着地 (2026-06-12, `497614d`)**: guidance_extras (OpEx/capex) を 8-K/transcript から抽出。schema に field enum(opex/capex)+period_type+low/high/unit/basis/source_quote 追加、label_jp は静的 FIELD_LABEL_JP (LLM 非生成、frontend 1:1 mirror)、few-shot+BAD-8 は独立 bp3 (bp1/bp2 cache lineage 不変)、max_tokens 2048、per-item §38 verify (`null_unverified_extras`: source_quote 逐語 + 数値逐語、fail は行 drop)。dogfood verify: **NVDA 8-K (Q1FY27) GAAP $8.5B/non-GAAP $8.3B opex を逐語確認・正抽出 (buyback/税率は誤抽出せず)、AAPL/CRM/SNOW/JPM は []→非表示 (正)**。全中立色 (§38)、consensus 方向比較は新 field 非拡張。⏳ frontend 実機 visual は user dogfood 待ち (DOGFOOD creds 要、`frontend/scripts/snap-forward-extras.mjs` で再現可)。
- **Phase 1a 着地 (2026-06-12)**: 粗利率は既に `q_margin` で抽出済 + per-field verify 済だったため、LLM 不使用の Python 数値層で `next_q.company_q_margin_*` に surface + frontend `GuidanceMarginRow` 表示。dogfood verify: **NVDA gross 74.4〜75.5% / SNOW operating 12.5% 表示、AAPL/CRM/JPM は逐語 verify 未通過で非表示 (捏造せず正)**。frontend headless で「粗利率 会社見通し 74.4〜75.5%」表示確認。§38 完璧 (新規 LLM 面ゼロ)。

## 1. 目的

「来期 コンセンサス」(ForwardOutlookSection) の情報を、現状の **売上・EPS の 2 項目**から、企業が実際に
ガイダンスで公表している**他の主要項目**へ拡充する。決算速報 note の模範 (AAPL 例:「グロスマージン
47.5〜48.5%」) と同等の情報粒度を目指す (原則4: 投資家が 8-K/プレスリリースを自分で開いて確認する手間の代替)。

## 2. 候補フィールド (優先順位は 6体合議で確定)

| 候補 | 出所 (8-K EX-99.1 で頻出) | §38 リスク | 備考 |
|---|---|---|---|
| 粗利率ガイダンス (range) | AAPL/NVDA 等ほぼ毎回 | 低 (会社公表値の転記) | 模範 note と一致、第一候補 |
| 営業費用 OpEx ガイダンス | AAPL 等 | 低 | |
| 営業マージン/EBITDA マージン | SaaS 系 (CRM/SNOW/NOW) | 低 | non-GAAP 注記必須 |
| FCF / FCF マージン | SaaS 系 | 低 | non-GAAP 注記必須 |
| 税率・為替前提 | AAPL 等 | 低 | 表示優先度は低め? |
| セグメント別ガイダンス | 稀 (開示企業少) | 中 (欠損が多い) | 「記載なし」が正となる銘柄多数 |
| 通期 capex | ハイパースケーラー | 低 | AI 投資文脈で関心高 |

## 3. §38 / Hallucination Guard 境界 (must)

- **会社が公表した数値の逐語転記 = 事実 (OK)** / 数値からの示唆・評価・将来断定 = NG。
- 既存 sec_guidance_text の HG 4 層 (BAD-5/6 + source_quote 逐語 + blocklist + per-field verify) を**フィールド単位**に適用:
  各フィールドに `source_quote` (8-K 原文の逐語) を保持し、検証 fail したフィールドは**行ごと非表示** (捏造しない)。
  [[feedback_transcript_guidance_38_guards]] の per-field verify パターンを流用。
- 色: **全フィールド中立** (将来見通し。緑/赤/琥珀 一切なし — 過去確定のみ着色の現行ルール維持)。
- 「上方修正/下方修正」語は会社ガイダンス比 (`@company-guidance-revision` 注釈) 以外で使用禁止 (pre-commit Check 7)。
- non-GAAP 値には `(non-GAAP)` 注記必須 (basis mismatch の Trust Cliff 防止)。

## 4. 実装 sketch

1. **backend**: 8-K 抽出 prompt の出力 schema に `guidance_extras: [{field, label_jp, low, high, unit, basis, source_quote}]`
   を追加 (LLM は抽出のみ、計算なし = aggregator 不変)。pre-commit Check 1/3 の対象外パス (visualizer/) で実装。
2. **検証層**: source_quote が原文に逐語一致しないフィールドは drop (既存 verify と同型)。
3. **frontend**: ForwardOutlookSection「会社の見通し（原文）」の上 or 中に構造化行として表示 (中立色、
   `MetricBlock` 流用)。欠損フィールドは非表示。
4. **検証**: AAPL/NVDA/CRM/SNOW/JPM (開示なし系) で per-field 抽出精度を dogfood。

## 5. Gate (実装前に必須)

- **6体合議** (LLM 出力品質 + Trust Cliff の 2 軸 active → 6体): 金融 (§38 逐語境界) / マーケ (§5) /
  Anthropic engineer (抽出 prompt) / ui-designer (表示密度) / frontend / qa-dogfooder。
- 合議後に user 承認 (gate 1) → 実装。

## 6. 未決事項 (→ §7 で 6体合議 + user が確定)

- 表示フィールドの優先順位 (粗利率を第一候補と仮置き) → **粗利率第一で確定**
- 「会社の見通し（原文）」折りたたみとの関係 → **構造化行を上・原文は格下げ (撤去せず) で確定**
- 通期/来四半期どちらを優先表示するか → **来四半期主・通期従属で確定**

## 7. 6体合議 verdict + 承認 scope (2026-06-12、gate 1 承認済)

**判定: 6/6 条件付賛成** (金融§38 / マーケ§5 / Anthropic eng / ui-designer / frontend-architect / qa-dogfooder)。反対ゼロ。

### Phase 1 承認 scope (絞り込み)
- **対象 = 粗利率 range / OpEx / 通期 capex の 3 種に限定**。営業/EBITDA/FCF マージンは Phase 2 (non-GAAP 注記コスト + 精度低)。**セグメント別・税率/為替前提は見送り** (前者=カバレッジ欠損が支配、後者=「前提」と「見通し」の混同で §5 risk)。
- **来四半期を主表示・通期は従属**。`period_type: "quarter"|"annual"` を schema 追加し通期のみ開示 (capex 等) を区別、「来四半期: —」誤表示を防ぐ。
- **原文折りたたみは格下げ (構造化行を上) するが撤去禁止** (§38 出典担保)。トグル文言を「詳細ガイダンス(原文)」等へ改名検討。

### 必須実装条件 (合議で全員 or 多数が条件化)
1. **`label_jp` を LLM 生成させず enum + frontend/backend 共有の静的 dict** (`FIELD_LABEL_JP`)、`field` も enum 制約。→ BAD-1(英語混在)/§38/Check 7 の新穴を構造的に塞ぐ (Anthropic eng)。
2. **`basis` (gaap/non_gaap/null) を schema 必須化**。basis 不明は drop or「ベース不明」注記、`(non-GAAP)` 注記をラベル横 muted 9px。**consensus との方向比較 (above/below) を新フィールドに拡張しない** (basis mismatch 構造回避、金融)。
3. **`max_tokens` 1024→2048** + 各 source_quote maxLength 200-250 で締め。→ JSON truncate → silent「記載なし」Trust Cliff 防止 (Anthropic eng / qa)。
4. **新 few-shot は独立 block + 新 ephemeral breakpoint (bp3)**、既存 bp1/bp2 cache lineage 不変 (hit 80% 死守、Anthropic eng)。
5. **per-field 逐語 verify は backend で厳格適用** (`null_unverified_number_fields` + `_FIELD_NUM_KEYS` に新 field の (low/high) key 登録、unit test で漏れ固定)。frontend は `source_quote` の presence check のみ。margin/FCF の派生計算はこれで物理 drop。
6. **欠損は `guidance_extras: []` で返し行ごと非表示**。`{value:null}` の null 行を作らない (`low===null && high===null` AND チェック)。JPM/AAPL(8-K非開示)で `[]` が正常系であることを dogfood 合格条件に。
7. **BAD-8 追加** (Q&A のアナリスト発言 / 派生計算 margin を guidance 誤抽出、AMZN income÷sales 実例)。BAD-1〜6 は編集禁止・追加のみ。
8. **frontend: `GuidanceExtraRow` を module-level 新 component** (MetricBlock 簡易版、gold 縦ライン継承、ForecastBars なし)、**MetricBlock の外側 sibling** に配置 (snap-pdca selector 保護)。**FutureGrid (EarningsFlashSummary) は無改変**。fetch は `fetchGuidanceSurprise` lazy に相乗り (guidance/basic を律速しない)。data-testid を全 render path に。
9. **表示上限 3-4 フィールド** (次Q+通期 合計最大6)、schema に `max_extras` 制約 (マーケ/ui の文字壁回避)。

### 差別化提案 (採否は実装時 user 判断)
- **sector 別優先順位テーブル** (ハイパースケーラー=capex hero / SaaS=OpEx 上位)。Phase 1 は固定順 (粗利率→OpEx→capex) で開始、sector 別は Phase 2 候補 (マーケ)。
- **フィールド表示自体は Free 維持、gate は「時系列推移=Premium」「nightly push=Signature」に限定** (マーケ)。

### dogfood 合格条件 (実装後)
AAPL/NVDA/CRM/SNOW/JPM の 5 銘柄で per-field 抽出精度確認。JPM 等で `[]`→空行非表示。CRM/SNOW で basis 正しく付与。source_quote に抽出数値が逐語存在を手動確認。既存 来期 売上/EPS + guidance_pit バッジの回帰なし。
