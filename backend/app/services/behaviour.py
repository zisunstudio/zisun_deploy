"""What visitors did, from the four behaviour events.

Until 2026-10 the storefront recorded nothing when someone simply arrived. A
visit existed only once a product card had been on screen for a moment or a
piece was opened, so a woman who landed, looked at the hero and left was
never counted, and her UTM tags left with her. Nothing recorded how far she
read, which parts of the home page she reached, or what she tapped.

The storefront now sends:

  page_view      {page, path, landing}           one per page shown
  page_engaged   {page, seconds, scroll_pct}     one per page left; seconds the
                                                 tab was visible, furthest scroll
  section_viewed {section}                       a home-page section held on screen
  cta_click      {name}                          a tap on something marked data-track

`summarise` is pure - the query hands it plain rows - so the definitions
below are tested without a database. Everything is counted in *visits*
(sessions), never raw events: forty scrolls by one woman are one reader.
"""
from __future__ import annotations

from statistics import median
from typing import Iterable, Optional

EVENTS = ("page_view", "page_engaged", "section_viewed", "cta_click")

#: Home-page sections in the order they appear, so the console can show how
#: far down the page visits get.
HOME_SECTIONS = ("hero", "stories", "drop", "offers", "fit", "ways", "receipts", "mark", "ask")

#: Under this many seconds on a single page, with nothing tapped, is a look.
GLANCE_SECONDS = 10


def _num(v) -> Optional[float]:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def summarise(rows: Iterable[dict]) -> dict:
    """rows: {session, type, page, section, name, seconds, scroll, landing, at}, oldest first."""
    sessions: dict[str, dict] = {}
    pages: dict[str, dict] = {}
    sections: dict[str, set] = {}
    clicks: dict[str, dict] = {}
    first_at = None

    for r in rows:
        sid = r.get("session")
        if not sid:
            continue
        s = sessions.setdefault(sid, {"views": 0, "landing": None, "clicked": False, "seconds": 0.0, "engaged": False})
        kind, page = r.get("type"), (r.get("page") or "other")
        if kind == "page_view":
            first_at = first_at or r.get("at")
            s["views"] += 1
            if s["landing"] is None:
                s["landing"] = page
            p = pages.setdefault(page, {"views": 0, "visits": set(), "seconds": [], "scroll": []})
            p["views"] += 1
            p["visits"].add(sid)
        elif kind == "page_engaged":
            p = pages.setdefault(page, {"views": 0, "visits": set(), "seconds": [], "scroll": []})
            sec, scr = _num(r.get("seconds")), _num(r.get("scroll"))
            if sec is not None:
                # A tab left open overnight is not eight hours of reading.
                p["seconds"].append(min(sec, 600.0))
                s["seconds"] += min(sec, 600.0)
                s["engaged"] = True
            if scr is not None:
                p["scroll"].append(max(0.0, min(scr, 100.0)))
        elif kind == "section_viewed":
            sections.setdefault(r.get("section") or "?", set()).add(sid)
        elif kind == "cta_click":
            s["clicked"] = True
            c = clicks.setdefault(r.get("name") or "?", {"taps": 0, "visits": set()})
            c["taps"] += 1
            c["visits"].add(sid)

    viewed = {k: v for k, v in sessions.items() if v["views"] > 0}
    total = len(viewed)
    landing: dict[str, int] = {}
    for v in viewed.values():
        landing[v["landing"]] = landing.get(v["landing"], 0) + 1
    one_page = [v for v in viewed.values() if v["views"] == 1]
    glanced = [v for v in one_page if not v["clicked"] and v["engaged"] and v["seconds"] < GLANCE_SECONDS]

    share = lambda n, d: round(n / d, 4) if d else None  # noqa: E731
    home_visits = len(pages.get("home", {}).get("visits", ()))
    return {
        "recording_since": first_at,
        "visits": total,
        "page_views": sum(p["views"] for p in pages.values()),
        "one_page_visits": len(one_page),
        "glanced_and_left": len(glanced),
        "landing": sorted(({"page": k, "visits": n, "share": share(n, total)} for k, n in landing.items()),
                          key=lambda x: -x["visits"]),
        "pages": sorted(({
            "page": k, "views": p["views"], "visits": len(p["visits"]),
            "median_seconds": round(median(p["seconds"]), 1) if p["seconds"] else None,
            "read_half": share(sum(1 for x in p["scroll"] if x >= 50), len(p["scroll"])),
            "read_to_end": share(sum(1 for x in p["scroll"] if x >= 90), len(p["scroll"])),
            "measured": len(p["scroll"]),
        } for k, p in pages.items()), key=lambda x: -x["views"]),
        "home_sections": [{"section": sec, "visits": len(sections.get(sec, ())),
                           "share": share(len(sections.get(sec, ())), home_visits)}
                          for sec in HOME_SECTIONS if sec in sections or sec in ("hero", "drop")],
        "home_visits": home_visits,
        "clicks": sorted(({"name": k, "taps": c["taps"], "visits": len(c["visits"])} for k, c in clicks.items()),
                         key=lambda x: -x["visits"]),
    }
