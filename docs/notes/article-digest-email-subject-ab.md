# ArticleDigest email subject A/B 候補草案

> **目的**: handover v125 backlog #5「ArticleDigest email A/B (件名 emoji / 文言 dogfood 観察)」 の草案。 user 帰宅後選定用。
> **対象 file**: `backend/app/mailer.py` line 75 (cup-handle digest) + line 244 (article digest)
> **作成日**: 2026-05-28
> **既存 baseline**:
> - cup-handle digest: `"BeatScanner: ファンダ × Cup-Handle 形成銘柄 ({count} 件)"`
> - article digest: `"BeatScanner: 本日の厳選記事 {count} 本"`

---

## 観察軸 (dogfood 評価)

1. **open rate** (受信箱で開封されるか、 件名訴求の strength)
2. **click rate** (本文の link click 率、 件名と本文の整合)
3. **brand 整合**: Aman/Ritz-Carlton 級 (品格 + 興奮 + 楽しい) を保てるか
4. **金商法 §38 / 景表法 §5 safe**: 「買い推奨」 「上昇予測」 等の断定表現 BAN
5. **mobile preview**: スマホ通知欄で 40 文字以内に主訴求が収まるか (日本語 全角換算)

---

## Article Digest 件名 A/B 候補 8 案 (現行 baseline 込み 9 案)

| # | subject | 観察軸該当 | priority |
|---|---|---|---|
| **0** (baseline) | `BeatScanner: 本日の厳選記事 {count} 本` | 中立、 既存 metric の baseline | 既存 |
| 1 | `📈 BeatScanner: 本日の米国株記事 {count} 本` | emoji 1 個追加で開封率 verify、 brand 軽さ +α | 高 |
| 2 | `BeatScanner: 今日の注目 {count} 本 — IBD テクニカル × 5 条件` | pillar 2 訴求を件名に統合 (v125 マーケ launch punch line と整合) | 高 |
| 3 | `🔔 BeatScanner ダイジェスト: {count} 本の決算 + テクニカル分析` | 通知系 emoji + 「決算」「テクニカル」 両柱明示 | 中 |
| 4 | `📊 本日の米国株: {count} 本の最新分析 (BeatScanner)` | 「米国株」 を冒頭に置くことで SEO/AIO 想起率 verify | 中 |
| 5 | `BeatScanner: {count} 本の記事と本日の市場ハイライト` | 「市場ハイライト」 で記事 + マクロ抱合せ訴求 | 中 |
| 6 | `🌅 朝の米国株 brief: {count} 本 — BeatScanner` | 朝の時間帯 trigger 訴求、 「brief」 で短時間消費可と示唆 | 中 |
| 7 | `BeatScanner: {count} 件の検出 — Cup-Handle / RS 80+ / 5 条件` | 具体的シグナル名 3 件を件名に列挙、 IBD 投資家 hook | 低 (件名長過ぎ risk) |
| 8 | `📈 BeatScanner: 今日の米国株を 2 分で — 記事 {count} 本 + 図解` | 「2 分で」 + 「図解」 で AI 図解差別化訴求 | 高 |

### 推奨優先順位

1. **最有力**: 案 2 `BeatScanner: 今日の注目 {count} 本 — IBD テクニカル × 5 条件`
   - v125 マーケ launch punch line と整合
   - pillar 2 (テクニカル × ファンダ両輪) を件名で先制
   - 「今日の注目」 ラベル使用 = Pane 1 Hero と統一感
2. **次点**: 案 8 `📈 BeatScanner: 今日の米国株を 2 分で — 記事 {count} 本 + 図解`
   - 「2 分で」 = LP「2 秒で判定」 と整合
   - 「図解」 で BeatScanner 独自差別化機能訴求
   - emoji 1 個でスマホ通知欄 attention
3. **保守的安全策**: 案 1 `📈 BeatScanner: 本日の米国株記事 {count} 本`
   - 既存 baseline からの最小変更 (emoji 1 個追加のみ)
   - 開封率 lift だけ verify、 brand 影響 0

---

## Cup-Handle Digest 件名 A/B 候補 5 案 (現行 baseline 込み 6 案)

| # | subject | 観察軸該当 | priority |
|---|---|---|---|
| **0** (baseline) | `BeatScanner: ファンダ × Cup-Handle 形成銘柄 ({count} 件)` | 既存 | 既存 |
| 1 | `🎯 BeatScanner: 本日の Cup-Handle 検出 {count} 銘柄` | emoji + 「本日の」 で時間訴求 | 高 |
| 2 | `BeatScanner: {count} 銘柄が IBD パターンを形成 — Cup-Handle + 5 条件` | IBD 公式 brand を件名に活用 | 中 |
| 3 | `📊 BeatScanner: Leader + Breakout 候補 {count} 銘柄` | v125 6 体合議 verdict 「O'Neil 3 条件」 → 「Leader + Breakout + Cup-Handle 交差」 rename と整合 | 高 |
| 4 | `🔍 BeatScanner: テクニカル × ファンダ 交差 {count} 銘柄` | 「両輪」 訴求 | 中 |
| 5 | `BeatScanner ダイジェスト: 今日の急上昇候補 {count} 銘柄` | 「急上昇候補」 = momentum 訴求、 ただし「予測」 解釈 risk あり (金商法 §38 確認必要) | 低 |

### 推奨優先順位

1. **最有力**: 案 3 `📊 BeatScanner: Leader + Breakout 候補 {count} 銘柄`
   - v125 6 体合議 で確定した rename「Leader + Breakout + Cup-Handle 交差」 と統一
   - 「候補」 表記で断定回避 (金商法 §38 safe)
   - IBD/O'Neil 公式用語 を brand 訴求に活用
2. **次点**: 案 1 `🎯 BeatScanner: 本日の Cup-Handle 検出 {count} 銘柄`
   - 既存 baseline + emoji 1 個 + 「本日の」 で控えめ改善
   - 開封率 lift だけ verify

---

## A/B 実装方針 (Resend 経由)

### 段階的 rollout

1. **Phase 1 (帰宅後 user 選定後 1 週間)**: 案 0 (baseline) vs 案 2 or 8 vs 案 3 の 3 variants を 1/3 ずつ振り分け
   - Resend Audience の random sampling 機能を使用
   - 観察期間: 7 日間
   - 計測 metric: open rate / click rate / unsubscribe rate
2. **Phase 2 (Phase 1 verdict 後)**: best performing variant に統一、 もう一段の variant (emoji 違い / 文言一部差替え) で 2nd round

### 実装 file 変更箇所

`backend/app/mailer.py`:
- line 75 `SUBJECT_TEMPLATE` を A/B 対応化:
  ```python
  SUBJECT_TEMPLATE_VARIANTS = [
      "BeatScanner: ファンダ × Cup-Handle 形成銘柄 ({count} 件)",  # baseline
      "📊 BeatScanner: Leader + Breakout 候補 {count} 銘柄",        # variant A
      "🎯 BeatScanner: 本日の Cup-Handle 検出 {count} 銘柄",         # variant B
  ]

  def select_variant(user_email: str) -> str:
      # email hash の下位 2 bit で 0/1/2 振り分け (deterministic、 user 体験一貫)
      h = int(hashlib.md5(user_email.encode()).hexdigest()[:8], 16)
      return SUBJECT_TEMPLATE_VARIANTS[h % len(SUBJECT_TEMPLATE_VARIANTS)]
  ```
- line 244 `ARTICLE_SUBJECT_TEMPLATE` も同様に拡張

### Resend tracking

- Resend dashboard で variant 別の open/click rate を計測可能 (custom event)
- backend で `mailer.py` send 時に variant id を Resend metadata に attach、 集計時に group by

---

## brand 整合 self-review (Aman/Ritz-Carlton 級)

| 案 | 「驚き」 | 「豪華さ」 | 「興奮」 | 「洗練さ」 | 「楽しい」 |
|---|---|---|---|---|---|
| 案 2 (推奨) | ○ (両柱訴求) | ○ (IBD ブランド継承) | △ (「注目」 で控えめ) | ○ (静的、 断定回避) | △ |
| 案 3 (Cup-Handle 推奨) | ○ (「Leader + Breakout」 新表現) | ○ (IBD/O'Neil 用語) | ○ (「候補」 で前向き) | ○ | △ |
| 案 8 | ○ (「2 分で」 速さ) | △ | ○ (「図解」 で楽しさ) | ○ | ○ (emoji 1 個) |

「楽しい」 軸は emoji 使用 1 個までが Aman 級境界。 案 8 の `📈` 1 個は OK、 2 個以上は brand 毀損。

---

## user 帰宅後の selection 質問形式

```
Article Digest 件名 (現行: BeatScanner: 本日の厳選記事 {count} 本)
  A. 案 2 (pillar 2 訴求): BeatScanner: 今日の注目 {count} 本 — IBD テクニカル × 5 条件
  B. 案 8 (「2 分で + 図解」): 📈 BeatScanner: 今日の米国株を 2 分で — 記事 {count} 本 + 図解
  C. 案 1 (保守的): 📈 BeatScanner: 本日の米国株記事 {count} 本

Cup-Handle Digest 件名 (現行: BeatScanner: ファンダ × Cup-Handle 形成銘柄 ({count} 件))
  A. 案 3 (Leader + Breakout 推奨): 📊 BeatScanner: Leader + Breakout 候補 {count} 銘柄
  B. 案 1 (保守的): 🎯 BeatScanner: 本日の Cup-Handle 検出 {count} 銘柄
```

3 variants の A/B test を 1 週間並行運用後、 ベスト案で統一推奨。

---

## 関連 anchor

- [[feedback-railway-native-cron]] (nightly cron は Railway native、 article-notify / cup-handle digest と関連)
- [[feedback-article-auto-publish]] (final_status='passed' で自動 publish + email 通知)
- [[pillar2-technical-redesign]] (v125 マーケ launch punch line と件名整合)
