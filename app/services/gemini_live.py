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

        # Model capability detection
        self._is_native_audio = "native-audio" in settings.gemini_live_model
        self._supports_video = not self._is_native_audio

        # Silence detection state
        self._last_audio_time: float = 0
        self._audio_started = False  # True once user has sent at least one chunk
        self._model_speaking = False  # True while model is generating a turn

    async def connect(self):
        logger.info(
            f"[CONNECT] Starting connection — model={settings.gemini_live_model}, "
            f"native_audio={self._is_native_audio}, session={self.session_id}"
        )

        # For native-audio models, embed the nudge in the system instruction
        system_text = self.system_prompt
        if self._is_native_audio:
            system_text += (
                "\n\nCRITICAL INSTRUCTION: You MUST begin speaking immediately when the session starts. "
                "Do NOT wait for the candidate to speak first. "
                "Your FIRST action upon connection is to greet the candidate warmly, introduce yourself as Wayne, "
                "mention the role you're interviewing for, and ask your first icebreaker question. "
                "Start speaking right away — the candidate is waiting and can hear you."
            )

        config_kwargs = {
            "system_instruction": types.Content(
                parts=[types.Part(text=system_text)]
            ),
        }

        if self._is_native_audio:
            config_kwargs["response_modalities"] = ["AUDIO"]
            config_kwargs["speech_config"] = types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name="Aoede"
                    )
                )
            )
            config_kwargs["input_audio_transcription"] = types.AudioTranscriptionConfig()
            config_kwargs["output_audio_transcription"] = types.AudioTranscriptionConfig()
            logger.info("[CONNECT] Native audio config: AUDIO modality, voice=Aoede, transcription=on")

        config = types.LiveConnectConfig(**config_kwargs)
        logger.info("[CONNECT] LiveConnectConfig created, opening connection...")

        self._ctx = self.client.aio.live.connect(
            model=settings.gemini_live_model,
            config=config,
        )
        self.session = await self._ctx.__aenter__()
        logger.info(f"[CONNECT] Session established successfully")

        self._is_active = True
        self._receive_task = asyncio.create_task(self._receive_loop())
        self._silence_task = asyncio.create_task(self._silence_watchdog())
        logger.info(f"[CONNECT] Receive loop and silence watchdog started")

        # Nudge the model to start the interview immediately
        logger.info("[CONNECT] Sending initial nudge to trigger first question...")
        if self._is_native_audio:
            # For native-audio models, use send_realtime_input with text
            # (send_client_content may not be supported)
            await self.session.send_realtime_input(
                text="The interview session has started. The candidate is ready and waiting. Please introduce yourself as Wayne and begin the interview now."
            )
            logger.info("[CONNECT] Text nudge sent via send_realtime_input")
        else:
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
            logger.info("[CONNECT] Text nudge sent via send_client_content")

    async def send_audio(self, audio_bytes: bytes):
        if not self._is_active or not self.session:
            return

        now = time.monotonic()
        if not self._audio_started:
            logger.info("[AUDIO] First user audio chunk received — starting turn tracking")
        self._last_audio_time = now
        self._audio_started = True
        await self.session.send_realtime_input(
            audio=types.Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
        )

    async def send_turn_complete(self) -> str:
        if not self._is_active or not self.session:
            return "inactive"
        if self._is_native_audio:
            # Native-audio models handle turn-taking via their own VAD,
            # but send a text nudge as a fallback to prompt the model to respond.
            try:
                await self.session.send_realtime_input(
                    text="The candidate has paused. Please continue the interview with your next question or follow-up."
                )
                self._audio_started = False
                return "native_audio_nudge"
            except Exception as e:
                logger.warning(f"Native audio nudge failed: {e}")
                self._audio_started = False
                return "native_audio_auto"
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
        if not self._supports_video:
            return
        await self.session.send_realtime_input(
            video=types.Blob(data=jpeg_bytes, mime_type="image/jpeg")
        )

    async def _silence_watchdog(self):
        """Fallback silence detector — after SILENCE_TIMEOUT with no audio, nudge the model."""
        logger.info("[WATCHDOG] Silence watchdog started (timeout=%.1fs)", SILENCE_TIMEOUT)
        try:
            while self._is_active:
                await asyncio.sleep(1.0)

                if not self._is_active:
                    break

                if not self._audio_started:
                    continue

                if self._model_speaking:
                    continue

                elapsed = time.monotonic() - self._last_audio_time
                if elapsed >= SILENCE_TIMEOUT and self.session:
                    mode = await self.send_turn_complete()
                    logger.info(
                        "[WATCHDOG] Silence %.1fs detected — nudged model (mode=%s)",
                        elapsed, mode,
                    )
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("[WATCHDOG] Error: %s", e)

    async def _receive_loop(self):
        logger.info("[RECEIVE] Receive loop started, waiting for Gemini messages...")
        msg_count = 0
        turn_count = 0
        try:
            while self._is_active and self.session:
                # session.receive() yields all messages for ONE model turn,
                # then the generator exhausts. Loop to receive the next turn.
                async for msg in self.session.receive():
                    if not self._is_active:
                        break

                    msg_count += 1
                    server_content = msg.server_content
                    if server_content is None:
                        logger.info("[RECEIVE] msg #%d: non-server_content type=%s", msg_count, type(msg).__name__)
                        continue

                    if server_content.interrupted:
                        logger.info("[RECEIVE] msg #%d: MODEL INTERRUPTED", msg_count)
                        self._model_speaking = False
                        await self._audio_out_queue.put({"type": "interrupted"})
                        continue

                    if server_content.model_turn:
                        self._model_speaking = True
                        parts_summary = []
                        for part in server_content.model_turn.parts:
                            if part.inline_data and part.inline_data.data:
                                parts_summary.append(f"audio({len(part.inline_data.data)}B)")
                                await self._audio_out_queue.put({
                                    "type": "audio",
                                    "data": part.inline_data.data,
                                })
                            elif part.text:
                                parts_summary.append(f"text({len(part.text)} chars)")
                                self._summary_text += part.text
                                await self._audio_out_queue.put({
                                    "type": "text",
                                    "data": part.text,
                                })
                        if parts_summary:
                            logger.info("[RECEIVE] msg #%d: model_turn — parts=[%s]", msg_count, ", ".join(parts_summary))

                    # Output transcription (AI speech → text)
                    if getattr(server_content, "output_transcription", None):
                        t = server_content.output_transcription
                        if getattr(t, "text", None):
                            self._summary_text += t.text
                            await self._audio_out_queue.put({"type": "text", "data": t.text})

                    # Input transcription (user speech → text)
                    if getattr(server_content, "input_transcription", None):
                        t = server_content.input_transcription
                        if getattr(t, "text", None):
                            await self._audio_out_queue.put({"type": "user_transcript", "data": t.text})

                    if server_content.turn_complete:
                        turn_count += 1
                        logger.info("[RECEIVE] msg #%d: TURN COMPLETE (turn #%d) — looping for next turn", msg_count, turn_count)
                        self._model_speaking = False
                        self._audio_started = False
                        await self._audio_out_queue.put({"type": "turn_complete"})
                        # Break inner loop — outer while will call session.receive() again
                        break

                if not self._is_active:
                    break

            logger.info("[RECEIVE] Receive loop exited — turns=%d msgs=%d", turn_count, msg_count)

        except Exception as e:
            logger.error(f"[RECEIVE] Receive loop error after {msg_count} messages: {e}", exc_info=True)
            await self._audio_out_queue.put({"type": "error", "data": str(e)})
        finally:
            logger.info(f"[RECEIVE] Receive loop exiting — total messages processed: {msg_count}")
            self._is_active = False

    async def get_next_output(self):
        return await self._audio_out_queue.get()

    async def send_wrap_up(self):
        """Ask the model to wrap up the interview gracefully."""
        if not self.session or not self._is_active:
            return
        if self._is_native_audio:
            logger.info("Wrap-up skipped for native-audio model")
            return
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
            try:
                if self._is_native_audio:
                    # For native audio, just signal the end — no need to wait
                    # for a response. The accumulated transcription is the summary.
                    await self.session.send_realtime_input(
                        text="The interview has now ended. Thank the candidate and say goodbye."
                    )
                    logger.info("[END] Native audio end signal sent, returning accumulated summary (%d chars)", len(self._summary_text))
                else:
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
                            if msg["type"] in ("turn_complete", "error"):
                                break
                    except asyncio.TimeoutError:
                        pass
            except Exception as e:
                logger.warning(f"[END] Error during end_interview: {e}")

        # Put sentinel BEFORE setting inactive so forward_to_browser() can
        # pick it up and send interview_ended to the client in order.
        await self._audio_out_queue.put({"type": "interview_ended", "data": self._summary_text})
        self._is_active = False
        logger.info("[END] interview_ended sentinel queued, _is_active=False")
        return self._summary_text

    async def close(self):
        self._is_active = False
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
            try:
                await asyncio.wait_for(
                    self._ctx.__aexit__(None, None, None), timeout=5.0
                )
            except (asyncio.TimeoutError, Exception):
                pass
            self._ctx = None
            self.session = None
        logger.info(f"Gemini Live session {self.session_id} closed")
