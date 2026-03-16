import asyncio
import logging

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.schemas import ParseJDRequest, ParseJDResponse, InterviewConfig
from app.models.db_models import Interview
from app.services.jd_service import parse_job_description
from app.services.resume_service import parse_resume
from app.services.skill_gap_service import analyze_skill_gap
from app.services.prompt_builder import build_system_prompt, enhance_prompt_with_config

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/parse-jd")
async def parse_jd(request: ParseJDRequest, db: AsyncSession = Depends(get_db)):
    if len(request.job_description.strip()) < 50:
        raise HTTPException(status_code=400, detail="Job description too short")

    has_resume = request.resume_text and len(request.resume_text.strip()) > 30

    if has_resume:
        skills, parsed_resume = await asyncio.gather(
            parse_job_description(request.job_description),
            parse_resume(request.resume_text),
        )
        # Run skill gap analysis after we have both extractions
        skill_gap = await analyze_skill_gap(skills, parsed_resume)
    else:
        skills = await parse_job_description(request.job_description)
        parsed_resume = None
        skill_gap = None

    system_prompt = build_system_prompt(
        skills, request.candidate_language, parsed_resume, skill_gap
    )

    # Apply interview config if provided
    config = getattr(request, 'config', None) or InterviewConfig()
    system_prompt = enhance_prompt_with_config(
        system_prompt,
        interview_type=config.interview_type,
        difficulty_level=config.difficulty_level,
        follow_up_depth=config.follow_up_depth,
        company_style=config.company_style,
        is_practice_mode=config.is_practice_mode,
    )

    # Create interview record in DB
    interview = Interview(
        job_title=skills.job_title,
        job_description_text=request.job_description,
        resume_text_used=request.resume_text if has_resume else None,
        skills_json=skills.model_dump(),
        system_prompt=system_prompt,
        interview_type=config.interview_type,
        difficulty_level=config.difficulty_level,
        follow_up_depth=config.follow_up_depth,
        company_style=config.company_style,
        is_practice_mode=config.is_practice_mode,
        duration_minutes=config.duration_minutes,
        candidate_id=getattr(request, 'candidate_id', None),
    )
    db.add(interview)
    await db.commit()
    await db.refresh(interview)

    return {
        "skills": skills.model_dump(),
        "resume": parsed_resume.model_dump() if parsed_resume else None,
        "skill_gap": skill_gap.model_dump() if skill_gap else None,
        "system_prompt": system_prompt,
        "interview_db_id": interview.id,
    }
