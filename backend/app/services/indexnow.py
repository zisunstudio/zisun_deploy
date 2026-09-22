"""IndexNow: tell search engines a page changed, the moment it changes.

Bing (and the engines that share IndexNow) re-crawl submitted URLs within
minutes to hours instead of weeks. ChatGPT's search leans on Bing's index,
so this is also how a newly listed piece becomes findable there quickly.

The key is public by design: the storefront serves it at /indexnow.txt and
every submission names that file as its keyLocation. It must equal
INDEXNOW_KEY in frontend/src/lib/indexnow.ts.

Fire and forget: a failed ping never affects a product save.
"""
import logging
from typing import Iterable

import httpx

logger = logging.getLogger(__name__)

INDEXNOW_KEY = "54f5ae3eb5f670d1001cabf463858588"
SITE = "https://zisun.in"
ENDPOINT = "https://api.indexnow.org/indexnow"


def payload(urls: Iterable[str]) -> dict:
    return {
        "host": "zisun.in",
        "key": INDEXNOW_KEY,
        "keyLocation": f"{SITE}/indexnow.txt",
        "urlList": [u for u in dict.fromkeys(urls) if u.startswith(SITE)],
    }


async def ping(urls: Iterable[str]) -> None:
    body = payload(urls)
    if not body["urlList"]:
        return
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(6.0)) as client:
            res = await client.post(ENDPOINT, json=body)
        if res.status_code >= 300:
            logger.info("IndexNow returned %s for %d urls", res.status_code, len(body["urlList"]))
    except Exception as exc:  # noqa: BLE001
        logger.info("IndexNow ping failed: %s", exc)


def product_urls(product_id, category_slug: str | None = None) -> list[str]:
    """What changes when a product does: its page, the collection, its category, the home page."""
    urls = [f"{SITE}/product/{product_id}", f"{SITE}/shop", f"{SITE}/"]
    if category_slug:
        urls.append(f"{SITE}/category/{category_slug}")
    return urls
