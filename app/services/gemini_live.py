import asyncio
import logging
import time
import uuid

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

SILENCE_TIMEOUT = 2.5  # fallback silence window before sending turn_complete


class GeminiLiveSession:
    """Manages a single Gemini Live API session for one interview."""

    def __init__(self, system_prompt: str):
        self.client = genai.Client(api_key=settings.google_api_key)
        self.system_prompt = system_prompt
        self.session_id = str(uuid.uuid4())
        self.session = None
        self._ctx = None
        self._receive_task = None
        self._silence_task = None
        self._audio_out_queue: asyncio.Queue = asyncio.Queue()
        self._text_out_queue: asyncio.Queue = asyncio.Queue()
        self._is_active = False
        self._summary_text = ""

        # Silence detection state
        self._last_audio_time: float = 0
        self._audio_started = False  # True once user has sent at least one chunk
        self._model_speaking = False  # True while model is generating a turn

    async def connect(self):
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            system_instruction=types.Content(
                parts=[types.Part(text=self.system_prompt)]
            ),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name="Kore"
                    )
                )
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
        )

        self._ctx = self.client.aio.live.connect(
            model=settings.gemini_live_model,
            config=config,
        )
        self.session = await self._ctx.__aenter__()

        self._is_active = True
        self._receive_task = asyncio.create_task(self._receive_loop())
        self._silence_task = asyncio.create_task(self._silence_watchdog())
        logger.info(f"Gemini Live session {self.session_id} connected")

        # Nudge the model to start the interview immediately
        await self.session.send_client_content(
            turns=[
                types.Content(
                    role="user",
                    parts=[types.Part(
                        text="The interview session has started. Please introduce yourself as Wayne and begin the interview now."
                    )]
                )
            ],
            turn_complete=True,
        )

    async def send_audio(self, audio_bytes: bytes):
        if not self._is_active or not self.session:
            return

        self._last_audio_time = time.monotonic()
        self._audio_started = True
        await self.session.send_realtime_input(
            audio=types.Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
        )

    async def send_turn_complete(self) -> str:
        if not self._is_active or not self.session:
            return "inactive"
        try:
            await self.session.send_client_content(turns=None, turn_complete=True)
            self._audio_started = False
            return "client_turn_complete"
        except Exception as e:
            logger.warning(f"turn_complete send failed: {e}")
            return "error"

    async def send_video_frame(self, jpeg_bytes: bytes):
        if not self._is_active or not self.session:
            return
        await self.session.send_realtime_input(
            video=types.Blob(data=jpeg_bytes, mime_type="image/jpeg")
        )

    async def _silence_watchdog(self):
        """Fallback silence detector if client speech-end signal is missed."""
        try:
            while self._is_active:
                await asyncio.sleep(1.0)

                if not self._audio_started or not self._is_active:
                    continue

                if self._model_speaking:
                    continue

                elapsed = time.monotonic() - self._last_audio_time
                if elapsed >= SILENCE_TIMEOUT and self.session:
                    mode = await self.send_turn_complete()
                    logger.info(
                        f"Silence detected ({elapsed:.1f}s) — sent turn_complete via {mode}"
                    )
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Silence watchdog error: {e}")

    async def _receive_loop(self):
        try:
            while self._is_active and self.session:
                got_message = False

                async for msg in self.session.receive():
                    got_message = True
                    server_content = msg.server_content
                    if server_content is None:
                        continue

                    if server_content.interrupted:
                        self._model_speaking = False
                        await self._audio_out_queue.put({"type": "interrupted"})
                        continue

                    if server_content.model_turn:
                        self._model_speaking = True
                        for part in server_content.model_turn.parts:
                            if part.inline_data and part.inline_data.data:
                                await self._audio_out_queue.put({
                                    "type": "audio",
                                    "data": part.inline_data.data,
                                })
                            elif part.text:
                                self._summary_text += part.text
                                await self._audio_out_queue.put({
                                    "type": "text",
                                    "data": part.text,
                                })

                    # Handle output audio transcription (AI speech → text)
                    if getattr(server_content, "output_transcription", None):
                        transcript = server_content.output_transcription
                        if hasattr(transcript, "text") and transcript.text:
                            self._summary_text += transcript.text
                            await self._audio_out_queue.put({
                                "type": "text",
                                "data": transcript.text,
                            })

                    # Handle input audio transcription (user speech → text)
                    if getattr(server_content, "input_transcription", None):
                        transcript = server_content.input_transcription
                        if hasattr(transcript, "text") and transcript.text:
                            await self._audio_out_queue.put({
                                "type": "user_transcript",
                                "data": transcript.text,
                            })

                    if server_content.turn_complete:
                        self._model_speaking = False
                        # Reset silence tracker so we wait for new user speech
                        self._audio_started = False
                        await self._audio_out_queue.put({"type": "turn_complete"})

                if not got_message:
                    logger.info(
                        "Gemini receive stream ended for session %s",
                        self.session_id,
                    )
                    break

        except Exception as e:
            logger.error(f"Receive loop error: {e}")
            await self._audio_out_queue.put({"type": "error", "data": str(e)})
        finally:
            self._is_active = False

    async def get_next_output(self):
        return await self._audio_out_queue.get()

    async def send_wrap_up(self):
        """Ask the model to wrap up the interview gracefully."""
        if self.session and self._is_active:
            await self.session.send_client_content(
                turns=[
                    types.Content(
                        role="user",
                        parts=[types.Part(
                            text="TIME_WARNING: We have 1 minute left. Please wrap up with "
                                 "a brief summary and closing remarks."
                        )]
                    )
                ],
                turn_complete=True,
            )

    async def end_interview(self) -> str:
        if self.session and self._is_active:
            await self.session.send_client_content(
                turns=[
                    types.Content(
                        role="user",
                        parts=[types.Part(
                            text="END_INTERVIEW. Please provide your comprehensive "
                                 "text summary of this interview now."
                        )]
                    )
                ],
                turn_complete=True,
            )
            # Wait for summary text (30s timeout)
            try:
                deadline = asyncio.get_event_loop().time() + 30
                while asyncio.get_event_loop().time() < deadline:
                    msg = await asyncio.wait_for(
                        self._audio_out_queue.get(), timeout=5
                    )
                    if msg["type"] == "text":
                        pass  # text is accumulated in _receive_loop
                    elif msg["type"] == "turn_complete":
                        break
                    elif msg["type"] == "error":
                        break
            except asyncio.TimeoutError:
                pass

        return self._summary_text

    async def close(self):
        self._is_active = False
        self._activity_open = False
        if self._silence_task:
            self._silence_task.cancel()
            try:
                await self._silence_task
            except asyncio.CancelledError:
                pass
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        if self._ctx:
            await self._ctx.__aexit__(None, None, None)
            self._ctx = None
            self.session = None
        logger.info(f"Gemini Live session {self.session_id} closed")
