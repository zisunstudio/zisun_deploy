#!/usr/bin/env python3
"""Upload product photographs to object storage and print their public URLs.

The supported path is /admin -> product -> media, which asks the API for a
presigned URL. That needs an admin session, which needs an OTP, which needs
Twilio -- so under LAUNCH_MODE=browse there is no way in. This does the same
upload directly, so a catalogue can be photographed and published without one.

It reuses `app.core.storage.get_s3_client`, so endpoint, credentials and
signing come from exactly the same place the API uses. A second S3 client
here would drift from the app's and upload to the wrong bucket the first time
someone changed a variable.

Usage (from backend/, with the same env the API runs with):

    python scripts/upload_media.py ../photos --prefix products
    python scripts/upload_media.py ../photos --prefix products --dry-run
    python scripts/upload_media.py ../photos --csv media_urls.csv

The printed URLs go straight into the `image_url` column of the catalogue CSV
that scripts/import_catalog.py reads.
"""
import argparse
import hashlib
import mimetypes
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings          # noqa: E402
from app.core.storage import get_s3_client    # noqa: E402

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"}


def _public_url(key: str) -> str:
    base = (settings.CLOUDFLARE_CDN_BASE_URL or "").rstrip("/")
    if not base:
        raise SystemExit(
            "CLOUDFLARE_CDN_BASE_URL is not set. Without it there is no public "
            "URL to put in the catalogue CSV, and the upload would be pointless."
        )
    return f"{base}/{key}"


def _collect(root: str) -> list[str]:
    if os.path.isfile(root):
        return [root]
    found = []
    for dirpath, _, filenames in os.walk(root):
        for fn in sorted(filenames):
            if os.path.splitext(fn)[1].lower() in IMAGE_SUFFIXES:
                found.append(os.path.join(dirpath, fn))
    return found


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path", help="image file, or a folder to walk")
    ap.add_argument("--prefix", default="products",
                    help="key prefix in the bucket (default: products)")
    ap.add_argument("--csv", help="also write filename,url pairs here")
    ap.add_argument("--dry-run", action="store_true",
                    help="show what would upload, touch nothing")
    ap.add_argument("--overwrite", action="store_true",
                    help="replace a key that already exists (default: skip)")
    args = ap.parse_args()

    files = _collect(args.path)
    if not files:
        print(f"No images found under {args.path}", file=sys.stderr)
        return 1

    if not settings.R2_ACCESS_KEY and not args.dry_run:
        raise SystemExit(
            "R2_ACCESS_KEY is not set — run this with the same environment the "
            "API uses, or the upload has nowhere to go."
        )

    client = None if args.dry_run else get_s3_client()
    bucket = settings.R2_BUCKET_NAME
    rows, uploaded, skipped = [], 0, 0

    for path in files:
        name = os.path.basename(path)
        key = f"{args.prefix.strip('/')}/{name}" if args.prefix else name
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        size = os.path.getsize(path)

        if args.dry_run:
            print(f"  would upload  {name:40} {size/1024:8.0f} KB  -> {key}")
            rows.append((name, _public_url(key)))
            continue

        if not args.overwrite:
            try:
                client.head_object(Bucket=bucket, Key=key)
                print(f"  exists, skip  {name:40} -> {key}")
                rows.append((name, _public_url(key)))
                skipped += 1
                continue
            except Exception:
                pass  # not present — proceed to upload

        with open(path, "rb") as fh:
            data = fh.read()
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType=ctype,
            # Product images are replaced by uploading a new name, not by
            # mutating one, so a long cache is safe and keeps origin cost down.
            CacheControl="public, max-age=31536000",
        )
        digest = hashlib.sha256(data).hexdigest()[:8]
        print(f"  uploaded      {name:40} {size/1024:8.0f} KB  {digest}  -> {key}")
        rows.append((name, _public_url(key)))
        uploaded += 1

    print(f"\n{'DRY RUN — ' if args.dry_run else ''}"
          f"{len(files)} image(s); uploaded {uploaded}, skipped {skipped}")
    print("\nPaste these into the image_url column of your catalogue CSV:\n")
    for name, url in rows:
        print(f"  {name:40} {url}")

    if args.csv:
        import csv as _csv
        with open(args.csv, "w", newline="") as fh:
            w = _csv.writer(fh)
            w.writerow(["filename", "image_url"])
            w.writerows(rows)
        print(f"\nWrote {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
