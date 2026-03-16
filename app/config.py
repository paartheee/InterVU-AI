from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    google_api_key: str = ""
    google_application_credentials: str = ""
    gcs_bucket_name: str = "interai-reports"
    gcs_enabled: bool = False
    gemini_live_model: str = "gemini-2.5-flash-native-audio-preview-12-2025"
    gemini_chat_model: str = "gemini-3-flash-preview"
    host: str = "0.0.0.0"
    port: int = 8080
    local_report_dir: str = "reports"
    database_url: str = "sqlite+aiosqlite:///./interai.db"
    rate_limit_per_minute: int = 30
    default_interview_duration: int = 30
    max_recording_chunks: int = 500

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
