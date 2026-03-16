import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone

from google import genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.schemas import ExtractedSkills, InterviewReport
from app.models.db_models import InterviewReportDB, SkillScore, Interview

logger = logging.getLogger(__name__)


def _clean_json(text: str) -> str:
    """Strip markdown fences and sanitize common LLM JSON errors."""
    text = text.strip()
    # Remove ```json ... ``` or ``` ... ``` wrappers
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    text = text.strip()
    # Remove trailing commas before } or ]
    text = re.sub(r",\s*([}\]])", r"\1", text)
    return text


async def generate_report(
    session_id: str,
    summary_text: str,
    skills: ExtractedSkills,
) -> InterviewReport:
    client = genai.Client(api_key=settings.google_api_key)

    prompt = f"""Based on this interview summary, generate a structured interview performance report.

Interview Summary:
{summary_text}

Job Title: {skills.job_title}
Technical Skills Assessed: {', '.join(skills.technical_skills)}
Soft Skills Assessed: {', '.join(skills.soft_skills)}

Return a JSON object with these exact fields:
- transcript_summary: string (2-3 paragraph summary)
- strengths: list of strings (3-5 strengths observed)
- areas_for_improvement: list of strings (2-4 areas)
- overall_score: integer 1-10
- eye_contact_notes: string (observations about eye contact)
- posture_notes: string (observations about posture)
- communication_notes: string (observations about communication style)

Return ONLY valid JSON, no markdown fences."""

    config = genai.types.GenerateContentConfig(
        response_mime_type="application/json",
    )

    last_error = None
    for attempt in range(2):
        response = await client.aio.models.generate_content(
            model=settings.gemini_chat_model,
            contents=prompt,
            config=config,
        )
        text = _clean_json(response.text)
        try:
            report_data = json.loads(text)
            break
        except json.JSONDecodeError as e:
            last_error = e
            logger.warning(f"Report JSON parse failed (attempt {attempt + 1}): {e}\nRaw: {text[:500]}")
    else:
        raise last_error

    return InterviewReport(
        session_id=session_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        job_title=skills.job_title,
        skills_assessed=skills,
        **report_data,
    )


async def generate_skill_scores(
    summary_text: str, skills: ExtractedSkills
) -> list[dict]:
    """Generate individual scores for each skill."""
    client = genai.Client(api_key=settings.google_api_key)

    all_skills = [{"name": s, "type": "technical"} for s in skills.technical_skills] + \
                 [{"name": s, "type": "soft"} for s in skills.soft_skills]

    prompt = f"""Based on this interview summary, score each skill individually.

Interview Summary:
{summary_text}

Skills to score:
{json.dumps(all_skills)}

Return a JSON array where each element has:
- skill_name: string
- skill_type: "technical" or "soft"
- score: integer 1-10
- notes: string (brief assessment for this specific skill)

Return ONLY valid JSON array, no markdown fences."""

    config = genai.types.GenerateContentConfig(
        response_mime_type="application/json",
    )

    last_error = None
    for attempt in range(2):
        response = await client.aio.models.generate_content(
            model=settings.gemini_chat_model,
            contents=prompt,
            config=config,
        )
        text = _clean_json(response.text)
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            last_error = e
            logger.warning(f"Skill scores JSON parse failed (attempt {attempt + 1}): {e}\nRaw: {text[:500]}")

    raise last_error


async def generate_coaching_plan(
    report: InterviewReport, skill_scores: list[dict]
) -> str:
    """Generate a structured coaching/improvement plan."""
    client = genai.Client(api_key=settings.google_api_key)

    weak_skills = [s for s in skill_scores if s.get("score", 10) <= 5]

    prompt = f"""Based on this interview report, create a coaching improvement plan.

Overall Score: {report.overall_score}/10
Strengths: {', '.join(report.strengths)}
Areas for Improvement: {', '.join(report.areas_for_improvement)}
Weak Skills: {json.dumps(weak_skills)}
Communication Notes: {report.communication_notes}

Create a structured coaching plan with:
1. Priority areas to focus on (ranked by impact)
2. Specific study topics and resources for each weak skill
3. Practice exercises to improve interview performance
4. Body language improvement tips based on the assessment
5. A 2-week improvement timeline

Return as plain text with clear sections and bullet points."""

    response = await client.aio.models.generate_content(
        model=settings.gemini_chat_model,
        contents=prompt,
    )

    return response.text.strip()


async def save_report(report: InterviewReport) -> str:
    report_json = report.model_dump_json(indent=2)
    filename = f"report_{report.session_id}_{report.timestamp[:10]}.json"

    if settings.gcs_enabled:
        try:
            from google.cloud import storage as gcs

            client = gcs.Client()
            bucket = client.bucket(settings.gcs_bucket_name)
            blob = bucket.blob(f"reports/{filename}")
            blob.upload_from_string(report_json, content_type="application/json")
            uri = f"gs://{settings.gcs_bucket_name}/reports/{filename}"
            logger.info(f"Report saved to GCS: {uri}")
            return uri
        except Exception as e:
            logger.warning(f"GCS save failed, falling back to local: {e}")

    local_path = os.path.join(settings.local_report_dir, filename)
    os.makedirs(settings.local_report_dir, exist_ok=True)
    with open(local_path, "w") as f:
        f.write(report_json)
    logger.info(f"Report saved locally: {local_path}")
    return local_path


async def save_report_to_db(
    db: AsyncSession,
    report: InterviewReport,
    skill_scores: list[dict],
    coaching_plan: str,
    share_token: str,
    interview_db_id: str | None,
) -> None:
    """Persist report and skill scores to SQLite."""
    report_db = InterviewReportDB(
        interview_id=interview_db_id,
        session_id=report.session_id,
        overall_score=report.overall_score,
        transcript_summary=report.transcript_summary,
        strengths_json=report.strengths,
        areas_for_improvement_json=report.areas_for_improvement,
        eye_contact_notes=report.eye_contact_notes,
        posture_notes=report.posture_notes,
        communication_notes=report.communication_notes,
        report_json=report.model_dump(),
        share_token=share_token,
        coaching_plan_text=coaching_plan,
    )
    db.add(report_db)

    if interview_db_id:
        for score_data in skill_scores:
            db.add(SkillScore(
                interview_id=interview_db_id,
                skill_name=score_data.get("skill_name", ""),
                skill_type=score_data.get("skill_type", "technical"),
                score=score_data.get("score", 5),
                notes=score_data.get("notes", ""),
            ))

    await db.commit()
