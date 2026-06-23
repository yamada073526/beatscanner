-- 2026-06-23 じっちゃま 5 条件 funda_pass の「年次 (Annual) 3 年連続増加」評価への是正
--
-- 背景: screener の funda_pass が常時 True=0 だった root cause は、 cond2/3/4 が
--   「連続四半期の QoQ 単調増加 (q[t-3]<q[t-2]<q[t-1]<q[t])」 を要求していたこと。
--   季節性 (AAPL のホリデー集中等) で大型優良株が構造的に全滅していた (全期間でも
--   all_passed=25/3366=0.7%、 cond2(EPS)=9.5% / cond3(CFPS)=8.5% / cond4(売上)=23.2%)。
-- 是正: じっちゃまプロトコル原典 (docs/references/jijima_protocol.md) は「年間 (Annual)
--   データで過去 3 年連続増加」 を意味する (四半期比較は使わない)。 → 年次データ層を新設し
--   FY[t-2] < FY[t-1] < FY[t] の 3 fiscal year 連続増加で判定する。
-- 設計判断: backtest (earnings_evaluation = 四半期 QoQ) は trade simulation のセマンティクスが
--   異なり LP 数値に直結するため据え置き、 funda_pass は本新テーブルに分離する (二重定義は
--   技術的負債として記録し将来統合)。
-- GRANT は別ファイル 2026-06-23_earnings_annual_grants.sql とペア (運用ルール)。

-- 年次の生データ (FMP /stable income-statement + cash-flow-statement, period=annual)。
-- earnings_history (四半期) を mirror、 fiscal_quarter を除く。 PK は (ticker, period_end)。
CREATE TABLE IF NOT EXISTS public.earnings_annual (
  ticker TEXT NOT NULL,
  period_end DATE NOT NULL,
  filing_date DATE,
  fiscal_year INT,
  revenue NUMERIC,
  net_income NUMERIC,
  operating_cash_flow NUMERIC,
  diluted_shares NUMERIC,
  eps NUMERIC,
  cfps NUMERIC,
  op_cf_margin NUMERIC,
  data_source TEXT DEFAULT 'fmp',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (ticker, period_end)
);

-- 年次 5 条件評価。 earnings_evaluation (四半期) を mirror、 evaluation_date を fiscal_year に
-- 置換し evaluated_at (バッチ実行時刻 = freshness の元) を追加。 PK は (ticker, fiscal_year)。
CREATE TABLE IF NOT EXISTS public.earnings_annual_evaluation (
  ticker TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  period_end DATE,
  cond1_passed BOOLEAN,   -- 最新年 営業 CF マージン >= 15%
  cond2_passed BOOLEAN,   -- EPS 3 fiscal year 連続増加
  cond3_passed BOOLEAN,   -- CFPS 3 fiscal year 連続増加
  cond4_passed BOOLEAN,   -- 売上高 3 fiscal year 連続増加
  cond5_passed BOOLEAN,   -- 最新年 CFPS > EPS (粉飾リスク回避)
  all_passed BOOLEAN,
  passed_count INT CHECK (passed_count >= 0 AND passed_count <= 5),
  evaluated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (ticker, fiscal_year)
);

-- per-ticker 最新年を引く screener クエリ用 index。
CREATE INDEX IF NOT EXISTS idx_earnings_annual_eval_ticker_fy
  ON public.earnings_annual_evaluation (ticker, fiscal_year DESC);

ALTER TABLE public.earnings_annual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings_annual_evaluation ENABLE ROW LEVEL SECURITY;
