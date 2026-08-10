"""Cloudflare R2 / S3-compatible presigned URL generation."""
import logging

import boto3
from botocore.config import Config

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL or None,
        aws_access_key_id=settings.R2_ACCESS_KEY or None,
        aws_secret_access_key=settings.R2_SECRET_KEY or None,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def generate_upload_presigned_url(
    key: str, content_type: str, expires_in: int = 3600
) -> dict:
    """Return {upload_url, cdn_url, key}.

    In development (R2_ACCESS_KEY not set) returns placeholder URLs so the
    rest of the flow can be exercised without real cloud credentials. In
    production a missing key raises — a placeholder URL would be persisted as
    a product's media path and silently 404 for every customer.
    """
    if not settings.R2_ACCESS_KEY:
        settings.dev_fallback("Cloudflare R2 media uploads")
        return {
            "upload_url": f"http://localhost:9000/{settings.R2_BUCKET_NAME}/{key}",
            "cdn_url": f"/media/{key}",
            "key": key,
        }

    client = get_s3_client()
    upload_url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.R2_BUCKET_NAME,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=expires_in,
    )
    cdn_url = (
        f"{settings.CLOUDFLARE_CDN_BASE_URL}/{key}"
        if settings.CLOUDFLARE_CDN_BASE_URL
        else upload_url
    )
    return {"upload_url": upload_url, "cdn_url": cdn_url, "key": key}


def delete_r2_object(key: str) -> None:
    """Delete an object from R2/S3. No-op in dev mode; raises in production."""
    if not settings.R2_ACCESS_KEY:
        settings.dev_fallback("Cloudflare R2 media deletes")
        return
    try:
        client = get_s3_client()
        client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
    except Exception as exc:
        logger.warning("R2 delete failed for key %s: %s", key, exc)
