from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.db_models import InterviewReportDB, Interview, SkillScore

router = APIRouter(tags=["share"])


@router.get("/share/{share_token}")
async def get_shared_report(
    share_token: str, db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InterviewReportDB).where(
            InterviewReportDB.share_token == share_token
        )
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Get interview details
    interview = None
    skill_scores = []
    if report.interview_id:
        int_result = await db.execute(
            select(Interview).where(Interview.id == report.interview_id)
        )
        interview = int_result.scalar_one_or_none()

        scores_result = await db.execute(
            select(SkillScore).where(
                SkillScore.interview_id == report.interview_id
            )
        )
        skill_scores = scores_result.scalars().all()

    return {
        "report": {
            "overall_score": report.overall_score,
            "transcript_summary": report.transcript_summary,
            "strengths": report.strengths_json,
            "areas_for_improvement": report.areas_for_improvement_json,
            "eye_contact_notes": report.eye_contact_notes,
            "posture_notes": report.posture_notes,
            "communication_notes": report.communication_notes,
            "coaching_plan": report.coaching_plan_text,
        },
        "interview": {
            "job_title": interview.job_title if interview else "Unknown",
            "interview_type": interview.interview_type if interview else "",
            "difficulty_level": interview.difficulty_level if interview else "",
            "started_at": interview.started_at.isoformat() if interview and interview.started_at else "",
        } if interview else None,
        "skill_scores": [
            {
                "skill_name": s.skill_name,
                "skill_type": s.skill_type,
                "score": s.score,
                "notes": s.notes,
            }
            for s in skill_scores
        ],
    }
