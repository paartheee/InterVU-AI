import secrets

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.schemas import ExtractedSkills, ReportRequest, ReportResponse
from app.services.report_service import (
    generate_report, save_report, generate_skill_scores,
    generate_coaching_plan, save_report_to_db,
)

router = APIRouter()


@router.post("/report", response_model=ReportResponse)
async def create_report(request: ReportRequest, db: AsyncSession = Depends(get_db)):
    try:
        skills = ExtractedSkills.model_validate_json(request.skills_json)
        report = await generate_report(
            session_id=request.session_id,
            summary_text=request.summary_text,
            skills=skills,
        )

        # Generate enhanced report components
        skill_scores = await generate_skill_scores(request.summary_text, skills)
        coaching_plan = await generate_coaching_plan(report, skill_scores)
        share_token = secrets.token_urlsafe(16)

        # Save to file (backward compat)
        location = await save_report(report)

        # Save to DB
        interview_db_id = getattr(request, 'interview_db_id', None)
        await save_report_to_db(
            db, report, skill_scores, coaching_plan,
            share_token, interview_db_id,
        )

        return ReportResponse(
            report=report,
            storage_location=location,
            skill_scores=[
                {"skill_name": s.get("skill_name", ""), "skill_type": s.get("skill_type", ""), "score": s.get("score", 5), "notes": s.get("notes", "")}
                for s in skill_scores
            ],
            coaching_plan=coaching_plan,
            share_token=share_token,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
