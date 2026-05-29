# SPEC v2: Cup-Handle `pullback_to_support` state 追加 (6 体合議反映)

**v1**: 2026-05-30 main session draft → user gate 1 承認 (「着手 OK」)
**v2**: 2026-05-30 v132 セッション、 Phase 0 6 体合議 verdict 集約反映
**status**: 🟡 v2 user gate 2 承認待ち、 実装未着手
**主要修正**: release 後 defer 推奨 (金融 / Anthropic 2 体)、 閾値再設計、 hysteresis 定義、 narration 法的修正、 既存関数内分岐で工数圧縮

---

## 6 体合議 verdict 集約

| 役 | verdict | 主要指摘 |
|---|---|---|
| ui-designer | APPROVE w/ MODIFY | 英語混在 (entries/idiom/band low) を日本語化、 chip tone は `warning` (amber) |
| frontend-architect | APPROVE w/ MODIFY | CUP_SELL_ZONE_DESC_JP entry 追加、 state_priority map に既存漏れ 2 state (cup_completing/breakout_extended) 同時整理 |
| qa-dogfooder | MODIFY | state hysteresis 未定義 + recent_high 定義揺れ + Hero 空欄 fallback + narration「entries」 → 4 件 release blocker |
| 金融アナリスト (Opus) | MODIFY | 閾値再設計 (5% は緩すぎ、 +8% は遠すぎ、 -3% は危険)、 volume condition 追加、 narration「目安」 重複削除、 **release 後 defer 推奨** |
| Anthropic engineer (Opus) | MODIFY | DB migration 不要 (CHECK constraint なし)、 新規 `_detect_pullback_to_support` 関数化回避 (既存 `_detect_cup_handle` 内分岐で OK、 0.5 人日圧縮)、 Phase 0 を 3 体合議圧縮可、 **release 後 defer 推奨** |
| マーケター | APPROVE | release 前 nice-to-have、 LP 訴求強 (じっちゃま idiom)、 retention DAU 増効果 |

**集約方針**: APPROVE 2 / MODIFY 4 → SPEC v2 に MODIFY 必要事項を反映、 **release 前 vs release 後の判断は user gate 2 (本 v2 承認)** で確定。

---

## v2 主要変更点 (v1 から)

### 1. release timing → defer 推奨 (3 体反対意見あり、 user 最終判断)
- 金融 + Anthropic engineer = release 後 ([[feedback-pre-release-priority]] SOP 「コンテンツ完成 → release 準備 → 集客」 順序)
- マーケター = release 前 nice-to-have (じっちゃま idiom 訴求)
- qa-dogfooder = release blocker (修正なしでは release 不可)
- **推奨**: release 後 Sprint で着手、 release 前は P1-A 文言改善 + 方針 #12 GC chip + 既存 dogfood に集中

### 2. §4 判定条件 (金融アナリスト Opus verdict)
v1 から閾値再設計、 volume condition 追加:

| 条件 | v1 | v2 推奨 (3 段選択) |
|---|---|---|
| ②高値から押し% | ≥ 5% | **≥ 7% / 10% / 12%** (5% は noise) |
| ③band 接近% | ≤ 8% | **≤ 3% / 5% / 8%** (+8% は遠すぎ) |
| ④band_low buffer | -3% | **-2% / -3% / -5%** (-3% は intraday wick で誤発火) |
| ⑤ pullback volume | (なし) | **追加: pullback 期間の volume < 50DMA volume avg (Minervini「low volume pullback」)** |

backtest で 3 段比較 + DoD <25% false positive 達成案を採用。

### 3. §4.1 state hysteresis (qa-dogfooder verdict 1)
v1 で未定義の遷移後ロジック追加:
- `pullback_to_support` → `breakout_extended` 戻りは **band+8% を 3 連続営業日上回る** 場合のみ
- `pullback_to_support` → `formation_market_weak` 移行は **band_low 割れ確定 (3% buffer 外 + 3 連続営業日)** 後
- これで「毎日 state が行き来する」 UX 崩壊を防ぐ

### 4. §4.2 recent_high 定義 (qa-dogfooder verdict 2)
**breakout_confirmed_date 以降の局所 252 営業日 high** を採用 (52週高値ではなく)。
NVDA 例: $214 (局所高値) を採用、 $974 (2025 年初 52w high) は対象外。

### 5. §6 narration 修正 (ui-designer + qa-dogfooder + 金融 verdict)
v1 ↓:
```
detail: "O\'Neil 著では breakout 後の押し目買いは支持線で entries を取る idiom として紹介されています。
ただし band 下抜けは pattern failure の signal にもなり得るため、 損切り目安は band low の -3% が目安です。"
```
v2 ↓:
```
conclusion: "直近高値から押し戻し、 長期支持線まで残り {DIST_PCT}% の局面です。"
detail: "「How to Make Money in Stocks」 では breakout 後の押し目で支持線が機能するかを観察する手法が紹介されています。
band low を明確に下抜けた場合は pattern failure の signal として参考水準に band low -3% 前後が言及される事例があります。
投資判断はご自身でご確認ください。"
```
- 「entries を取る」 → 「観察する」 (金商法 §38 抵触回避)
- 英語混在「O'Neil 著」 → 「『How to Make Money in Stocks』」 / 「idiom」 → 「手法」 (5 原則 §1)
- 「目安」 2 回重複 → 「参考水準」 / 「事例 / 言及」 で出典化
- 免責「投資判断はご自身でご確認ください」 末尾必須

### 6. §5.6 screener Hero 空欄 fallback (qa-dogfooder verdict 3)
該当銘柄 0 件のとき:
- 4 セクション目を **「該当銘柄はありません」 empty state** で表示 (CLS envelope 維持)
- もしくは **第 4 セクション自体を hide** (該当時のみ表示、 conditional render)
- 推奨: hide で「常時空欄」 不快感を回避

### 7. §5 backend 影響範囲 (Anthropic engineer verdict)
- **CHECK constraint 緩和 削除** — pattern_signals.state は `text not null` で制約なし (migration 不要)
- **新規 `_detect_pullback_to_support` 関数化回避** — 既存 `_detect_cup_handle` 内 (v126 R13-5 breakout_extended fallback の直後) に分岐挿入で OK、 0.5 人日圧縮
- **state_priority map 一元化** — main.py:14938 の dict に既存欠落 2 state (cup_completing / breakout_extended) + 新 pullback_to_support を同時追加、 module-level `_STATE_PRIORITY` 定数抽出

### 8. §8 Phase 区切り 工数圧縮 (Anthropic engineer)
| Phase | v1 工数 | v2 工数 |
|---|---|---|
| Phase 0 (合議) | 6 体合議 ~$3-5 | **3 体合議 ~$1.5-2** (Anthropic engineer 推奨、 [[multi-review-3-vs-6]] 3 軸全 ○) |
| Phase 1 (backend) | 1.5-2 人日 | **1-1.5 人日** (関数化回避で 0.5 圧縮) |
| Phase 2 (frontend) | 0.5-1 人日 | 同 |
| Phase 3 (dogfood) | 0.5 人日 | 同 |
| **合計** | 2.5-3.5 人日 | **2-3 人日** |

### 9. §7 DoD 追加 (Anthropic engineer verdict)
- Phase 1 DoD: `BUY_ZONE_DESC_JP.pullback_to_support` の文言が `frontend/src/lib/blocklist.js` BLOCKLIST_REGEX で sentence 削除されないことを unit test
- Phase 1 DoD: `state_priority` map 一元化 (cup_completing + breakout_extended + pullback_to_support 同時追加)
- Phase 2 DoD: SellZoneCard で `CUP_SELL_ZONE_DESC_JP.pullback_to_support` undefined 参照 silent failure 回避 (chip label 空欄防止)

---

## user gate 2 承認 checklist

- [ ] **release timing 判断**: release 前 nice-to-have / **release 後 defer** (推奨) — 6 体合議 3:3 split、 user 最終判断
- [ ] **§4 閾値再設計 3 段選択**: 7%/+5%/-3% (推奨中央値) or 10%/+3%/-2% (保守) or 5%/+8%/-3% (v1 維持)
- [ ] **§4.1 hysteresis**: 3 連続営業日 buffer の妥当性
- [ ] **§5.6 Hero fallback**: hide / empty state のどちら
- [ ] **§6 narration 修正**: 法的修正 + 英語日本語化 が brand 整合
- [ ] **Phase 区切り工数**: 2-3 人日 + Phase 0 3 体合議 cost ~$1.5-2

承認後の next action:
- release 後 defer → handover に SPEC v2 を「next sprint backlog」 として記録、 終了
- release 前着手 → Phase 0 (3 体合議) 起動 → Phase 1 backend 着手

---

## v1 → v2 主要差分要約 (1 行)

「閾値再設計 + hysteresis 追加 + narration 法的修正 + 新規関数化回避 + Phase 0 3 体圧縮 + release 後 defer 推奨」
