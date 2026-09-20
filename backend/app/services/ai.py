"""Claude, for the console.

One thin client over the Messages API, two verbs. `write` returns prose;
`extract` returns a dict shaped by a JSON schema, by forcing a tool call so
the model cannot answer in free text. No SDK: httpx is already a dependency
and the API is one POST.

Every caller is an admin endpoint. The storefront never reaches this module,
which is what keeps the bill proportional to the founder's own use.
"""
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


class AIUnavailable(Exception):
    """The feature cannot run right now; the caller turns this into a 503."""


async def _post(payload: dict[str, Any]) -> dict[str, Any]:
    if not settings.has_ai:
        raise AIUnavailable("ANTHROPIC_API_KEY is not set")
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            response = await client.post(ANTHROPIC_URL, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        logger.warning("Claude request failed: %s", exc)
        raise AIUnavailable("Could not reach Claude") from exc
    if response.status_code >= 400:
        # The body carries the reason (bad key, no credits, overloaded) and is
        # safe to log: it never echoes the prompt. The three the founder can
        # fix herself are named in plain words; the console shows this text.
        body = response.text[:300]
        logger.warning("Claude returned %s: %s", response.status_code, body)
        if response.status_code == 401:
            raise AIUnavailable("the ANTHROPIC_API_KEY was rejected")
        if "credit balance" in body:
            raise AIUnavailable("the Anthropic account has no credits — add credits at console.anthropic.com")
        if response.status_code == 429:
            raise AIUnavailable("Claude is rate-limited right now, try again in a minute")
        raise AIUnavailable(f"Claude returned {response.status_code}")
    return response.json()


async def write(system: str, user: str, max_tokens: int = 800) -> str:
    """Prose. Returns the concatenated text blocks."""
    data = await _post({
        "model": settings.AI_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    })
    return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()


async def extract(system: str, user: str, schema: dict[str, Any], name: str = "result",
                  description: str = "Return the structured result.", max_tokens: int = 1500) -> dict[str, Any]:
    """Structured output: a dict validated against `schema` by the model itself.

    Forcing the tool means the reply is always the tool's input and never a
    paragraph that starts "Sure! Here is..." followed by JSON in a code fence.
    """
    data = await _post({
        "model": settings.AI_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "tools": [{"name": name, "description": description, "input_schema": schema}],
        "tool_choice": {"type": "tool", "name": name},
        "messages": [{"role": "user", "content": user}],
    })
    for block in data.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == name:
            return dict(block.get("input") or {})
    raise AIUnavailable("Claude returned no structured result")
