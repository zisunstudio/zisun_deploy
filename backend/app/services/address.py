"""Address service — CRUD + set-default for user delivery addresses."""
import uuid
import logging

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Address
from app.schemas.address import AddressCreate, AddressUpdate

logger = logging.getLogger(__name__)


class AddressService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_addresses(self, user_id: uuid.UUID) -> list:
        """Return all addresses for a user, default first."""
        stmt = (
            select(Address)
            .where(Address.user_id == str(user_id))
            .order_by(Address.is_default.desc(), Address.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_address(self, user_id: uuid.UUID, data: AddressCreate) -> Address:
        """Create a new address; auto-set as default if it's the user's first."""
        # Check if user already has addresses
        existing_stmt = select(Address).where(Address.user_id == str(user_id)).limit(1)
        existing_result = await self.db.execute(existing_stmt)
        is_first = existing_result.scalar_one_or_none() is None

        address = Address(
            user_id=str(user_id),
            line1=data.line1,
            line2=data.line2 if hasattr(data, "line2") else None,
            city=data.city,
            state=data.state,
            pincode=data.pincode,
            is_default=is_first,
        )
        self.db.add(address)
        await self.db.commit()
        await self.db.refresh(address)
        return address

    async def update_address(
        self,
        user_id: uuid.UUID,
        address_id: uuid.UUID,
        data: AddressUpdate,
    ) -> Address:
        """Update an address; raises 404 if not found, 403 if not owned by user."""
        stmt = select(Address).where(Address.id == str(address_id))
        result = await self.db.execute(stmt)
        address = result.scalar_one_or_none()

        if not address:
            raise HTTPException(status_code=404, detail="Address not found")
        if str(address.user_id) != str(user_id):
            raise HTTPException(status_code=403, detail="Not authorised to modify this address")

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                setattr(address, field, value)

        await self.db.commit()
        await self.db.refresh(address)
        return address

    async def delete_address(self, user_id: uuid.UUID, address_id: uuid.UUID) -> None:
        """Delete an address owned by the user."""
        stmt = select(Address).where(Address.id == str(address_id))
        result = await self.db.execute(stmt)
        address = result.scalar_one_or_none()

        if not address:
            raise HTTPException(status_code=404, detail="Address not found")
        if str(address.user_id) != str(user_id):
            raise HTTPException(status_code=403, detail="Not authorised to delete this address")

        await self.db.delete(address)
        await self.db.commit()

    async def set_default(self, user_id: uuid.UUID, address_id: uuid.UUID) -> Address:
        """Set an address as the default, clearing others first."""
        stmt = select(Address).where(Address.id == str(address_id))
        result = await self.db.execute(stmt)
        address = result.scalar_one_or_none()

        if not address:
            raise HTTPException(status_code=404, detail="Address not found")
        if str(address.user_id) != str(user_id):
            raise HTTPException(status_code=403, detail="Not authorised to modify this address")

        # Clear all existing defaults for this user
        clear_stmt = (
            update(Address)
            .where(Address.user_id == str(user_id))
            .values(is_default=False)
        )
        await self.db.execute(clear_stmt)

        # Set this one as default
        address.is_default = True
        await self.db.commit()
        await self.db.refresh(address)
        return address
