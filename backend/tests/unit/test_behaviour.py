"""What a visit is, how far it read, where it landed - counted in visits, not events."""
from app.services.behaviour import summarise


def ev(session, type_, **kw):
    return {"session": session, "type": type_, **kw}


class TestSummarise:
    def test_a_visitor_who_only_arrives_is_counted(self):
        out = summarise([ev("a", "page_view", page="home", at="2026-10-04T10:00:00Z")])
        assert out["visits"] == 1 and out["page_views"] == 1
        assert out["landing"] == [{"page": "home", "visits": 1, "share": 1.0}]
        assert out["recording_since"] == "2026-10-04T10:00:00Z"

    def test_landing_is_the_first_page_of_the_visit(self):
        out = summarise([ev("a", "page_view", page="product"), ev("a", "page_view", page="home"),
                         ev("b", "page_view", page="home")])
        assert {x["page"]: x["visits"] for x in out["landing"]} == {"product": 1, "home": 1}

    def test_glance_is_one_page_under_ten_seconds_with_nothing_tapped(self):
        rows = [ev("a", "page_view", page="home"), ev("a", "page_engaged", page="home", seconds=4, scroll=10),
                ev("b", "page_view", page="home"), ev("b", "page_engaged", page="home", seconds=4, scroll=10),
                ev("b", "cta_click", name="hero_cta"),
                ev("c", "page_view", page="home"), ev("c", "page_engaged", page="home", seconds=40, scroll=80)]
        out = summarise(rows)
        assert out["one_page_visits"] == 3 and out["glanced_and_left"] == 1

    def test_reading_depth_is_a_share_of_measured_pages(self):
        rows = [ev("a", "page_view", page="product"), ev("a", "page_engaged", page="product", seconds=30, scroll=95),
                ev("b", "page_view", page="product"), ev("b", "page_engaged", page="product", seconds=10, scroll=55),
                ev("c", "page_view", page="product"), ev("c", "page_engaged", page="product", seconds=2, scroll=5)]
        p = summarise(rows)["pages"][0]
        assert p["views"] == 3 and p["measured"] == 3
        assert p["read_half"] == round(2 / 3, 4) and p["read_to_end"] == round(1 / 3, 4)
        assert p["median_seconds"] == 10

    def test_a_tab_left_open_is_capped(self):
        rows = [ev("a", "page_view", page="home"), ev("a", "page_engaged", page="home", seconds=30000, scroll=10)]
        assert summarise(rows)["pages"][0]["median_seconds"] == 600

    def test_sections_and_clicks_count_visits_not_events(self):
        rows = [ev("a", "page_view", page="home"), ev("a", "section_viewed", section="hero"), ev("a", "section_viewed", section="drop"),
                ev("b", "page_view", page="home"), ev("b", "section_viewed", section="hero"),
                ev("a", "cta_click", name="hero_cta"), ev("a", "cta_click", name="hero_cta")]
        out = summarise(rows)
        secs = {s["section"]: s for s in out["home_sections"]}
        assert secs["hero"]["visits"] == 2 and secs["hero"]["share"] == 1.0
        assert secs["drop"]["visits"] == 1 and secs["drop"]["share"] == 0.5
        assert out["clicks"] == [{"name": "hero_cta", "taps": 2, "visits": 1}]

    def test_events_without_a_session_are_ignored(self):
        assert summarise([{"session": None, "type": "page_view", "page": "home"}])["visits"] == 0

    def test_empty(self):
        out = summarise([])
        assert out["visits"] == 0 and out["landing"] == [] and out["pages"] == [] and out["clicks"] == []
