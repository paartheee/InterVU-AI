from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # AWS Bedrock
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    bedrock_text_model: str = "amazon.nova-lite-v1:0"
    bedrock_vision_model: str = "amazon.nova-pro-v1:0"

    # LiveKit
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    # App
    host: str = "0.0.0.0"
    port: int = 8080
    local_report_dir: str = "reports"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
