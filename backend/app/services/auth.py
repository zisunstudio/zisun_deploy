from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from fastapi import HTTPException, status
import random
import logging

from app.models.user import User, UserRole
from app.schemas.auth import UserResponse

logger = logging.getLogger(__name__)

# MOCK REDIS FOR OTP STORAGE (Since Redis is not running locally yet)
# Format: { "+919876543210": "123456" }
MOCK_OTP_STORE = {}

class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def send_otp(self, phone: str) -> bool:
        """
        Generates a 6-digit OTP, stores it in (mock) Redis, and 'sends' it via SMS.
        """
        # 1. Check rate limits here (Mocked: allow all)
        
        # 2. Generate 6-digit OTP
        otp = str(random.randint(100000, 999999))
        
        # 3. Store in Mock Redis with 5-min TTL
        MOCK_OTP_STORE[phone] = otp
        
        # 4. Mock sending via Twilio
        logger.info(f"MOCK SMS: Sending OTP {otp} to {phone}")
        print(f"========== MOCK SMS ==========\nTo: {phone}\nOTP: {otp}\n==============================")
        
        return True

    async def verify_otp(self, phone: str, otp: str) -> UserResponse:
        """
        Verifies the OTP and returns the User object (creating one if it doesn't exist).
        """
        # 1. Verify OTP against store
        stored_otp = MOCK_OTP_STORE.get(phone)
        if not stored_otp or stored_otp != otp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired OTP"
            )
        
        # Clear the OTP after successful use
        del MOCK_OTP_STORE[phone]
        
        # 2. Find or create user
        stmt = select(User).where(User.phone == phone)
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            # Create new user
            user = User(phone=phone, role=UserRole.user)
            self.db.add(user)
            await self.db.commit()
            await self.db.refresh(user)
            
        return user
