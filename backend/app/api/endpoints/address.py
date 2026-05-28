"""Address API endpoints — CRUD + set-default + pincode serviceability check."""
import re
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.core.security import get_current_user
from app.schemas.address import AddressCreate, AddressResponse, AddressUpdate
from app.services.address import AddressService

router = APIRouter()

_PINCODE_RE = re.compile(r"^\d{6}$")


# ── Addresses ─────────────────────────────────────────────────────────────────


@router.get("/", response_model=List[AddressResponse], tags=["Addresses"])
async def list_addresses(
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """List all saved delivery addresses for the authenticated user."""
    svc = AddressService(db)
    return await svc.list_addresses(user_id=current_user.id)


@router.post("/", response_model=AddressResponse, status_code=201, tags=["Addresses"])
async def create_address(
    data: AddressCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """Create a new delivery address."""
    svc = AddressService(db)
    return await svc.create_address(user_id=current_user.id, data=data)


@router.put("/{address_id}", response_model=AddressResponse, tags=["Addresses"])
async def update_address(
    address_id: uuid.UUID,
    data: AddressUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """Update an existing address."""
    svc = AddressService(db)
    return await svc.update_address(
        user_id=current_user.id,
        address_id=address_id,
        data=data,
    )


@router.delete("/{address_id}", status_code=204, tags=["Addresses"])
async def delete_address(
    address_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """Delete a saved address."""
    svc = AddressService(db)
    await svc.delete_address(user_id=current_user.id, address_id=address_id)


@router.post("/{address_id}/set-default", response_model=AddressResponse, tags=["Addresses"])
async def set_default_address(
    address_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user=Depends(get_current_user),
):
    """Mark an address as the default delivery address."""
    svc = AddressService(db)
    return await svc.set_default(user_id=current_user.id, address_id=address_id)


# ── Pincode serviceability check ──────────────────────────────────────────────


@router.get("/checkout/pincode/{pincode}/check", tags=["Checkout"])
async def check_pincode(pincode: str):
    """
    Check if a pincode is serviceable.
    Phase 2: any valid 6-digit pincode returns serviceable=true.
    Real Shiprocket integration in Phase 4.
    """
    if not _PINCODE_RE.match(pincode):
        raise HTTPException(status_code=400, detail="Pincode must be exactly 6 digits")
    return {"serviceable": True, "estimated_days": "3-7", "pincode": pincode}
