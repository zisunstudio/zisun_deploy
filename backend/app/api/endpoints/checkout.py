"""Checkout API endpoints — pincode serviceability check."""
import re

from fastapi import APIRouter, HTTPException

router = APIRouter()

_PINCODE_RE = re.compile(r"^\d{6}$")


@router.get("/pincode/{pincode}/check", tags=["Checkout"])
async def check_pincode(pincode: str):
    """
    Check if a pincode is serviceable.
    Phase 2: any valid 6-digit pincode returns serviceable=true.
    Real Shiprocket integration in Phase 4.
    """
    if not _PINCODE_RE.match(pincode):
        raise HTTPException(status_code=400, detail="Pincode must be exactly 6 digits")
    return {"serviceable": True, "estimated_days": "3-7", "pincode": pincode}
