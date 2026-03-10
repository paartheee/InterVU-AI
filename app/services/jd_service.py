from app.services.llm import get_llm
from app.models.schemas import ExtractedSkills


async def parse_job_description(jd_text: str) -> ExtractedSkills:
    structured_llm = get_llm().with_structured_output(ExtractedSkills)

    prompt = (
        "Analyze this job description and extract:\n"
        "- The top 3 most critical technical skills required\n"
        "- The top 2 most important soft skills required\n"
        "- The job title\n"
        "- A one-sentence company/role context summary\n\n"
        f"Job Description:\n{jd_text}"
    )

    result = await structured_llm.ainvoke(prompt)
    return result
