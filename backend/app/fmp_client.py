"""Financial Modeling Prep API client (stable endpoints)."""
from __future__ import annotations

import datetime as _dt
import os
from typing import Any

import httpx

# FMP migrated from /api/v3 to /stable/ (v3 deprecated Aug 31 2025).
FMP_BASE_URL = "https://financialmodelingprep.com/stable"


class FMPError(Exception):
    pass


class FMPClient:
    def __init__(self, api_key: str | None = None, timeout: float = 15.0):
        self.api_key = api_key or os.getenv("FMP_API_KEY")
        if not self.api_key:
            raise FMPError("FMP_API_KEY is not set")
        self.timeout = timeout

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        params = {**(params or {}), "apikey": self.api_key}
        url = f"{FMP_BASE_URL}{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                raise FMPError(f"FMP {r.status_code}: {r.text[:200]}")
            try:
                data = r.json()
            except Exception:
                raise FMPError(f"FMP non-JSON response: {r.text[:200]}")
            if isinstance(data, dict):
                # "Error Message" (v3 style) or "message" (stable style) error handling
                err = data.get("Error Message") or data.get("error") or None
                if err:
                    raise FMPError(str(err))
                msg = data.get("message", "")
                if msg and any(kw in msg.lower() for kw in (
                    "upgrade", "not authorized", "invalid api", "limit reach",
                    "subscription", "premium", "you need to",
                )):
                    raise FMPError(msg)
            return data

    async def income_statement(self, ticker: str, limit: int = 4, period: str = "annual") -> list[dict]:
        return await self._get(
            "/income-statement",
            {"symbol": ticker.upper(), "limit": limit, "period": period},
        )

    async def cash_flow(self, ticker: str, limit: int = 4, period: str = "annual") -> list[dict]:
        return await self._get(
            "/cash-flow-statement",
            {"symbol": ticker.upper(), "limit": limit, "period": period},
        )

    async def profile(self, ticker: str) -> list[dict]:
        return await self._get("/profile", {"symbol": ticker.upper()})

    async def earning_calendar(self, date_from: str, date_to: str) -> list[dict]:
        return await self._get(
            "/earnings-calendar",
            {"from": date_from, "to": date_to},
        )

    async def economic_calendar(self, date_from: str, date_to: str) -> list[dict]:
        """米国・日本・ユーロ圏など主要国の経済指標発表予定。
        Returns: [{event, date, country, currency, previous, estimate, actual, change, impact, ...}]
        impact は "Low"/"Medium"/"High"/"None" (FMP free 枠では空のことあり、キーワード補完で対応)。
        """
        return await self._get(
            "/economic-calendar",
            {"from": date_from, "to": date_to},
        )

    async def search(self, query: str, limit: int = 10) -> list[dict]:
        return await self._get(
            "/search-name",
            {"query": query, "limit": limit},
        )

    async def earnings_surprises(self, ticker: str, limit: int = 16) -> list[dict]:
        # handover v83 P1 fix (2026-05-18): FMP Premium per-ticker endpoint に置換。
        # 旧 free plan workaround (/earnings-calendar 日付 filter 無 + client-side filter) は
        # AMZN のように直近 30 日に決算が無い銘柄で empty を返し、 /api/guidance/{T}/quarterly-history
        # が history=[] で 404 化 (memory fmp_plan_naming.md の code smell 確定発火)。
        # /stable/earnings は per-ticker historical surprises を返し Premium plan で利用可能。
        data = await self._get(
            "/earnings",
            {"symbol": ticker.upper(), "limit": limit},
        )
        if not isinstance(data, list):
            return []
        return data

    async def analyst_estimates(self, ticker: str, period: str = "quarter", limit: int = 8) -> list[dict]:
        return await self._get(
            "/analyst-estimates",
            {"symbol": ticker.upper(), "period": period, "limit": limit},
        )

    async def market_movers(self, category: str) -> list[dict]:
        """category: 'biggest-gainers' | 'biggest-losers' | 'most-actives'"""
        return await self._get(f"/{category}")

    async def etf_info(self, ticker: str) -> list[dict]:
        """ETF metadata (AUM / expense_ratio / inception_date / domicile / sectorsList 等).

        v118 R9.3 path 確定: /stable/etf/info?symbol=SPY (slash 区切り、 hyphen ではない)
        返却 keys: symbol, name, description, isin, assetClass, domicile, etfCompany,
                  expenseRatio, assetsUnderManagement, avgVolume, inceptionDate, nav,
                  navCurrency, holdingsCount, isActivelyTrading, sectorsList
        """
        return await self._get("/etf/info", {"symbol": ticker.upper()})

    async def etf_holdings(self, ticker: str) -> list[dict]:
        """ETF top holdings list (weight / shares / name).

        v118 R9.3 path 確定: /stable/etf/holdings — ただし FMP 402 Restricted Endpoint で
        Premium 上位 plan (Ultimate 等) 必要。 user FMP plan の features 確認で判断。
        現状 Premium plan では 402 returning subscription upgrade message。
        """
        return await self._get("/etf/holdings", {"symbol": ticker.upper()})

    async def etf_sector_weightings(self, ticker: str) -> list[dict]:
        """ETF sector breakdown (sector / weight %).

        v118 R9.3: /stable/etf/sector-weightings (slash 区切り)。 etf_info の sectorsList
        field で同等情報取得可能なため、 Phase 2 donut chart まで本 method は未使用。
        """
        return await self._get("/etf/sector-weightings", {"symbol": ticker.upper()})

    async def historical_price(self, ticker: str, from_date: str, to_date: str) -> list[dict]:
        data = await self._get(
            "/historical-price-eod/full",
            {"symbol": ticker.upper(), "from": from_date, "to": to_date},
        )
        if isinstance(data, dict) and "historical" in data:
            return data["historical"]
        if isinstance(data, list):
            return data
        return []

    async def earnings_transcript(self, ticker: str, year: int, quarter: int) -> list[dict]:
        return await self._get(
            "/earning-call-transcript",
            {"symbol": ticker.upper(), "year": year, "quarter": quarter},
        )

    async def analyst_recommendations(self, ticker: str, limit: int = 5) -> list[dict]:
        return await self._get(
            "/analyst-stock-recommendations",
            {"symbol": ticker.upper(), "limit": limit},
        )

    async def grades(self, ticker: str, limit: int = 50) -> list[dict]:
        """アナリスト格付け変更履歴 (upgrades / downgrades / initiates / maintains).

        Returns: [{symbol, date, gradingCompany, previousGrade, newGrade, action, ...}]
        action: "upgrade" | "downgrade" | "maintain" | "initiate" 等 (FMP の正規化値)
        ratings timeline / Top 3 アナリスト統合 / upgrade-downgrade kpi の元データ。
        """
        return await self._get(
            "/grades",
            {"symbol": ticker.upper(), "limit": limit},
        )

    async def price_target_consensus(self, ticker: str) -> dict:
        """アナリスト目標株価 consensus (mean / median / high / low + analyst count).

        Returns: {"symbol", "targetHigh", "targetLow", "targetConsensus", "targetMedian", ...}
        FMP は dict 単一返却 (list[dict] でない) ことに注意。 list で返ってきたら
        最初の要素を採用 (defensive)。
        """
        data = await self._get(
            "/price-target-consensus",
            {"symbol": ticker.upper()},
        )
        if isinstance(data, list):
            return data[0] if data else {}
        if isinstance(data, dict):
            return data
        return {}
    async def stock_peers(self, ticker: str) -> list[str]:
        """競合 peer ticker 一覧を返す (FMP /stock-peers)。
        返値: ["AAPL", "GOOG", "AMZN", ...] (ticker string list)

        v97 真因 fix: FMP `/stable/stock-peers` の response 形式が legacy と異なる:
        - 旧 /api/v3: {"symbol": str, "peersList": [str, ...]} (dict、 peersList 配列)
        - 新 /stable: [{"symbol": str, "companyName": str, "price": ..., "mktCap": ...}, ...]
          (各 entry = 1 peer 銘柄、 symbol field が ticker)

        既存 parsing は peersList を期待していたため常に空 list を silent 返却していた
        (Phase 3 競合比較 Tab で「データ取得できませんでした」 表示 root cause)。
        自社 ticker は除外 (FMP が自分自身を含めるケースあり)。
        """
        t = ticker.upper()
        data = await self._get("/stock-peers", {"symbol": t})

        if isinstance(data, list):
            # 新 /stable 形式: 各 entry から symbol を抽出
            new_format = [
                d.get("symbol") for d in data
                if isinstance(d, dict) and isinstance(d.get("symbol"), str) and d.get("symbol") != t
            ]
            if new_format:
                return new_format
            # legacy entry が混在の場合 (1 entry が dict で peersList を持つ)
            if data and isinstance(data[0], dict) and "peersList" in data[0]:
                peers = data[0].get("peersList", [])
                return [p for p in peers if isinstance(p, str) and p != t]

        if isinstance(data, dict):
            # legacy: {"symbol": ..., "peersList": [...]}
            return [p for p in data.get("peersList", []) if isinstance(p, str) and p != t]

        return []

    async def stock_news(self, ticker: str, limit: int = 20) -> list[dict]:
        """単一銘柄ニュース (/stable/news/stock)。

        ⚠️ v173 stable 移行 (2026-06-06): 旧 /stock-news (v3) は 404。 後継は /news/stock で
        param は symbols (複数形・カンマ区切り、 単一 symbol でも可)。 返却 schema は旧
        /stock-news と同一 (title/url/publishedDate/site/text/image) のため呼出側
        (_fetch_news_for_ticker / general_news) は無変更で動く。
        """
        data = await self._get(
            "/news/stock",
            {"symbols": ticker.upper(), "limit": limit},
        )
        return data if isinstance(data, list) else []

    async def general_news(self, limit: int = 50) -> list[dict]:
        """マクロ・マーケット全体ニュース。
        dedicated endpoint → 多様化された ETF news の集約 に fallback。
        指数・地域・コモディティを散らすことで重複を抑え、日本人個人投資家が
        見るべき「ドル円・原油・中国・小型株」も拾える設計。
        """
        # 1) FMP の dedicated general news endpoint を試す
        try:
            data = await self._get("/news/general-latest", {"limit": limit})
            if isinstance(data, list) and data:
                return data
        except FMPError:
            pass
        # 2) Fallback: 指数・地域多様化 ETF の stock-news を集約
        # 同一指数 proxy (IVV/VOO) は SPY と 80-95% 重複するため不採用。
        # SPY (S&P500) / QQQ (Nasdaq) / DIA (Dow) / IWM (Russell 2000)
        # / EEM (新興国) / GLD (金) / USO (原油)
        # ITA (国防) / XLF (金融) / XLE (エネ) を追加で
        # 地政学速報・主要 IB ニュース・原油/中東ニュースを拾える構成に。
        proxies = ("SPY", "QQQ", "DIA", "IWM", "EEM", "GLD", "USO", "ITA", "XLF", "XLE")
        per_proxy = max(12, min(20, limit // len(proxies) if limit > 0 else 15))
        pool: list[dict] = []
        for proxy in proxies:
            try:
                items = await self.stock_news(proxy, limit=per_proxy)
                if isinstance(items, list):
                    pool.extend(items)
            except FMPError:
                continue
        return pool

    async def batch_quotes(self, symbols: list[str]) -> list[dict]:
        """複数銘柄 quote を 1 call で取得する compat shim (実体は /stable/batch-quote)。

        ⚠️ 旧実装は /stable/quote にカンマ区切り複数 symbol を渡していたが、 /quote は
        単一 symbol 仕様で複数渡すと 0 件を返す (2026-06-05 curl 確認)。 結果、 複数銘柄
        fetch が常に空 → yfinance への silent fallback が発火し、 FMP Premium quote が
        複数取得時に一切使われず yfinance の rate limit / 精度問題を踏んでいた。

        本 method は batch_quote (/batch-quote) に委譲し、 旧 /quote schema 互換のため
        `changesPercentage` (s 有) を `changePercentage` (s 無) から alias する。 これで
        既存呼出側 (main.py /api/quotes・market-indices・portfolio・universe・analyst) は
        無変更で動く。 他 field (price / change / previousClose / marketCap / symbol) は
        両 schema で同名のため alias 不要。 単一 symbol ([sym]) でも /batch-quote で動作。
        """
        rows = await self.batch_quote(symbols)
        for r in rows:
            if isinstance(r, dict) and "changesPercentage" not in r:
                cp = r.get("changePercentage")
                if isinstance(cp, (int, float)):
                    r["changesPercentage"] = cp
        return rows

    async def batch_quote(self, symbols: list[str]) -> list[dict]:
        """複数銘柄の quote を 1 call で取得 (/stable/batch-quote)。

        返却 item keys: symbol, name, price, marketCap, changePercentage,
                       change, volume, exchange, dayHigh/Low, yearHigh/Low, ...
        daily_digest の銘柄選別 (時価総額/株価フィルタ) 等、 多数銘柄の
        基礎指標をまとめて引くケースで使う。 空 list は取得失敗を意味する。
        """
        if not symbols:
            return []
        joined = ",".join(s.upper() for s in symbols)
        data = await self._get("/batch-quote", {"symbols": joined})
        return data if isinstance(data, list) else []

    async def press_releases(self, ticker: str, limit: int = 5) -> list[dict]:
        """企業プレスリリース (/stable/news/press-releases)。

        ⚠️ v173 stable 移行 (2026-06-06): 旧 /press-releases (v3) は 404。 後継は
        /news/press-releases で param は symbols (複数形)。 返却 schema は
        symbol/publishedDate/publisher/title/image/site/text/url。 旧 /press-releases の
        date field は新 schema に無く publishedDate に改名されたため、 呼出側 (ir_links が
        p.get("date") を参照) 互換のため date を publishedDate から alias する。
        """
        data = await self._get(
            "/news/press-releases",
            {"symbols": ticker.upper(), "limit": limit},
        )
        if not isinstance(data, list):
            return []
        for p in data:
            if isinstance(p, dict) and "date" not in p and p.get("publishedDate"):
                p["date"] = p["publishedDate"]
        return data

    async def sec_filings(self, ticker: str, limit: int = 5, filing_type: str = "8-K") -> list[dict]:
        """SEC filings を per-symbol で返す (/stable/sec-filings-search/symbol)。

        ⚠️ v173 stable 移行 (2026-06-06): 旧 /sec-filings (v3) は 404。 task が後継候補とした
        /sec-filings-8k は symbol param を無視する市場全体 feed (symbol=AAPL でも SUNE 等
        他社 8-K が返る) のため per-ticker には使えない。 正しい per-symbol endpoint は
        /sec-filings-search/symbol で、 以下 2 つの癖がある:
          1. from/to が必須 (無いと "Query Error: Invalid or missing query parameter - from")
          2. type/formType query は無視され全 form type (4/SD/10-Q/8-K...) が返るため、
             formType==filing_type の filter は client 側で行う
        返却 schema: symbol/cik/filingDate/acceptedDate/formType/link/finalLink (newest-first)。
        旧呼出側 (_fetch_8k_for_ticker / ir_links) が参照する fillingDate(旧 typo・複 l) と
        type(旧名) を、 新 filingDate(単 l)/formType から alias して main.py 無変更で動かす。
        8-K は Form 4 等に埋もれるため 2 年窓 + limit=1000 で全件取得→filter→上位 limit 件。
        ⚠️ 既知の限界 (v173 R3 dogfood): 大型銀行 (JPM/BAC/GS 等) は 424B2 (債券目論見書) を
        超高頻度発行するため (JPM は 2 年で 827 件)、 limit=1000 cap が直近数日で埋まり 8-K が
        0-2 件に過少化する (FMP に per-symbol+formType を同時指定できる endpoint が無く回避不能、
        /sec-filings-8k は symbol 無視の市場 feed)。
        対策 (v173 後続): 8-K を user に見せる経路 (ir_links / portfolio events lane) は main.py の
        _fetch_8k_for_ticker 経由にし、 FMP が limit 未満の時 SEC EDGAR submissions.json で補完する
        (recent は「直近 1000 件 or 直近 1 年の多い方」 を返し、 銀行は直近 1 年まるごと入るので
        8-K が 10-36 件取れる。 実測 JPM 2→24 / BAC 1→14 / GS 0→17、 historical files 不要)。
        本 method を直叩きする daily_digest 内部ランキング (article_pipeline/sources.py の
        sec_8k_count) も v173 後続で対応済: EDGAR helper を sec_edgar.py に切り出し (循環 import 回避)、
        _fetch_event_signals が FMP limit 未満時のみ EDGAR で補完する (普通株は未発火 = 回帰なし)。
        なお sec_8k_count は §38 で非表示 + cap_term 支配で影響限定的。
        """
        t = ticker.upper()
        today = _dt.date.today()
        params: dict[str, Any] = {
            "symbol": t,
            "from": (today - _dt.timedelta(days=730)).isoformat(),
            "to": (today + _dt.timedelta(days=2)).isoformat(),
            "limit": 1000,
        }
        data = await self._get("/sec-filings-search/symbol", params)
        if not isinstance(data, list):
            return []
        want = (filing_type or "").upper()
        out: list[dict] = []
        for f in data:
            if not isinstance(f, dict):
                continue
            form = str(f.get("formType") or "")
            if want and form.upper() != want:
                continue
            # 旧 schema 互換 alias (呼出側 main.py を無変更で動かす)
            if "type" not in f:
                f["type"] = f.get("formType")
            if "fillingDate" not in f:
                f["fillingDate"] = f.get("filingDate")
            out.append(f)
            if len(out) >= limit:
                break
        return out

    async def sp500_constituent(self) -> list[dict]:
        return await self._get("/sp500-constituent")

    # v100 (handover §100点 multi-review、 金融アナリスト verdict + user dogfood):
    # FMP Premium per-ticker endpoint を活用、 Pane 3 Insider 取引 section の placeholder 解消。
    # endpoint 名修正 (2026-05-23 試行): /insider-trading → /insider-trading/search
    async def insider_trading(self, ticker: str, limit: int = 50) -> list[dict]:
        """Form 4 経営者株式売買 (直近 N 件)。 transactionType: P-Purchase / S-Sale / A-Award 等"""
        data = await self._get(
            "/insider-trading/search",
            {"symbol": ticker.upper(), "limit": limit},
        )
        return data if isinstance(data, list) else []

    async def institutional_holder(
        self,
        ticker: str,
        limit: int = 50,
        year: int | None = None,
        quarter: int | None = None,
    ) -> list[dict]:
        """13F 機関投資家保有サマリー (symbol-positions-summary)。

        ⚠️ v157 真因判明 (2026-06-03): 過去「Restricted」 と誤認していたが、 実際は
        FMP が必須 query param `year` / `quarter` を要求していた (未指定だと 200 で
        "Invalid or missing query parameter - year" を返し、 _get が非 JSON / Error 扱い
        → 空配列になっていた)。 現キー (Ultimate) で year/quarter を渡せば 1 四半期 1 row の
        集計が返る:
          ownershipPercent / lastOwnershipPercent / investorsHolding /
          newPositions / closedPositions / increasedPositions / reducedPositions ...
        year/quarter 未指定の呼出 (旧 /api/insider holders 経路) は従来通り空を返すため
        後方互換 (回帰なし)。 直近 4Q 推移は呼出側で year/quarter を変えて並列 fetch する。
        """
        params: dict[str, Any] = {"symbol": ticker.upper(), "limit": limit}
        if year is not None:
            params["year"] = year
        if quarter is not None:
            params["quarter"] = quarter
        try:
            data = await self._get(
                "/institutional-ownership/symbol-positions-summary",
                params,
            )
            return data if isinstance(data, list) else []
        except Exception:
            return []

    async def senate_trades(self, ticker: str) -> list[dict]:
        """⑤ 米上院議員の株取引開示 (Senate Stock Watcher / FMP)。

        現キー (Ultimate) で `?symbol=` のみで動作 (param 不足なし、 13F とは別パターン)。
        fields: firstName/lastName/office/district/owner/assetType/type
                (Purchase/Sale/Sale (Partial)/Sale (Full))/amount(範囲文字列)/
                transactionDate/disclosureDate/link。
        ⚠️ 公開開示の事実データ。 投資シグナルではない (§38: 因果断定禁止・話題枠)。
        """
        try:
            data = await self._get("/senate-trades", {"symbol": ticker.upper()})
            return data if isinstance(data, list) else []
        except Exception:
            return []

    async def house_trades(self, ticker: str) -> list[dict]:
        """⑤ 米下院議員の株取引開示。 senate_trades と同 schema・同方針。"""
        try:
            data = await self._get("/house-trades", {"symbol": ticker.upper()})
            return data if isinstance(data, list) else []
        except Exception:
            return []
