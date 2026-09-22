"""What ZISUN may say about itself, computed from what its pieces record.

The home page once said "handloom cotton from Mangalgiri, Ilkal and Kasavu,
woven by hand, never re-run" over a catalogue of one silk piece and one
Rajasthani dabu print, neither recorded as any of those things. The rule now:
a brand claim exists only if the live pieces support it. Silence is the
default; a claim has to be earned by data the founder entered.

Every derived claim carries the *evidence* it rests on (which pieces, how
many) so the console can show why the site says what it says, and the
founder can see which single missing fact is holding a true claim back.

Pure functions over plain dicts; no database, no settings; unit-tested.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Optional

_COTTON = re.compile(r"\bcotton\b", re.I)
_SILK = re.compile(r"\bsilk\b", re.I)
_HANDLOOM = re.compile(r"hand\s*-?\s*(loom|woven)", re.I)


@dataclass
class Claim:
    """A single true statement, with the count of pieces it rests on."""
    key: str
    text: str
    pieces: int
    of: int


@dataclass
class Truth:
    pieces: int = 0
    fabrics: list[str] = field(default_factory=list)      # distinct, as recorded
    crafts: list[str] = field(default_factory=list)
    origins: list[str] = field(default_factory=list)
    all_cotton: bool = False
    any_handloom: bool = False
    all_handloom: bool = False
    all_never_rerun: bool = False    # every piece has will_rerun == False
    max_batch: Optional[int] = None  # largest known batch, when every piece has one
    claims: list[Claim] = field(default_factory=list)
    # Facts that would unlock a stronger claim, for the console.
    missing: list[str] = field(default_factory=list)


def _norm(s: Optional[str]) -> str:
    return (s or "").strip()


def _region(origin: str) -> str:
    """'Mangalgiri, Andhra Pradesh' -> 'Mangalgiri'. The place, not the state."""
    return origin.split(",")[0].strip()


def compute(products: Iterable[dict]) -> Truth:
    rows = [p for p in products if p.get("is_active", True)]
    t = Truth(pieces=len(rows))
    if not rows:
        return t

    fabrics = [_norm(p.get("fabric_composition")) for p in rows]
    crafts = [_norm(p.get("craft")) for p in rows]
    origins = [_norm(p.get("origin")) for p in rows]
    reruns = [p.get("will_rerun") for p in rows]
    batches = [p.get("batch_size") for p in rows]

    t.fabrics = sorted({f for f in fabrics if f})
    t.crafts = sorted({c for c in crafts if c})
    t.origins = sorted({o for o in origins if o})

    known_fabric = [f for f in fabrics if f]
    t.all_cotton = bool(known_fabric) and len(known_fabric) == len(rows) and all(_COTTON.search(f) and not _SILK.search(f) for f in known_fabric)
    handloom_flags = [bool(_HANDLOOM.search(c)) for c in crafts if c]
    t.any_handloom = any(handloom_flags)
    t.all_handloom = bool(handloom_flags) and len(handloom_flags) == len(rows) and all(handloom_flags)
    t.all_never_rerun = all(r is False for r in reruns)
    if all(isinstance(b, int) and b > 0 for b in batches):
        t.max_batch = max(batches)  # type: ignore[type-var]

    n = len(rows)
    cotton_n = sum(1 for f in fabrics if f and _COTTON.search(f) and not _SILK.search(f))
    handloom_n = sum(handloom_flags)

    # ── Claims, each only when earned ────────────────────────────────────────
    if t.all_handloom and t.all_cotton:
        t.claims.append(Claim("fabric", "Handloom cotton", n, n))
    elif t.all_cotton:
        t.claims.append(Claim("fabric", "Cotton", n, n))
    elif cotton_n:
        t.claims.append(Claim("fabric", f"Cotton and {'silk' if any(_SILK.search(f) for f in fabrics) else 'more'}", cotton_n, n))

    if t.all_handloom:
        t.claims.append(Claim("craft", "Woven by hand", handloom_n, n))
    elif t.any_handloom:
        t.claims.append(Claim("craft", "Some pieces woven by hand", handloom_n, n))

    regions = sorted({_region(o) for o in t.origins})
    if regions and len(t.origins) == len({o for o in origins if o}) and all(origins):
        t.claims.append(Claim("origin", " · ".join(regions[:3]), n, n))
    elif regions:
        t.claims.append(Claim("origin", "Some pieces from " + " and ".join(regions[:2]), sum(1 for o in origins if o), n))

    if t.all_never_rerun:
        if t.max_batch:
            t.claims.append(Claim("batch", f"Small batches - never more than {t.max_batch} of a piece - and never re-run", n, n))
        else:
            t.claims.append(Claim("batch", "Never re-run. When a piece goes, it goes", n, n))

    # ── What would unlock more ───────────────────────────────────────────────
    if not all(fabrics):
        t.missing.append("fabric composition on every piece")
    if not all(crafts):
        t.missing.append("craft (handloom / powerloom / print technique) on every piece")
    if not all(origins):
        t.missing.append("origin on every piece")
    if any(r is None for r in reruns):
        t.missing.append("a re-run decision (yes/no) on every piece")
    if not all(isinstance(b, int) and b > 0 for b in batches):
        t.missing.append("batch size on every piece")
    return t


def as_dict(t: Truth) -> dict:
    return {
        "pieces": t.pieces,
        "fabrics": t.fabrics,
        "crafts": t.crafts,
        "origins": t.origins,
        "all_cotton": t.all_cotton,
        "any_handloom": t.any_handloom,
        "all_handloom": t.all_handloom,
        "all_never_rerun": t.all_never_rerun,
        "max_batch": t.max_batch,
        "claims": [{"key": c.key, "text": c.text, "pieces": c.pieces, "of": c.of} for c in t.claims],
        "missing": t.missing,
    }
