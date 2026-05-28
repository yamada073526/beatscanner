# JudgmentDetail.jsx 依存関係 map (Phase 4-B Sprint A 着手準備)

> **目的**: 1422 行 monolithic JSX を `FundamentalsAccordion.jsx` + `MarketEvalSection.jsx` + `ContextSection.jsx` に named component 抽出する Sprint A の navigation aid。 順序変更 (Sprint B) は別 commit。
>
> **作成日**: 2026-05-28 (v125 自律 PDCA 中)
> **対象 commit**: 3160f08 (R3 hotfix 着地後)
> **target SPEC**: `docs/specs/SPEC_2026-05-28_pillar2-technical.md` §11-B Phase 4-B patch

---

## 1. Feature flag 4 種 (L133-192)

抽出時、 各 section の switch 分岐を named component に正確に移植する必要あり:

| flag fn | 用途 | localStorage / URL trigger |
|---|---|---|
| `isPane3V1()` (L133) | レガシー v1 mode | localStorage `pane3_v1` |
| `isPane3ScrollV1()` (L143) | scroll-only fallback (発光バグ撤回コスト最小化) | URL `?scroll_v1=1` / localStorage |
| `isPane3V2()` (L154) | v2 mode (header structure 変更) | URL `?pane3_v2=1` |
| `isPane3V3()` (L174) | v3 mode (現行) | URL `?pane3_v3=1` |
| `isPane3V2Frameless()` (L192) | v2 mode 内の frameless opt-in | URL `?frameless=1` |

**Sprint A 注意**: hoist 済 (L575-580)、 named component 抽出時 props 経由で渡す必要あり (component スコープから外に出るため)

---

## 2. Hooks (early return 前必須、 v107 hotfix L386-411 で移動済)

| hook | 用途 | early return 前必須 |
|---|---|---|
| `useJudgment().selectedTicker` (L290) | active ticker | ○ |
| `useWorkspaceStore` 4 fields (L293-298) | pulsingConditionIndex / expandedSections / expandSection | ○ |
| `useRelatedArticle(selectedTicker)` (L301) | 関連記事 1 件 | ○ |
| `useEffect ?section=` URL parse (L310) | section deep link | ○ |
| `analystHaloTriggerRef = useRef(null)` (L324) | AnalystPanel halo trigger | ○ |
| `qhistoryHaloTriggerRef = useRef(null)` (L325) | QuarterlyHistoryTable halo trigger | ○ |
| `haloFiredSetRef = useRef(new Set())` (L332) | 1 回限り halo guard | ○ |
| `useEffect ticker change → halo Set clear` (L333) | halo reset | ○ |
| `analyzedTickerRef = useRef(null)` (L342) | auto runAnalyze 重複 fire 防止 | ○ |
| `useEffect auto runAnalyze` (L343) | ticker mount で runAnalyze fire | ○ |
| `valuationExtras = useState(null)` (L363) | Forward P/E / PEG | ○ |
| `useEffect fetchValuation` (L364) | valuation-extras endpoint | ○ |
| `ch2Tab = useState(L390)` | 章 2 tab state (v107 hotfix で 移動) | ○ |
| `ch3Tab = useState(L411)` | 章 3 tab state | ○ |

**Sprint A 注意**: hooks 順序は React の rule of hooks で固定。 named component 抽出時 props 経由で渡す必要 (state / ref を hoist しない場合)。

---

## 3. AccordionSection ID 配列 (順序入替時の wire マッピング)

現行順 (L833-1306):

| section id | line | tier | default state | feature flag |
|---|---|---|---|---|
| `sec-profile` | L833 | (header) | - | isV3 / isV2 / scroll |
| `sec-ch2-tabs` (SectionFade) | L867 | (sub) | - | isV2 only |
| `sec-quarterly-history-v3` | L908 | (sub) | - | isV3 only |
| `sec-guidance` (SectionFade) | L928 | - | - | isV2 only |
| `sec-earnings-history` (SectionFade) | L941 | - | - | isV2 only |
| `sec-analyst-v3` | L979 | - | - | isV3 only |
| `sec-insights-v3` | L988 | - | - | isV3 only |
| `sec-analyst` | L1002 (div) / L1011 (Accordion) | 2 | collapsed | isScrollV1 vs Accordion |
| `sec-quarterly-history` | L1052 / L1058 | 2 | collapsed | 同上 |
| `sec-insights` | L1103 / L1114 | 2 | collapsed | 同上 |
| **`sec-chart`** (SectionFade) | L1141 | - | (常時 visible) | - |
| **`sec-target-and-zone`** (SectionFade、 **v125 新規追加**) | L1150 | - | (常時 visible) | - |
| `sec-earnings-reaction` | L1162 / L1167 | 2 | collapsed | isScrollV1 vs Accordion |
| `sec-insider` | L1195 / L1206 | 2 | collapsed | 同上、 PremiumLock 内包 |
| `sec-news` | L1244 / L1250 | 2 | collapsed | 同上 |
| `sec-ir` | L1273 / L1279 | 2 | collapsed | 同上 |
| `sec-10k` | L1300 | 2 | collapsed | (PremiumLock 内) |
| (sec-detail-report 等は L1306+) | | | | |

**Sprint A 抽出 grouping 提案**:

- `FundamentalsAccordion.jsx`: sec-profile / sec-quarterly-history / sec-guidance / sec-earnings-history / sec-analyst (+ -v3 variants) + sec-insights / sec-ch2-tabs
- `MarketEvalSection.jsx`: ※ Phase 4-B で「市場評価」 章を独立 component 化、 sec-analyst / sec-insights が候補
- `ChartTechnicalSection.jsx`: sec-chart / sec-target-and-zone (v125 新規) / sec-earnings-reaction
- `ContextSection.jsx`: sec-insider / sec-news / sec-ir / sec-10k / sec-detail-report

---

## 4. Halo trigger ref chain (XL blast radius source)

```
JudgmentDetail.jsx (parent)
├── analystHaloTriggerRef = useRef(null)         L324
│   └── <AnalystPanel haloTriggerRef={ref} />    (AccordionSection 内、 sec-analyst)
│       └── AnalystPanel.jsx で useEffect(() => { haloTriggerRef.current = triggerOnAccordionOpen; }, [haloTriggerRef]);
│
├── qhistoryHaloTriggerRef = useRef(null)        L325
│   └── <QuarterlyHistoryTable haloTriggerRef={ref} />  (sec-quarterly-history)
│       └── 同 pattern で halo trigger を register
│
└── haloFiredSetRef = useRef(new Set())          L332
    └── AccordionSection の onOpenChange(id, true) で:
        - haloFiredSetRef.current.has(id) なら skip (1 回限り)
        - 未発火なら haloTriggerRef.current?.() 呼出 + Set に id 追加
        - ticker 切替時に Set.clear()  (L333 useEffect)
```

**Sprint A 注意**:
1. analystHaloTriggerRef / qhistoryHaloTriggerRef を `FundamentalsAccordion` 内に隠蔽すると、 parent (JudgmentDetail) からの onOpenChange 経由の halo trigger が壊れる risk
2. `haloFiredSetRef` は ticker change で clear するため parent に維持必須
3. Sprint A では **halo ref chain は parent に残す** (named component 内では ref を介して trigger を register するのみ、 既存 API 維持)

---

## 5. expandedSections Set (URL deep link 経路)

```
URL ?section=<id>
  → useEffect (L310) で new URLSearchParams(window.location.search).get('section') 取得
  → expandSection(sectionId) 呼出 (workspaceStore Set に追加)
  → AccordionSection の controlledOpen={expandedSections.has('XXX') || undefined}
  → expanded 状態が forced 適用
```

**Sprint A 注意**: section id (`sec-XXX`) は URL deep link と直結。 Sprint B 順序変更で id をそのまま維持しないと、 既存 bookmark / SEO URL が壊れる。

**Phase 4-C (URL parameter sync) の §11-C patch**: section id namespace 確定後に enum allowlist で validate、 backward compat redirect 必要なら追加。

---

## 6. SectionFade staggerIndex (visual hierarchy、 順序入替時の wire 移植必須)

```
SectionFade staggerIndex=0: Hero / KpiStrip 等 (L700 周辺)
SectionFade staggerIndex=1: sec-ch2-tabs (L867), sec-guidance (L928)
SectionFade staggerIndex=2: sec-earnings-history (L941)
SectionFade staggerIndex=3: sec-chart (L1141), sec-target-and-zone (L1150)
```

**Sprint A 注意**: staggerIndex は section の登場 timing (fade-in delay) を制御。 順序入替 (Sprint B) で staggerIndex を新順序に合わせて再計算する必要 (例: 図解 sticky が staggerIndex=0、 Chart が staggerIndex=1、 etc.)。

---

## 7. Sprint A (抽出分離) 推奨着手手順 (frontend-architect verdict)

1. **baseline**: snap-pdca-loop で AAPL / NVDA / TSLA / MSFT / AMZN の Pane 3 PNG 5 枚保存 (`.visual/phase4b-baseline/`)
2. **named component 抽出**:
   - `frontend/src/features/judgment/components/detail/FundamentalsAccordion.jsx` 新規 (Profile / Guidance / EarningsHistory / QuarterlyHistory / Insights / AnalystPanel を内包)
   - props: `selectedTicker / plan / isV2 / isV3 / isScrollV1 / analystHaloTriggerRef / qhistoryHaloTriggerRef / expandedSections / expandSection / detailContext / valuationExtras / ch2Tab / setCh2Tab` 等
3. **JudgmentDetail.jsx は composition root に薄化**: `<FundamentalsAccordion {...props} />` で置換、 描画順序は不変
4. **build pass + snap-pdca-loop で 5 銘柄 visual regression 0 を確認** (Sprint A は順序不変 = 視覚差分 0 が DoD)
5. **commit**: `feat(v125 Phase 4-B Sprint A): JudgmentDetail から FundamentalsAccordion 抽出`

---

## 8. 触ってはいけない箇所 (v82 / v107 hotfix で固定済)

- L386-411 ch2Tab / ch3Tab useState の位置 (early return 前必須、 React #310 fix)
- L324-333 halo ref chain (AccordionSection の onOpenChange 呼出 timing)
- L342-354 analyzedTickerRef auto runAnalyze (strict-mode double-invoke 対応)
- L310 ?section= URL deep link (Phase 4-C と直結)

---

## 9. risk register (Sprint A 着手前確認)

| risk | 影響 | 緩和策 |
|---|---|---|
| named component 抽出で feature flag 漏れ → silent regression | UI 一部表示崩れ | snap-pdca-loop 5 銘柄 visual regression 0 を DoD に明記 |
| halo ref chain 切断 → AnalystPanel halo 不発 | 視覚 polish 低下 | Sprint A 着地後に手動 dogfood で halo 発火確認 |
| expandedSections forced expand 壊れ → URL ?section= 不動 | bookmark / SEO 流入 user の deep link 壊れ | Sprint A DoD に URL ?section=sec-analyst で正しく expand する e2e test 1 件追加 |
| ch2Tab / ch3Tab state lifting に失敗 → useState 位置違反 | React #310 再発、 真っ白事故 | Sprint A は state を hoist せず props drilling で渡す |

---

## 10. 関連 memory anchor

- [[pillar2-technical-redesign]] (v125 SSOT、 §11-B Phase 4-B patch)
- [[feedback-chart-overlay-safety]] (v75 真っ白事故、 ReferenceLine 追加時の 4 層防御)
- [[feedback-dead-code-hook-dependency]] (v84 真っ白事故、 useEffect import 削除 risk)
- [[css-specificity-gotchas]] (compound .X.is-arriving:hover 4 セット、 halo trigger と直結)
- [[feedback-feature-flag-dual-mode]] (URL + localStorage dual mode、 Phase 4-B pane3_v4 flag pattern)
- [[feedback-multi-review-3-panel-workflow]] (Sprint A 着地後の 3 体合議 起動 SOP)
