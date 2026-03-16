import json
import logging

from google import genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.db_models import QuestionBank
from app.models.schemas import ExtractedSkills

logger = logging.getLogger(__name__)


async def get_or_generate_questions(
    db: AsyncSession,
    skill_name: str,
    interview_type: str,
    difficulty_level: str,
    company_style: str | None,
) -> list[str]:
    """Check DB cache first, generate via LLM if missing."""
    result = await db.execute(
        select(QuestionBank).where(
            QuestionBank.skill_name == skill_name,
            QuestionBank.interview_type == interview_type,
            QuestionBank.difficulty_level == difficulty_level,
        )
    )
    cached = result.scalars().all()
    if cached:
        return [q.question_text for q in cached]

    # Generate via Gemini
    questions = await _generate_questions_llm(
        skill_name, interview_type, difficulty_level, company_style
    )

    # Cache to DB
    for q_text in questions:
        entry = QuestionBank(
            skill_name=skill_name,
            interview_type=interview_type,
            difficulty_level=difficulty_level,
            question_text=q_text,
            company_style=company_style,
        )
        db.add(entry)
    await db.commit()

    return questions


async def _generate_questions_llm(
    skill_name: str,
    interview_type: str,
    difficulty_level: str,
    company_style: str | None,
) -> list[str]:
    """Generate interview questions for a skill via Gemini."""
    client = genai.Client(api_key=settings.google_api_key)

    style_note = f" in a {company_style} interview style" if company_style else ""
    prompt = (
        f"Generate 3-5 interview questions for assessing '{skill_name}' "
        f"in a {interview_type} interview at {difficulty_level} level{style_note}. "
        f"Return ONLY a JSON array of question strings. No markdown fences."
    )

    response = await client.aio.models.generate_content(
        model=settings.gemini_chat_model,
        contents=prompt,
    )

    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]

    return json.loads(text.strip())


async def generate_question_preview(
    db: AsyncSession,
    skills: ExtractedSkills,
    interview_type: str,
    difficulty_level: str,
    company_style: str | None,
) -> list[dict]:
    """Generate question previews for all skills."""
    previews = []
    all_skills = [(s, "technical") for s in skills.technical_skills] + \
                 [(s, "soft") for s in skills.soft_skills]

    for skill_name, _ in all_skills:
        questions = await get_or_generate_questions(
            db, skill_name, interview_type, difficulty_level, company_style
        )
        previews.append({
            "skill_name": skill_name,
            "questions": questions,
            "interview_type": interview_type,
            "difficulty_level": difficulty_level,
        })

    return previews
