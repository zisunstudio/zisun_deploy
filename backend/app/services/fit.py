"""The fit engine: which size to take, and how it will sit on her.

Sizing is the one thing that reliably goes wrong buying clothes online, and
the one question the founder answers by hand most often. This answers it
from facts the shop already has - the sizes in stock, the piece's size
chart and length, and who is wearing it in the photographs - plus two
things the customer tells us: her height, and the size she usually wears.

It is deliberately rules, not a model. The size it recommends is decided
here, deterministically, and the stylist endpoint lets Claude *explain*
that answer in the label's voice but never change it. So the answer is the
same with or without an Anthropic key, it can be tested, and it can never
invent a measurement.

The reference body is Sushmita: she photographs pieces on herself and is
153 cm, close to the average Indian woman (NFHS-5: 151-153 cm). "You are
7 cm taller than her" is a statement a customer can picture against the
photographs, which a measurement table alone is not.

Pure functions only - no settings, no database - so this module is
unit-testable in isolation.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Optional

SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"]
FOUNDER_NAME = "Sushmita"
FOUNDER_HEIGHT_CM = 153
PREFERENCES = ("relaxed", "as_designed", "fitted")


def rank(size: Optional[str]) -> int:
    s = (size or "").strip().upper()
    return SIZE_ORDER.index(s) if s in SIZE_ORDER else len(SIZE_ORDER)


def parse_height_cm(text: Optional[str]) -> Optional[int]:
    """'153 cm', '153', '5\\'4"', "5'4", '5 ft 4 in' -> centimetres."""
    if not text:
        return None
    t = text.strip().lower()
    feet = re.match(r"^\s*(\d)\s*(?:'|ft|feet|′)\s*(\d{1,2})?\s*(?:\"|in|inch|inches|″)?\s*$", t)
    if feet:
        cm = int(feet.group(1)) * 30.48 + int(feet.group(2) or 0) * 2.54
        return round(cm)
    num = re.match(r"^\s*(\d{3})(?:\.\d+)?\s*(?:cm)?\s*$", t)
    if num:
        return int(num.group(1))
    return None


def feet_inches(cm: int) -> str:
    inches = round(cm / 2.54)
    return f"{inches // 12}'{inches % 12}\""


@dataclass
class FitAdvice:
    size: str
    headline: str
    reasons: list[str] = field(default_factory=list)
    confidence: str = "medium"          # "high" | "medium" | "low"
    reference: Optional[str] = None     # who the length comparison is against
    height_delta_cm: Optional[int] = None


def _nearest(target_rank: int, available: list[str]) -> str:
    return min(available, key=lambda s: (abs(rank(s) - target_rank), rank(s)))


def _length_line(delta: int, who: str, garment_length: Optional[str]) -> str:
    what = f"this {garment_length.lower()} piece" if garment_length else "it"
    if abs(delta) <= 4:
        return f"You are about {who}'s height, so {what} will fall much as it does in the photographs."
    direction = "higher" if delta > 0 else "lower"
    taller = "taller" if delta > 0 else "shorter"
    amount = "a little" if abs(delta) <= 10 else "noticeably"
    tail = " Check the lengths in the size guide." if abs(delta) > 10 else ""
    return f"You are {abs(delta)} cm {taller} than {who}, so {what} will sit {amount} {direction} on you than in the photographs.{tail}"


def recommend(
    *,
    available_sizes: Iterable[str],
    usual_size: str,
    height_cm: int,
    preference: str = "as_designed",
    fit: Optional[str] = None,
    garment_length: Optional[str] = None,
    worn_by_founder: bool = False,
    model_size: Optional[str] = None,
    model_height: Optional[str] = None,
    has_size_chart: bool = False,
) -> FitAdvice:
    """Decide the size. Every sentence in the result is a fact or a rule."""
    available = sorted({s.strip() for s in available_sizes if s and s.strip()}, key=rank)
    if not available:
        raise ValueError("no sizes in stock")
    usual = usual_size.strip().upper()
    if preference not in PREFERENCES:
        preference = "as_designed"

    target = rank(usual)
    reasons: list[str] = []
    relaxed_cut = bool(fit and re.search(r"relax|loose|oversiz|a-line|flow", fit, re.I))

    if preference == "relaxed":
        if relaxed_cut:
            reasons.append(f"It is already a {fit.lower()} cut, so your usual size gives you the ease you like.")
        else:
            target += 1
            reasons.append("You like room to move, so one size up.")
    elif preference == "fitted":
        if relaxed_cut:
            reasons.append(f"It is a {fit.lower()} cut, so it will not hug even in your usual size.")
        else:
            reasons.append("Your usual size keeps it closest to the body without pulling.")
    else:
        reasons.append("Your usual size, as it was designed to fit.")

    size = _nearest(target, available)
    confidence = "high" if has_size_chart else "medium"
    if rank(size) != target:
        wanted = SIZE_ORDER[target] if target < len(SIZE_ORDER) else usual
        reasons.append(f"{wanted} is not in stock in this piece; {size} is the closest.")
        confidence = "low"

    # Who to compare against: the founder when it is her in the photographs,
    # otherwise a named model height when one was recorded.
    ref_cm, who = None, None
    if worn_by_founder:
        ref_cm, who = FOUNDER_HEIGHT_CM, FOUNDER_NAME
    else:
        parsed = parse_height_cm(model_height)
        if parsed:
            ref_cm, who = parsed, "the model"

    delta = None
    if ref_cm is not None:
        delta = int(height_cm) - ref_cm
        reasons.append(_length_line(delta, who, garment_length))
        if model_size and model_size.strip().upper() == size.upper():
            reasons.append(f"{who.capitalize() if who == 'the model' else who} is wearing {size} in the photographs.")

    headline = f"Take {size}."
    return FitAdvice(size=size, headline=headline, reasons=reasons, confidence=confidence,
                     reference=f"{who}, {ref_cm} cm" if who else None, height_delta_cm=delta)
