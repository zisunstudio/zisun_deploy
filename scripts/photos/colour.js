/**
 * Colour science for the photograph pipeline.
 *
 * The first version of `correct.js` multiplied gamma-encoded sRGB values and
 * called the result an exposure change. It is not one. A multiply in sRGB is
 * a multiply of a perceptual encoding, so it distorts chroma and rotates hue
 * as a side effect — measured on ZISUN's own catalogue it moved colour by a
 * mean ΔE2000 of up to **10.7**, with chroma +10 and hue +6.7°, on a script
 * whose comment claimed it did not touch hue. It was asserted, never
 * measured. That is the difference between a heuristic and engineering.
 *
 * So the pipeline is rebuilt on the actual model:
 *
 *   sRGB  --(EOTF)-->  linear light  --> CIEXYZ(D65) --> CIELAB
 *
 * Exposure and tone are then applied to **L* only**, and a* and b* are carried
 * through untouched. Hue and chroma are therefore preserved *by
 * construction* rather than by hope: Δh and ΔC* are zero because nothing in
 * the transform can change them, and the residual ΔE is lightness alone,
 * which is what a correction is supposed to change.
 *
 * Everything here is the published definition — sRGB IEC 61966-2-1, CIELAB,
 * CIEDE2000 (Sharma, Wu & Dalal 2005). No approximations, no magic numbers
 * beyond the standards' own constants.
 */

// ── sRGB transfer function (IEC 61966-2-1) ───────────────────────────────────

/** Gamma-encoded 0…255 → linear light 0…1. */
function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear light 0…1 → gamma-encoded 0…255, clamped. */
function linearToSrgb(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

// ── CIEXYZ (D65) ─────────────────────────────────────────────────────────────

const WHITE = { X: 0.95047, Y: 1.0, Z: 1.08883 }; // D65, 2° observer

function linearRgbToXyz(R, G, B) {
  return {
    X: 0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
    Y: 0.2126729 * R + 0.7151522 * G + 0.0721750 * B,
    Z: 0.0193339 * R + 0.1191920 * G + 0.9503041 * B,
  };
}

function xyzToLinearRgb(X, Y, Z) {
  return {
    R: 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    G: -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z,
    B: 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  };
}

// ── CIELAB ───────────────────────────────────────────────────────────────────

const E = 216 / 24389;   // 0.008856
const K = 24389 / 27;    // 903.3

const fwd = (t) => (t > E ? Math.cbrt(t) : (K * t + 16) / 116);
const inv = (t) => (t ** 3 > E ? t ** 3 : (116 * t - 16) / K);

/** Gamma-encoded sRGB bytes → CIELAB. */
function rgbToLab(r, g, b) {
  const { X, Y, Z } = linearRgbToXyz(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
  const fx = fwd(X / WHITE.X), fy = fwd(Y / WHITE.Y), fz = fwd(Z / WHITE.Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIELAB → gamma-encoded sRGB bytes. */
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const { R, G, B } = xyzToLinearRgb(inv(fx) * WHITE.X, inv(fy) * WHITE.Y, inv(fz) * WHITE.Z);
  return [linearToSrgb(R), linearToSrgb(G), linearToSrgb(B)];
}

// ── CIEDE2000 (Sharma, Wu & Dalal 2005) ──────────────────────────────────────

const RAD = Math.PI / 180, DEG = 180 / Math.PI;

/**
 * Perceptual colour difference. The unit that matters for apparel:
 * 1 ≈ just noticeable, 2–3 noticeable side by side, >5 a different colour.
 */
function deltaE2000(L1, a1, b1, L2, a2, b2) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const Cb7 = Cb ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);

  let hp1 = Math.atan2(b1, ap1) * DEG; if (hp1 < 0) hp1 += 360;
  let hp2 = Math.atan2(b2, ap2) * DEG; if (hp2 < 0) hp2 += 360;

  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1 * Cp2 !== 0) {
    dhp = hp2 - hp1;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp * RAD) / 2);

  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hpb;
  if (Cp1 * Cp2 === 0) hpb = hp1 + hp2;
  else {
    hpb = hp1 + hp2;
    if (Math.abs(hp1 - hp2) > 180) hpb += hpb < 360 ? 360 : -360;
    hpb /= 2;
  }

  const T = 1 - 0.17 * Math.cos((hpb - 30) * RAD)
              + 0.24 * Math.cos(2 * hpb * RAD)
              + 0.32 * Math.cos((3 * hpb + 6) * RAD)
              - 0.20 * Math.cos((4 * hpb - 63) * RAD);

  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const Sc = 1 + 0.045 * Cpb;
  const Sh = 1 + 0.015 * Cpb * T;

  const dTheta = 30 * Math.exp(-(((hpb - 275) / 25) ** 2));
  const Cpb7 = Cpb ** 7;
  const Rc = 2 * Math.sqrt(Cpb7 / (Cpb7 + 25 ** 7));
  const Rt = -Rc * Math.sin(2 * dTheta * RAD);

  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

// ── Robust statistics ────────────────────────────────────────────────────────

/**
 * Percentiles, not means.
 *
 * The mean of a frame is dominated by whatever occupies the most pixels,
 * which in a product photograph is usually the background. One bright sky
 * drags the mean up and the correction then *darkens* the garment. The
 * median and the tails describe the picture; the mean describes the wall
 * behind it.
 */
function percentiles(values, ps) {
  const sorted = Float64Array.from(values).sort();
  return ps.map((p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))]);
}

module.exports = {
  srgbToLinear, linearToSrgb,
  linearRgbToXyz, xyzToLinearRgb,
  rgbToLab, labToRgb,
  deltaE2000,
  percentiles,
};
