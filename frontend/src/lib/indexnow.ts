/**
 * IndexNow: tell Bing (and Yandex, Seznam...) the moment a page changes,
 * instead of waiting weeks for a crawl. It matters beyond Bing: ChatGPT's
 * search leans on Bing's index, so a piece listed today can be findable in
 * ChatGPT this week rather than next month.
 *
 * The key is public by design - it is served at /indexnow.txt to prove the
 * submitter owns the site - so it lives in code. The backend holds the same
 * value (INDEXNOW_KEY in app/services/indexnow.py) and pings on every product
 * save.
 */
export const INDEXNOW_KEY = "54f5ae3eb5f670d1001cabf463858588";
