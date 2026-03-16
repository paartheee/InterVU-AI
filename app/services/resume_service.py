from app.services.llm import get_llm
from app.models.schemas import ParsedResume


async def parse_resume(resume_text: str) -> ParsedResume:
    structured_llm = get_llm().with_structured_output(ParsedResume)

    prompt = (
        "You are an expert resume analyzer.\n\n"
        "Extract structured information from the resume below.\n"
        "Return ONLY valid JSON matching the schema.\n\n"
        f"Resume:\n{resume_text}\n\n"
        "Rules:\n"
        "- skills should include all major technical skills.\n"
        "- programming_languages must only include programming languages.\n"
        "- frameworks should include ML/Backend/Frontend frameworks.\n"
        "- projects must contain short project titles only (max 5).\n"
        "- Do not hallucinate. Only extract from the provided resume text.\n"
    )

    result = await structured_llm.ainvoke(prompt)
    return result
