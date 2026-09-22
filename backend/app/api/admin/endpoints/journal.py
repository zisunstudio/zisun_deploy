"""The Journal, as the founder writes it.

The pipeline the brief asks for, with a human at the gate:
  ideas  -> what people typed into the shop's own search and did not find,
            and the questions the catalogue can answer
  draft  -> Claude writes from a brief and ONLY the recorded facts of the
            pieces it may recommend; it is told what it does not know
  edit   -> her words win
  approve/publish -> status, by hand; publishing pings IndexNow

Nothing reaches the public site until status is "published".
"""
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_async_db
from app.models.catalog import Product
from app.models.journal import KINDS, STATUSES, JournalArticle
from app.models.ml import SearchQuery
from app.services import ai, indexnow

router = APIRouter()

SITE = "https://zisun.in"


def slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:100] or "article"


class ArticleIn(BaseModel):
    title: str = Field(..., min_length=3, max_length=160)
    slug: Optional[str] = Field(None, max_length=120)
    dek: Optional[str] = Field(None, max_length=300)
    kind: str = Field("style")
    body_md: str = ""
    status: str = "draft"
    product_ids: list[uuid.UUID] = Field(default_factory=list, max_length=8)
    cover_url: Optional[str] = Field(None, max_length=1000)
    meta_title: Optional[str] = Field(None, max_length=160)
    meta_description: Optional[str] = Field(None, max_length=320)
    brief: Optional[str] = None
    search_intent: Optional[str] = Field(None, max_length=200)


class ArticleOut(ArticleIn):
    id: uuid.UUID
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def _check(data: ArticleIn) -> None:
    if data.kind not in KINDS:
        raise HTTPException(422, f"kind must be one of {', '.join(KINDS)}")
    if data.status not in STATUSES:
        raise HTTPException(422, f"status must be one of {', '.join(STATUSES)}")


async def _get(db: AsyncSession, article_id: uuid.UUID) -> JournalArticle:
    a = (await db.execute(select(JournalArticle).where(JournalArticle.id == article_id))).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "No such article")
    return a


@router.get("", response_model=list[ArticleOut])
async def admin_list(db: AsyncSession = Depends(get_async_db)):
    return (await db.execute(select(JournalArticle).order_by(desc(JournalArticle.updated_at)))).scalars().all()


@router.post("", response_model=ArticleOut, status_code=201)
async def admin_create(data: ArticleIn, db: AsyncSession = Depends(get_async_db)):
    _check(data)
    slug = slugify(data.slug or data.title)
    if (await db.execute(select(JournalArticle.id).where(JournalArticle.slug == slug))).scalar_one_or_none():
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"
    a = JournalArticle(**{**data.model_dump(), "slug": slug, "product_ids": [str(i) for i in data.product_ids]})
    if a.status == "published":
        a.published_at = datetime.now(timezone.utc)
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return a


@router.put("/{article_id}", response_model=ArticleOut)
async def admin_update(article_id: uuid.UUID, data: ArticleIn, background: BackgroundTasks, db: AsyncSession = Depends(get_async_db)):
    _check(data)
    a = await _get(db, article_id)
    was_published = a.status == "published"
    for k, v in data.model_dump().items():
        if k == "product_ids":
            v = [str(i) for i in v]
        if k == "slug":
            v = slugify(v or a.slug)
        setattr(a, k, v)
    if a.status == "published" and not a.published_at:
        a.published_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(a)
    if a.status == "published" or was_published:
        background.add_task(indexnow.ping, [f"{SITE}/journal/{a.slug}", f"{SITE}/journal"] + [f"{SITE}/product/{p}" for p in (a.product_ids or [])])
    return a


@router.delete("/{article_id}", status_code=204)
async def admin_delete(article_id: uuid.UUID, db: AsyncSession = Depends(get_async_db)):
    a = await _get(db, article_id)
    await db.delete(a)
    await db.commit()


# ── Ideas: what people asked the shop, and what it can answer ────────────────

@router.get("/ideas")
async def admin_ideas(db: AsyncSession = Depends(get_async_db)):
    """Topics with evidence behind them.

    Searches typed into the shop are the truest signal of what a visitor
    wanted: each one is a question the site was asked. The ones that found
    nothing are the questions it could not answer. Search Console joins this
    list when its credentials exist; until then this is the shop's own data.
    """
    rows = (await db.execute(
        select(SearchQuery.query_text, func.count().label("n"), func.min(SearchQuery.result_count).label("min_results"))
        .group_by(SearchQuery.query_text).order_by(desc("n")).limit(40)
    )).all()
    searches = [{"query": q, "times": int(n), "found_nothing": (mr or 0) == 0} for q, n, mr in rows if q and len(q.strip()) > 1]

    pieces = (await db.execute(select(Product.name, Product.fabric_composition, Product.craft, Product.origin, Product.occasion)
                               .where(Product.deleted_at.is_(None), Product.is_active.is_(True)))).all()
    fabrics = sorted({(f or "").strip() for _, f, _, _, _ in pieces if f})
    crafts = sorted({(c or "").strip() for _, _, c, _, _ in pieces if c})
    origins = sorted({(o or "").strip() for _, _, _, o, _ in pieces if o})
    occasions = sorted({(oc or "").strip() for _, _, _, _, oc in pieces if oc})

    # Evergreen questions the catalogue can honestly answer today.
    suggestions: list[dict] = []
    for f in fabrics:
        suggestions.append({"kind": "fabric", "title": f"What is {f.lower()}, and how does it wear?", "why": f"{f} is in the shop"})
        suggestions.append({"kind": "care", "title": f"How to wash and keep {f.lower()}", "why": "care instructions are recorded"})
    for c in crafts:
        suggestions.append({"kind": "fabric", "title": f"{c}: what it is and why it looks the way it does", "why": f"a piece records '{c}'"})
    for o in origins:
        suggestions.append({"kind": "fabric", "title": f"Cloth from {o.split(',')[0]}", "why": f"a piece is from {o}"})
    for oc in occasions:
        suggestions.append({"kind": "occasion", "title": f"What to wear for {oc.lower()}", "why": f"a piece is tagged '{oc}'"})
    suggestions += [
        {"kind": "fit", "title": "How to measure a kurta you already own, and choose your size", "why": "Find my size exists; the page can show the method"},
        {"kind": "fit", "title": "Kurta length for a 5-foot frame: what falls where", "why": "the founder is 153 cm and photographs every piece"},
        {"kind": "founder", "title": "Why I photograph every piece on myself", "why": "the brand's one unrepeatable fact"},
    ]
    # Search Console data joins this list when its credentials exist.
    return {"searches": searches, "suggestions": suggestions, "search_console": False}


# ── Draft with Claude, from facts only ───────────────────────────────────────

VOICE = (
    "You write the ZISUN Journal. ZISUN is a small Indian women's label from Bengaluru run by "
    "Sushmita, who photographs every piece on herself at 153 cm. Voice: plain, warm, specific, "
    "Indian English, first person plural, no exclamation marks, no hype words (elevate, effortless, "
    "chic, curated). Write to be genuinely useful to a woman searching for this; earn any mention of "
    "a piece by answering her question first. NEVER state a fabric, craft, origin, measurement or "
    "care fact that is not in the facts given; if you do not know, say what would be needed to know."
)

DRAFT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "maxLength": 120},
        "dek": {"type": "string", "maxLength": 240, "description": "One sentence under the title."},
        "body_md": {"type": "string", "description": "600-1000 words of Markdown: ## headings, short paragraphs, lists where useful. Mention pieces by their exact given name in a natural sentence."},
        "meta_title": {"type": "string", "maxLength": 60},
        "meta_description": {"type": "string", "maxLength": 155},
        "search_intent": {"type": "string", "maxLength": 160, "description": "The question a searcher typed that this answers."},
        "unknowns": {"type": "array", "items": {"type": "string"}, "description": "Facts the article needed but was not given."},
    },
    "required": ["title", "dek", "body_md", "meta_title", "meta_description", "search_intent", "unknowns"],
    "additionalProperties": False,
}


class DraftRequest(BaseModel):
    brief: str = Field(..., min_length=10, max_length=2000)
    kind: str = "style"
    product_ids: list[uuid.UUID] = Field(default_factory=list, max_length=6)


def _facts_for(p: Product) -> dict[str, Any]:
    keep = ("fabric_composition", "fabric_gsm", "weave", "wash_care", "colourfastness", "has_pockets", "fit", "garment_length",
            "neck_type", "sleeve_type", "print_type", "pattern", "embroidery", "bottom_type", "occasion", "set_pieces",
            "craft", "origin", "lining", "transparency", "batch_size", "will_rerun", "model_size", "worn_by_founder")
    facts = {k: getattr(p, k, None) for k in keep}
    return {"name": p.name, "price_rupees": p.base_price // 100, "facts": {k: v for k, v in facts.items() if v not in (None, "", [], {})}}


@router.post("/draft")
async def admin_draft(body: DraftRequest, db: AsyncSession = Depends(get_async_db)):
    if body.kind not in KINDS:
        raise HTTPException(422, f"kind must be one of {', '.join(KINDS)}")
    pieces = []
    if body.product_ids:
        rows = (await db.execute(select(Product).where(Product.id.in_(body.product_ids), Product.deleted_at.is_(None)))).scalars().all()
        pieces = [_facts_for(p) for p in rows]
    user = (
        f"Article kind: {body.kind}\nBrief from the founder:\n{body.brief}\n\n"
        f"Pieces you may mention, with the ONLY facts you may use about them:\n{pieces or '(none - write without recommending a piece)'}\n\n"
        "Write the article. List in `unknowns` every fact you wanted and did not have, instead of inventing it."
    )
    try:
        result = await ai.extract(VOICE, user, DRAFT_SCHEMA, name="article", max_tokens=2500)
    except ai.AIUnavailable as exc:
        raise HTTPException(503, str(exc))
    return {**result, "model": settings.AI_MODEL}
