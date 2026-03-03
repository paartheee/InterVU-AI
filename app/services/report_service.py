import logging
import os
from datetime import datetime, timezone

from app.config import settings
from app.models.schemas import ExtractedSkills, InterviewReport
from app.services.bedrock_llm import bedrock_converse_json

logger = logging.getLogger(__name__)


async def generate_report(
    session_id: str,
    summary_text: str,
    skills: ExtractedSkills,
) -> InterviewReport:
    prompt = f"""Based on this interview summary, generate a structured interview performance report.

Interview Summary:
{summary_text}

Job Title: {skills.job_title}
Technical Skills Assessed: {', '.join(skills.technical_skills)}
Soft Skills Assessed: {', '.join(skills.soft_skills)}

Return a JSON object with these exact fields:
- "transcript_summary": string (2-3 paragraph summary)
- "strengths": list of strings (3-5 strengths observed)
- "areas_for_improvement": list of strings (2-4 areas)
- "overall_score": integer 1-10
- "eye_contact_notes": string (observations about eye contact)
- "posture_notes": string (observations about posture)
- "communication_notes": string (observations about communication style)"""

    report_data = await bedrock_converse_json(prompt)

    return InterviewReport(
        session_id=session_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        job_title=skills.job_title,
        skills_assessed=skills,
        **report_data,
    )


async def save_report(report: InterviewReport) -> str:
    report_json = report.model_dump_json(indent=2)
    filename = f"report_{report.session_id}_{report.timestamp[:10]}.json"

    local_path = os.path.join(settings.local_report_dir, filename)
    os.makedirs(settings.local_report_dir, exist_ok=True)
    with open(local_path, "w") as f:
        f.write(report_json)
    logger.info(f"Report saved locally: {local_path}")
    return local_path
