from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.db_models import (
    Interview, InterviewReportDB, TranscriptEntry,
    ConfidenceSample, SkillScore,
)

router = APIRouter(tags=["history"])


@router.get("/interviews")
async def list_interviews(
    candidate_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    query = select(Interview).order_by(Interview.started_at.desc())
    if candidate_id:
        query = query.where(Interview.candidate_id == candidate_id)
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    interviews = result.scalars().all()

    items = []
    for i in interviews:
        # Get report score if exists
        report_result = await db.execute(
            select(InterviewReportDB.overall_score).where(
                InterviewReportDB.interview_id == i.id
            )
        )
        score = report_result.scalar_one_or_none()

        items.append({
            "id": i.id,
            "session_id": i.session_id,
            "job_title": i.job_title,
            "interview_type": i.interview_type,
            "difficulty_level": i.difficulty_level,
            "overall_score": score,
            "status": i.status,
            "started_at": i.started_at.isoformat() if i.started_at else "",
            "duration_minutes": i.duration_minutes,
            "is_practice_mode": i.is_practice_mode,
            "company_style": i.company_style,
        })

    return items


@router.get("/interviews/{interview_id}")
async def get_interview_detail(
    interview_id: str, db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    # Get report
    report_result = await db.execute(
        select(InterviewReportDB).where(
            InterviewReportDB.interview_id == interview_id
        )
    )
    report = report_result.scalar_one_or_none()

    # Get skill scores
    scores_result = await db.execute(
        select(SkillScore).where(SkillScore.interview_id == interview_id)
    )
    skill_scores = scores_result.scalars().all()

    return {
        "interview": {
            "id": interview.id,
            "session_id": interview.session_id,
            "job_title": interview.job_title,
            "interview_type": interview.interview_type,
            "difficulty_level": interview.difficulty_level,
            "status": interview.status,
            "started_at": interview.started_at.isoformat() if interview.started_at else "",
            "ended_at": interview.ended_at.isoformat() if interview.ended_at else "",
            "duration_minutes": interview.duration_minutes,
            "actual_duration_seconds": interview.actual_duration_seconds,
            "is_practice_mode": interview.is_practice_mode,
            "company_style": interview.company_style,
            "skills_json": interview.skills_json,
        },
        "report": {
            "overall_score": report.overall_score,
            "transcript_summary": report.transcript_summary,
            "strengths": report.strengths_json,
            "areas_for_improvement": report.areas_for_improvement_json,
            "eye_contact_notes": report.eye_contact_notes,
            "posture_notes": report.posture_notes,
            "communication_notes": report.communication_notes,
            "coaching_plan": report.coaching_plan_text,
            "share_token": report.share_token,
        } if report else None,
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


@router.get("/interviews/{interview_id}/transcript")
async def get_transcript(
    interview_id: str, db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TranscriptEntry)
        .where(TranscriptEntry.interview_id == interview_id)
        .order_by(TranscriptEntry.timestamp_ms)
    )
    entries = result.scalars().all()
    return [
        {
            "speaker": e.speaker,
            "content": e.content,
            "timestamp_ms": e.timestamp_ms,
            "entry_type": e.entry_type,
        }
        for e in entries
    ]


@router.get("/interviews/{interview_id}/confidence-timeline")
async def get_confidence_timeline(
    interview_id: str, db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ConfidenceSample)
        .where(ConfidenceSample.interview_id == interview_id)
        .order_by(ConfidenceSample.timestamp_ms)
    )
    samples = result.scalars().all()
    return [
        {
            "timestamp_ms": s.timestamp_ms,
            "confidence_score": s.confidence_score,
            "eye_contact_score": s.eye_contact_score,
            "sentiment_label": s.sentiment_label,
            "noise_level_db": s.noise_level_db,
        }
        for s in samples
    ]


@router.get("/compare")
async def compare_interviews(
    job_title: str,
    candidate_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Interview, InterviewReportDB.overall_score)
        .join(InterviewReportDB, InterviewReportDB.interview_id == Interview.id)
        .where(
            Interview.job_title.ilike(f"%{job_title}%"),
            Interview.status == "completed",
        )
        .order_by(Interview.started_at)
    )
    if candidate_id:
        query = query.where(Interview.candidate_id == candidate_id)

    result = await db.execute(query)
    rows = result.all()

    return {
        "job_title": job_title,
        "session_ids": [r[0].session_id or r[0].id for r in rows],
        "scores": [r[1] for r in rows],
        "dates": [r[0].started_at.isoformat() if r[0].started_at else "" for r in rows],
    }
