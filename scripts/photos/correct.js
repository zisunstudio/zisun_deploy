#!/usr/bin/env node
/**
 * Correct a shoot so it reads as one collection.
 *
 * The photographs arrive as they are taken - a garden, a corridor, a street,
 * different light, different hour. Measured across ZISUN's first ten, the
 * brightness ranged 67 to 149: more than a factor of two, in one catalogue.
 * A customer does not see "different lighting", she sees a shop that cannot
 * keep its own pictures straight.
 *
 * This corrects each photograph ON ITS OWN MEASUREMENTS towards a common
 * target. It is not a preset, and it is not a filter applied to everything.
 *
 * WHAT IT WILL NOT DO, and this is the important part:
 *
 *   It does not touch hue. ZISUN's casts ARE the garments - the wine set
 *   measures +45 red, the purple one measures -39 green - and an ordinary
 *   auto-white-balance "corrects" those into a washed-out kurta that is not
 *   the thing being sold. A photograph that flatters a garment the customer
 *   will not receive is the same lie as a claim the cloth cannot support.
 *
 *   It does not retouch. It removes nothing from the frame, invents no
 *   pixels, and cannot fix a crease, a stray hair or a car in the
 *   background. Those are a reshoot.
 *
 * Usage:
 *   node scripts/photos/correct.js <source-dir> <output-dir>
 *   node scripts/photos/correct.js <source-dir> <output-dir> --sheet review.jpg
 *
 * The originals are never written to.
 */
const fs = require("fs");
const path = require("path");

const SHARP = path.join(__dirname, "../../frontend/node_modules/sharp");
const sharp = require(SHARP);

/** Where product photography sits on a pale site. Measured, not guessed. */
const TARGET_BRIGHTNESS = 115;

/** Clamps. A photograph beyond these is a reshoot, not a correction. */
const MIN_GAIN = 0.90;
const MAX_GAIN = 1.55;

/**
 * How much correction one photograph needs, from that photograph.
 *
 * `spread` is the distance between the channel means, and it stands in for
 * "how colourful is this frame already". A vivid garment shows a wide
 * spread, and adding saturation on top of that is exactly how the purple
 * kurta turned electric on the first pass.
 */
function planFor(stats) {
  const ch = stats.channels.slice(0, 3);
  const means = ch.map((c) => c.mean);
  const brightness = means.reduce((a, b) => a + b, 0) / 3;
  const contrastNow = ch.reduce((a, c) => a + c.stdev, 0) / 3;
  const spread = Math.max(...means) - Math.min(...means);

  const gain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_BRIGHTNESS / brightness));
  // Only a flat frame gets contrast; a punchy one is left alone.
  const contrast = contrastNow < 58 ? 1.06 : 1.0;
  // Only a dull frame gets saturation, and never a vivid one.
  const saturation = spread > 30 ? 1.0 : spread > 18 ? 1.02 : 1.05;

  return { brightness, contrastNow, spread, gain, contrast, saturation };
}

/**
 * Exposure and contrast composed into ONE linear operation.
 *
 * sharp applies its pipeline in a fixed internal order and a second
 * `.linear()` REPLACES the first rather than composing with it. Chaining
 * them silently dropped the exposure lift and made every photograph darker
 * while the log reported success - which is why this does the algebra here:
 *
 *     y1 = g·x + b1 ;  y2 = c·y1 + b2  =>  y2 = (c·g)·x + (c·b1 + b2)
 */
function linearFor(gain, contrast) {
  const b1 = -(gain - 1) * 14;    // hold the blacks from going milky
  const b2 = -(contrast - 1) * 128; // pivot contrast around mid-grey
  return { a: gain * contrast, b: contrast * b1 + b2 };
}

async function correctOne(srcFile, dstFile) {
  const stats = await sharp(srcFile).stats();
  const plan = planFor(stats);
  const { a, b } = linearFor(plan.gain, plan.contrast);

  await sharp(srcFile)
    .linear(a, b)
    .modulate({ saturation: plan.saturation })
    .sharpen({ sigma: 0.7, m1: 0.5, m2: 1.6 })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toFile(dstFile);

  const after = await sharp(dstFile).stats();
  plan.after = after.channels.slice(0, 3).reduce((s, c) => s + c.mean, 0) / 3;
  return plan;
}

/** A contact sheet, because the numbers do not show an electric purple. */
async function contactSheet(srcDir, dstDir, files, out) {
  const W = 236, H = 310, GAP = 6, COLS = 5;
  const sheet = async (dir) => {
    const tiles = [];
    for (let i = 0; i < files.length; i++) {
      tiles.push({
        input: await sharp(path.join(dir, files[i])).resize(W, H, { fit: "cover", position: "top" }).toBuffer(),
        left: (i % COLS) * (W + GAP),
        top: Math.floor(i / COLS) * (H + GAP),
      });
    }
    const rows = Math.ceil(files.length / COLS);
    return sharp({ create: { width: COLS * (W + GAP) - GAP, height: rows * (H + GAP) - GAP, channels: 3, background: "#efeae4" } })
      .composite(tiles).jpeg({ quality: 88 }).toBuffer();
  };
  const before = await sheet(srcDir);
  const after = await sheet(dstDir);
  const m = await sharp(before).metadata();
  await sharp({ create: { width: m.width, height: m.height * 2 + 18, channels: 3, background: "#ffffff" } })
    .composite([{ input: before, left: 0, top: 0 }, { input: after, left: 0, top: m.height + 18 }])
    .jpeg({ quality: 86 }).toFile(out);
}

(async () => {
  const [srcDir, dstDir] = process.argv.slice(2);
  if (!srcDir || !dstDir) {
    console.error("usage: correct.js <source-dir> <output-dir> [--sheet review.jpg]");
    process.exit(1);
  }
  fs.mkdirSync(dstDir, { recursive: true });
  const files = fs.readdirSync(srcDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  if (!files.length) { console.error("no photographs in " + srcDir); process.exit(1); }

  const skipped = [];
  console.log("  photograph".padEnd(40) + "bright      sat  gain  contrast");
  for (const f of files) {
    try {
      const p = await correctOne(path.join(srcDir, f), path.join(dstDir, f));
      console.log(
        "  " + f.padEnd(38) +
        `${p.brightness.toFixed(0).padStart(3)} -> ${p.after.toFixed(0).padStart(3)}   ` +
        `${p.saturation.toFixed(2)}  ${p.gain.toFixed(2)}  ${p.contrast.toFixed(2)}`,
      );
    } catch (e) {
      // A truncated download is the usual cause. Never let one bad file end
      // the batch: the other fifty-nine are fine.
      skipped.push(f);
      console.log("  " + f.padEnd(38) + "SKIPPED (" + String(e.message).slice(0, 40) + ")");
    }
  }

  const sheetIdx = process.argv.indexOf("--sheet");
  if (sheetIdx > -1 && process.argv[sheetIdx + 1]) {
    const done = files.filter((f) => !skipped.includes(f));
    await contactSheet(srcDir, dstDir, done, process.argv[sheetIdx + 1]);
    console.log("\n  review sheet: " + process.argv[sheetIdx + 1] + "  (top = as shot, bottom = corrected)");
    console.log("  LOOK AT IT before uploading anything.");
  }
  if (skipped.length) console.log("\n  re-download and re-run: " + skipped.join(", "));
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
