from app.services.bedrock_llm import bedrock_converse_json
from app.models.schemas import ParsedResume


async def parse_resume(resume_text: str) -> ParsedResume:
    prompt = (
        "Analyze this resume and extract the following as JSON:\n"
        '- "candidate_name": the candidate\'s name (string)\n'
        '- "years_of_experience": total years of professional experience (string)\n'
        '- "technical_skills": list of all technical skills mentioned (list of strings)\n'
        '- "projects": list of key projects or work experiences (one-line summaries, max 5, list of strings)\n'
        '- "education": highest education level and field (string)\n\n'
        f"Resume:\n{resume_text}"
    )

    data = await bedrock_converse_json(prompt)
    return ParsedResume(**data)
