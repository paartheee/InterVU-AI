from app.services.llm import get_llm
from app.models.schemas import ExtractedSkills


async def parse_job_description(jd_text: str) -> ExtractedSkills:
    structured_llm = get_llm().with_structured_output(ExtractedSkills)

    prompt = (
        "You are an expert technical recruiter.\n\n"
        "Extract structured information from the Job Description below.\n"
        "Return ONLY valid JSON matching the schema.\n\n"
        f"Job Description:\n{jd_text}\n\n"
        "Rules:\n"
        "- required_skills must contain only technical skills (e.g., Python, FastAPI, Kubernetes).\n"
        "- preferred_skills are optional nice-to-have skills.\n"
        "- soft_skills should include interpersonal and leadership skills.\n"
        "- tools_and_technologies include frameworks, platforms, databases, cloud services.\n"
        "- responsibilities must be concise bullet points.\n"
        "- keywords should include the most important hiring signals.\n"
        "- Do not hallucinate. Only extract from the provided text.\n"
    )

    result = await structured_llm.ainvoke(prompt)
    return result
