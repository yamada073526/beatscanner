# Article body_md backfill SQL (v125 P1'-3 verdict)

> **目的**: P1'-3 Hallucination Guard DoD verify で検出した BAD-6「圧倒的シェア」 1 件を DB layer でも clean。
> **対象**: `nvda-202605262204` の body_md 内 1 sentence
> **risk**: 低 (1 article、 1 sentence、 意味維持)
> **判断**: user 帰宅後の任意 cleanup task として保留 (frontend `ArticleBody.jsx` sanitizeText で表示時除去済、 user 体験は safe)

## 検出経緯

P1'-3 で Supabase published articles 9 件を BLOCKLIST_REGEX で grep verify したところ、 `nvda-202605262204` の body_md に「圧倒的シェアを持つ NVDA」 (BAD-6 最上級表現、 景表法 §5 抵触) が残存。 frontend `ArticleBody.jsx` の sanitizeText 第 3 層で sentence 削除されるため user 視覚は safe、 ただし DB layer は raw のまま。

## SQL (user 帰宅後 Supabase SQL Editor で実行)

```sql
-- nvda-202605262204 article の body_md 内「圧倒的シェアを持つ NVDA」 を「高い市場シェアを持つ NVDA」 に置換
-- frontend sanitize は変わらず動作、 DB layer も BAD-6 clean に
update articles
set body_md = replace(body_md, '圧倒的シェアを持つ NVDA', '高い市場シェアを持つ NVDA'),
    updated_at = now()
where slug = 'nvda-202605262204';

-- 確認 query (実行後)
select slug, position('圧倒的' in body_md) as 圧倒的_pos
from articles
where slug = 'nvda-202605262204';
-- 期待: 圧倒的_pos = 0 (= 該当 substring 不在)
```

## 横展開判断

- 過去 article で「圧倒的」 を含む他例も backfill する必要は **なし** (本件のみ frontend ArticleBody sanitize が確実に動く前提で deploy 済)
- 今後の article 生成は writer.py の system prompt + frontend sanitize の 4 重防御で予防 (BAD-6 anti-pattern v123 強化済)
- v125 で「圧倒的」 を含む新規 article 生成された場合は本 SQL を template に同 pattern で backfill

## 関連 anchor

- [[feedback-diagram-quality-guard]] (BAD 1-6 pattern + Trust Cliff DoD SSOT)
- [[feedback-ticker-universe-validation]] (v123 ticker hallucination 構造予防、 BAD-7)
- [[feedback-data-completeness-guard]] (per-source data namespace、 frontend sanitize layer)
- v125 handover §「P1'-3 Hallucination Guard DoD verify」
