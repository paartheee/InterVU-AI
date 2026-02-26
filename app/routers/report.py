from fastapi import APIRouter, HTTPException

from app.models.schemas import ExtractedSkills, ReportRequest, ReportResponse
from app.services.report_service import generate_report, save_report

router = APIRouter()


@router.post("/report", response_model=ReportResponse)
async def create_report(request: ReportRequest):
    try:
        skills = ExtractedSkills.model_validate_json(request.skills_json)
        report = await generate_report(
            session_id=request.session_id,
            summary_text=request.summary_text,
            skills=skills,
        )
        location = await save_report(report)
        return ReportResponse(report=report, storage_location=location)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
