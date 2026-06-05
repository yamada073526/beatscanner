"""SEC EDGAR filings helper (CIK 解決 + submissions.json fetch) の共有 leaf module。

v173 後続 (2026-06-06) で main.py から切り出し。 main.py と article_pipeline/sources.py の
両方が EDGAR helper を必要とするが、 main.py → article_pipeline.router の一方向依存があるため、
sources.py が main.py を import すると循環 import になる。 EDGAR helper は FMPClient にも
main.py の cache にも依存しない leaf (httpx + time + 自前 CIK cache のみ) なので、 ここに
切り出して双方から import する。

提供する関数:
- _sec_lookup_cik(sym): ticker → 10 桁 CIK (24h cache、 US 上場のみ)
- _fetch_filings_from_sec_edgar(sym, form_type, limit): 任意 form type の filings (10-K/10-Q/8-K...)
- _fetch_8k_from_sec_edgar(sym, limit): 8-K 専用の薄い wrapper (caller 互換)

完全無料 (User-Agent 必須、 10 req/s)。 大型銀行は submissions.json が数 MB になるため、
caller 側で「FMP が limit 未満を返した時のみ」 叩く条件分岐で rate limit / latency を抑えること。
"""
from __future__ import annotations

import time as _time


# SEC EDGAR ticker → CIK mapping cache (24h TTL、 ticker → 10 桁 CIK 文字列)
_SEC_CIK_CACHE: dict[str, tuple[float, str]] = {}
_SEC_CIK_TTL = 60 * 60 * 24


async def _sec_lookup_cik(sym: str) -> str | None:
    """SEC EDGAR の ticker → CIK 解決 (24h cache)。 US 上場銘柄のみ対応 (日本株 7203.T 等は None)。

    SEC が提供する `company_tickers.json` (https://www.sec.gov/files/company_tickers.json)
    で全 US 上場銘柄の ticker → CIK マッピングを取得。 リクエスト 1 回で全マッピング取得 →
    24h cache で全 ticker 共有。
    """
    if not sym:
        return None
    sym_u = sym.upper().strip()
    if "." in sym_u:  # 7203.T 等の海外取引所 ticker は SEC 対象外
        return None
    now = _time.time()
    cached = _SEC_CIK_CACHE.get(sym_u)
    if cached and now - cached[0] < _SEC_CIK_TTL:
        return cached[1] if cached[1] else None
    # 全マッピング fetch (10MB 程度、 24h で 1 回のみ)
    if "__all__" not in _SEC_CIK_CACHE or now - _SEC_CIK_CACHE["__all__"][0] >= _SEC_CIK_TTL:
        try:
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=10.0) as client:
                # SEC は User-Agent 必須 (空だと 403 / 429 で reject される)
                resp = await client.get(
                    "https://www.sec.gov/files/company_tickers.json",
                    headers={"User-Agent": "BeatScanner support@beatscanner.example"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    # SEC response: {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}, ...}
                    for v in data.values():
                        if not isinstance(v, dict):
                            continue
                        t = (v.get("ticker") or "").upper()
                        cik = v.get("cik_str")
                        if t and cik is not None:
                            _SEC_CIK_CACHE[t] = (now, str(cik).zfill(10))
                    _SEC_CIK_CACHE["__all__"] = (now, "ok")
        except Exception as e:
            print(f"[SEC EDGAR] CIK mapping fetch failed: {e}")
            _SEC_CIK_CACHE["__all__"] = (now, "")  # 1 時間は retry しない (cache hit にする)
    cached_after = _SEC_CIK_CACHE.get(sym_u)
    return cached_after[1] if cached_after else None


async def _fetch_filings_from_sec_edgar(sym: str, form_type: str, limit: int = 5) -> list[dict]:
    """SEC EDGAR submissions.json から指定 form type の filings を取得 (v104 release MVP)。

    form_type 例: "10-K" (年次) / "10-Q" (四半期) / "8-K" (重大事象)。
    完全無料 (User-Agent 必須)、 12h cache 推奨。
    返却: [{date, title, url}, ...] (新→古順)、 該当なしは []。
    """
    cik = await _sec_lookup_cik(sym)
    if not cik:
        return []
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://data.sec.gov/submissions/CIK{cik}.json",
                headers={"User-Agent": "BeatScanner support@beatscanner.example"},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
    except Exception as e:
        print(f"[SEC EDGAR] submissions.json fetch failed for {sym} ({form_type}): {e}")
        return []
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", []) or []
    dates = recent.get("filingDate", []) or []
    report_dates = recent.get("reportDate", []) or []  # v115: 会計年度末日 (例 "2024-09-28")
    accessions = recent.get("accessionNumber", []) or []
    primary_docs = recent.get("primaryDocument", []) or []
    out: list[dict] = []
    cik_int = str(int(cik))
    for i, form in enumerate(forms):
        if form != form_type:
            continue
        if i >= len(dates) or i >= len(accessions):
            continue
        date_s = str(dates[i])[:10]
        report_date_s = str(report_dates[i])[:10] if i < len(report_dates) and report_dates[i] else None
        accession = accessions[i].replace("-", "")
        primary = primary_docs[i] if i < len(primary_docs) else ""
        if primary:
            url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession}/{primary}"
        else:
            url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type={form_type}"
        out.append({
            "date": date_s,
            "report_date": report_date_s,  # v115 multi-review A-4: 会計年度末日を frontend に pass
            "title": form_type,
            "url": url,
        })
        if len(out) >= limit:
            break
    return out


async def _fetch_8k_from_sec_edgar(sym: str, limit: int = 5) -> list[dict]:
    """SEC EDGAR submissions.json から 8-K filings を取得 (v71 Phase 3-c fallback)。

    v104 で _fetch_filings_from_sec_edgar に generic 化、 本 helper は 8-K caller 互換のための薄い wrapper。
    FMP が empty を返した時の fallback、 完全無料 (User-Agent 必須)。
    submissions.json は CIK 単位で全 filings (recent + historical) を返す。
    返却: [{date, title, url}, ...]。 url は SEC EDGAR の filing index ページ。
    """
    cik = await _sec_lookup_cik(sym)
    if not cik:
        return []
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://data.sec.gov/submissions/CIK{cik}.json",
                headers={"User-Agent": "BeatScanner support@beatscanner.example"},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
    except Exception as e:
        print(f"[SEC EDGAR] submissions.json fetch failed for {sym}: {e}")
        return []
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", []) or []
    dates = recent.get("filingDate", []) or []
    accessions = recent.get("accessionNumber", []) or []
    primary_docs = recent.get("primaryDocument", []) or []
    out: list[dict] = []
    cik_int = str(int(cik))  # 先頭 0 を落とした form (URL 構築用)
    for i, form in enumerate(forms):
        if form != "8-K":
            continue
        if i >= len(dates) or i >= len(accessions):
            continue
        date_s = str(dates[i])[:10]
        accession = accessions[i].replace("-", "")  # 0000320193-25-XXXXXX → 000032019325XXXXXX
        primary = primary_docs[i] if i < len(primary_docs) else ""
        # SEC EDGAR filing index URL: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=8-K
        # or filing-specific: https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession}/{primary}
        if primary:
            url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession}/{primary}"
        else:
            url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=8-K"
        out.append({
            "date": date_s,
            "title": "8-K",
            "url": url,
        })
        if len(out) >= limit:
            break
    return out
