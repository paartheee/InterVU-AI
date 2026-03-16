from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.db_models import CandidateProfile
from app.models.schemas import CandidateProfileSchema

router = APIRouter(tags=["profile"])


@router.post("/profile", response_model=CandidateProfileSchema)
async def create_or_update_profile(
    profile: CandidateProfileSchema,
    db: AsyncSession = Depends(get_db),
):
    if profile.id:
        result = await db.execute(
            select(CandidateProfile).where(CandidateProfile.id == profile.id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            if profile.display_name is not None:
                existing.display_name = profile.display_name
            if profile.resume_text is not None:
                existing.resume_text = profile.resume_text
            if profile.target_roles:
                existing.target_roles = profile.target_roles
            if profile.preferences:
                existing.preferences_json = profile.preferences
            await db.commit()
            await db.refresh(existing)
            return CandidateProfileSchema(
                id=existing.id,
                display_name=existing.display_name,
                resume_text=existing.resume_text,
                target_roles=existing.target_roles or [],
                preferences=existing.preferences_json or {},
            )

    new_profile = CandidateProfile(
        id=profile.id or None,
        display_name=profile.display_name,
        resume_text=profile.resume_text,
        target_roles=profile.target_roles,
        preferences_json=profile.preferences,
    )
    db.add(new_profile)
    await db.commit()
    await db.refresh(new_profile)
    return CandidateProfileSchema(
        id=new_profile.id,
        display_name=new_profile.display_name,
        resume_text=new_profile.resume_text,
        target_roles=new_profile.target_roles or [],
        preferences=new_profile.preferences_json or {},
    )


@router.get("/profile/{profile_id}", response_model=CandidateProfileSchema)
async def get_profile(profile_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.id == profile_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return CandidateProfileSchema(
        id=profile.id,
        display_name=profile.display_name,
        resume_text=profile.resume_text,
        target_roles=profile.target_roles or [],
        preferences=profile.preferences_json or {},
    )
