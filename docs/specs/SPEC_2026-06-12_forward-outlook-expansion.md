# SPEC: 来期コンセンサス/会社の見通し — 内容拡充 (売上・EPS 以外のガイダンス項目)

- 起票: 2026-06-12 (user 起床 feedback「今は製品売上高のみ。他にも記載できる事項はないか」→「慎重に進めて」)
- status: **DRAFT — 6体合議 gate 前 (実装着手禁止)**
- 想定工数: 3-5 人日 (backend 抽出 2-3 + frontend 1 + 検証 1)

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

## 6. 未決事項 (user 判断)

- 表示フィールドの優先順位 (粗利率を第一候補と仮置き)
- 「会社の見通し（原文）」折りたたみとの関係 (構造化行が増えたら原文は格下げ?)
- 通期/来四半期どちらを優先表示するか
