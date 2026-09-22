"""IndexNow submissions name the key file and only our own URLs."""
from app.services.indexnow import INDEXNOW_KEY, payload, product_urls


def test_payload_names_the_key_file_and_dedupes():
    body = payload(["https://zisun.in/shop", "https://zisun.in/shop", "https://evil.example/x"])
    assert body["key"] == INDEXNOW_KEY
    assert body["keyLocation"] == "https://zisun.in/indexnow.txt"
    assert body["urlList"] == ["https://zisun.in/shop"]


def test_a_product_change_touches_its_page_the_collection_and_its_category():
    urls = product_urls("abc", "co-ord-sets")
    assert "https://zisun.in/product/abc" in urls
    assert "https://zisun.in/category/co-ord-sets" in urls
    assert "https://zisun.in/shop" in urls
