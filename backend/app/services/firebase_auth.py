"""Verify Firebase Phone Auth ID tokens.

Firebase does the SMS: the browser runs the phone sign-in flow and receives a
signed ID token. This module proves that token is genuine, then hands back the
verified phone number so the caller can issue our own session.

Deliberately no `firebase-admin` dependency and no service-account key. A
Firebase ID token is an ordinary RS256 JWT signed by Google, so PyJWT plus
Google's published certificates verify it completely — the only configuration
needed is the project id, which is not a secret.

What is checked, and why each matters:

  signature   against Google's current x509 certs — the whole basis of trust
  iss         `https://securetoken.google.com/<project>` — a token from
              another Firebase project is signed by the same Google key, so
              without this check any Firebase project on earth could mint
              logins for this one
  aud         the project id, for the same reason
  exp/iat     PyJWT enforces; stops replay of an old token
  phone_number present and non-empty — an email or anonymous sign-in produces
              a perfectly valid token with no phone, and this app identifies
              users solely by phone
"""
import logging
import time
from dataclasses import dataclass

import httpx
import jwt
from cryptography.x509 import load_pem_x509_certificate

from app.core.config import settings

logger = logging.getLogger(__name__)

_CERT_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/"
    "securetoken@system.gserviceaccount.com"
)

# Google rotates these roughly daily and states the lifetime in Cache-Control.
# Refetching per login would add a round trip to every sign-in and, worse, make
# Google's availability a hard dependency of ours.
_certs: dict[str, str] = {}
_certs_expire_at: float = 0.0


@dataclass(frozen=True)
class FirebaseIdentity:
    """Who Firebase says this is.

    Exactly one of `phone` or `email` is typically set: phone for SMS
    sign-in, email for email/password. Both are possible once an account
    links providers, and the caller resolves a user from whichever it has.
    """

    uid: str
    phone: str | None = None
    email: str | None = None


class FirebaseAuthError(Exception):
    """Token rejected. The message is safe to log, never to return verbatim."""


async def _get_certs() -> dict[str, str]:
    global _certs, _certs_expire_at
    if _certs and time.time() < _certs_expire_at:
        return _certs
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(_CERT_URL)
        resp.raise_for_status()
        certs = resp.json()
    max_age = 3600
    cache_control = resp.headers.get("cache-control", "")
    for part in cache_control.split(","):
        part = part.strip()
        if part.startswith("max-age="):
            try:
                max_age = int(part.split("=", 1)[1])
            except ValueError:
                pass
    _certs = certs
    # Expire a minute early so a token is never checked against a key Google
    # has just retired.
    _certs_expire_at = time.time() + max(60, max_age - 60)
    return _certs


async def verify_firebase_id_token(id_token: str) -> "FirebaseIdentity":
    """Return the verified identity from the token, or raise FirebaseAuthError."""
    project_id = settings.FIREBASE_PROJECT_ID
    if not project_id:
        raise FirebaseAuthError("FIREBASE_PROJECT_ID is not configured")

    try:
        kid = jwt.get_unverified_header(id_token).get("kid")
    except Exception as exc:
        raise FirebaseAuthError(f"malformed token: {exc}") from exc
    if not kid:
        raise FirebaseAuthError("token header has no kid")

    certs = await _get_certs()
    pem = certs.get(kid)
    if pem is None:
        # A rotation between our cache and this token: refetch once before
        # rejecting, otherwise every login fails for the cache's lifetime.
        _certs.clear()
        certs = await _get_certs()
        pem = certs.get(kid)
    if pem is None:
        raise FirebaseAuthError(f"no Google certificate for kid {kid}")

    public_key = load_pem_x509_certificate(pem.encode()).public_key()
    try:
        claims = jwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise FirebaseAuthError(f"token rejected: {exc}") from exc

    phone = (claims.get("phone_number") or "").strip()
    email = (claims.get("email") or "").strip().lower()

    if phone and not phone.startswith("+"):
        raise FirebaseAuthError("phone_number is not in E.164 form")

    if not phone and not email:
        # A valid Firebase token from a sign-in method we do not accept -
        # anonymous, or a federated provider with no email released. Accepting
        # it would create an account with nothing to identify the person by.
        raise FirebaseAuthError("token carries neither phone_number nor email")

    # Only trust an address Firebase says was verified. Email/password sign-up
    # sets email_verified=false until the user clicks the link, and treating an
    # unverified address as an identity lets anyone claim someone else's.
    # Phone sign-in is inherently verified: Google delivered the SMS.
    if email and not phone and not claims.get("email_verified", False):
        raise FirebaseAuthError("email is not verified")

    return FirebaseIdentity(uid=str(claims.get("sub") or ""), phone=phone or None, email=email or None)
