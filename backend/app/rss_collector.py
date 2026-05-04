"""Phase 2a: RSS フィードからティッカー別ニュースを収集するモジュール。

毎朝 Railway Cron から呼ばれる /api/insights/refresh/batch の上流で、
ウォッチリスト各銘柄のニュースを Yahoo Finance + Seeking Alpha から収集する。
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Optional

import httpx


RSS_SOURCES: dict[str, str] = {
    "yahoo_finance": "https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US",
    "seeking_alpha": "https://seekingalpha.com/api/sa/combined/{ticker}.xml",
}


async def fetch_rss(url: str, timeout: int = 15) -> Optional[str]:
    """RSS フィードを取得して生 XML 文字列を返す。失敗時は None。"""
    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            headers={"User-Agent": "Mozilla/5.0 (compatible; beatscanner/1.0)"},
            follow_redirects=True,
        ) as client:
            r = await client.get(url)
            if r.status_code == 200:
                return r.text
            print(f"[rss_collector] non-200 {r.status_code}: {url}")
    except Exception as e:
        print(f"[rss_collector] fetch error: {url} → {e}")
    return None


def parse_rss(xml_text: str, max_items: int = 10) -> list[dict]:
    """RSS XML をパースして {title, description, published, url} のリストを返す。
    RSS 2.0 / Atom 両対応。description の HTML タグは除去し300字に切り詰め。"""
    items: list[dict] = []
    try:
        root = ET.fromstring(xml_text)
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        # RSS 2.0
        for item in root.findall(".//item")[:max_items]:
            title = (item.findtext("title") or "").strip()
            desc = (item.findtext("description") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()
            link = (item.findtext("link") or "").strip()
            desc = re.sub(r"<[^>]+>", "", desc).strip()
            if title:
                items.append({
                    "title": title,
                    "description": desc[:300] if desc else "",
                    "published": pub_date,
                    "url": link,
                })

        # Atom フォールバック
        if not items:
            for entry in root.findall("atom:entry", ns)[:max_items]:
                title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
                summary = (entry.findtext("atom:summary", default="", namespaces=ns) or "").strip()
                published = (entry.findtext("atom:published", default="", namespaces=ns) or "").strip()
                link_el = entry.find("atom:link", ns)
                link = link_el.get("href", "") if link_el is not None else ""
                if title:
                    items.append({
                        "title": title,
                        "description": summary[:300],
                        "published": published,
                        "url": link,
                    })
    except Exception as e:
        print(f"[rss_collector] parse error: {e}")
    return items


async def collect_ticker_news(ticker: str) -> list[dict]:
    """指定 ticker のニュースを全 RSS ソースから収集して結合返却。
    各 item には source キーを追加。"""
    all_items: list[dict] = []

    for source_name, url_template in RSS_SOURCES.items():
        url = url_template.format(ticker=ticker)
        xml_text = await fetch_rss(url)
        if not xml_text:
            continue
        items = parse_rss(xml_text)
        for item in items:
            item["source"] = source_name
        all_items.extend(items)
        print(f"[rss_collector] {ticker} {source_name}: {len(items)} items")

    return all_items
