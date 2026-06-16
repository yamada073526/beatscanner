# breakout 着手前 決裁ワークシート (2026-06-16 夜 autopilot 作成 / user 決裁待ち)

> **目的**: breakout Generator 着手の**唯一の残ゲート = 下記 9 件の決裁**(SPEC v2 是正✅ / retest infra✅ は充足済)。各項目に Claude 推奨を付した。朝に **「全部推奨で」** か **個別に調整** で即 unblock できる。決定は user、Claude は推奨のみ。
> 元 SPEC: `SPEC_2026-06-16_breakout-signal_draft.md`(v2)。decision⑫ は §12.4、F①-⑧ は §8 に inline。

---

## D⑫. pending × tier 境界 ★最重要(集客 × Trust Cliff)
- **論点**: pending(日中上抜け→終値未確認)を無料層に出すか。decision①(pending を出す)と ⑦(分類ラベル=Premium 物理除去)が**無料層で両立しない**(6体中5体 blocking/major)。
- **選択肢**: **(A)** pending を**無料 viz の中立注記**「日中上抜け/終値未確認」(色なし)で出し、Premium は確度判別(confirmed/soft/extended)+screener+nightly push に分離 / **(B)** pending も Premium に含める(無料層は何も見えない)。
- **推奨 = A**。**理由**: 発端の CPA が全 N で pending。物理除去(B)だと「新高値ブレイクを肩代わり」訴求の核(pending を正直に見せて Trust Cliff を殺す)が無料層に届かず CVR フックが死ぬ。A なら CPA デモを無料層で体験でき、Premium 価値は「確度の判別」に置ける(6体合議推奨)。**影響**: 無料 viz 層に中立 state 注記レイヤーを1つ追加(色なし=§38 安全)。

## F①. state namespace 最終形 ★先 lock 必要(伝播のため)
- **論点**: breakout state を `bo_*` か `newhigh_*` か。
- **推奨 = bo_***。**理由**: SPEC v2 で既に `bo_confirmed/pending/soft/extended` を全 reference に伝播済(107 箇所)。`newhigh_*` に変える実利なし。**影響**: lock で cup の `breakout_*` との名前衝突が確定的に解消。

## F②. extended(過熱)閾値の再キャリブレーション
- **論点**: base_rise > X% で extended(過熱=高値掴み注意)に降格。cup 流用の +25% は緩すぎ(pivot+20% 走った銘柄を clean breakout 表示=高値掴み誘導)。
- **選択肢**: A=>25%(cup流用) / **B=>10%(O'Neil原典寄り・暫定)** / C=>15%(中間)。SMA50 乖離も 30%(大型)/50%(中小) 固定か単一か。
- **推奨 = B(>10%)を暫定採用、ただし lock 前に③再計測**。**理由**: O'Neil 原典は pivot+5〜10% が買い妥当域。+25% は過延伸。ただし B だと extended が増えすぎる可能性 → **framework 確定後に breakout 実装し③(S&P500)で confirmed/extended 比を実測してから最終 lock** が安全。**影響**: 緑(confirmed)で出す銘柄数に直結(Trust Cliff 軸)。

## F③. prior uptrend / stage filter の形式 + 訴求降格
- **論点**: 落ちるナイフ(bear-market rally の戻り高値抜け)を confirmed=緑で出さないための地合い gate。
- **選択肢**: 形式= ① `pivotH>SMA50 かつ 50DMA上向き`(2条件 AND) / ② `close>SMA200`(単独)。+ 検出激減時に訴求を「新高値ブレイク」→「短期高値更新(地合い未確認)」に降格するか。
- **推奨 = ①(2条件 AND)、訴求降格は③再計測後に判断**。**理由**: autopilot 実測で①は上げ相場で検出コスト0(confirmed 100%残存)かつ下げ相場の faulty base を弾く安全網。CPA も above200 & 50DMA↑(健全 uptrend 内の日中失敗)で①を通過。降格是非は実装後③で検出数を見てから。**影響**: 金融致命リスク(落ちるナイフ量産)の防止。

## F④. screener RS filter 閾値
- **論点**: `/api/scanner/breakout` の default RS 絞り込み値。
- **選択肢**: `rs_ratings.universe_percentile >= 70` / `>= 80` / `rs_vs_spy_pct > 0`(retest 同型)。
- **推奨 = universe_percentile >= 70**。**理由**: retest A先行 screener と同じ rs_ratings JOIN(SSOT・二重実装廃止)。70 は「市場上位3割」で IBD 流の妥当下限。80 は厳しすぎて件数が枯れるリスク。**影響**: screener 件数と質のトレードオフ。

## F⑤. 3 signal 同時検出時の priceCell 優先順位
- **論点**: retest / breakout / cup_handle が同時 detected の時、StateCompass priceCell で何を主表示するか。
- **選択肢**: retest > breakout > cup(暫定) / cup_handle confirmed(ベース完成直後)を breakout(当日のみ)より上に置く逆転案。
- **推奨 = retest > breakout > cup を暫定、6体合議で逆転案を検証**。**理由**: 直近の押し戻し買い場(retest)が最も actionable。ただし「cup ベース完成 confirmed は breakout より構造的に重要」という反論は妥当 → 合議で確定。**影響**: 同時検出時の表示の一貫性。

## F⑥. bo_soft chip の出来高倍率 inject
- **論点**: soft(出来高やや不足)の chip ラベルに ×倍率を動的に出すか。
- **推奨 = `BUY_ZONE_LABEL_JP` は「出来高やや不足 ×{VOL_RATIO}」動的 inject / `COMPASS_PRICE_LABEL` は固定文字列**。**理由**: chip は数値併記で情報量↑、compass は2秒理解優先で固定。**影響**: 軽微(表示文言のみ)。

## F⑦. 相対出来高 chip の色 tone
- **論点**: volRatio>=1.5 の相対出来高 chip を緑にするか中立 muted か。
- **推奨 = 中立 muted**。**理由**: 出来高は方向(上昇/下落)を持たない指標。緑は「上昇」専用(投資色ルール)。出来高の多寡を緑にすると誤シグナル。**影響**: §38/色ルール遵守。

## F⑧. StateCompass priceCell の confirmed 色
- **論点**: confirmed breakout を信号機サマリーで緑(gain)にするか warn(amber)固定か。
- **推奨 = warn(amber)固定**(§2.3.1、暫定)。**理由**: StateCompass は「信号機サマリー」。confirmed 緑が「買い時」誤認を生む §38 リスク。chip/tooltip 層は §2.4 で gain 可(過去確定事実の polarity)。2層分離は既存 retest 実装(signal='warn')とも整合。**影響**: §38 境界(最重要バグカテゴリ)。

---

## 決裁後の流れ
1. 上記を lock(特に F① state namespace を最初に) → SPEC を final lock。
2. **§12.3 MAJOR 13件** を決裁内容に沿って SPEC v3 反映(avgVol50 三重定義統一 / bo_* 伝播漏れ `_STATE_PRIORITY`・`_detect_signal_transitions` / masking 実態=get_technical に plan gate 無し 等)。
3. F②③ の data 依存項目は breakout 実装後に③(S&P500)で実測 → 値を確定。
4. 再6体合議(Phase gate)→ implementation_ready 確認 → Generator 着手。
