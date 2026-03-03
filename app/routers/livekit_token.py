import json
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from livekit.api import AccessToken, VideoGrants, RoomConfiguration, RoomAgentDispatch

from app.config import settings

router = APIRouter()


class TokenRequest(BaseModel):
    system_prompt: str
    skills_json: str
    participant_name: str = "Candidate"


class TokenResponse(BaseModel):
    server_url: str
    participant_token: str
    room_name: str


@router.post("/livekit-token", response_model=TokenResponse)
async def get_livekit_token(request: TokenRequest):
    if not all(
        [settings.livekit_api_key, settings.livekit_api_secret, settings.livekit_url]
    ):
        raise HTTPException(status_code=500, detail="LiveKit not configured")

    room_name = f"interview-{int(time.time())}"
    participant_identity = f"candidate-{int(time.time())}"

    # Package the system prompt and skills as dispatch metadata
    dispatch_metadata = json.dumps(
        {
            "system_prompt": request.system_prompt,
            "skills_json": request.skills_json,
        }
    )

    token = (
        AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(participant_identity)
        .with_name(request.participant_name)
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )
        .with_room_config(
            RoomConfiguration(
                agents=[
                    RoomAgentDispatch(
                        agent_name="wayne-interviewer",
                        metadata=dispatch_metadata,
                    )
                ],
            ),
        )
        .to_jwt()
    )

    return TokenResponse(
        server_url=settings.livekit_url,
        participant_token=token,
        room_name=room_name,
    )
