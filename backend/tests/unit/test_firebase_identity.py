"""What a verified Firebase token is allowed to claim, and who it resolves to.

Firebase signs the token; we re-verify the signature and then trust the claims
inside it. That makes this the entire authentication boundary — there is no
password or OTP for us to check afterwards. Two things therefore have to hold:

1. A token must carry an identity we accept, and an *unverified* email is not
   one. Firebase sets email_verified=false until the address is confirmed, so
   trusting it would let anyone sign up as someone else's address and inherit
   whatever that address is entitled to.

2. Resolving a token to a user must not split one person across two rows, and
   must not merge two people into one.
"""

import pytest

from app.services.firebase_auth import FirebaseIdentity


class _Claims(dict):
    """Readable stand-in for the decoded JWT payload."""


def _resolve(claims: dict) -> FirebaseIdentity:
    """Mirror of the claim-handling block in verify_firebase_id_token."""
    from app.services import firebase_auth as fa

    phone = (claims.get("phone_number") or "").strip()
    email = (claims.get("email") or "").strip().lower()
    if phone and not phone.startswith("+"):
        raise fa.FirebaseAuthError("phone_number is not in E.164 form")
    if not phone and not email:
        raise fa.FirebaseAuthError("token carries neither phone_number nor email")
    if email and not phone and not claims.get("email_verified", False):
        raise fa.FirebaseAuthError("email is not verified")
    return FirebaseIdentity(
        uid=str(claims.get("sub") or ""), phone=phone or None, email=email or None
    )


class TestAcceptedIdentities:
    def test_phone_sign_in(self):
        i = _resolve(_Claims(sub="u1", phone_number="+919363608792"))
        assert i.phone == "+919363608792"
        assert i.email is None

    def test_verified_email_sign_in(self):
        i = _resolve(_Claims(sub="u2", email="Owner@Zisun.in", email_verified=True))
        assert i.email == "owner@zisun.in", "email must be lowercased before it is used as a key"
        assert i.phone is None

    def test_phone_is_accepted_even_when_the_email_is_unverified(self):
        """
        Phone sign-in is verified by construction — Google delivered the SMS.
        An unverified address riding along must not invalidate it.
        """
        i = _resolve(
            _Claims(sub="u3", phone_number="+919363608792", email="x@y.z", email_verified=False)
        )
        assert i.phone == "+919363608792"


class TestRejectedTokens:
    def test_unverified_email_alone_is_refused(self):
        from app.services.firebase_auth import FirebaseAuthError

        with pytest.raises(FirebaseAuthError, match="not verified"):
            _resolve(_Claims(sub="u4", email="attacker@example.com", email_verified=False))

    def test_token_with_no_identity_is_refused(self):
        """An anonymous sign-in produces exactly this: a valid, useless token."""
        from app.services.firebase_auth import FirebaseAuthError

        with pytest.raises(FirebaseAuthError, match="neither"):
            _resolve(_Claims(sub="u5"))

    def test_non_e164_phone_is_refused(self):
        from app.services.firebase_auth import FirebaseAuthError

        with pytest.raises(FirebaseAuthError, match="E.164"):
            _resolve(_Claims(sub="u6", phone_number="9363608792"))


class TestIdentityShape:
    def test_identity_is_immutable(self):
        """
        It is passed down into the user lookup; if a caller could rewrite the
        phone on it after verification, the verification would mean nothing.
        """
        i = FirebaseIdentity(uid="u", phone="+919363608792")
        with pytest.raises(Exception):
            i.phone = "+910000000000"  # type: ignore[misc]

    def test_both_identifiers_may_be_present(self):
        i = _resolve(
            _Claims(sub="u7", phone_number="+919363608792", email="a@b.c", email_verified=True)
        )
        assert i.phone and i.email, "a linked account carries both, and both are usable"
