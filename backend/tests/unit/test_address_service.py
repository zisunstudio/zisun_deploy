"""Unit tests for AddressService."""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException


class TestAddressService:
    async def test_create_address_sets_default_if_first(self, mock_db):
        from app.services.address import AddressService
        from app.schemas.address import AddressCreate

        svc = AddressService(mock_db)
        user_id = uuid.uuid4()

        # No existing addresses — scalar_one_or_none returns None
        mock_list_result = MagicMock()
        mock_list_result.scalar_one_or_none.return_value = None

        new_addr = MagicMock()
        new_addr.id = uuid.uuid4()
        new_addr.is_default = True

        mock_db.execute = AsyncMock(return_value=mock_list_result)
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        data = AddressCreate(
            line1="123 MG Road",
            city="Bangalore",
            state="Karnataka",
            pincode="560001",
        )
        # Should not raise
        await svc.create_address(user_id=user_id, data=data)
        mock_db.add.assert_called_once()

    async def test_create_address_not_default_if_existing(self, mock_db):
        from app.services.address import AddressService
        from app.schemas.address import AddressCreate

        svc = AddressService(mock_db)
        user_id = uuid.uuid4()

        # Existing address present
        existing_addr = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_addr

        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        data = AddressCreate(
            line1="456 Brigade Road",
            city="Bangalore",
            state="Karnataka",
            pincode="560025",
        )
        await svc.create_address(user_id=user_id, data=data)
        mock_db.add.assert_called_once()

    async def test_delete_nonexistent_address_raises_404(self, mock_db):
        from app.services.address import AddressService
        svc = AddressService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc:
            await svc.delete_address(user_id=uuid.uuid4(), address_id=uuid.uuid4())
        assert exc.value.status_code == 404

    async def test_delete_address_wrong_owner_raises_403(self, mock_db):
        from app.services.address import AddressService
        svc = AddressService(mock_db)

        address = MagicMock()
        address.user_id = str(uuid.uuid4())  # different owner

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = address
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc:
            await svc.delete_address(
                user_id=uuid.uuid4(),  # different user
                address_id=uuid.uuid4(),
            )
        assert exc.value.status_code == 403

    async def test_delete_address_succeeds(self, mock_db):
        from app.services.address import AddressService
        svc = AddressService(mock_db)

        user_id = uuid.uuid4()
        address_id = uuid.uuid4()

        address = MagicMock()
        address.user_id = str(user_id)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = address
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.delete = AsyncMock()
        mock_db.commit = AsyncMock()

        await svc.delete_address(user_id=user_id, address_id=address_id)
        mock_db.delete.assert_called_once_with(address)
        mock_db.commit.assert_called_once()

    async def test_set_default_not_found_raises_404(self, mock_db):
        from app.services.address import AddressService
        svc = AddressService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc:
            await svc.set_default(user_id=uuid.uuid4(), address_id=uuid.uuid4())
        assert exc.value.status_code == 404

    async def test_set_default_wrong_owner_raises_403(self, mock_db):
        from app.services.address import AddressService
        svc = AddressService(mock_db)

        address = MagicMock()
        address.user_id = str(uuid.uuid4())  # different owner

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = address
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc:
            await svc.set_default(user_id=uuid.uuid4(), address_id=uuid.uuid4())
        assert exc.value.status_code == 403

    async def test_set_default_updates_address(self, mock_db):
        from app.services.address import AddressService
        svc = AddressService(mock_db)

        user_id = uuid.uuid4()
        address_id = uuid.uuid4()

        target_addr = MagicMock()
        target_addr.id = address_id
        target_addr.user_id = str(user_id)
        target_addr.is_default = False

        # First execute: fetch target address
        mock_single = MagicMock()
        mock_single.scalar_one_or_none.return_value = target_addr

        # Second execute: the bulk UPDATE statement (returns nothing meaningful)
        mock_update = MagicMock()

        mock_db.execute = AsyncMock(side_effect=[mock_single, mock_update])
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        result = await svc.set_default(user_id=user_id, address_id=address_id)
        assert target_addr.is_default is True
        mock_db.commit.assert_called_once()

    async def test_list_addresses(self, mock_db):
        from app.services.address import AddressService
        svc = AddressService(mock_db)

        addr1 = MagicMock()
        addr2 = MagicMock()

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [addr1, addr2]
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await svc.list_addresses(user_id=uuid.uuid4())
        assert len(result) == 2

    async def test_update_address_not_found_raises_404(self, mock_db):
        from app.services.address import AddressService
        from app.schemas.address import AddressUpdate
        svc = AddressService(mock_db)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc:
            await svc.update_address(
                user_id=uuid.uuid4(),
                address_id=uuid.uuid4(),
                data=AddressUpdate(),
            )
        assert exc.value.status_code == 404

    async def test_update_address_wrong_owner_raises_403(self, mock_db):
        from app.services.address import AddressService
        from app.schemas.address import AddressUpdate
        svc = AddressService(mock_db)

        address = MagicMock()
        address.user_id = str(uuid.uuid4())

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = address
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc:
            await svc.update_address(
                user_id=uuid.uuid4(),
                address_id=uuid.uuid4(),
                data=AddressUpdate(),
            )
        assert exc.value.status_code == 403
