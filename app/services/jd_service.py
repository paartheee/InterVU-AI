from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings
from app.models.schemas import ExtractedSkills


async def parse_job_description(jd_text: str) -> ExtractedSkills:
    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_chat_model,
        google_api_key=settings.google_api_key,
        temperature=0.1,
    )

    structured_llm = llm.with_structured_output(ExtractedSkills)

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
