"""Find the garment in a photograph, and say what colour it is.

Every tonal or colour decision in this pipeline was previously anchored on
whole-frame statistics, and these photographs are mostly *not* the garment -
they are trees, road, wall and sky. A median taken over the frame describes
the background, so the correction it drives is aimed at the wrong thing.

This module answers the only question the rest of the pipeline needs: which
pixels are the cloth, and what is its colour in CIELAB.

The method is deliberately not a neural network. The garment in a ZISUN
photograph is the large, saturated, centrally-placed region, and that is
enough structure to solve for directly:

  1. Take the central half of the frame, where the garment always is.
  2. Cluster those pixels in the a*b* plane - chromaticity only, so that
     light and shade on one cloth stay in one cluster instead of splitting
     into two.
  3. Of the clusters big enough to be the subject, keep the most
     **saturated** one - not the most populous. Dyed cloth is the most
     chromatic large thing in these frames; hair, skin, road and wall all
     sit nearer the neutral axis. Choosing by population instead put the
     mask on the model's hair in one frame, which reported a violet co-ord
     set as a muted brown and asked the pipeline to correct the whole shoot
     towards it.
  4. Grow the mask over the whole frame by CIEDE2000 proximity to that
     centroid, which picks up the sleeve or dupatta that fell outside the
     central box.

Transforms come from `colour-science`, not from hand-typed formulae.
"""
from __future__ import annotations

import numpy as np
from PIL import Image
import colour

MAX_EDGE = 520          # measurement resolution; the statistics are stable well below full size
CENTRAL = 0.50          # fraction of width/height taken as "where the garment is"
MIN_CHROMA = 8.0        # below this a cluster is a grey road or a white wall
MIN_SHARE = 0.12        # and below this it is a detail, not the subject
MASK_DE = 26.0          # CIEDE2000 radius for growing the mask outward


def load_lab(path: str, max_edge: int = MAX_EDGE) -> np.ndarray:
    """Photograph -> CIELAB array (H, W, 3), through linear light and XYZ D65."""
    img = Image.open(path).convert("RGB")
    img.thumbnail((max_edge, max_edge), Image.LANCZOS)
    rgb = np.asarray(img, dtype=np.float64) / 255.0
    return colour.XYZ_to_Lab(colour.sRGB_to_XYZ(rgb))


def _kmeans_ab(ab: np.ndarray, k: int = 3, iters: int = 30, seed: int = 0):
    """Tiny k-means on the a*b* plane. No sklearn dependency for 3 centroids."""
    rng = np.random.default_rng(seed)
    centres = ab[rng.choice(len(ab), k, replace=False)]
    for _ in range(iters):
        d = np.linalg.norm(ab[:, None, :] - centres[None, :, :], axis=2)
        lab = d.argmin(axis=1)
        new = np.array([ab[lab == i].mean(axis=0) if np.any(lab == i) else centres[i]
                        for i in range(k)])
        if np.allclose(new, centres, atol=1e-3):
            break
        centres = new
    counts = np.array([(lab == i).sum() for i in range(k)])
    return centres, counts


def garment_mask(lab: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Boolean mask of the cloth, and its median L*a*b*."""
    h, w, _ = lab.shape
    y0, y1 = int(h * (1 - CENTRAL) / 2), int(h * (1 + CENTRAL) / 2)
    x0, x1 = int(w * (1 - CENTRAL) / 2), int(w * (1 + CENTRAL) / 2)
    centre = lab[y0:y1, x0:x1].reshape(-1, 3)

    centres, counts = _kmeans_ab(centre[:, 1:])
    chroma = np.hypot(centres[:, 0], centres[:, 1])
    share = counts / counts.sum()
    viable = np.where((chroma >= MIN_CHROMA) & (share >= MIN_SHARE))[0]
    if len(viable):
        pick = int(viable[chroma[viable].argmax()])          # most saturated
    else:                                                     # a grey frame
        pick = int(counts.argmax())
    seed_ab = centres[pick]

    # Median L* of the seeded cluster, so the reference is a real colour of
    # the cloth rather than a chromaticity with an invented lightness.
    d_centre = np.linalg.norm(centre[:, 1:] - seed_ab, axis=1)
    seed_L = float(np.median(centre[d_centre < 12][:, 0])) if np.any(d_centre < 12) \
        else float(np.median(centre[:, 0]))
    seed = np.array([seed_L, seed_ab[0], seed_ab[1]])

    flat = lab.reshape(-1, 3)
    de = colour.difference.delta_E_CIE2000(flat, np.broadcast_to(seed, flat.shape))
    mask = (de < MASK_DE).reshape(h, w)
    if mask.sum() < 0.02 * mask.size:          # too tight to be the garment
        mask = (de < MASK_DE * 1.8).reshape(h, w)
    return mask, np.median(lab[mask], axis=0)


def describe(path: str) -> dict:
    lab = load_lab(path)
    mask, med = garment_mask(lab)
    L, a, b = med
    C = float(np.hypot(a, b))
    hdeg = float(np.degrees(np.arctan2(b, a)) % 360)
    return {
        "path": path, "share": float(mask.mean()),
        "L": float(L), "a": float(a), "b": float(b), "C": C, "h": hdeg,
        "lab": med, "mask": mask,
    }
