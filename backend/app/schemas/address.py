import re
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
import uuid


INDIAN_STATES: List[str] = [
    # 28 States
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    # 8 Union Territories
    "Andaman and Nicobar Islands",
    "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
    "Lakshadweep",
    "Puducherry",
]

_PINCODE_RE = re.compile(r"^\d{6}$")


class AddressCreate(BaseModel):
    line1: str
    line2: Optional[str] = None
    city: str
    state: str
    pincode: str

    @field_validator("state")
    @classmethod
    def validate_state(cls, v: str) -> str:
        if v not in INDIAN_STATES:
            raise ValueError(
                f"'{v}' is not a valid Indian state or union territory. "
                f"Valid values: {', '.join(INDIAN_STATES)}"
            )
        return v

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, v: str) -> str:
        if not _PINCODE_RE.match(v):
            raise ValueError("pincode must be exactly 6 digits")
        return v


class AddressUpdate(BaseModel):
    line1: Optional[str] = None
    line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

    @field_validator("state")
    @classmethod
    def validate_state(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in INDIAN_STATES:
            raise ValueError(
                f"'{v}' is not a valid Indian state or union territory."
            )
        return v

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _PINCODE_RE.match(v):
            raise ValueError("pincode must be exactly 6 digits")
        return v


class AddressResponse(BaseModel):
    id: uuid.UUID
    line1: str
    line2: Optional[str] = None
    city: str
    state: str
    pincode: str
    is_default: bool
    created_at: datetime

    class Config:
        from_attributes = True
