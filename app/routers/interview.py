import asyncio
import base64
import json
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from sqlalchemy import select

from app.services.gemini_live import GeminiLiveSession
from app.database import async_session
from app.models.db_models import Interview, TranscriptEntry, ConfidenceSample

logger = logging.getLogger(__name__)
router = APIRouter()

active_sessions: dict[str, GeminiLiveSession] = {}


def _ws_open(ws: WebSocket) -> bool:
    return ws.client_state == WebSocketState.CONNECTED


async def _safe_send(ws: WebSocket, data: dict):
    if _ws_open(ws):
        await ws.send_json(data)


@router.websocket("/ws/interview")
async def interview_websocket(websocket: WebSocket):
    await websocket.accept()
    gemini_session = None
    interview_db_id = None
    interview_start_time = time.time()
    transcript_buffer: list[dict] = []
    confidence_buffer: list[dict] = []

    try:
        init_msg = await websocket.receive_json()
        if init_msg.get("type") != "start":
            await _safe_send(websocket, {
                "type": "error",
                "data": "First message must be type 'start'",
            })
            await websocket.close()
            return

        system_prompt = init_msg["system_prompt"]
        interview_db_id = init_msg.get("interview_db_id")
        duration_minutes = init_msg.get("duration_minutes", 30)

        # Update interview status
        if interview_db_id:
            async with async_session() as db:
                result = await db.execute(
                    select(Interview).where(Interview.id == interview_db_id)
                )
                interview = result.scalar_one_or_none()
                if interview:
                    interview.status = "in_progress"
                    interview.started_at = datetime.now(timezone.utc)
                    await db.commit()

        gemini_session = GeminiLiveSession(system_prompt)
        await gemini_session.connect()
        active_sessions[gemini_session.session_id] = gemini_session

        # Link session_id to DB
        if interview_db_id:
            async with async_session() as db:
                result = await db.execute(
                    select(Interview).where(Interview.id == interview_db_id)
                )
                interview = result.scalar_one_or_none()
                if interview:
                    interview.session_id = gemini_session.session_id
                    await db.commit()

        await _safe_send(websocket, {
            "type": "session_started",
            "session_id": gemini_session.session_id,
        })

        audio_chunks_received = 0
        video_frames_received = 0

        async def timer_task():
            """Send countdown updates and auto-end at time limit."""
            total_seconds = duration_minutes * 60
            while gemini_session._is_active and _ws_open(websocket):
                elapsed = int(time.time() - interview_start_time)
                remaining = total_seconds - elapsed
                if remaining <= 0:
                    await gemini_session.send_wrap_up()
                    await _safe_send(websocket, {"type": "time_up"})
                    # Wait a bit for wrap-up then auto-end
                    await asyncio.sleep(60)
                    if gemini_session._is_active:
                        summary = await gemini_session.end_interview()
                        await _safe_send(websocket, {
                            "type": "interview_ended",
                            "session_id": gemini_session.session_id,
                            "summary": summary,
                        })
                    return

                await _safe_send(websocket, {
                    "type": "timer_update",
                    "remaining_seconds": remaining,
                    "elapsed_seconds": elapsed,
                })

                if remaining <= 30:
                    interval = 1
                elif remaining <= 120:
                    interval = 10
                else:
                    interval = 30
                await asyncio.sleep(interval)

        async def forward_to_gemini():
            nonlocal audio_chunks_received, video_frames_received

            while True:
                msg = await websocket.receive()

                if msg.get("type") == "websocket.disconnect":
                    break

                if "text" in msg:
                    data = json.loads(msg["text"])

                    if data["type"] == "audio":
                        audio_bytes = base64.b64decode(data["data"])
                        await gemini_session.send_audio(audio_bytes)
                        audio_chunks_received += 1

                        if audio_chunks_received % 20 == 0:
                            await _safe_send(websocket, {
                                "type": "log",
                                "level": "audio",
                                "data": f"Backend processed {audio_chunks_received} audio chunks ({len(audio_bytes)} bytes/chunk)",
                            })

                    elif data["type"] == "turn_complete":
                        mode = await gemini_session.send_turn_complete()
                        # Log user turn in transcript
                        transcript_buffer.append({
                            "speaker": "user",
                            "content": "[turn complete]",
                            "timestamp_ms": int((time.time() - interview_start_time) * 1000),
                            "entry_type": "turn_marker",
                        })
                        await _safe_send(websocket, {
                            "type": "log",
                            "level": "info",
                            "data": f"Client signaled user turn complete ({mode})",
                        })

                    elif data["type"] == "video":
                        jpeg_bytes = base64.b64decode(data["data"])
                        await gemini_session.send_video_frame(jpeg_bytes)
                        video_frames_received += 1

                        await _safe_send(websocket, {
                            "type": "log",
                            "level": "video",
                            "data": f"Frame #{video_frames_received} sent to Gemini ({len(jpeg_bytes)} bytes JPEG)",
                        })

                    elif data["type"] == "confidence_sample":
                        confidence_buffer.append({
                            "timestamp_ms": int((time.time() - interview_start_time) * 1000),
                            "confidence_score": data.get("confidence_score", 50),
                            "eye_contact_score": data.get("eye_contact_score"),
                            "sentiment_label": data.get("sentiment_label"),
                            "noise_level_db": data.get("noise_level_db"),
                        })

                    elif data["type"] == "end":
                        await _safe_send(websocket, {
                            "type": "log",
                            "level": "info",
                            "data": f"Session stats: {audio_chunks_received} audio chunks, {video_frames_received} video frames processed",
                        })
                        summary = await gemini_session.end_interview()
                        await _safe_send(websocket, {
                            "type": "interview_ended",
                            "session_id": gemini_session.session_id,
                            "summary": summary,
                        })
                        return

        async def forward_to_browser():
            while gemini_session._is_active and _ws_open(websocket):
                try:
                    output = await asyncio.wait_for(
                        gemini_session.get_next_output(), timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue

                if not _ws_open(websocket):
                    break

                if output["type"] == "audio":
                    await _safe_send(websocket, {
                        "type": "audio",
                        "data": base64.b64encode(output["data"]).decode("ascii"),
                    })
                elif output["type"] == "interrupted":
                    await _safe_send(websocket, {"type": "interrupted"})
                    transcript_buffer.append({
                        "speaker": "system",
                        "content": "[AI interrupted]",
                        "timestamp_ms": int((time.time() - interview_start_time) * 1000),
                        "entry_type": "interruption",
                    })
                    await _safe_send(websocket, {
                        "type": "log",
                        "level": "interrupt",
                        "data": "Gemini interrupted — detected user activity (speaking/visual cue)",
                    })
                elif output["type"] == "turn_complete":
                    await _safe_send(websocket, {"type": "turn_complete"})
                elif output["type"] == "text":
                    transcript_buffer.append({
                        "speaker": "ai",
                        "content": output["data"],
                        "timestamp_ms": int((time.time() - interview_start_time) * 1000),
                        "entry_type": "speech",
                    })
                    await _safe_send(websocket, {
                        "type": "text",
                        "data": output["data"],
                    })
                elif output["type"] == "user_transcript":
                    transcript_buffer.append({
                        "speaker": "user",
                        "content": output["data"],
                        "timestamp_ms": int((time.time() - interview_start_time) * 1000),
                        "entry_type": "speech",
                    })
                    await _safe_send(websocket, {
                        "type": "user_transcript",
                        "data": output["data"],
                    })
                elif output["type"] == "error":
                    await _safe_send(websocket, {
                        "type": "error",
                        "data": output["data"],
                    })
                    break

        await asyncio.gather(
            forward_to_gemini(),
            forward_to_browser(),
            timer_task(),
        )

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await _safe_send(websocket, {"type": "error", "data": str(e)})
        except Exception:
            pass
    finally:
        # Flush transcript and confidence to DB
        if interview_db_id:
            try:
                actual_duration = int(time.time() - interview_start_time)
                async with async_session() as db:
                    # Update interview status
                    result = await db.execute(
                        select(Interview).where(Interview.id == interview_db_id)
                    )
                    interview = result.scalar_one_or_none()
                    if interview:
                        interview.status = "completed"
                        interview.ended_at = datetime.now(timezone.utc)
                        interview.actual_duration_seconds = actual_duration

                    # Save transcript entries
                    for entry in transcript_buffer:
                        db.add(TranscriptEntry(
                            interview_id=interview_db_id,
                            speaker=entry["speaker"],
                            content=entry["content"],
                            timestamp_ms=entry["timestamp_ms"],
                            entry_type=entry["entry_type"],
                        ))

                    # Save confidence samples
                    for sample in confidence_buffer:
                        db.add(ConfidenceSample(
                            interview_id=interview_db_id,
                            timestamp_ms=sample["timestamp_ms"],
                            confidence_score=sample["confidence_score"],
                            eye_contact_score=sample.get("eye_contact_score"),
                            sentiment_label=sample.get("sentiment_label"),
                            noise_level_db=sample.get("noise_level_db"),
                        ))

                    await db.commit()
                    logger.info(
                        f"Flushed {len(transcript_buffer)} transcript entries and "
                        f"{len(confidence_buffer)} confidence samples for interview {interview_db_id}"
                    )
            except Exception as e:
                logger.error(f"Failed to flush interview data to DB: {e}")

        if gemini_session:
            active_sessions.pop(gemini_session.session_id, None)
            await gemini_session.close()
