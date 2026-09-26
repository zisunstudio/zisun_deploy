# Photographs

How ZISUN's product photographs are corrected before they go on the site.

`DESIGN.md` covers how a photograph is *presented* once it is up —
`components/Photo.tsx`, the framing, the focal point. This file covers what
happens to the file itself, beforehand.

---

## The problem, measured

The photographs are taken as the day allows: a garden, a hotel corridor, a
street, different hours, different light. Across ZISUN's first ten:

| | brightness (0–255) | contrast | channel spread |
|---|---|---|---|
| darkest | **67** | 55 | 24 |
| brightest | **149** | 76 | 39 |

More than a factor of two in one catalogue. A customer does not see
"different lighting" — she sees a shop that cannot keep its own pictures
straight. Everything below exists to close that gap without touching what
the garment actually looks like.

## Running it

```bash
node scripts/photos/correct.js <source-dir> <output-dir> --sheet review.jpg
```

Originals are never written to. The script prints what it did to each
photograph and writes a before/after contact sheet.

**Then look at the sheet.** That is not a nicety, it is the method — see
"Why looking is the method" below.

## What it does, and why each part

Each photograph is corrected **on its own measurements**, never by a preset
applied to the set.

- **Exposure** toward a target of **115**, clamped to ×0.90–×1.55. A
  photograph that needs more than that is a reshoot, not a correction.
- **Contrast** lifted only when the frame is flat (stdev < 58). A punchy
  photograph is left alone.
- **Saturation** raised only when the frame is dull. The test is the spread
  between channel means: above 30 it gets **nothing**. See the next section
  for why that rule exists.
- **Sharpening**, gentle and last.

## What it will not do

**It does not touch hue.** This is the rule that matters most.

ZISUN's colour "casts" *are the garments*. Measured:

```
rich wine kurta    R +45   G −30   B −15     ← the garment, not the light
purple co-ord      R  +7   G −39   B +32     ← the garment, not the light
```

An ordinary auto-white-balance reads those as errors and "corrects" them
into a washed-out kurta that is not the thing being sold. A photograph that
flatters a garment the customer will not receive is the same lie as a claim
the cloth cannot support — see the brand-claim invariant in `CLAUDE.md`.

**It does not retouch.** Nothing is removed from the frame, no pixels are
invented. It cannot fix a crease, a stray hair, or the parked cars behind
her. Those need a human or a reshoot, and for product photography a reshoot
is the honest answer.

Generative "editing" — the kind that regenerates the image — is not used
here at all. It does not edit a photograph, it produces a new one, and the
bandhani dots land somewhere else. For a clothing label that is not a
quality problem, it is a truthfulness problem.

## Why looking is the method

The first pass on these ten produced *perfect numbers*: every photograph
landed between 89 and 128, tight and consistent. It was also wrong. The
purple kurta had gone **electric** — more vivid on screen than in the hand —
because a saturation bump had been applied to a garment that was already
saturated.

No measurement caught that. Looking at the contact sheet did.

So the loop is:

1. measure every photograph
2. correct each on its own numbers
3. **look at the contact sheet**
4. find what the numbers missed
5. change the rule — not the one photograph — and run again
6. look again, and stop when it is right

Step 5 is why the saturation rule keys on `spread`. It was not designed; it
was the fix for something seen.

## Settled parameters

These produced the result accepted on 2026-09-26 and are the defaults in the
script. They are a starting point for a new shoot, not a law.

```
TARGET_BRIGHTNESS  115
gain               clamped 0.90 … 1.55
contrast           1.06 when stdev < 58, else 1.00
saturation         1.05 / 1.02 / 1.00  by channel spread  (≤18 / ≤30 / >30)
sharpen            sigma 0.7, m1 0.5, m2 1.6
output             JPEG q92, 4:4:4 chroma, mozjpeg
```

## A trap, kept because it cost an hour

`sharp` applies its pipeline in a fixed internal order, and a second
`.linear()` **replaces** the first rather than composing with it. Chaining
exposure and contrast as two calls silently dropped the exposure lift and
made every photograph *darker* — while the log happily reported the gain it
had not applied. The algebra is done in `linearFor()` for that reason:

```
y1 = g·x + b1 ;  y2 = c·y1 + b2   =>   y2 = (c·g)·x + (c·b1 + b2)
```

The symptom was "brightness 67 → 61 after a ×1.60 gain". If a correction
reports a lift and the number falls, look here first.

## Before a shoot

None of this fixes framing, and framing is where the remaining quality is:

- **One backdrop where possible.** Varying backgrounds are the strongest
  remaining signal that these are snapshots. The car park behind the wine
  set is the single biggest weakness in the current catalogue and no
  correction touches it.
- **Same distance, subject in the upper-middle**, so the automatic crop
  (`Photo.tsx`, upper third) always lands right.
- **Soft indirect light, same time of day.** This is what makes a set look
  like a collection, and it is free.

## Uploading

Corrected files go up through the console's photo uploader like any other —
`lib/downscale.ts` caps them at 2400px on the way, which is twice the widest
the storefront ever renders. Keep the originals; `product_media` is the most
expensive asset in the business.

---

## Where this actually stands (2026-09-26)

The pipeline is `scripts/photos/harmonise.py`. `correct.js` and `tone.js`
came before it and are superseded; they are kept only because the traps
recorded in them are real. Do not run them on a shoot.

### The problem, stated as a number

The founder put two photographs of one wine kurta side by side and asked
which colour the customer was supposed to believe. Measured across all six
frames of that piece, in the garment region rather than the whole frame:

```
photo     L*      a*      b*      C*      h
03      34.8    42.5    -5.2    42.8   353.1
05      29.1    39.2     7.1    39.8    10.2
06       8.8    20.3    -1.8    20.4   354.9

mean dE2000 between frames  10.0      worst  20.6
```

Lightness across a factor of four, chroma across a factor of two, hue across
seventeen degrees - on one dyed cloth, which has one reflectance and cannot
actually change between the shade of a tree and the middle of a road. dE 5
is already "a different colour". The eye was reading something real and
large.

### The method

Every bit of that spread is illuminant and exposure, so it is a correction
with a right answer rather than a matter of taste. Three steps, kept
separate so each can be measured on its own:

1. **Find the garment** (`garment.py`). Cluster the central half of the
   frame in the a*b* plane - chromaticity only, so light and shade on one
   cloth stay one cluster - and keep the most *saturated* cluster big
   enough to be the subject. Then grow the mask outward by CIEDE2000
   proximity. Dyed cloth is the most chromatic large thing in these frames;
   hair, skin, road and wall sit near the neutral axis.
2. **Remove the light.** Estimate the illuminant by Shades-of-Gray
   (Finlayson & Trezzi 2004, Minkowski p=6) over the frame's *low-chroma*
   pixels only - road, wall, overcast sky - because those surfaces are
   nearly neutral, so what the sensor recorded there is very nearly the
   light itself. Then adapt the whole frame from that illuminant to D65
   with Bradford.
3. **Tone and chroma, anchored on the cloth.** Shift L* so the garment's
   median lands on the shoot's reference, and scale a* and b* by one
   factor - which preserves hue *by construction*, since scaling the
   (a*, b*) vector cannot change `atan2(b*, a*)`. Both are clamped, and a
   frame that hits a clamp is named in the output as beyond correction.

### Measured result

```
                   before            after
wine (6 frames)    mean  9.95  worst 20.64     mean 3.47  worst 6.05
purple (4 frames)  mean  8.41  worst 15.19     mean 2.53  worst 3.70
```

Four of the six wine frames now sit within dE 0.8 of each other. 03 remains
at 4.85 and is flagged: it hit both clamps, which is the pipeline saying
this frame needs reshooting rather than correcting.

### Two mistakes this went through, both caught by measuring

**A von Kries matrix anchored on the garment.** The first attempt treated
the cloth as the white point, reasoning that one corresponding pair
determines the three unknowns. It does, but a chromatic adaptation
transform is defined between *white* tristimulus values, and a dark
saturated patch has almost no S-cone response, so the ratio it implies is
enormous. One frame came back at L* 63.8 from a tone shift of +2.3, and the
spread across the shoot got *worse*: 10.04 to 13.83. The cloth is what the
correction is checked against, never what it is anchored on.

**Choosing the mask by population.** "The most populous chromatic cluster"
put the mask on the model's hair in one frame, which reported a violet
co-ord set as a muted brown and would have dragged the whole shoot towards
it. The rule is saturation, not size. It was visible in one overlay and
invisible in every number until then, which is the same lesson as the
electric purple above: **look at the output.**

### Running it

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/photos/requirements.txt
.venv/bin/python scripts/photos/harmonise.py <src>/*.jpg --out <dst>
```

Per shoot, per piece - the reference is the median of the frames given, so
pass one garment's photographs at a time or it will harmonise a wine kurta
towards a purple one. `--reference <file>` anchors on a chosen frame
instead, which is how the founder says *this* is what the cloth looks like
in the hand. No algorithm can supply that: the maths makes the set
consistent, and only she can make it correct.

It runs on a laptop, once per shoot. Nothing here is in any deployed image
and `backend/requirements.txt` must not grow these dependencies.
