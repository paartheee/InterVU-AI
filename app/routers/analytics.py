from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.db_models import (
    Interview, InterviewReportDB, SkillScore, AnalyticsEvent,
)
from app.models.schemas import AnalyticsEventRequest

router = APIRouter(tags=["analytics"])


@router.get("/analytics/summary")
async def get_analytics_summary(
    candidate_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    # Base filter
    base_filter = []
    if candidate_id:
        base_filter.append(Interview.candidate_id == candidate_id)

    # Total interviews
    total_result = await db.execute(
        select(func.count(Interview.id)).where(*base_filter)
    )
    total = total_result.scalar() or 0

    # Completed interviews
    completed_result = await db.execute(
        select(func.count(Interview.id)).where(
            Interview.status == "completed", *base_filter
        )
    )
    completed = completed_result.scalar() or 0

    # Average score
    avg_result = await db.execute(
        select(func.avg(InterviewReportDB.overall_score))
        .join(Interview, InterviewReportDB.interview_id == Interview.id)
        .where(*base_filter)
    )
    avg_score = avg_result.scalar() or 0

    # Interviews by type
    type_result = await db.execute(
        select(Interview.interview_type, func.count(Interview.id))
        .where(*base_filter)
        .group_by(Interview.interview_type)
    )
    by_type = {row[0]: row[1] for row in type_result.all()}

    # Score trend (last 20 interviews)
    trend_result = await db.execute(
        select(Interview.started_at, InterviewReportDB.overall_score)
        .join(InterviewReportDB, InterviewReportDB.interview_id == Interview.id)
        .where(Interview.status == "completed", *base_filter)
        .order_by(Interview.started_at.desc())
        .limit(20)
    )
    trend_rows = trend_result.all()
    score_trend = [
        {
            "date": row[0].isoformat() if row[0] else "",
            "score": row[1],
        }
        for row in reversed(trend_rows)
    ]

    # Top and weakest skills
    skill_result = await db.execute(
        select(
            SkillScore.skill_name,
            func.avg(SkillScore.score).label("avg_score"),
            func.count(SkillScore.id).label("count"),
        )
        .join(Interview, SkillScore.interview_id == Interview.id)
        .where(*base_filter)
        .group_by(SkillScore.skill_name)
        .order_by(func.avg(SkillScore.score).desc())
    )
    all_skills = [
        {"skill": row[0], "avg_score": round(float(row[1]), 1), "count": row[2]}
        for row in skill_result.all()
    ]

    top_skills = all_skills[:5]
    weakest_skills = sorted(all_skills, key=lambda x: x["avg_score"])[:5]

    return {
        "total_interviews": total,
        "completed_interviews": completed,
        "average_score": round(float(avg_score), 1),
        "interviews_by_type": by_type,
        "score_trend": score_trend,
        "top_skills": top_skills,
        "weakest_skills": weakest_skills,
    }


@router.post("/analytics/event")
async def track_event(
    body: AnalyticsEventRequest,
    db: AsyncSession = Depends(get_db),
):
    event = AnalyticsEvent(
        event_type=body.event_type,
        candidate_id=body.candidate_id,
        interview_id=body.interview_id,
        metadata_json=body.metadata,
    )
    db.add(event)
    await db.commit()
    return {"status": "ok"}
