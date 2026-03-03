import asyncio
import json

import boto3

from app.config import settings

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "bedrock-runtime",
            region_name=settings.aws_region,
        )
    return _client


async def bedrock_converse(
    prompt: str,
    system_prompt: str = "",
    model_id: str = None,
    temperature: float = 0.1,
    max_tokens: int = 2000,
) -> str:
    """Call Bedrock Converse API with Amazon Nova."""
    client = _get_client()
    model = model_id or settings.bedrock_text_model

    messages = [{"role": "user", "content": [{"text": prompt}]}]

    kwargs = {
        "modelId": model,
        "messages": messages,
        "inferenceConfig": {
            "maxTokens": max_tokens,
            "temperature": temperature,
        },
    }
    if system_prompt:
        kwargs["system"] = [{"text": system_prompt}]

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None, lambda: client.converse(**kwargs)
    )

    return response["output"]["message"]["content"][0]["text"]


async def bedrock_converse_json(
    prompt: str,
    system_prompt: str = "",
    model_id: str = None,
    temperature: float = 0.1,
    max_tokens: int = 2000,
) -> dict:
    """Call Bedrock and parse JSON response."""
    full_prompt = prompt + "\n\nReturn ONLY valid JSON, no markdown fences or extra text."
    text = await bedrock_converse(
        full_prompt, system_prompt, model_id, temperature, max_tokens
    )

    # Strip markdown fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]

    return json.loads(text.strip())
