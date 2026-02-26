from pydantic import BaseModel, Field


class ExtractedSkills(BaseModel):
    technical_skills: list[str] = Field(
        description="Top 3 most important technical skills from the job description"
    )
    soft_skills: list[str] = Field(
        description="Top 2 most important soft skills from the job description"
    )
    job_title: str = Field(
        description="The job title from the job description"
    )
    company_context: str = Field(
        description="Brief one-sentence summary of what the company/role does"
    )


class ParsedResume(BaseModel):
    candidate_name: str = Field(
        description="The candidate's name"
    )
    years_of_experience: str = Field(
        description="Total years of professional experience"
    )
    technical_skills: list[str] = Field(
        description="All technical skills mentioned in the resume"
    )
    projects: list[str] = Field(
        description="Key projects or work experiences (one-line summaries)"
    )
    education: str = Field(
        description="Highest education level and field"
    )


class ParseJDRequest(BaseModel):
    job_description: str
    resume_text: str = ""
    candidate_language: str = "Tamil"


class ParseJDResponse(BaseModel):
    skills: ExtractedSkills
    resume: ParsedResume | None = None
    system_prompt: str


class InterviewReport(BaseModel):
    session_id: str
    timestamp: str
    job_title: str
    skills_assessed: ExtractedSkills
    transcript_summary: str
    strengths: list[str]
    areas_for_improvement: list[str]
    overall_score: int = Field(ge=1, le=10)
    eye_contact_notes: str
    posture_notes: str
    communication_notes: str


class ReportRequest(BaseModel):
    session_id: str
    summary_text: str
    skills_json: str


class ReportResponse(BaseModel):
    report: InterviewReport
    storage_location: str
