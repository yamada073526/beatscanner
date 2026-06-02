# Round 2-A: AI 図解 (DiagramCard) section IA 順序入替 SPEC

> handover v152 Round 2 の **A (最優先・IA変更)** を実行するための SPEC。
> autopilot セッション (2026-06-03) で **B/C/D は着地、A は user 判断待ちで DEFER**。
> 理由: 11 ブロックの再配置 + Section 6 分割は「大型 UX 再構成」で、正確な最終順序は user の
> 編集判断 (特にバリュエーションの位置) が入るため。視覚ハーネス (snap-diagram.mjs) は構築済なので、
> **user が下記の順序を承認すれば 1 セッションで実行 + 目視検証可能**。

## 現状の section 順序 (commit 着地後)

```
Header
1. 判定/5条件 (diagram-section-story)        ← verdict summary
2. バリュエーション + 配当 (valuation)
3. ビジネスモデル (business-flow)
3.5 セグメント別売上 (segment)
3.6 資本政策 (capital-return)
3.7 次Qガイダンス (guidance)
4. 数字で見る成長ストーリー (yearly)
4.5 FCF・設備投資 (fcf)
5. 強み・リスク対比 (strengths-risks)
6. 投資家への問い + ブル/ベア対比 (highlights)  ← 1 ブロックに同居
   + この決算のチェックポイント (checkpoint, Round 2-C で追加済)
```

## 提案する目標順序 (事業理解→実績→株価→将来→論点→締め)

```
Header
1. 判定/5条件                               ← 据置 (HERO verdict、2秒原則)
─ 事業理解 ─
2. ビジネスモデル                           ← バリュエーションの前へ (handover A①)
3. セグメント別売上
─ 実績 ─
4. 数字で見る成長ストーリー
5. FCF・設備投資
6. 資本政策                                 ← ※判断点1 (実績 or 株価?)
─ 株価 ─
7. バリュエーション + 配当                  ← ※判断点2 (実績の後ろへ大きく下る)
─ 将来 ─
8. 次Qガイダンス
─ 論点 ─
9. 強み・リスク対比
10. ブル・ベア対比                          ← Section 6 から分離、強み・リスクと隣接 (handover A②)
─ 締め ─
11. 投資家への問い                          ← 末尾へ (handover A③)
12. この決算のチェックポイント (§38 card)   ← 既に末尾配置済
```

## user に決めてほしい判断点 (2 つ)

- **判断点1: 資本政策の所属** — 「実績」(FCF の直後、現金の使い道として) か「株価」(配当=株主還元として valuation 隣) か。
  - 推奨: **実績** (FCF→資本政策 で「稼いだ現金→還元」の流れが自然)
- **判断点2: バリュエーションの位置** — 提案は「実績の後 (7番)」。ただし現状は 2 番目で、早く見たい user もいる。
  - A 案 (推奨): 実績の後 (7番)。「事業を理解→実績を見て→**それから**株価を判断」の教育的物語。
  - B 案: バリュエーションは 2 番目に据置 (株価を早く見せる)。この場合「事業理解→株価→実績→…」になり北極星の物語性はやや弱まる。

→ **判断点2 が最重要**。A 案 (valuation を下げる) で進めてよいか確認したい。

## 実装方針 (承認後)

### ブロック移動 (logic 変更なし、JSX 兄弟ブロックの cut/paste)
各 section は `<div style={{ padding: '4px 16px 20px' }}>` (DiagramCard.jsx 内) 直下の独立した conditional 兄弟ブロック。
testid で境界が明確なので、ブロック単位で順序を入れ替える。**各 section の instant skeleton / full / empty の全分岐を 1 ブロックとして一緒に移動する**こと。

### Section 6 分割 (唯一の構造変更)
現状 `diagram-section-highlights` は `投資家への問い (investorQuestions)` + `ブル/ベア (AccordionHeader + grid)` を 1 ブロックに同居。これを 2 つに割る:
- **9.5 ブル・ベア対比** = 新 section。VizSectionLabel「ブル・ベア対比」(icon は TrendingUp 等) + AccordionHeader (bullbear) + grid。強み・リスクの直後へ。
- **11. 投資家への問い** = 新 section。VizSectionLabel「投資家への問い」(HelpCircle) + investorQuestions list。末尾 (§38 card の前) へ。
- instant skeleton / empty state も 2 つに分割するか、簡略化して投資家への問い側に残す (要検討、最小工数なら empty/instant は片方に集約)。

### 検証 (ハーネス必須)
1. `cd frontend && npx vite build --config vite.preview.config.mjs`
2. `node scripts/snap-diagram.mjs --out .visual/diagram-A-reorder.png` → full-page で順序を目視
3. instant 分岐確認: fixture に `_phase: 'instant'` を一時付与して再 snap (skeleton 崩れチェック)
4. empty 分岐確認: fixture の各 section field を一時的に空にして再 snap (任意)
5. `npx vite build` (本番構文) + design-system-check

### リスク
- `first` prop: 現状どの section も `first` を使っていない (story は VizSectionLabel 非経由)。順序変更後、story 直後の section (= ビジネスモデル) は divider を出してよい (現状の valuation と同じ挙動)。`first` は不要。
- `flashRef` は 数字で見る成長ストーリー section に付く (year toggle flash 用)。移動時に ref を一緒に運ぶ。
- 営業利益率 sparkline は 売上高 trend に連動 (operatingMargins index 対応)。yearly section 内で完結するので移動の影響なし。

## 見積
2-4 時間 (ブロック移動 1h + Section 6 分割 1h + ハーネス目視 + 微調整 1-2h)。新規 token・新規 endpoint なし。
