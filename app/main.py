import os

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import jd_parser, livekit_token, report

app = FastAPI(title="InterAI", version="0.2.0")

# Register API routers before the static file catch-all
app.include_router(jd_parser.router, prefix="/api")
app.include_router(livekit_token.router, prefix="/api")
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
    """Extract text from PDF bytes without external libraries."""
    import re

    text_parts = []

    # Find all text streams between BT and ET markers
    stream_pattern = re.compile(rb"stream\r?\n(.*?)\r?\nendstream", re.DOTALL)
    for match in stream_pattern.finditer(data):
        stream = match.group(1)
        # Extract text from Tj and TJ operators
        tj_matches = re.findall(rb"\(([^)]*)\)\s*Tj", stream)
        for t in tj_matches:
            try:
                text_parts.append(t.decode("utf-8", errors="ignore"))
            except Exception:
                pass
        # TJ arrays
        tj_array = re.findall(rb"\[(.*?)\]\s*TJ", stream, re.DOTALL)
        for arr in tj_array:
            strings = re.findall(rb"\(([^)]*)\)", arr)
            for s in strings:
                try:
                    text_parts.append(s.decode("utf-8", errors="ignore"))
                except Exception:
                    pass

    if text_parts:
        return " ".join(text_parts)

    # Fallback: extract any readable text from the raw PDF
    raw = data.decode("latin-1", errors="ignore")
    readable = "".join(c if c.isprintable() or c in "\n\r\t" else " " for c in raw)
    import re as re2
    readable = re2.sub(r" {3,}", "\n", readable)
    return readable


# Serve static frontend files
app.mount("/", StaticFiles(directory="static", html=True), name="static")

# Ensure local report directory exists
os.makedirs(settings.local_report_dir, exist_ok=True)
