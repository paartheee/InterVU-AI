from pydantic import BaseModel, Field


class ExtractedSkills(BaseModel):
    job_title: str = Field(
        description="The job title from the job description"
    )
    seniority_level: str = Field(
        description="Seniority level (e.g., Junior, Mid-Level, Senior, Lead, Staff)"
    )
    years_of_experience: str = Field(
        description="Required years of experience (e.g., '3+ years')"
    )
    required_skills: list[str] = Field(
        description="Required technical skills (e.g., Python, FastAPI, Kubernetes)"
    )
    preferred_skills: list[str] = Field(
        description="Optional nice-to-have skills"
    )
    soft_skills: list[str] = Field(
        description="Top soft skills required (e.g., Communication, Leadership)"
    )
    tools_and_technologies: list[str] = Field(
        description="Frameworks, platforms, databases, cloud services mentioned"
    )
    responsibilities: list[str] = Field(
        description="Concise bullet-point responsibilities"
    )
    domain: str = Field(
        description="Industry domain (e.g., AI/ML, Fintech, Healthcare)"
    )
    education_requirements: str = Field(
        description="Education requirements (e.g., Bachelor's in CS or related)"
    )
    keywords: list[str] = Field(
        description="Most important hiring signal keywords"
    )
    company_context: str = Field(
        description="Brief one-sentence summary of what the company/role does"
    )

    @property
    def technical_skills(self) -> list[str]:
        """Backward-compatible accessor combining required + preferred skills."""
        return self.required_skills


class ParsedResume(BaseModel):
    candidate_name: str = Field(
        description="The candidate's name"
    )
    current_role: str = Field(
        default="", description="Current or most recent job title"
    )
    years_of_experience: str = Field(
        description="Total years of professional experience"
    )
    skills: list[str] = Field(
        description="All major technical skills mentioned"
    )
    programming_languages: list[str] = Field(
        description="Programming languages only (e.g., Python, SQL, Go)"
    )
    frameworks: list[str] = Field(
        description="ML/Backend/Frontend frameworks (e.g., PyTorch, FastAPI)"
    )
    tools: list[str] = Field(
        description="Dev tools (e.g., Docker, Git, Airflow)"
    )
    cloud_platforms: list[str] = Field(
        description="Cloud platforms (e.g., AWS, GCP, Azure)"
    )
    databases: list[str] = Field(
        description="Databases (e.g., PostgreSQL, MongoDB, Redis)"
    )
    projects: list[str] = Field(
        description="Short project titles only (max 5)"
    )
    domains: list[str] = Field(
        description="Industry domains the candidate has worked in"
    )
    education: str = Field(
        description="Highest education level and field"
    )
    certifications: list[str] = Field(
        default_factory=list, description="Professional certifications"
    )

    @property
    def technical_skills(self) -> list[str]:
        """Backward-compatible accessor combining all technical skills."""
        return self.skills


class SkillGapAnalysis(BaseModel):
    matching_skills: list[str] = Field(
        description="Skills present in both JD and resume"
    )
    missing_skills: list[str] = Field(
        description="Skills required by JD but missing from resume"
    )
    focus_areas: list[str] = Field(
        description="Key areas to focus on during the interview"
    )


class ParseJDRequest(BaseModel):
    job_description: str
    resume_text: str = ""
    candidate_language: str = "Tamil"
    config: "InterviewConfig | None" = None
    candidate_id: str | None = None


class ParseJDResponse(BaseModel):
    skills: ExtractedSkills
    resume: ParsedResume | None = None
    skill_gap: SkillGapAnalysis | None = None
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
    skill_scores: list["SkillScoreItem"] = []
    coaching_plan: str = ""
    share_token: str | None = None


class InterviewConfig(BaseModel):
    interview_type: str = "mixed"
    difficulty_level: str = "mid"
    follow_up_depth: int = 2
    duration_minutes: int = 30
    company_style: str | None = None
    is_practice_mode: bool = False


class SkillScoreItem(BaseModel):
    skill_name: str
    skill_type: str
    score: int = Field(ge=1, le=10)
    notes: str = ""


class InterviewHistoryItem(BaseModel):
    id: str
    session_id: str | None
    job_title: str
    interview_type: str
    difficulty_level: str
    overall_score: int | None = None
    status: str
    started_at: str
    duration_minutes: int


class CandidateProfileSchema(BaseModel):
    id: str | None = None
    display_name: str | None = None
    resume_text: str | None = None
    target_roles: list[str] = []
    preferences: dict = {}


class ComparisonData(BaseModel):
    session_ids: list[str]
    scores: list[int]
    dates: list[str]
    job_title: str


class QuestionPreview(BaseModel):
    skill_name: str
    questions: list[str]
    interview_type: str
    difficulty_level: str


class ConfidenceSampleSchema(BaseModel):
    timestamp_ms: int
    confidence_score: float
    eye_contact_score: float | None = None
    sentiment_label: str | None = None
    noise_level_db: float | None = None


class AnalyticsSummary(BaseModel):
    total_interviews: int
    completed_interviews: int
    average_score: float
    interviews_by_type: dict
    score_trend: list[dict]
    top_skills: list[dict]
    weakest_skills: list[dict]


class AnalyticsEventRequest(BaseModel):
    event_type: str
    metadata: dict | None = None
    candidate_id: str | None = None
    interview_id: str | None = None
