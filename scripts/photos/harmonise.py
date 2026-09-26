"""Make one shoot look like one shoot.

The problem, measured on ZISUN's own six photographs of a single wine kurta:
L* from 8.8 to 34.8, C* from 20.4 to 42.8, hue across 17 degrees, a mean
CIEDE2000 of 10.0 between frames and a worst pair of 20.6. Five is already
"a different colour". The founder saw two frames of one garment and asked
which one the customer was supposed to believe. Both, and neither.

None of that is the cloth. A dyed fabric has one reflectance; it does not
change between the shade of a tree and the middle of a road. Every bit of
that spread is the illuminant and the exposure, which means it is a
correction with a right answer rather than a matter of taste.

The method treats **the garment as the reference patch**. A colour-managed
studio photographs a chart of known patches and solves for the transform
that puts them where they belong. There is no chart here, but there is
something nearly as good: the same cloth appears in every frame, so one
corresponding pair per frame is enough to determine a von Kries diagonal in
cone space - three unknowns, three equations. That transform is then applied
to the *whole* frame, because the whole scene shared the illuminant.

Two corrections, kept separate so each can be measured on its own:

  1. **Chromatic** - a Bradford von Kries adaptation carrying this frame's
     garment chromaticity onto the reference. This is what collapses the
     hue and chroma spread.
  2. **Tonal** - a lightness shift anchored on the *garment's* median L*,
     not the frame's. Anchoring on the frame is the mistake the earlier
     version made: these photographs are mostly trees and road, so a
     whole-frame median described the background and the correction aimed
     at the wrong subject, clipping its own ceiling on nine frames of ten.

What this does not do: invent detail, retouch, or decide what the cloth
truly looks like. The reference is the median across the shoot, which makes
the set *consistent*; making it *correct* needs one human judgement that no
algorithm can supply - see `--reference`.
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
from PIL import Image
import colour

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from garment import describe, load_lab, garment_mask   # noqa: E402

OUT_EDGE = 2400      # the console's uploader caps here anyway
MAX_TONE_SHIFT = 18   # beyond this a frame is a reshoot, not a correction
MAX_CHROMA_GAIN = 1.30  # and so is a frame needing more saturation than this
MIN_CHROMA_GAIN = 0.78


D65 = colour.xy_to_XYZ(
    colour.CCS_ILLUMINANTS["CIE 1931 2 Degree Standard Observer"]["D65"])


def estimate_illuminant(rgb_lin: np.ndarray, lab: np.ndarray) -> np.ndarray:
    """The colour of the light, read off the scene's near-neutral surfaces.

    Shades-of-Gray (Finlayson & Trezzi 2004): the illuminant is the Minkowski
    mean of the image in linear light. p=6 sits between the grey-world mean
    (p=1), which a large block of one colour drags badly, and max-RGB
    (p=inf), which a single specular pixel decides on its own.

    It is computed over the *low-chroma* pixels only - road, wall, concrete,
    overcast sky. Those surfaces are close to neutral, so what the sensor
    recorded there is very nearly the light itself. Including the garment
    would be circular: grey-world would read a frame full of wine cloth as
    lit by red light and dutifully remove the dye.

    An earlier attempt skipped this and built a von Kries matrix straight
    from the garment colour, treating the cloth as the white point. A
    chromatic adaptation transform is defined between *white* tristimulus
    values; a dark saturated patch has almost no S-cone response, so the
    ratio it implies is enormous. One frame came back at L* 63.8 from a
    tone shift of +2.3 and the spread across the shoot got worse, not
    better. The cloth is what we *check* the correction against, never what
    we anchor it on.
    """
    C = np.hypot(lab[..., 1], lab[..., 2])
    neutral = (C < 12) & (lab[..., 0] > 12) & (lab[..., 0] < 92)
    # A frame with too little neutral surface cannot support the estimate;
    # widen once, then accept the whole frame rather than invent a number.
    if neutral.sum() < 0.02 * neutral.size:
        neutral = (C < 22) & (lab[..., 0] > 8)
    if neutral.sum() < 0.01 * neutral.size:
        neutral = np.ones(lab.shape[:2], dtype=bool)

    px = rgb_lin[neutral]
    p = 6.0
    e = np.power(np.mean(np.power(np.clip(px, 1e-6, None), p), axis=0), 1.0 / p)
    e = e / e.sum()
    return colour.sRGB_to_XYZ(colour.models.eotf_inverse_sRGB(e / e.max()))


def harmonise(paths: list[str], out_dir: str, reference: str | None = None,
              target_L: float | None = None) -> list[dict]:
    os.makedirs(out_dir, exist_ok=True)
    stats = [describe(p) for p in paths]
    labs = np.array([s["lab"] for s in stats])

    if reference:
        ref_lab = next(s["lab"] for s in stats if os.path.basename(s["path"]) == reference)
    else:
        # Median across the shoot: robust, and privileges no single frame.
        ref_lab = np.median(labs, axis=0)
    ref_L = target_L if target_L is not None else float(ref_lab[0])

    results = []
    for s in stats:
        img = Image.open(s["path"]).convert("RGB")
        img.thumbnail((OUT_EDGE, OUT_EDGE), Image.LANCZOS)
        rgb = np.asarray(img, dtype=np.float64) / 255.0
        rgb_lin = colour.models.eotf_sRGB(rgb)
        xyz = colour.sRGB_to_XYZ(rgb)
        lab0 = colour.XYZ_to_Lab(xyz)

        # 1. Remove the light. Estimate what illuminant the scene was under,
        #    then adapt the whole frame from it to D65 - a transform between
        #    two white points, which is what Bradford is defined for.
        illum = estimate_illuminant(rgb_lin, lab0)
        M = colour.adaptation.matrix_chromatic_adaptation_VonKries(
            illum, D65, transform="Bradford")
        xyz = np.einsum("ij,...j->...i", M, xyz)

        # 2. Tone, anchored on the garment's own lightness - measured inside
        #    the cloth mask, never over a frame that is mostly trees.
        lab = colour.XYZ_to_Lab(xyz)
        mask_full = np.asarray(Image.fromarray(s["mask"].astype(np.uint8) * 255)
                               .resize((lab.shape[1], lab.shape[0]), Image.NEAREST)) > 127
        garment_L_now = float(np.median(lab[mask_full][..., 0])) if mask_full.any() else float(s["lab"][0])
        shift = float(np.clip(ref_L - garment_L_now, -MAX_TONE_SHIFT, MAX_TONE_SHIFT))
        # Taper toward white so a lift cannot clip the highlights, which are
        # the one thing nothing downstream can recover.
        lab[..., 0] = np.clip(lab[..., 0] + shift * (1 - lab[..., 0] / 100), 0, 100)

        # 3. Chroma. Adapting the illuminant fixes the colour *of the light*;
        #    it does not restore saturation lost to veiling glare, haze or a
        #    badly under-exposed capture. Scaling a* and b* by one factor is
        #    hue-safe by construction - it scales the (a*, b*) vector, so
        #    atan2(b*, a*) is unchanged and only its length moves.
        #
        #    Bounded hard, because this is the step that ruined an earlier
        #    pass: a saturation bump applied to an already-saturated garment
        #    made the purple kurta read as electric on screen and nothing in
        #    the numbers caught it. Anchored on the cloth, never the frame.
        C_now = float(np.median(np.hypot(lab[mask_full][..., 1], lab[mask_full][..., 2])))
        C_ref = float(np.hypot(ref_lab[1], ref_lab[2]))
        cgain = float(np.clip(C_ref / max(C_now, 1e-6), MIN_CHROMA_GAIN, MAX_CHROMA_GAIN))
        lab[..., 1] *= cgain
        lab[..., 2] *= cgain

        out_rgb = np.clip(colour.XYZ_to_sRGB(colour.Lab_to_XYZ(lab)), 0, 1)
        dst = os.path.join(out_dir, os.path.basename(s["path"]))
        Image.fromarray((out_rgb * 255 + 0.5).astype(np.uint8)).save(
            dst, "JPEG", quality=92, subsampling=0, optimize=True)
        # Measured through the *source* mask, so before and after describe the
        # same cloth. Re-segmenting the output would let the measurement drift
        # onto a different region and quietly flatter the result.
        after_lab = np.median(colour.XYZ_to_Lab(colour.sRGB_to_XYZ(out_rgb))[mask_full], axis=0)
        results.append({"src": s["path"], "dst": dst, "before": s["lab"],
                        "after": after_lab, "shift": shift, "illum": illum,
                        "cgain": cgain})
    return results, ref_lab


def spread(labs: np.ndarray) -> tuple[float, float]:
    ds = [float(colour.difference.delta_E_CIE2000(labs[i], labs[j]))
          for i in range(len(labs)) for j in range(i + 1, len(labs))]
    return float(np.mean(ds)), float(np.max(ds))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("sources", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--reference", help="filename whose colour is correct in the hand")
    ap.add_argument("--target-L", type=float)
    a = ap.parse_args()

    res, ref = harmonise(a.sources, a.out, a.reference, a.target_L)
    before = np.array([r["before"] for r in res])
    after = np.array([r["after"] for r in res])

    print(f"  reference L*a*b*  {ref[0]:.1f} {ref[1]:.1f} {ref[2]:.1f}"
          f"   ({a.reference or 'median of the shoot'})\n")
    print("  photo".ljust(22), "     before L*a*b*", "      after L*a*b*",
          "  tone  chroma   dE to ref")
    for r, b, af in zip(res, before, after):
        d_ref = float(colour.difference.delta_E_CIE2000(af, ref))
        flag = "   <- beyond correction" if d_ref > 5 else ""
        print("  " + os.path.basename(r["src"])[-6:].ljust(20),
              "".join(f"{v:7.1f}" for v in b), " ",
              "".join(f"{v:7.1f}" for v in af),
              f"  {r['shift']:+5.1f}   x{r['cgain']:.2f}   {d_ref:6.2f}{flag}")
    bm, bw = spread(before)
    am, aw = spread(after)
    print(f"\n  spread across the shoot (dE2000, same cloth):")
    print(f"    before   mean {bm:5.2f}   worst {bw:5.2f}")
    print(f"    after    mean {am:5.2f}   worst {aw:5.2f}")
