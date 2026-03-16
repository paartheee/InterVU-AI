import logging

from google import genai
from app.config import settings

logger = logging.getLogger(__name__)


async def analyze_video_frame_confidence(jpeg_bytes: bytes) -> dict:
    """Analyze a video frame for confidence indicators using Gemini vision."""
    try:
        client = genai.Client(api_key=settings.google_api_key)

        response = await client.aio.models.generate_content(
            model=settings.gemini_chat_model,
            contents=[
                {
                    "parts": [
                        {"text": (
                            "Analyze this interview candidate's video frame. "
                            "Return ONLY a JSON object with these numeric scores (0-100): "
                            "confidence_score, eye_contact_score, posture_score, "
                            "and sentiment_label (one of: positive, neutral, negative). "
                            "Return ONLY valid JSON, no markdown."
                        )},
                        {"inline_data": {"mime_type": "image/jpeg", "data": jpeg_bytes}},
                    ]
                }
            ],
        )

        import json
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
        return json.loads(text.strip())
    except Exception as e:
        logger.warning(f"Confidence analysis failed: {e}")
        return {
            "confidence_score": 50,
            "eye_contact_score": 50,
            "posture_score": 50,
            "sentiment_label": "neutral",
        }


def compute_noise_level_db(rms: float) -> float:
    """Convert RMS to approximate dB."""
    import math
    return 20 * math.log10(max(rms, 0.00001))
