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
    ap.add_argument("phone", help="phone in E.164, e.g. +919363608792")
    ap.add_argument("--role", default=UserRole.admin.value, choices=ROLES,
                    help="role to set (default: admin)")
    ap.add_argument("--create", action="store_true",
                    help="create the user if no row exists yet")
    ap.add_argument("--name", default=None, help="name to set when creating")
    ap.add_argument("--dry-run", action="store_true", help="show what would change, write nothing")
    args = ap.parse_args()

    phone = args.phone.strip().replace(" ", "")
    if not E164.match(phone):
        print(f"error: {args.phone!r} is not E.164. Use a leading + and country code, "
              f"e.g. +919363608792 — the app stores phones in that form and a "
              f"mismatch would promote nobody.", file=sys.stderr)
        return 2

    _, SessionLocal = _get_sync_engine()
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.phone == phone)).scalar_one_or_none()

        if user is None:
            if not args.create:
                print(f"No user with phone {phone}.\n"
                      f"Either have them sign in once and re-run this, or pass --create "
                      f"to make the row now so their first sign-in is already an admin.",
                      file=sys.stderr)
                return 1
            if args.dry_run:
                print(f"would create {phone} with role={args.role}")
                return 0
            user = User(phone=phone, name=args.name, role=UserRole(args.role))
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"created {phone} with role={user.role.value} (id={user.id})")
            return 0

        was = user.role.value if hasattr(user.role, "value") else str(user.role)
        if was == args.role:
            print(f"{phone} already has role={was}; nothing to do")
            return 0
        if args.dry_run:
            print(f"would change {phone}: {was} -> {args.role}")
            return 0

        user.role = UserRole(args.role)
        if args.name and not user.name:
            user.name = args.name
        db.commit()
        print(f"{phone}: role {was} -> {args.role} (id={user.id})")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
