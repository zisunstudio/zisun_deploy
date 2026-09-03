#!/usr/bin/env python3
"""Give a phone number an admin role, so someone can actually reach /admin.

The chicken-and-egg this solves: every admin route is behind
`require_role("admin", ...)`, roles live on the `users` row, and a `users` row
is only created when someone signs in. With an empty users table there is no
admin, no way to promote anyone through the UI, and therefore no way into the
catalogue screens at all.

Two ways to use it, depending on whether phone sign-in is working yet:

    # Someone has already signed in once — promote that row.
    python scripts/grant_admin.py +919363608792

    # Nobody can sign in yet — create the row now, so the first sign-in
    # with that number lands straight in the admin.
    python scripts/grant_admin.py +919363608792 --create

    # Undo.
    python scripts/grant_admin.py +919363608792 --role user

Run it from `backend/` with the same environment the API runs with. It uses the
app's own sync engine, so host, credentials and pooling come from one place.

Phone format matters: `app/services/auth.py` stores E.164 (a leading + and
country code), and a mismatch here creates a second user rather than promoting
the intended one — which is why this refuses anything else.
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.core.database import _get_sync_engine  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402

# E.164: a plus, a non-zero country code, then digits. Deliberately strict —
# a silently-normalised number is a silently-wrong grant.
E164 = re.compile(r"^\+[1-9]\d{7,13}$")  # capped at users.phone String(15)

ROLES = tuple(r.value for r in UserRole)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("identifier", help="phone in E.164 (+919363608792) or an email address")
    ap.add_argument("--role", default=UserRole.admin.value, choices=ROLES,
                    help="role to set (default: admin)")
    ap.add_argument("--create", action="store_true",
                    help="create the user if no row exists yet")
    ap.add_argument("--name", default=None, help="name to set when creating")
    ap.add_argument("--link", default=None,
                    help="also attach this email or phone to the same account")
    ap.add_argument("--dry-run", action="store_true", help="show what would change, write nothing")
    args = ap.parse_args()

    raw = args.identifier.strip().replace(" ", "")
    phone = email = None
    if "@" in raw:
        # Lowercased to match the API, which lowercases the verified email claim
        # before using it as a key. A mixed-case grant here would promote nobody.
        email = raw.lower()
    elif E164.match(raw):
        phone = raw
    else:
        print(f"error: {args.identifier!r} is neither an email address nor an E.164 "
              f"phone number. Use +919363608792 or owner@example.com - the app "
              f"stores phones in E.164 and a mismatch would promote nobody.",
              file=sys.stderr)
        return 2
    label = phone or email

    _, SessionLocal = _get_sync_engine()
    with SessionLocal() as db:
        criterion = (User.phone == phone) if phone else (User.email == email)
        user = db.execute(select(User).where(criterion)).scalar_one_or_none()

        if user is None:
            if not args.create:
                print(f"No user with phone {phone}.\n"
                      f"Either have them sign in once and re-run this, or pass --create "
                      f"to make the row now so their first sign-in is already an admin.",
                      file=sys.stderr)
                return 1
            if args.dry_run:
                print(f"would create {label} with role={args.role}")
                return 0
            user = User(phone=phone, email=email, name=args.name, role=UserRole(args.role))
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"created {label} with role={user.role.value} (id={user.id})")
            return 0

        was = user.role.value if hasattr(user.role, "value") else str(user.role)
        if was == args.role:
            print(f"{label} already has role={was}; nothing to do")
            return 0
        if args.dry_run:
            print(f"would change {label}: {was} -> {args.role}")
            return 0

        user.role = UserRole(args.role)
        if args.name and not user.name:
            user.name = args.name
        # --link attaches the other identifier to the same row, so an admin
        # created by phone can sign in by email without a second account.
        if args.link:
            if "@" in args.link and not user.email:
                user.email = args.link.strip().lower()
            elif E164.match(args.link.strip()) and not user.phone:
                user.phone = args.link.strip()
        db.commit()
        print(f"{label}: role {was} -> {args.role} (id={user.id})")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
