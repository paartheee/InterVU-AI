from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.schemas import ExtractedSkills
from app.services.question_service import generate_question_preview

router = APIRouter(tags=["questions"])


@router.post("/questions/preview")
async def preview_questions(
    skills_json: str,
    interview_type: str = "mixed",
    difficulty_level: str = "mid",
    company_style: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    skills = ExtractedSkills.model_validate_json(skills_json)
    previews = await generate_question_preview(
        db, skills, interview_type, difficulty_level, company_style
    )
    return previews


@router.get("/questions/bank")
async def list_question_bank(
    skill: str | None = None,
    interview_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from app.models.db_models import QuestionBank

    query = select(QuestionBank)
    if skill:
        query = query.where(QuestionBank.skill_name == skill)
    if interview_type:
        query = query.where(QuestionBank.interview_type == interview_type)
    query = query.limit(100)

    result = await db.execute(query)
    questions = result.scalars().all()
    return [
        {
            "skill_name": q.skill_name,
            "interview_type": q.interview_type,
            "difficulty_level": q.difficulty_level,
            "question_text": q.question_text,
            "company_style": q.company_style,
        }
        for q in questions
    ]
