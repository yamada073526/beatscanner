# multi-review 過去運用事例

過去の Phase gate / 重要設計判断で multi-review を起動した実例。 future 設計判断時の 参考 + 議論済テーマの再発防止用。

新規事例は handover に記録し、 historical interest があるものを本 file に転載する。

## 2026-05-10 画面全体 workspace 化の方針確定 (v62、 6 体合議)

**判断対象**: SPA classic を捨てて pane 構成の workspace UI に全面移行するか

**結果サマリー**:

- 6 体共通: WorkspaceShell 新設 + react-resizable-panels + URL = SSOT + Cmd+K palette
- UI/UX: ヘッダー tabs を Pane 1 nav に統合、 検索を palette 完全移管
- 設計: URL 経由で Linear 流、 frontend/ で完結 (Next.js 移行延期)
- 開発: localStorage 命名 `bs:ws:` namespace + `:v1` suffix
- 金融: **Pane 2 で 5 銘柄 × 5 条件 PASS/FAIL ヒートマップ (差別化最強)**
- Anthropic: `designing-workspace-ui` skill 即取り込み + `workspace_path_map.md` SSOT
- マーケター (条件付賛成、 軌道修正 5 件):
  - LP は workspace 化対象外 (SEO/AIO 死守)
  - MVP を 11-13 日 → 5-6 日に圧縮、 dogfood 3 日
  - 買付クイック登録を workspace 前に先行 (1 日、 CV +35-45%)
  - Pane 4 は AI chat → マクロニュース連動に転換
  - mobile は `/classic` 強制、 launch は「ヒートマップ」 一点突破

**統合結論**: マーケターの軌道修正を反映して MVP を 5-6 日に圧縮、 買付登録を先行、 ヒートマップを訴求軸に。

**詳細**: `memory/migration_v61_to_v62.md` 参照。

## 2026-05-17 Phase 4 hallucination guard 6 体合議 (v82)

**判断対象**: BAD-5 (断定的将来予測) / BAD-6 (最上級表現) を NEGATIVE_EXAMPLES に追加すべきか

**結果**: 6 体全員「条件付賛成」。 金融 + Anthropic + マーケター 一致で景表法 §5 / 金商法 §38 抵触リスク回避のため必須と判定。 4 BAD → 6 BAD に拡張、 frontend BLOCKLIST_REGEX も追加。

**詳細**: `memory/feedback_diagram_quality_guard.md` (BAD pattern + Trust Cliff DoD SSOT) 参照。

## 2026-05-17 Phase 5 3 体合議で十分判定 (v82)

**判断対象**: 「保有 × 5 条件 × Cup-Handle」 triage banner の設計

**結果**: 6 体合議実施したが、 Anthropic verdict 「3 体で十分だった」 (frontend 局所修正 + 既存 schema 維持なら ui-designer + frontend-architect + qa-dogfooder の 3 体で 30-50% cost 圧縮)。 これが CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 の起点。

**学習**: scope が limited (frontend 局所 + LLM prompt 不変 + RLS 触らず) なら 3 体合議で十分。 6 体は LLM 出力品質 / Trust Cliff / 新 backend endpoint + RLS / cache 設計 のうち 2+ active な時。

## 記録 template

新事例追加時のフォーマット:

```markdown
## YYYY-MM-DD <判断対象 short label> (vNN、 N 体合議)

**判断対象**: <判断対象>

**結果サマリー**:
- <共通結論>
- <専門家別 差別化提案>
- <対立論点があれば明記>

**統合結論**: <最終的に user が採用した方針>

**詳細**: <memory / handover 参照>
```
