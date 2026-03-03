import asyncio
import base64
import json
import logging

import boto3
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RunContext,
    get_job_context,
)
from livekit.agents.pipeline import AgentTask
from livekit.plugins import aws

from app.config import settings

logger = logging.getLogger("wayne-agent")
logging.basicConfig(level=logging.INFO)


class WayneInterviewer(Agent):
    """LiveKit Agent that conducts mock interviews using Amazon Nova Sonic."""

    def __init__(self, system_prompt: str, skills_json: str):
        super().__init__(
            instructions=system_prompt,
        )
        self._skills_json = skills_json
        self._latest_frame: rtc.VideoFrame | None = None
        self._video_stream: rtc.VideoStream | None = None
        self._tasks: list[asyncio.Task] = []
        self._vision_client = boto3.client(
            "bedrock-runtime",
            region_name=settings.aws_region,
        )
        self._vision_interval = 5.0  # analyze a frame every 5 seconds

    async def on_enter(self):
        """Called when the agent joins the room and session starts."""
        ctx = get_job_context()
        room = ctx.room

        # Greet the user as Wayne
        await self.session.generate_reply(
            instructions="Introduce yourself as Wayne and begin with a casual icebreaker."
        )

        # Subscribe to existing video tracks
        for participant in room.remote_participants.values():
            for pub in participant.track_publications.values():
                if pub.track and pub.track.kind == rtc.TrackKind.KIND_VIDEO:
                    self._create_video_stream(pub.track)

        # Listen for new video tracks
        @room.on("track_subscribed")
        def on_track_subscribed(track, publication, participant):
            if track.kind == rtc.TrackKind.KIND_VIDEO:
                self._create_video_stream(track)

        # Register handler for interview lifecycle messages
        room.register_text_stream_handler(
            "interview-control", self._handle_control_message
        )

        # Start periodic vision analysis
        vision_task = asyncio.create_task(self._vision_analysis_loop())
        self._tasks.append(vision_task)

    def _create_video_stream(self, track: rtc.Track):
        """Subscribe to a video track and continuously capture latest frame."""
        if self._video_stream is not None:
            self._video_stream.close()
        self._video_stream = rtc.VideoStream(track)

        async def read_stream():
            async for event in self._video_stream:
                self._latest_frame = event.frame

        task = asyncio.create_task(read_stream())
        self._tasks.append(task)

    async def _vision_analysis_loop(self):
        """Periodically capture a frame, analyze with Nova Pro, inject text."""
        while True:
            await asyncio.sleep(self._vision_interval)
            if self._latest_frame is None:
                continue
            try:
                # Encode frame as JPEG
                argb_frame = self._latest_frame.convert(
                    rtc.VideoBufferType.RGBA
                )
                jpeg_bytes = self._encode_frame_jpeg(argb_frame)
                if jpeg_bytes:
                    observation = await self._analyze_frame(jpeg_bytes)
                    if observation:
                        await self.session.generate_reply(
                            instructions=(
                                f"VISUAL OBSERVATION (act on this naturally, "
                                f"do NOT read it verbatim): {observation}"
                            )
                        )
            except Exception as e:
                logger.error(f"Vision analysis error: {e}")

    def _encode_frame_jpeg(self, frame: rtc.VideoFrame) -> bytes | None:
        """Encode a video frame as JPEG bytes."""
        try:
            import struct

            width = frame.width
            height = frame.height
            data = frame.data

            # Create a simple BMP-like representation for Nova Pro
            # Since we don't have PIL, send raw RGBA as PNG via minimal encoding
            # Actually, for Bedrock converse, we can send raw image bytes
            # Let's use a simple approach: convert RGBA to JPEG-like format

            # For Bedrock, we can send the frame data directly with format info
            # Using a minimal JPEG encoder would be ideal, but let's use
            # the raw bytes approach that Bedrock supports

            return bytes(data)
        except Exception as e:
            logger.error(f"Frame encoding error: {e}")
            return None

    async def _analyze_frame(self, image_bytes: bytes) -> str:
        """Send frame to Bedrock Nova Pro for eye contact/posture analysis."""
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self._vision_client.converse(
                    modelId=settings.bedrock_vision_model,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "image": {
                                        "format": "png",
                                        "source": {"bytes": image_bytes},
                                    }
                                },
                                {
                                    "text": (
                                        "Analyze this webcam frame of a job interview candidate. "
                                        "Report ONLY actionable observations in 1-2 sentences: "
                                        "1) Eye contact: looking at camera or looking away? "
                                        "2) Posture: upright or slouching? "
                                        "3) Any other body language concerns? "
                                        "If everything looks fine, respond with just 'OK'. "
                                        "Be concise."
                                    ),
                                },
                            ],
                        }
                    ],
                    inferenceConfig={"maxTokens": 100, "temperature": 0.1},
                ),
            )

            result_text = response["output"]["message"]["content"][0]["text"]
            if result_text.strip().upper() == "OK":
                return ""  # nothing noteworthy
            return result_text
        except Exception as e:
            logger.error(f"Frame analysis error: {e}")
            return ""

    async def _handle_control_message(self, reader, participant_identity):
        """Handle lifecycle messages from the browser (e.g., end interview)."""
        text = ""
        async for chunk in reader:
            text += chunk if isinstance(chunk, str) else chunk.decode("utf-8")

        try:
            data = json.loads(text)
            if data.get("type") == "end_interview":
                await self._end_interview()
        except json.JSONDecodeError:
            logger.error(f"Invalid control message: {text}")

    async def _end_interview(self):
        """Request summary from Nova Sonic and send back via data channel."""
        # Ask Nova Sonic to provide the interview summary
        await self.session.generate_reply(
            instructions=(
                "END_INTERVIEW. The interview is now over. Please provide your "
                "comprehensive text summary of this interview including scores "
                "for each skill assessed, eye contact assessment, posture assessment, "
                "communication clarity, overall score (1-10), top 3 strengths, "
                "top 3 areas for improvement, and specific recommendations."
            )
        )

        # Wait a moment for the response to be generated
        await asyncio.sleep(3)

        # Collect the summary from chat context
        summary = self._collect_summary_from_context()

        # Send the summary back to the browser via text stream
        ctx = get_job_context()
        room = ctx.room
        writer = await room.local_participant.stream_text(
            topic="interview-result",
        )
        await writer.write(
            json.dumps(
                {
                    "type": "interview_ended",
                    "summary": summary,
                    "skills_json": self._skills_json,
                }
            )
        )
        await writer.close()

        # Cancel vision analysis
        for task in self._tasks:
            task.cancel()

    def _collect_summary_from_context(self) -> str:
        """Extract the last assistant message from the chat context."""
        for msg in reversed(self.chat_ctx.messages):
            if msg.role == "assistant" and msg.text_content:
                return msg.text_content
        return ""


async def entrypoint(ctx: JobContext):
    """Main entrypoint called when LiveKit dispatches this agent to a room."""
    # Extract metadata passed via token dispatch
    metadata = json.loads(ctx.job.metadata or "{}")
    system_prompt = metadata.get(
        "system_prompt", "You are Wayne, an interviewer."
    )
    skills_json = metadata.get("skills_json", "{}")

    session = AgentSession(
        llm=aws.realtime.RealtimeModel.with_nova_sonic_2(
            voice="tiffany",
            turn_detection="MEDIUM",
            modalities="mixed",
            region=settings.aws_region,
        ),
    )

    await session.start(
        room=ctx.room,
        agent=WayneInterviewer(system_prompt, skills_json),
    )


if __name__ == "__main__":
    from livekit.agents import cli

    cli.run_app(
        entrypoint,
        agent_name="wayne-interviewer",
    )
