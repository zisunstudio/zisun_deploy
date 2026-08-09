"""Address API endpoints — CRUD + set-default."""
import uuid
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_db
from app.core.security import get_current_user
from app.schemas.address import AddressCreate, AddressResponse, AddressUpdate
from app.services.address import AddressService

router = APIRouter()


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

