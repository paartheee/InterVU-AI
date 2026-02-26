import asyncio
import logging
import uuid

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)


class GeminiLiveSession:
    """Manages a single Gemini Live API session for one interview."""

    def __init__(self, system_prompt: str):
        self.client = genai.Client(api_key=settings.google_api_key)
        self.system_prompt = system_prompt
        self.session_id = str(uuid.uuid4())
        self.session = None
        self._receive_task = None
        self._audio_out_queue: asyncio.Queue = asyncio.Queue()
        self._text_out_queue: asyncio.Queue = asyncio.Queue()
        self._is_active = False
        self._summary_text = ""

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
        )

        self.session = await self.client.aio.live.connect(
            model=settings.gemini_live_model,
            config=config,
        ).__aenter__()

        self._is_active = True
        self._receive_task = asyncio.create_task(self._receive_loop())
        logger.info(f"Gemini Live session {self.session_id} connected")

    async def send_audio(self, audio_bytes: bytes):
        if not self._is_active or not self.session:
            return
        await self.session.send_realtime_input(
            audio=types.Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
        )

    async def send_video_frame(self, jpeg_bytes: bytes):
        if not self._is_active or not self.session:
            return
        await self.session.send_realtime_input(
            video=types.Blob(data=jpeg_bytes, mime_type="image/jpeg")
        )

    async def _receive_loop(self):
        try:
            async for msg in self.session.receive():
                server_content = msg.server_content
                if server_content is None:
                    continue

                if server_content.interrupted:
                    await self._audio_out_queue.put({"type": "interrupted"})
                    continue

                if server_content.model_turn:
                    for part in server_content.model_turn.parts:
                        if part.inline_data and part.inline_data.data:
                            await self._audio_out_queue.put({
                                "type": "audio",
                                "data": part.inline_data.data,
                            })
                        elif part.text:
                            self._summary_text += part.text
                            await self._text_out_queue.put({
                                "type": "text",
                                "data": part.text,
                            })

                if server_content.turn_complete:
                    await self._audio_out_queue.put({"type": "turn_complete"})

        except Exception as e:
            logger.error(f"Receive loop error: {e}")
            await self._audio_out_queue.put({"type": "error", "data": str(e)})
        finally:
            self._is_active = False

    async def get_next_output(self):
        return await self._audio_out_queue.get()

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
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        if self.session:
            await self.session.__aexit__(None, None, None)
            self.session = None
        logger.info(f"Gemini Live session {self.session_id} closed")
