"""Twilio client construction — API key or account auth token.

Twilio accepts two credential styles, and they are NOT interchangeable in the
SDK's two-argument constructor:

    Client(account_sid, auth_token)                       # account auth token
    Client(api_key_sid, api_key_secret, account_sid)      # API key

Passing an API key SID (`SK...`) to the two-argument form looks like it should
work — it is a SID and a secret, after all — but the SDK then uses that first
argument as the account to act on, so every request goes to
`/Accounts/SK.../Messages` and fails authentication. The symptom is that OTP
delivery 503s for every user and nobody can log in.

API keys are the better credential: scoped, and revocable without rotating the
account token that everything else uses. This module picks the right form so
neither call site has to remember the distinction.
"""

from app.core.config import settings


def get_twilio_client():
    """Return an authenticated Twilio REST client.

    Prefers an API key when configured; falls back to the account auth token.
    Raises if neither is present — callers must check `settings.has_twilio_auth`
    (or rely on the production boot validator) before getting here.
    """
    from twilio.rest import Client  # noqa: PLC0415 — heavy import, keep it lazy

    if settings.TWILIO_API_KEY_SID and settings.TWILIO_API_KEY_SECRET:
        # Three-argument form: authenticate AS the key, act ON the account.
        return Client(
            settings.TWILIO_API_KEY_SID,
            settings.TWILIO_API_KEY_SECRET,
            settings.TWILIO_ACCOUNT_SID,
        )

    if settings.TWILIO_AUTH_TOKEN:
        return Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

    raise RuntimeError(
        "Twilio is not authenticated: set TWILIO_API_KEY_SID + "
        "TWILIO_API_KEY_SECRET, or TWILIO_AUTH_TOKEN."
    )
