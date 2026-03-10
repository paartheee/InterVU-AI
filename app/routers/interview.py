import asyncio
import base64
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.services.gemini_live import GeminiLiveSession

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory session store (hackathon; production would use Redis)
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

    try:
        # Wait for the "start" message with system_prompt
        init_msg = await websocket.receive_json()
        if init_msg.get("type") != "start":
            await _safe_send(websocket, {
                "type": "error",
                "data": "First message must be type 'start'",
            })
            await websocket.close()
            return

        system_prompt = init_msg["system_prompt"]

        # Create and connect Gemini Live session
        gemini_session = GeminiLiveSession(system_prompt)
        await gemini_session.connect()
        active_sessions[gemini_session.session_id] = gemini_session

        await _safe_send(websocket, {
            "type": "session_started",
            "session_id": gemini_session.session_id,
        })

        # Track frame counts for backend logging
        audio_chunks_received = 0
        video_frames_received = 0

        async def forward_to_gemini():
            """Receive from browser WebSocket, forward to Gemini."""
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

                        # Send periodic backend log events
                        if audio_chunks_received % 20 == 0:
                            await _safe_send(websocket, {
                                "type": "log",
                                "level": "audio",
                                "data": f"Backend processed {audio_chunks_received} audio chunks ({len(audio_bytes)} bytes/chunk)",
                            })

                    elif data["type"] == "turn_complete":
                        mode = await gemini_session.send_turn_complete()
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
            """Receive from Gemini, forward to browser WebSocket."""
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
                    await _safe_send(websocket, {
                        "type": "log",
                        "level": "interrupt",
                        "data": "Gemini interrupted — detected user activity (speaking/visual cue)",
                    })
                elif output["type"] == "turn_complete":
                    await _safe_send(websocket, {"type": "turn_complete"})
                elif output["type"] == "text":
                    await _safe_send(websocket, {
                        "type": "text",
                        "data": output["data"],
                    })
                elif output["type"] == "error":
                    await _safe_send(websocket, {
                        "type": "error",
                        "data": output["data"],
                    })
                    break

        # Run both directions concurrently
        await asyncio.gather(
            forward_to_gemini(),
            forward_to_browser(),
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
        if gemini_session:
            active_sessions.pop(gemini_session.session_id, None)
            await gemini_session.close()
