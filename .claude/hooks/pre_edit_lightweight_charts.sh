#!/bin/bash
# PreToolUse hook: lightweight-charts v5 で削除された旧 API の追加を block.
#
# 経緯 (v71 Phase 3-c dogfood 2026-05-15):
#   lightweight-charts v5.2.0 で `ISeriesApi.setMarkers()` が削除され
#   `createSeriesMarkers(series, markers)` primitive に migration された。
#   `typeof areaSeries.setMarkers === 'function'` guard が常に false →
#   Phase 3-a の earnings marker / Phase 3-c の ex-div marker が
#   silent fail していた事故が発生。
#
# 防止策:
#   .jsx/.tsx ファイルで `<anything>.setMarkers(` (= ISeriesApi の旧 API) を新規追加
#   しようとしたら block。 `createSeriesMarkers(` または primitive 返り値の
#   `<markersPrimitive>.setMarkers(` は許可。
#
# 関連 anchor: feedback_pane3_detail_view.md / lightweight_charts_v5_migration

INPUT=$(cat)

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
OLD=$(echo "$INPUT" | jq -r '.tool_input.old_string // ""')
NEW=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // ""')

# 対象: frontend/src/ + frontend-next/{components,app,hooks}/ の {jsx,tsx,js,ts}
case "$FILE" in
    */frontend/src/*.jsx|*/frontend/src/*.tsx|*/frontend/src/*.js|*/frontend/src/*.ts)
        ;;
    */frontend-next/components/*.tsx|*/frontend-next/components/*.ts)
        ;;
    */frontend-next/app/*.tsx|*/frontend-next/app/*.ts)
        ;;
    */frontend-next/hooks/*.tsx|*/frontend-next/hooks/*.ts)
        ;;
    *)
        exit 0
        ;;
esac

# 新規追加された行のみ検査 (old に既存なら許可、 new だけにあるものを block)
# 検出パターン:
#   - `series.setMarkers(`  (areaSeries / spySeries / lineSeries 等 ISeriesApi 系)
#   - `Series.setMarkers(`
#   - `Ref.setMarkers(` で current 経由でない場合
# 許可パターン:
#   - `createSeriesMarkers(` (v5 正規 API)
#   - `markersRef.current.setMarkers(` (primitive 返り値経由)
#   - `<primitive>.setMarkers(` (= createSeriesMarkers の return から)

# 簡略化: `\.setMarkers\(` のうち以下を許可リストとして除外
#   - createSeriesMarkers
#   - markersRef
#   - .current.setMarkers
#   - SeriesMarkersPlugin / SeriesMarkers (primitive 系)

new_calls=$(printf '%s' "$NEW" | grep -nE '\.setMarkers\(' | grep -vE 'createSeriesMarkers|markersRef|\.current\.setMarkers|SeriesMarkersPlugin|seriesMarkers\.setMarkers' || true)
old_calls=$(printf '%s' "$OLD" | grep -nE '\.setMarkers\(' | grep -vE 'createSeriesMarkers|markersRef|\.current\.setMarkers|SeriesMarkersPlugin|seriesMarkers\.setMarkers' || true)

# 新規追加 = new - old (行内容ベース比較; 行番号は new 側のもの)
if [ -n "$new_calls" ]; then
    added=()
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        # 行内容部分のみ抽出 (行番号: を除去)
        content=$(echo "$line" | sed 's/^[0-9]*://')
        # old に同じ行が存在しなければ「新規追加」
        if ! printf '%s' "$old_calls" | grep -qF "$content"; then
            added+=("$line")
        fi
    done <<< "$new_calls"

    if [ ${#added[@]} -gt 0 ]; then
        {
            echo "❌ lightweight-charts v5 migration (${FILE##*/}):"
            echo "   ISeriesApi.setMarkers() は v5.2.0 で削除されています:"
            for l in "${added[@]}"; do
                echo "     • $l"
            done
            echo ""
            echo "対応:"
            echo "   1. createSeriesMarkers(series, markers) で primitive を生成し ref で保持"
            echo "      → markersRef.current = lc.createSeriesMarkers(areaSeries, allMarkers);"
            echo "   2. 後続更新は primitive 経由"
            echo "      → markersRef.current.setMarkers(newMarkers);"
            echo ""
            echo "関連: feedback_pane3_detail_view.md (Phase 3-d) / lightweight-charts v5 typings"
        } 1>&2
        exit 2
    fi
fi

exit 0
