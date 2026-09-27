"""Position -> address. Fixtures are real Nominatim answers taken 2026-09-27."""
import importlib.util
import sys
import types
from pathlib import Path

# Load without the app's settings, and remove the stub afterwards.
_added = []
for name, attrs in {"app.core.config": {"settings": types.SimpleNamespace(LM_CONSUMER_CARE_EMAIL="x@y")}}.items():
    if name not in sys.modules:
        m = types.ModuleType(name); m.__dict__.update(attrs); sys.modules[name] = m; _added.append(name)
try:
    _spec = importlib.util.spec_from_file_location(
        "geocode", Path(__file__).resolve().parents[2] / "app/services/geocode.py")
    geo = importlib.util.module_from_spec(_spec)
    sys.modules["geocode"] = geo        # @dataclass resolves annotations through it
    _spec.loader.exec_module(geo)
finally:
    for n in _added:
        sys.modules.pop(n, None)

INDIRANAGAR = {"address": {
    "house_number": "375", "road": "100 Feet Road", "suburb": "Indiranagar",
    "city_district": "Bengaluru Central City Corporation", "city": "Bengaluru",
    "county": "Bangalore East", "state_district": "Bengaluru Urban", "state": "Karnataka",
    "postcode": "560038", "country": "India", "country_code": "in"}}
MYSURU = {"address": {
    "road": "Albert Victor Road", "suburb": "Mandi Mohalla", "city": "Mysuru",
    "county": "Mysuru taluk", "state_district": "Mysuru District", "state": "Karnataka",
    "postcode": "570001", "country": "India", "country_code": "in"}}


def test_fills_everything_but_the_door():
    loc = geo.parse(INDIRANAGAR)
    assert (loc.pincode, loc.line1, loc.locality, loc.city, loc.state) == (
        "560038", "100 Feet Road", "Indiranagar", "Bengaluru", "Karnataka")


def test_never_offers_a_neighbours_house_number():
    assert "375" not in (geo.parse(INDIRANAGAR).line1 or "")


def test_a_smaller_city():
    loc = geo.parse(MYSURU)
    assert (loc.pincode, loc.city, loc.locality) == ("570001", "Mysuru", "Mandi Mohalla")


def test_outside_india_is_nothing_to_find():
    assert not geo.in_india(51.5, -0.12)
    assert geo.in_india(12.97, 77.64)
    assert not geo.parse({"address": {"country_code": "gb", "postcode": "SW1A 1AA"}}).found


def test_a_malformed_postcode_is_dropped_not_guessed():
    assert geo.parse({"address": {"country_code": "in", "postcode": "5600", "city": "X"}}).pincode is None
