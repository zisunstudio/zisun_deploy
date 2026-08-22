"""Legal Metrology declarations resolve to something publishable.

The declarations are a compliance surface, not a nicety: the Packaged
Commodities Rules require them on the listing before purchase. The failure mode
worth testing against is not an exception — it is a page that renders a blank
where a declaration should be, because nobody filled a column in.
"""

import datetime
import uuid

import pytest

from app.core.config import settings
from app.schemas.catalog import LegalMetrology, ProductResponse


class _Row:
    """Stand-in for an ORM Product row."""

    def __init__(self, **overrides):
        self.id = uuid.uuid4()
        self.name = "Sungudi Everyday Kurti"
        self.description = None
        self.base_price = 149900
        self.category_id = None
        self.vendor_id = None
        self.is_active = True
        self.created_at = self.updated_at = datetime.datetime.now(datetime.timezone.utc)
        self.variants = []
        self.media = []
        self.category = None
        self.commodity_name = None
        self.net_quantity = None
        self.dimensions = None
        self.country_of_origin = None
        self.manufacturer_name = None
        self.manufacturer_address = None
        for key, value in overrides.items():
            setattr(self, key, value)


def _dump(row: _Row) -> dict:
    return ProductResponse.model_validate(row, from_attributes=True).model_dump()


class TestDefaultsFillTheGaps:
    def test_untouched_product_still_declares_everything(self):
        """A row with no overrides is the common case — all eight products."""
        lm = _dump(_Row())["legal_metrology"]
        required = (
            "commodity_name",
            "net_quantity",
            "country_of_origin",
            "manufacturer_name",
            "manufacturer_address",
            "consumer_care_name",
            "consumer_care_email",
            "consumer_care_phone",
        )
        for field in required:
            assert lm[field], f"{field} resolved empty — the listing would show a blank declaration"

    def test_dimensions_stay_absent_rather_than_guessed(self):
        """
        Dimensions are the one field with no honest brand-wide default: a kurti
        and a co-ord set do not share measurements. Absent is correct; a
        plausible-looking default would be a false declaration.
        """
        assert _dump(_Row())["legal_metrology"]["dimensions"] is None

    def test_blank_string_is_treated_as_missing(self):
        """An empty column is a human leaving the field blank, not a value."""
        lm = _dump(_Row(net_quantity="", country_of_origin="   " and ""))["legal_metrology"]
        assert lm["net_quantity"] == settings.LM_NET_QUANTITY
        assert lm["country_of_origin"] == settings.LM_COUNTRY_OF_ORIGIN


class TestOverridesWin:
    def test_product_value_beats_the_default(self):
        lm = _dump(
            _Row(
                net_quantity="1 set of 2 pieces",
                dimensions="Bust 92 cm, Length 114 cm",
                country_of_origin="India",
                manufacturer_name="Third Party Weaves",
            )
        )["legal_metrology"]
        assert lm["net_quantity"] == "1 set of 2 pieces"
        assert lm["dimensions"] == "Bust 92 cm, Length 114 cm"
        assert lm["manufacturer_name"] == "Third Party Weaves"
        # Not overridden, so it still falls back.
        assert lm["commodity_name"] == settings.LM_COMMODITY_NAME


class TestRawColumnsDoNotLeak:
    def test_response_publishes_only_the_resolved_block(self):
        """
        Two sources for the same declaration invites a client rendering the
        unresolved one, which is the blank-declaration bug by another route.
        """
        dumped = _dump(_Row(net_quantity="1 unit"))
        for raw in ("commodity_name", "net_quantity", "dimensions", "manufacturer_address"):
            assert raw not in dumped, f"raw override {raw} leaked alongside legal_metrology"
        assert "legal_metrology" in dumped


class TestResolveIsTotal:
    @pytest.mark.parametrize(
        "field",
        [
            "commodity_name",
            "net_quantity",
            "country_of_origin",
            "manufacturer_name",
            "manufacturer_address",
            "consumer_care_name",
            "consumer_care_email",
            "consumer_care_phone",
        ],
    )
    def test_every_required_field_is_typed_non_optional(self, field):
        """
        These are declared `str`, not `Optional[str]`, so a future default that
        is emptied in config fails at serialisation instead of silently
        publishing a listing that is missing a statutory declaration.
        """
        assert LegalMetrology.model_fields[field].annotation is str
