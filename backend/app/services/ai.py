"""The console's model, with somewhere to fall back to.

Two verbs. `write` returns prose; `extract` returns a dict shaped by a JSON
schema, so the model cannot answer in free text. No SDK: httpx is already a
dependency and each API is one POST.

**Two providers, on purpose.** The Anthropic account ran out of credits and
every AI feature in the console died at the same moment - the daily brief,
the listing drafter, styling notes, attribute extraction and the journal
drafter - with nothing to fall back to. A shop with one provider has none as
soon as that provider says no. Claude is tried first and Gemini answers when
Claude cannot, so running out of credits becomes a quieter sentence in the
log rather than five dead features.

The fence is unchanged and is what keeps the bill bounded: every caller is an
admin endpoint. The storefront never reaches this module. `extract` is the
only shape either provider may answer in, so a fallback cannot smuggle prose
into a field the console parses as data.
"""
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

#: Which provider answered last, for the console to show. Not a fact about
#: the account - a fact about the last call.
_last_provider: str | None = None


def last_provider() -> str | None:
    return _last_provider


class AIUnavailable(Exception):
    """The feature cannot run right now; the caller turns this into a 503."""


async def _post(payload: dict[str, Any], timeout: float = 60.0) -> dict[str, Any]:
    if not settings.has_ai:
        raise AIUnavailable("ANTHROPIC_API_KEY is not set")
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=min(10.0, timeout))) as client:
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


# ── Gemini ───────────────────────────────────────────────────────────────────


async def _gemini(body: dict[str, Any], timeout: float = 60.0) -> dict[str, Any]:
    if not settings.has_gemini:
        raise AIUnavailable("GEMINI_API_KEY is not set")
    url = GEMINI_URL.format(model=settings.GEMINI_MODEL)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=min(10.0, timeout))) as client:
            response = await client.post(
                url,
                headers={"x-goog-api-key": settings.GEMINI_API_KEY, "content-type": "application/json"},
                json=body,
            )
    except httpx.HTTPError as exc:
        logger.warning("Gemini request failed: %s", exc)
        raise AIUnavailable("Could not reach Gemini") from exc
    if response.status_code >= 400:
        # Same rule as Claude: the body says why and never echoes the prompt.
        detail = response.text[:300]
        logger.warning("Gemini returned %s: %s", response.status_code, detail)
        if response.status_code in (401, 403):
            raise AIUnavailable("the GEMINI_API_KEY was rejected")
        if response.status_code == 429:
            raise AIUnavailable("Gemini is rate-limited right now, try again in a minute")
        if response.status_code == 503:
            raise AIUnavailable("Gemini is busy right now, try again in a minute")
        raise AIUnavailable(f"Gemini returned {response.status_code}")
    return response.json()


def _gemini_text(data: dict[str, Any]) -> str:
    for candidate in data.get("candidates") or []:
        parts = (candidate.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts).strip()
        if text:
            return text
    return ""


def _for_gemini(schema: dict[str, Any]) -> dict[str, Any]:
    """The subset of JSON Schema Gemini accepts.

    It rejects `additionalProperties` and bare `maxLength` on a string, which
    Claude's tool schemas carry, and a rejected schema is a 400 rather than a
    quiet degradation - so the unsupported keys are stripped rather than
    hoped about.
    """
    drop = {"additionalProperties", "maxLength", "minLength", "$schema", "title"}
    if not isinstance(schema, dict):
        return schema
    out = {k: v for k, v in schema.items() if k not in drop}
    if isinstance(out.get("properties"), dict):
        out["properties"] = {k: _for_gemini(v) for k, v in out["properties"].items()}
    if isinstance(out.get("items"), dict):
        out["items"] = _for_gemini(out["items"])
    return out


async def write(system: str, user: str, max_tokens: int = 800) -> str:
    """Prose, from whichever provider answers."""
    global _last_provider
    try:
        data = await _post({
            "model": settings.AI_MODEL,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        })
        _last_provider = "claude"
        return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    except AIUnavailable as claude_said:
        if not settings.has_gemini:
            raise
        logger.info("Claude unavailable (%s) - asking Gemini", claude_said)

    data = await _gemini({
        # Gemini has no separate system role on this endpoint; the instruction
        # goes in systemInstruction, which it honours the same way.
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"parts": [{"text": user}]}],
        "generationConfig": {"maxOutputTokens": max_tokens},
    })
    _last_provider = "gemini"
    text = _gemini_text(data)
    if not text:
        raise AIUnavailable("Gemini returned nothing")
    return text


async def extract(system: str, user: str, schema: dict[str, Any], name: str = "result",
                  description: str = "Return the structured result.", max_tokens: int = 1500,
                  model: str | None = None, timeout: float | None = None) -> dict[str, Any]:
    """Structured output: a dict validated against `schema` by the model itself.

    Forcing the tool means the reply is always the tool's input and never a
    paragraph that starts "Sure! Here is..." followed by JSON in a code fence.
    """
    global _last_provider
    try:
        data = await _post({
            "model": model or settings.AI_MODEL,
            "max_tokens": max_tokens,
            "system": system,
            "tools": [{"name": name, "description": description, "input_schema": schema}],
            "tool_choice": {"type": "tool", "name": name},
            "messages": [{"role": "user", "content": user}],
        }, timeout=timeout or 60.0)
        for block in data.get("content", []):
            if block.get("type") == "tool_use" and block.get("name") == name:
                _last_provider = "claude"
                return dict(block.get("input") or {})
        raise AIUnavailable("Claude returned no structured result")
    except AIUnavailable as claude_said:
        if not settings.has_gemini:
            raise
        logger.info("Claude unavailable (%s) - asking Gemini", claude_said)

    # Gemini has no tool-forcing here, but it does have response schemas,
    # which buy the same thing: the reply is JSON of this shape or an error,
    # never a paragraph with JSON in a code fence.
    data = await _gemini({
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"parts": [{"text": user}]}],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "responseMimeType": "application/json",
            "responseSchema": _for_gemini(schema),
        },
    }, timeout=timeout or 60.0)
    raw = _gemini_text(data)
    try:
        import json  # noqa: PLC0415

        parsed = json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        raise AIUnavailable("Gemini returned no structured result") from exc
    if not isinstance(parsed, dict):
        raise AIUnavailable("Gemini returned no structured result")
    _last_provider = "gemini"
    return parsed
