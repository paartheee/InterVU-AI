import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Integer, Float, Text, DateTime, Boolean,
    ForeignKey, JSON,
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"
    id = Column(String, primary_key=True, default=gen_uuid)
    display_name = Column(String, nullable=True)
    resume_text = Column(Text, nullable=True)
    parsed_resume_json = Column(JSON, nullable=True)
    target_roles = Column(JSON, nullable=True)
    preferences_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    interviews = relationship("Interview", back_populates="candidate")


class Interview(Base):
    __tablename__ = "interviews"
    id = Column(String, primary_key=True, default=gen_uuid)
    session_id = Column(String, unique=True, index=True, nullable=True)
    candidate_id = Column(String, ForeignKey("candidate_profiles.id"), nullable=True)
    job_title = Column(String)
    job_description_text = Column(Text, nullable=True)
    resume_text_used = Column(Text, nullable=True)
    skills_json = Column(JSON)
    system_prompt = Column(Text)
    interview_type = Column(String, default="mixed")
    difficulty_level = Column(String, default="mid")
    follow_up_depth = Column(Integer, default=2)
    company_style = Column(String, nullable=True)
    is_practice_mode = Column(Boolean, default=False)
    duration_minutes = Column(Integer, default=30)
    actual_duration_seconds = Column(Integer, nullable=True)
    status = Column(String, default="pending")
    started_at = Column(DateTime, default=utcnow)
    ended_at = Column(DateTime, nullable=True)
    candidate = relationship("CandidateProfile", back_populates="interviews")
    report = relationship("InterviewReportDB", back_populates="interview", uselist=False)
    transcript_entries = relationship(
        "TranscriptEntry", back_populates="interview",
        order_by="TranscriptEntry.timestamp_ms",
    )
    skill_scores = relationship("SkillScore", back_populates="interview")
    recordings = relationship("RecordingChunk", back_populates="interview")
    confidence_samples = relationship("ConfidenceSample", back_populates="interview")


class InterviewReportDB(Base):
    __tablename__ = "interview_reports"
    id = Column(String, primary_key=True, default=gen_uuid)
    interview_id = Column(String, ForeignKey("interviews.id"), unique=True)
    session_id = Column(String, index=True)
    timestamp = Column(DateTime, default=utcnow)
    overall_score = Column(Integer)
    transcript_summary = Column(Text)
    strengths_json = Column(JSON)
    areas_for_improvement_json = Column(JSON)
    eye_contact_notes = Column(Text)
    posture_notes = Column(Text)
    communication_notes = Column(Text)
    report_json = Column(JSON)
    share_token = Column(String, unique=True, nullable=True, index=True)
    coaching_plan_text = Column(Text, nullable=True)
    interview = relationship("Interview", back_populates="report")


class TranscriptEntry(Base):
    __tablename__ = "transcript_entries"
    id = Column(String, primary_key=True, default=gen_uuid)
    interview_id = Column(String, ForeignKey("interviews.id"))
    speaker = Column(String)
    content = Column(Text)
    timestamp_ms = Column(Integer)
    entry_type = Column(String, default="speech")
    interview = relationship("Interview", back_populates="transcript_entries")


class SkillScore(Base):
    __tablename__ = "skill_scores"
    id = Column(String, primary_key=True, default=gen_uuid)
    interview_id = Column(String, ForeignKey("interviews.id"))
    skill_name = Column(String)
    skill_type = Column(String)
    score = Column(Integer)
    notes = Column(Text, nullable=True)
    interview = relationship("Interview", back_populates="skill_scores")


class ConfidenceSample(Base):
    __tablename__ = "confidence_samples"
    id = Column(String, primary_key=True, default=gen_uuid)
    interview_id = Column(String, ForeignKey("interviews.id"))
    timestamp_ms = Column(Integer)
    confidence_score = Column(Float)
    eye_contact_score = Column(Float, nullable=True)
    posture_score = Column(Float, nullable=True)
    sentiment_label = Column(String, nullable=True)
    noise_level_db = Column(Float, nullable=True)
    interview = relationship("Interview", back_populates="confidence_samples")


class RecordingChunk(Base):
    __tablename__ = "recording_chunks"
    id = Column(String, primary_key=True, default=gen_uuid)
    interview_id = Column(String, ForeignKey("interviews.id"))
    chunk_index = Column(Integer)
    media_type = Column(String)
    blob_data = Column(Text)
    timestamp_ms = Column(Integer)
    interview = relationship("Interview", back_populates="recordings")


class QuestionBank(Base):
    __tablename__ = "question_bank"
    id = Column(String, primary_key=True, default=gen_uuid)
    skill_name = Column(String, index=True)
    interview_type = Column(String)
    difficulty_level = Column(String)
    question_text = Column(Text)
    follow_up_hints = Column(JSON, nullable=True)
    company_style = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"
    id = Column(String, primary_key=True, default=gen_uuid)
    event_type = Column(String, index=True)
    candidate_id = Column(String, nullable=True)
    interview_id = Column(String, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow)
