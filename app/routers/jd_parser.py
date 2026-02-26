from fastapi import APIRouter, HTTPException

from app.models.schemas import ParseJDRequest, ParseJDResponse
from app.services.jd_service import parse_job_description
from app.services.resume_service import parse_resume
from app.services.prompt_builder import build_system_prompt

router = APIRouter()


@router.post("/parse-jd", response_model=ParseJDResponse)
async def parse_jd(request: ParseJDRequest):
    if len(request.job_description.strip()) < 50:
        raise HTTPException(status_code=400, detail="Job description too short")

    skills = await parse_job_description(request.job_description)

    # Parse resume if provided
    parsed_resume = None
    if request.resume_text and len(request.resume_text.strip()) > 30:
        parsed_resume = await parse_resume(request.resume_text)

    system_prompt = build_system_prompt(
        skills, request.candidate_language, parsed_resume
    )

    return ParseJDResponse(
        skills=skills, resume=parsed_resume, system_prompt=system_prompt
    )
