from app.services.bedrock_llm import bedrock_converse_json
from app.models.schemas import ExtractedSkills


async def parse_job_description(jd_text: str) -> ExtractedSkills:
    prompt = (
        "Analyze this job description and extract the following as JSON:\n"
        '- "technical_skills": list of top 3 most critical technical skills (strings)\n'
        '- "soft_skills": list of top 2 most important soft skills (strings)\n'
        '- "job_title": the job title (string)\n'
        '- "company_context": one-sentence company/role context summary (string)\n\n'
        f"Job Description:\n{jd_text}"
    )

    data = await bedrock_converse_json(prompt)
    return ExtractedSkills(**data)
