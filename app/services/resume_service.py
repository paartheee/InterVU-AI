from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings
from app.models.schemas import ParsedResume


async def parse_resume(resume_text: str) -> ParsedResume:
    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_chat_model,
        google_api_key=settings.google_api_key,
        temperature=0.1,
    )

    structured_llm = llm.with_structured_output(ParsedResume)

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
