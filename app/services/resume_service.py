from app.services.llm import get_llm
from app.models.schemas import ParsedResume


async def parse_resume(resume_text: str) -> ParsedResume:
    structured_llm = get_llm().with_structured_output(ParsedResume)

    prompt = (
        "Analyze this resume and extract:\n"
        "- The candidate's name\n"
        "- Total years of professional experience\n"
        "- All technical skills mentioned\n"
        "- Key projects or work experiences (one-line summaries, max 5)\n"
        "- Highest education level and field\n\n"
        f"Resume:\n{resume_text}"
    )

    result = await structured_llm.ainvoke(prompt)
    return result
