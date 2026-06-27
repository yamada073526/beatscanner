// ftdRegime 集約ロジックの裏取り (2026-06-28 金融アナリスト review 論点2/5)。
// 論点2: confirmed は「2 指数以上」 or「NASDAQ confirmed」のみ (楽観バイアス除去)。
// 論点5: 有効指数 2 本未満なら none (部分欠落の Trust Cliff 回避)。
import { describe, it, expect } from 'vitest';
import { ftdRegime } from './ftd.js';

const confirmed = (label_ja) => ({ status: 'ftd_confirmed', ftd_day_number: 5, ftd_pct: 2.1, label_ja });
const watching = (label_ja) => ({ status: 'watching', label_ja });
const noAttempt = (label_ja) => ({ status: 'no_attempt', label_ja });
const err = () => ({ status: 'error' });
const insuf = () => ({ status: 'insufficient_data' });

describe('ftdRegime — 論点2 集約 (楽観バイアス除去)', () => {
  it('2 指数以上 confirmed → ftd_confirmed', () => {
    const r = ftdRegime({ '^GSPC': confirmed('S&P 500'), '^IXIC': confirmed('NASDAQ'), '^DJI': noAttempt('DOW') });
    expect(r.status).toBe('ftd_confirmed');
    expect(r.confirmedCount).toBe(2);
  });

  it('NASDAQ のみ confirmed (他 no_attempt) → ftd_confirmed (主導指数)', () => {
    const r = ftdRegime({ '^GSPC': noAttempt('S&P 500'), '^IXIC': confirmed('NASDAQ'), '^DJI': noAttempt('DOW') });
    expect(r.status).toBe('ftd_confirmed');
    expect(r.indexName).toBe('NASDAQ');
    expect(r.confirmedCount).toBe(1);
  });

  it('1 指数のみ confirmed (NASDAQ 以外・DOW) → watching へ降格', () => {
    const r = ftdRegime({ '^GSPC': noAttempt('S&P 500'), '^IXIC': noAttempt('NASDAQ'), '^DJI': confirmed('DOW') });
    expect(r.status).toBe('watching');
    expect(r.confirmedCount).toBe(1);
  });

  it('全 valid が no_attempt → no_attempt', () => {
    const r = ftdRegime({ '^GSPC': noAttempt('S&P 500'), '^IXIC': noAttempt('NASDAQ'), '^DJI': noAttempt('DOW') });
    expect(r.status).toBe('no_attempt');
  });

  it('watching が混在 (confirmed なし) → watching', () => {
    const r = ftdRegime({ '^GSPC': watching('S&P 500'), '^IXIC': noAttempt('NASDAQ'), '^DJI': noAttempt('DOW') });
    expect(r.status).toBe('watching');
  });
});

describe('ftdRegime — 論点5 部分欠落 (Trust Cliff 回避)', () => {
  it('有効 1 指数 (no_attempt) + 2 error → none (平穏と誤表示しない)', () => {
    const r = ftdRegime({ '^GSPC': noAttempt('S&P 500'), '^IXIC': err(), '^DJI': err() });
    expect(r.status).toBe('none');
  });

  it('有効 1 指数 (confirmed) + 2 insufficient → none (breadth 不足)', () => {
    const r = ftdRegime({ '^GSPC': confirmed('S&P 500'), '^IXIC': insuf(), '^DJI': insuf() });
    expect(r.status).toBe('none');
  });

  it('空 map → none', () => {
    expect(ftdRegime({}).status).toBe('none');
  });

  it('全 regime に §38 disclaimer が付与される', () => {
    const r = ftdRegime({ '^GSPC': confirmed('S&P 500'), '^IXIC': confirmed('NASDAQ'), '^DJI': confirmed('DOW') });
    expect(r.disclaimer).toContain('相場予測ではありません');
  });
});
