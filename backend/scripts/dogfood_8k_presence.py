"""⑩ Phase 1 戦略検証 (throwaway): 各 ticker の最新 8-K EX-99.1 に「将来ガイダンス言語」が
含まれるかを SEC EDGAR から直接 fetch して grep で判定する。 LLM/main.py 非依存。

transcript fallback は 8-K にガイダンス数値が無い時のみ発火する設計。 8-K に guidance section が
ある銘柄 (= NVDA 型) は本番で transcript を取りに行かない。 どの mega-cap が「8-K 空」 で
transcript path が実際に効くのかを切り分ける。
"""
import re
import sys
from html.parser import HTMLParser

import httpx

HEADERS = {"User-Agent": "beatscanner research@example.com", "Accept-Encoding": "gzip, deflate"}

# 将来ガイダンス特有の言語 (実績報告と区別)。 $ レンジ + 将来表現。
FWD_GUIDANCE_RE = re.compile(
    r"(we (?:expect|anticipate|are guiding|now expect)|outlook|guidance|"
    r"for the (?:first|second|third|fourth) quarter|full[- ]year)",
    re.IGNORECASE,
)
RANGE_RE = re.compile(r"(?:\$|usd)\s?\d[\d.,]*\s?(?:to|-|–|and|billion|million)", re.IGNORECASE)


class _Txt(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, d):
        self.parts.append(d)

    def text(self):
        return re.sub(r"\s+", " ", " ".join(self.parts))


def cik_of(ticker):
    r = httpx.get("https://www.sec.gov/files/company_tickers.json", headers=HEADERS, timeout=15)
    for e in r.json().values():
        if e.get("ticker", "").upper() == ticker.upper():
            return str(e["cik_str"]).zfill(10)
    return None


def latest_8k_ex99_text(ticker):
    cik = cik_of(ticker)
    if not cik:
        return None
    sub = httpx.get(f"https://data.sec.gov/submissions/CIK{cik}.json", headers=HEADERS, timeout=15).json()
    f = sub.get("filings", {}).get("recent", {})
    forms, accs, items = f.get("form", []), f.get("accessionNumber", []), f.get("items", [])
    checked = 0
    for i, (form, acc) in enumerate(zip(forms, accs)):
        if form != "8-K" or "2.02" not in str(items[i] if i < len(items) else ""):
            continue
        checked += 1
        if checked > 2:
            break
        a = acc.replace("-", "")
        idx = httpx.get(
            f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{a}/{acc}-index.html",
            headers=HEADERS, timeout=15, follow_redirects=True,
        )
        m = re.search(r'href="(/Archives/edgar/data/[^"]+(?:ex[-_]?99|99d1)[^"]*\.html?)"', idx.text, re.I)
        if not m:
            m = re.search(r'EX-99\.1[^<]*</td>\s*<td[^>]*>\s*<a href="(/Archives/edgar/data/[^"]+\.html?)"', idx.text, re.I)
        if not m:
            continue
        htm = httpx.get(f"https://www.sec.gov{m.group(1)}", headers=HEADERS, timeout=20, follow_redirects=True)
        if htm.status_code != 200:
            continue
        p = _Txt()
        p.feed(htm.text)
        txt = p.text()
        if len(txt) > 300:
            return txt
    return None


def main():
    for t in (sys.argv[1:] or ["MSFT", "GOOGL", "META", "AMZN", "NVDA"]):
        try:
            txt = latest_8k_ex99_text(t)
        except Exception as e:
            print(f"{t:6} ERROR {e}")
            continue
        if not txt:
            print(f"{t:6} 8-K EX-99.1 取得不可 → transcript fallback 発火しうる")
            continue
        # guidance/outlook 文脈の近傍に $ レンジが出るか (粗い presence check)
        fwd = bool(FWD_GUIDANCE_RE.search(txt))
        rng = bool(RANGE_RE.search(txt))
        # "outlook"/"guidance" の語の周辺 300 字に $ レンジがあるか
        near = False
        for m in re.finditer(r"(outlook|guidance|we expect|for the (?:first|second|third|fourth) quarter)", txt, re.I):
            w = txt[m.start():m.start() + 400]
            if RANGE_RE.search(w):
                near = True
                break
        verdict = "8-K にガイダンス likely (transcript 発火しない)" if near else \
                  "8-K にガイダンス数値 見当たらず (transcript 発火しうる)"
        print(f"{t:6} len={len(txt):6} fwd_lang={fwd} has_range={rng} guidance_near_range={near}  → {verdict}")


if __name__ == "__main__":
    main()
