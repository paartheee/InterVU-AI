from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    google_api_key: str = ""
    gcs_bucket_name: str = "interai-reports"
    gcs_enabled: bool = False
    gemini_live_model: str = "gemini-2.0-flash-live-001"
    gemini_chat_model: str = "gemini-2.0-flash"
    host: str = "0.0.0.0"
    port: int = 8080
    local_report_dir: str = "reports"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
