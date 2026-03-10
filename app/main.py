import os
import logging

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import jd_parser, interview, report

logger = logging.getLogger(__name__)

app = FastAPI(title="InterAI", version="0.1.0")

# Register API routers before the static file catch-all
app.include_router(jd_parser.router, prefix="/api")
app.include_router(interview.router)
app.include_router(report.router, prefix="/api")


@app.post("/api/extract-text")
async def extract_text(file: UploadFile = File(...)):
    """Extract text from uploaded files (PDF, TXT, DOC, DOCX)."""
    content = await file.read()
    filename = file.filename or ""

    if filename.endswith(".txt"):
        text = content.decode("utf-8", errors="ignore")
    elif filename.endswith(".pdf"):
        # Basic PDF text extraction — pull readable ASCII/UTF-8 strings
        text = _extract_pdf_text(content)
    else:
        # Best-effort for .doc/.docx
        text = content.decode("utf-8", errors="ignore")
        text = "".join(c if c.isprintable() or c in "\n\r\t" else " " for c in text)
        import re
        text = re.sub(r" {3,}", "\n", text)

    return JSONResponse({"text": text.strip()})


def _extract_pdf_text(data: bytes) -> str:
    """Extract text from PDF bytes using PyPDF2."""
    import io
    from PyPDF2 import PdfReader

    reader = PdfReader(io.BytesIO(data))
    text_parts = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            text_parts.append(text)
    return "\n".join(text_parts)


@app.on_event("startup")
async def startup_checks():
    # Always ensure local fallback path exists
    os.makedirs(settings.local_report_dir, exist_ok=True)

    if settings.google_application_credentials and not os.getenv(
        "GOOGLE_APPLICATION_CREDENTIALS"
    ):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = (
            settings.google_application_credentials
        )

    if not settings.gcs_enabled:
        logger.info(
            "GCS disabled (GCS_ENABLED=false). Reports will be saved locally in '%s'.",
            settings.local_report_dir,
        )
        return

    try:
        from google.auth import default as google_auth_default
        from google.auth.exceptions import DefaultCredentialsError
        from google.cloud import storage as gcs

        credentials, project_id = google_auth_default()
        adc_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

        if adc_path and not os.path.exists(adc_path):
            logger.warning(
                "GOOGLE_APPLICATION_CREDENTIALS is set but file does not exist: '%s'. "
                "Using local fallback '%s'.",
                adc_path,
                settings.local_report_dir,
            )
            return

        client = gcs.Client(credentials=credentials, project=project_id)
        bucket = client.bucket(settings.gcs_bucket_name)

        if not bucket.exists():
            logger.warning(
                "GCS_ENABLED=true but bucket '%s' is not accessible. "
                "Using local fallback '%s'.",
                settings.gcs_bucket_name,
                settings.local_report_dir,
            )
            return

        logger.info(
            "GCS preflight successful. Project='%s', bucket='%s', ADC='%s'.",
            project_id or "(auto)",
            settings.gcs_bucket_name,
            adc_path or "Application Default Credentials",
        )
    except DefaultCredentialsError:
        logger.error(
            "GCS_ENABLED=true but Google ADC is missing. "
            "Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path. "
            "Example: export GOOGLE_APPLICATION_CREDENTIALS='/absolute/path/key.json'. "
            "Reports will fallback to local '%s'.",
            settings.local_report_dir,
        )
    except Exception as exc:
        logger.warning(
            "GCS preflight check failed: %s. Reports will fallback to local '%s'.",
            exc,
            settings.local_report_dir,
        )


# Serve static frontend files
app.mount("/", StaticFiles(directory="static", html=True), name="static")
