import { describe, it, expect } from 'vitest';
import { buildSegmentSummaryText, translateSegmentName, displaySegmentName } from './segmentNames.js';

// v6 Sprint 2-C 後続: 会社概要 fold ヘッダーのセグメント%サマリー文字列生成。
// §38-safe: 売上構成比 (事実数値) のみ。行動指示・将来予測・最上級を含まないことを構造で担保。
describe('buildSegmentSummaryText', () => {
  // displaySegmentName の辞書和訳と切り離すため辞書非収載の name を使う
  // (iPhone/Mac は dict pass-through、 セグメント名は別途 displaySegmentName 側でテスト)。
  it('top2 + ほか を value_b 降順で生成する', () => {
    const seg = {
      segments: [
        { name: 'Seg-B', value_b: 26 },
        { name: 'Seg-A', value_b: 51 },
        { name: 'Seg-C', value_b: 12 },
        { name: 'Seg-D', value_b: 11 },
      ],
    };
    // total=100 → Seg-A 51% · Seg-B 26% · ほか (降順整列)
    expect(buildSegmentSummaryText(seg)).toBe('Seg-A 51% · Seg-B 26% · ほか');
  });

  it('セグメント 2 件以下では「ほか」を付けない', () => {
    const seg = { segments: [{ name: 'Seg-A', value_b: 60 }, { name: 'Seg-B', value_b: 40 }] };
    expect(buildSegmentSummaryText(seg)).toBe('Seg-A 60% · Seg-B 40%');
  });

  it('topN を変更できる', () => {
    const seg = {
      segments: [
        { name: 'A', value_b: 50 },
        { name: 'B', value_b: 30 },
        { name: 'C', value_b: 20 },
      ],
    };
    expect(buildSegmentSummaryText(seg, 3)).toBe('A 50% · B 30% · C 20%');
  });

  it('segments 不在 / null / total 0 は null (graceful skip)', () => {
    expect(buildSegmentSummaryText(null)).toBeNull();
    expect(buildSegmentSummaryText({})).toBeNull();
    expect(buildSegmentSummaryText({ segments: [] })).toBeNull();
    expect(buildSegmentSummaryText({ segments: [{ name: 'X', value_b: 0 }] })).toBeNull();
  });

  it('value_b 欠損は 0 扱いで集計し share% に反映する', () => {
    const seg = { segments: [{ name: 'Seg-X', value_b: 75 }, { name: 'Seg-Y' }, { name: 'Seg-Z', value_b: 25 }] };
    // total=100、Seg-Y は value_b 欠損=0% → 降順 Seg-X 75% · Seg-Z 25% · ほか
    expect(buildSegmentSummaryText(seg)).toBe('Seg-X 75% · Seg-Z 25% · ほか');
  });
});

// AAPL は FMP segment を単数形 "Service" で返すため、辞書に "Service" を追加 (会社概要 fold / SegmentSection の英語落ち解消)。
describe('translateSegmentName / displaySegmentName: AAPL "Service" 単数形', () => {
  it('"Service" (単数) を「サービス」に和訳する', () => {
    expect(translateSegmentName('Service')).toBe('サービス');
  });
  it('既存の "Services" (複数) は「サービス事業」のまま影響を受けない', () => {
    expect(translateSegmentName('Services')).toBe('サービス事業');
  });
  it('displaySegmentName でも object/string 両方で "Service"→「サービス」', () => {
    expect(displaySegmentName('Service')).toBe('サービス');
    expect(displaySegmentName({ name: 'Service' })).toBe('サービス');
  });
});
