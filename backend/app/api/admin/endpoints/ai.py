"""Claude in the console: a listing from her words, a description from facts.

Two endpoints, both admin-only, both stateless. Neither writes to the
database: the model produces a draft and the founder reviews it in the same
form she would have typed into. The form is the safety net, not the prompt.
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_async_db
from app.models.catalog import Category
from app.services import ai

router = APIRouter()

BRAND_VOICE = (
    "You write for ZISUN, a small Indian label selling handloom cotton kurtis, "
    "co-ords and dresses woven in South India (Mangalgiri, Ilkal, Kasavu). "
    "Voice: warm, plain, first person plural, no hype, no exclamation marks, "
    "no invented claims. Never state a fabric, measurement, price or feature "
    "that is not in the facts you are given. Indian English, prices in rupees."
)


@router.get("/status")
async def ai_status():
    """Whether the console's AI features can run, so the UI can say so."""
    return {"available": settings.has_ai, "model": settings.AI_MODEL if settings.has_ai else None}


class DraftRequest(BaseModel):
    """What she said, typed or transcribed, plus the palette the form offers."""
    text: str = Field(..., min_length=3, max_length=6000)
    palette: list[str] = Field(default_factory=list, max_length=64)
    sizes: list[str] = Field(default_factory=list, max_length=24)


def _draft_schema(categories: list[str], palette: list[str], sizes: list[str]) -> dict[str, Any]:
    colour = {"type": "string"}
    if palette:
        colour["enum"] = palette
    size = {"type": "string"}
    if sizes:
        size["enum"] = sizes
    category: dict[str, Any] = {"type": ["string", "null"]}
    if categories:
        category = {"type": ["string", "null"], "enum": categories + [None]}
    return {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Product name, 2-6 words, title case, no colour in the name unless it is the only colour."},
            "description": {"type": "string", "description": "60-110 words in the brand voice, built only from the facts given."},
            "base_price_rupees": {"type": ["integer", "null"]},
            "compare_at_rupees": {"type": ["integer", "null"], "description": "The struck-through was-price, only if she mentioned a discount or an old price."},
            "category": category,
            "colours": {"type": "array", "items": colour, "description": "Every colour the piece comes in, from the palette; closest match if she used another word."},
            "sizes": {"type": "array", "items": size, "description": "Every size she mentioned; if she said 'all sizes' use the full list."},
            "stock_per_variant": {"type": ["integer", "null"], "description": "Units per colour-size if she gave one number for all."},
            "fabric_composition": {"type": ["string", "null"]},
            "weave": {"type": ["string", "null"]},
            "fabric_gsm": {"type": ["integer", "null"]},
            "wash_care": {"type": ["string", "null"]},
            "has_pockets": {"type": ["boolean", "null"]},
            "print_type": {"type": ["string", "null"]},
            "pattern": {"type": ["string", "null"]},
            "neck_type": {"type": ["string", "null"]},
            "sleeve_type": {"type": ["string", "null"]},
            "sleeve_attached": {"type": ["boolean", "null"]},
            "dupatta_included": {"type": ["boolean", "null"]},
            "missing": {"type": "array", "items": {"type": "string"}, "description": "Short list of what she did not say and the listing needs: price, sizes, colours, stock, fabric."},
        },
        "required": ["name", "description", "colours", "sizes", "missing"],
    }


@router.post("/product-draft")
async def ai_product_draft(body: DraftRequest, db: AsyncSession = Depends(get_async_db)):
    """Turn a spoken or typed brief into a filled-in listing form.

    Categories come from the database, not the client, so the draft can only
    name one that exists. Colours and sizes come from the client because the
    form is the source of truth for both lists.
    """
    rows = (await db.execute(select(Category.id, Category.name))).all()
    by_name = {name: str(cid) for cid, name in rows}
    schema = _draft_schema(list(by_name), body.palette, body.sizes)
    system = BRAND_VOICE + (
        " You are filling in a product listing form from the founder's own words. "
        "Take every fact she gives; leave fields null when she did not say; never guess a price. "
        "If she names a colour outside the palette, pick the closest palette colour."
    )
    try:
        draft = await ai.extract(system, body.text, schema, name="listing",
                                 description="The listing fields filled in from the founder's brief.")
    except ai.AIUnavailable as exc:
        raise HTTPException(503, str(exc))
    category_name = draft.get("category")
    return {
        "draft": draft,
        "category_id": by_name.get(category_name) if category_name else None,
        "model": settings.AI_MODEL,
    }


class DescribeRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    facts: dict[str, Any] = Field(default_factory=dict)
    tone: Optional[str] = Field(default=None, max_length=200)


@router.post("/describe")
async def ai_describe(body: DescribeRequest):
    """A product description from the fields already on the form."""
    facts = "\n".join(f"- {k}: {v}" for k, v in body.facts.items() if v not in (None, "", [], {}))
    user = f"Product: {body.name}\nFacts:\n{facts or '- (none given)'}\n"
    if body.tone:
        user += f"Tone note from the founder: {body.tone}\n"
    user += "Write the product description: 60-110 words, one or two short paragraphs, no heading, no bullet points."
    try:
        text = await ai.write(BRAND_VOICE, user, max_tokens=400)
    except ai.AIUnavailable as exc:
        raise HTTPException(503, str(exc))
    return {"description": text, "model": settings.AI_MODEL}


class StylingRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    facts: dict[str, Any] = Field(default_factory=dict)


STYLING_SCHEMA = {
    "type": "object",
    "properties": {
        "notes": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "occasion": {"type": "string", "description": "Two or three words, e.g. 'The office', 'A long lunch', 'A family function'."},
                    "note": {"type": "string", "description": "35-55 words. Footwear, jewellery, hair, a bag, a layer - concrete and wearable in Indian weather."},
                },
                "required": ["occasion", "note"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["notes"],
    "additionalProperties": False,
}


@router.post("/styling")
async def ai_styling(body: StylingRequest):
    """Three ways to wear a piece, drafted for the founder to edit.

    A draft, never a publish: the console puts these in the form and she
    saves them like any other field. Only what she saves reaches a customer.
    """
    facts = "\n".join(f"- {k}: {v}" for k, v in body.facts.items() if v not in (None, "", [], {}))
    user = (
        f"Product: {body.name}\nFacts:\n{facts or '- (none given)'}\n\n"
        "Write three ways to wear this piece, for three different occasions in the life of a "
        "woman in an Indian city. Speak as the founder advising a friend: specific things she "
        "already owns (kolhapuris, jhumkas, a tote, a watch), never brand names, never "
        "'elevate', 'effortless' or 'chic'. Do not invent facts about the garment."
    )
    try:
        result = await ai.extract(BRAND_VOICE, user, STYLING_SCHEMA, name="styling")
    except ai.AIUnavailable as exc:
        raise HTTPException(503, str(exc))
    notes = [
        {"occasion": str(n.get("occasion", "")).strip()[:40], "note": str(n.get("note", "")).strip()[:360]}
        for n in result.get("notes", [])
        if n.get("occasion") and n.get("note")
    ]
    return {"notes": notes[:4], "model": settings.AI_MODEL}


class AttributesRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=4000)
    facts: dict[str, Any] = Field(default_factory=dict)


def _text(desc: str) -> dict[str, Any]:
    return {"type": ["string", "null"], "description": desc, "maxLength": 120}


ATTRIBUTES_SCHEMA = {
    "type": "object",
    "properties": {
        "set_pieces": {
            "type": ["array", "null"],
            "maxItems": 6,
            "items": {"type": "string"},
            "description": "Each garment in the set, in order, singular and capitalised: [\"Kurta\", \"Palazzo\"]. A single garment is a one-item list.",
        },
        "fit": _text("Relaxed, Regular, Straight, A-line, Fitted."),
        "garment_length": _text("Knee length, Calf length, Ankle length, Cropped."),
        "neck_type": _text("Round neck, V-neck, Collared, Boat neck."),
        "sleeve_type": _text("Sleeveless, Short, Three-quarter, Full."),
        "print_type": _text("Block print, Screen print, Plain, Ajrakh."),
        "pattern": _text("Solid, Floral, Striped, Checked."),
        "embroidery": _text("What is embroidered and how, e.g. 'Hand-embroidered rose motif with sequins'."),
        "bottom_type": _text("Only for a set: Palazzo, Straight pants, Sharara."),
        "occasion": _text("Two or three words: 'Everyday and work', 'Festive'."),
        "colour": _text("The garment's described colour, only when richer than one word, e.g. 'Indigo with off-white border'."),
        "has_pockets": {"type": ["boolean", "null"]},
        "dupatta_included": {"type": ["boolean", "null"]},
        "sleeve_attached": {"type": ["boolean", "null"]},
    },
    "required": [],
    "additionalProperties": False,
}


@router.post("/attributes")
async def ai_attributes(body: AttributesRequest):
    """Read the founder's own words and fill in the detail sheet.

    The gap this closes is not that the storefront hides what she enters -
    it is that entering fourteen fields by hand, per product, on a phone,
    does not happen, so the product page had nothing to show. She has
    already described the piece in a sentence; this turns that sentence
    into the structured facts the page renders, for her to correct.

    Null is a real answer here and the prompt insists on it: an invented
    neckline on a live listing is an exchange request.
    """
    facts = "\n".join(f"- {k}: {v}" for k, v in body.facts.items() if v not in (None, "", [], {}))
    user = (
        f"Product: {body.name}\n"
        f"Description: {body.description or '(none written yet)'}\n"
        f"Already recorded:\n{facts or '- (nothing)'}\n\n"
        "Fill in only the attributes that the name, the description or the recorded facts "
        "actually state or unambiguously imply. Return null for anything else - a guessed "
        "neckline or sleeve on a real listing becomes an exchange request. Do not contradict "
        "an already recorded fact. Use the customer's plain words, not marketing adjectives."
    )
    try:
        result = await ai.extract(BRAND_VOICE, user, ATTRIBUTES_SCHEMA, name="attributes")
    except ai.AIUnavailable as exc:
        raise HTTPException(503, str(exc))

    out: dict[str, Any] = {}
    for key, value in result.items():
        if key not in ATTRIBUTES_SCHEMA["properties"] or value in (None, "", []):
            continue
        if key == "set_pieces":
            pieces, seen = [], set()
            for piece in value if isinstance(value, list) else []:
                nm = str(piece).strip()[:60]
                if nm and nm.lower() not in seen:
                    seen.add(nm.lower())
                    pieces.append(nm)
            if pieces:
                out[key] = pieces
        elif isinstance(value, bool):
            out[key] = value
        else:
            out[key] = str(value).strip()[:120]
    return {"attributes": out, "model": settings.AI_MODEL}
