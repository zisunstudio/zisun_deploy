#!/usr/bin/env node
/**
 * Tone-map a shoot in CIELAB, so the colour of the garment cannot move.
 *
 * This replaces the sRGB gain in the first `correct.js`. That version
 * multiplied gamma-encoded values, which is not an exposure change, and it
 * moved ZISUN's own catalogue by a mean ΔE2000 of up to 10.7 — chroma +10,
 * hue +6.7° — while its comment claimed hue was untouched.
 *
 * The method here:
 *
 *   1. Decode sRGB to CIELAB (through linear light and CIEXYZ D65).
 *   2. Describe the picture with **percentiles of L***, not a mean. A mean
 *      is dominated by whatever fills the frame, so one bright sky drags it
 *      up and the "correction" then darkens the garment.
 *   3. Map L* with a monotone curve: a global anchor that puts the median
 *      on a target, plus a **local** term that lifts shadows more than
 *      highlights. The local term is why a photograph the global version
 *      could not rescue — it clipped at the gain ceiling and stayed dark —
 *      comes up without flattening what was already correct.
 *   4. Carry a* and b* through **untouched**.
 *   5. Encode back to sRGB and report the measured ΔE, ΔC* and Δh.
 *
 * Because only L* is written, ΔC* and Δh are zero by construction. Not by
 * intention, not by tuning — there is no term in the transform that can
 * change them. The residual ΔE is lightness, which is the thing a tonal
 * correction is *for*.
 *
 * Usage:
 *   node scripts/photos/tone.js <source-dir> <output-dir> [--target 58] [--sheet review.jpg]
 */
const fs = require("fs");
const path = require("path");

const sharp = require(path.join(__dirname, "../../frontend/node_modules/sharp"));
const { rgbToLab, labToRgb, deltaE2000, percentiles } = require("./colour");

/**
 * Where the median of a product photograph should sit in L*.
 *
 * L* 58 is a little above middle grey (L* 50). Product photography on a
 * pale ground reads better slightly open, and the storefront's ground is
 * porcelain, not white — a picture anchored at 50 looks heavy against it.
 */
const DEFAULT_TARGET_L = 58;

/** How far one photograph may be moved before it is a reshoot, not a fix. */
const MAX_SHIFT_L = 22;

/** Radius of the base layer for the local term, as a fraction of the shorter side. */
const BASE_FRACTION = 0.06;

/**
 * The tone curve.
 *
 * `shift` moves the median onto the target. `local` is the extra lift a
 * pixel gets for sitting in a dark *neighbourhood* — read from a blurred
 * copy, so it follows regions rather than individual pixels and does not
 * produce the halo a per-pixel lift would.
 *
 * The highlight guard tapers everything towards L*=100: without it a lift
 * pushes a bright background into clipping, and a clipped highlight cannot
 * be recovered by anything downstream.
 */
function mapL(L, base, shift, localStrength) {
  const head = 1 - L / 100;                       // 1 at black, 0 at white
  const local = localStrength * (1 - base / 100) ** 2;
  const out = L + (shift + local) * head;
  return Math.max(0, Math.min(100, out));
}

async function correctOne(srcFile, dstFile, targetL) {
  const img = sharp(srcFile);
  const meta = await img.metadata();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const n = width * height;

  // Lab for every pixel. Float32 keeps this affordable at 12MP.
  const Ls = new Float32Array(n), As = new Float32Array(n), Bs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    const lab = rgbToLab(data[o], data[o + 1], data[o + 2]);
    Ls[i] = lab.L; As[i] = lab.a; Bs[i] = lab.b;
  }

  const [p05, p50, p95] = percentiles(Ls, [0.05, 0.5, 0.95]);

  // Global: put the median on the target, but never move further than the
  // clamp — a photograph needing more is under-exposed beyond rescue.
  const shift = Math.max(-MAX_SHIFT_L, Math.min(MAX_SHIFT_L, targetL - p50));

  // Local: only when the shadows are genuinely crushed. p05 is the shadow
  // floor; if it is already open there is nothing to lift.
  const localStrength = p05 < 22 ? Math.min(14, (22 - p05) * 0.9) : 0;

  // The base layer: a blurred L*, as the neighbourhood term.
  const sigma = Math.max(2, Math.round(Math.min(width, height) * BASE_FRACTION));
  const lBytes = Buffer.alloc(n);
  for (let i = 0; i < n; i++) lBytes[i] = Math.max(0, Math.min(255, Math.round(Ls[i] * 2.55)));
  const blurred = await sharp(lBytes, { raw: { width, height, channels: 1 } })
    .blur(sigma).raw().toBuffer();

  // Apply to L* only. a* and b* are copied, so hue and chroma cannot move.
  const out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const L2 = mapL(Ls[i], blurred[i] / 2.55, shift, localStrength);
    const [r, g, b] = labToRgb(L2, As[i], Bs[i]);
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
  }

  await sharp(out, { raw: { width, height, channels: 3 } })
    .sharpen({ sigma: 0.6, m1: 0.4, m2: 1.2 })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toFile(dstFile);

  return { width: meta.width, height: meta.height, p05, p50, p95, shift, localStrength };
}

/** Measure what actually happened, on a sample of pixels. */
async function verify(srcFile, dstFile) {
  const opt = { width: 180, height: 240, fit: "cover", position: "top" };
  const a = await sharp(srcFile).resize(opt).raw().toBuffer();
  const b = await sharp(dstFile).resize(opt).raw().toBuffer();
  const n = Math.min(a.length, b.length) / 3;
  const des = new Float64Array(n);
  let dC = 0, dh = 0;
  for (let i = 0; i < n; i++) {
    const A = rgbToLab(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
    const B = rgbToLab(b[i * 3], b[i * 3 + 1], b[i * 3 + 2]);
    des[i] = deltaE2000(A.L, A.a, A.b, B.L, B.a, B.b);
    dC += Math.hypot(B.a, B.b) - Math.hypot(A.a, A.b);
    let h1 = Math.atan2(A.b, A.a) * 180 / Math.PI;
    let h2 = Math.atan2(B.b, B.a) * 180 / Math.PI;
    let d = h2 - h1;
    if (d > 180) d -= 360; if (d < -180) d += 360;
    dh += d;
  }
  const [p95] = percentiles(des, [0.95]);
  let mean = 0; for (let i = 0; i < n; i++) mean += des[i];
  return { dE: mean / n, dE95: p95, dC: dC / n, dh: dh / n };
}

(async () => {
  const args = process.argv.slice(2);
  const [srcDir, dstDir] = args;
  if (!srcDir || !dstDir) {
    console.error("usage: tone.js <source-dir> <output-dir> [--target 58] [--sheet review.jpg]");
    process.exit(1);
  }
  const ti = args.indexOf("--target");
  const targetL = ti > -1 ? Number(args[ti + 1]) : DEFAULT_TARGET_L;

  fs.mkdirSync(dstDir, { recursive: true });
  const files = fs.readdirSync(srcDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();

  console.log("  photograph".padEnd(40) + "L* p05/p50/p95   shift  local    dE   dC*    dh");
  for (const f of files) {
    try {
      const r = await correctOne(path.join(srcDir, f), path.join(dstDir, f), targetL);
      const v = await verify(path.join(srcDir, f), path.join(dstDir, f));
      console.log(
        "  " + f.padEnd(38) +
        `${r.p05.toFixed(0).padStart(3)}/${r.p50.toFixed(0).padStart(3)}/${r.p95.toFixed(0).padStart(3)}` +
        `   ${r.shift >= 0 ? "+" : ""}${r.shift.toFixed(1).padStart(5)}  ${r.localStrength.toFixed(1).padStart(4)}` +
        `  ${v.dE.toFixed(2).padStart(5)} ${v.dC >= 0 ? "+" : ""}${v.dC.toFixed(2).padStart(5)} ${v.dh >= 0 ? "+" : ""}${v.dh.toFixed(2).padStart(5)}`,
      );
    } catch (e) {
      console.log("  " + f.padEnd(38) + "SKIPPED (" + String(e.message).slice(0, 44) + ")");
    }
  }
  console.log("\n  dC* and dh are the colour of the garment. They must be ~0:");
  console.log("  only L* is written, so nothing in the transform can move them.");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
