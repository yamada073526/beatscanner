// @vitest-environment jsdom
//
// 2026-07-02 incident 再発防止テスト: PriceLadder.jsx の zoneBox useLayoutEffect を
// pivot/current/levels の useMemo より前に置いた版が TDZ ReferenceError
// ("Cannot access 'pivot' before initialization") で本番ティッカー詳細を全クラッシュさせた。
// build (vite build) / 既存 vitest (純粋関数テストのみ) はどちらも検出できなかった —
// 実際に component を render する回帰テストが必要と判明したため追加。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PriceLadder from './PriceLadder.jsx';

// jsdom は IntersectionObserver 未実装 (useInViewOnce が使用)。本番ブラウザには実装があるため
// これはテスト環境の制約への対応であり、実装側の修正ではない。
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver = MockIntersectionObserver;

// pivot < current (ブレイク未確認・zoneBox effect の主経路) を再現する AAPL 相当のモック。
vi.mock('../api.js', () => ({
  fetchAnalyst: vi.fn().mockResolvedValue({
    sources: { price_target: 'ok' },
    precomputed_metrics: { target_range: { mean: 326.25 } },
  }),
  fetchTechnical: vi.fn().mockResolvedValue({
    patterns: {
      cup_handle: { state: 'cup_completing', pivot: { price: 300.85 }, box_support: { level: 264.41 } },
    },
    overlays: [{ key: 'sma_50', data: [{ value: 292.67 }] }],
  }),
  fetchPriceHistory: vi.fn().mockResolvedValue({
    prices: Array.from({ length: 60 }, (_, i) => ({
      close: 294.38 - (60 - i) * 0.05,
      volume: 40_000_000,
    })),
  }),
  fetchPriceIntraday: vi.fn().mockResolvedValue({ prices: [] }),
  TECHNICAL_CANONICAL_PATTERNS: 'cup_handle,resistance_retest',
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PriceLadder (render smoke test)', () => {
  it('AAPL 相当 (pivot 検出・ブレイク未確認) で render エラーを投げず、ブレイク確認ゾーンが描画される', async () => {
    render(<PriceLadder ticker="AAPL" plan="free" />);
    // 主 UI (価格目安 見出し) が表示され、error boundary 相当の例外が render 中に投げられないことを確認。
    await screen.findByText(/主要な価格水準/);
    await screen.findByTestId('price-ladder-row-current');
    // ブレイク未確認ゾーンブラケット (Pivot 〜 +5%・pivot の「上」) が pivot 行検出時に描画されること
    // (2026-07-02 drift 修正: pivot 下ではなく上に表示。jsdom の getBoundingClientRect は 0 だが zoneBox は truthy)。
    expect(await screen.findByTestId('price-ladder-zone-bracket')).toBeTruthy();
    // 監視ゾーン (pivot 下〜現在価格) も同時に描画される (mockup .zwatch 準拠、案A 忠実化で追加)。
    expect(await screen.findByTestId('price-ladder-zone-watch')).toBeTruthy();
    // 警戒ゾーン (50日線割れ以下) も row index から算出され描画される。
    expect(await screen.findByTestId('price-ladder-zone-warn')).toBeTruthy();
  });

  it('pivot 未検出 (cup_handle なし) でも render エラーを投げない', async () => {
    const api = await import('../api.js');
    api.fetchTechnical.mockResolvedValueOnce({
      patterns: {},
      overlays: [{ key: 'sma_50', data: [{ value: 292.67 }] }],
    });
    render(<PriceLadder ticker="MSFT" plan="free" />);
    await screen.findByText(/主要な価格水準/);
    await screen.findByTestId('price-ladder-row-current');
    expect(screen.queryByTestId('price-ladder-zone-bracket')).toBeNull();
  });

  it('ブレイク確認済 (現在値 ≥ pivot) でも render エラーを投げない', async () => {
    const api = await import('../api.js');
    api.fetchTechnical.mockResolvedValueOnce({
      patterns: {
        cup_handle: { state: 'breakout_support', pivot: { price: 280.0 }, box_support: { level: 264.41 } },
      },
      overlays: [{ key: 'sma_50', data: [{ value: 292.67 }] }],
    });
    render(<PriceLadder ticker="AAPL" plan="premium" />);
    await screen.findByText(/主要な価格水準/);
    await screen.findByTestId('price-ladder-row-current');
    // ブレイク確認済 = zoneBox は非表示 (pivot 行〜現在価格行のブラケットは未確認状態専用)。
    expect(screen.queryByTestId('price-ladder-zone-bracket')).toBeNull();
  });
});
