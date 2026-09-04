"""The refresh cookie has to survive a cross-site request.

The storefront and this API are on different hosts, so every call between them
is cross-site. A SameSite=Strict cookie is accepted by the browser and then
never sent back, which does not look like a bug from either end: sign-in
succeeds, the access token sits in memory, and the session silently disappears
on the first full page load. The user sees a bounce to /login and a bare 401
from /auth/refresh, with nothing wrong in any log.

These pin the four attributes that make it work, and the two that keep it safe.
"""

from app.api.endpoints.auth import _REFRESH_COOKIE


class TestCrossSiteDelivery:
    def test_samesite_is_none(self):
        """
        Anything stricter is never sent from the storefront's origin. If this
        ever needs to go back to "lax", the API and the storefront must be on
        the same registrable domain first — see the comment on the cookie.
        """
        assert _REFRESH_COOKIE["samesite"] == "none"

    def test_secure_is_set(self):
        """SameSite=None without Secure is rejected outright by browsers."""
        assert _REFRESH_COOKIE["secure"] is True


class TestItStaysOutOfReach:
    def test_httponly(self):
        """
        The whole reason the access token is held in memory rather than storage
        is to keep it away from XSS. A readable refresh cookie would hand back
        everything that decision was protecting.
        """
        assert _REFRESH_COOKIE["httponly"] is True

    def test_scoped_to_the_auth_routes(self):
        """
        Narrow path so the cookie rides along only where it is needed, instead
        of on every catalogue and checkout request.
        """
        assert _REFRESH_COOKIE["path"] == "/api/v1/auth"


class TestLifetime:
    def test_matches_a_thirty_day_refresh_window(self):
        assert _REFRESH_COOKIE["max_age"] == 30 * 24 * 60 * 60
