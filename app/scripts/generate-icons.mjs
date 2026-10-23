#!/usr/bin/env node
/**
 * Generates the Smartrays app icon (2026-10-23) from the web's logo:
 *   node scripts/generate-icons.mjs        (run from app/)
 *
 * Source: frontend/src/assets/logo-horizontal.png — the triangle "S" mark is
 * cut from its left end (the wordmark is unreadable at icon size).
 *
 * The source has a dark, speckled fringe around every edge (anti-aliasing
 * against a dark background). It is cleaned before anything is drawn: dark,
 * unsaturated, part-transparent edge pixels are dropped, then the alpha edge
 * is smoothed.
 *
 * Writes:
 * - mipmap-<density>/ic_launcher.png, ic_launcher_round.png — legacy (pre-Android 8)
 *   square and round icons, mark on the splash background colour;
 * - mipmap-<density>/ic_launcher_foreground.png, ic_launcher_monochrome.png and
 *   mipmap-anydpi-v26/ic_launcher(.xml, _round.xml) — adaptive icons with a
 *   colour background matching the splash (#fbfbfa) and a themed (Android 13)
 *   monochrome layer;
 * - app/store/play-icon-512.png — the Play Store listing icon (full bleed;
 *   Play applies its own mask).
 *
 * sharp comes with react-native-bootsplash (its own asset generator uses it).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.resolve(APP, "../frontend/src/assets/logo-horizontal.png");
const RES = path.join(APP, "android/app/src/main/res");
const STORE = path.join(APP, "store");
const BACKGROUND = "#fbfbfa"; // = bootsplash_background (values/colors.xml)

// Launcher sizes per density: legacy icon (48 dp) and adaptive layer (108 dp).
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** The mark, cut from the logo, its fringe cleaned, trimmed to its own edges. */
async function cleanMark() {
  const { width, height } = await sharp(SOURCE).metadata();
  // The mark is the left end of the horizontal logo: roughly as wide as it is tall.
  const markWidth = Math.round(height * 1.18);
  const { data, info } = await sharp(SOURCE)
    .extract({ left: 0, top: 0, width: Math.min(markWidth, width), height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    // The fringe: dark and grey (the mark itself is saturated blue / green),
    // or light grey specks — never part of the mark.
    // Measured on the source: the fringe is near-black at 25–45 % opacity,
    // then one dull, part-transparent pixel before the true colours start.
    const nearBlack = max < 60;
    const dullEdge = a < 220 && saturation < 0.5;
    const lightGrey = saturation < 0.12 && max > 110;
    if (nearBlack || dullEdge || lightGrey || a < 40) data[i + 3] = 0;
  }

  // Smooth the alpha edge: a light blur of the alpha channel, then a gentle threshold.
  const raw = await sharp(data, { raw: info }).png().toBuffer();
  const alpha = await sharp(raw).extractChannel("alpha").blur(0.8).linear(1.3, -30).toBuffer();
  const rgb = await sharp(raw).removeAlpha().toBuffer();
  return sharp(rgb).joinChannel(alpha).trim({ threshold: 1 }).png().toBuffer();
}

async function placed(mark, canvas, markFraction, background) {
  const size = Math.round(canvas * markFraction);
  const resized = await sharp(mark).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, gravity: "center" }])
    .png();
}

function rounded(canvas, radius) {
  return Buffer.from(`<svg width="${canvas}" height="${canvas}"><rect width="${canvas}" height="${canvas}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
}

function circle(canvas) {
  return Buffer.from(`<svg width="${canvas}" height="${canvas}"><circle cx="${canvas / 2}" cy="${canvas / 2}" r="${canvas / 2}" fill="#fff"/></svg>`);
}

async function main() {
  const mark = await cleanMark();
  fs.mkdirSync(STORE, { recursive: true });

  for (const [density, scale] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    const legacy = Math.round(48 * scale);
    const layer = Math.round(108 * scale);

    // Legacy: mark on the splash colour, rounded square / circle.
    const square = await (await placed(mark, legacy, 0.68, BACKGROUND)).toBuffer();
    await sharp(square).composite([{ input: rounded(legacy, Math.round(legacy * 0.2)), blend: "dest-in" }]).png().toFile(path.join(dir, "ic_launcher.png"));
    await sharp(square).composite([{ input: circle(legacy), blend: "dest-in" }]).png().toFile(path.join(dir, "ic_launcher_round.png"));

    // Adaptive foreground: the mark inside the 66 dp safe zone of the 108 dp layer.
    await (await placed(mark, layer, 0.56)).toFile(path.join(dir, "ic_launcher_foreground.png"));
    // Monochrome (themed icons): the mark's shape in one colour; Android tints it.
    const foreground = await (await placed(mark, layer, 0.56)).toBuffer();
    const shape = await sharp(foreground).extractChannel("alpha").toBuffer();
    await sharp({ create: { width: layer, height: layer, channels: 3, background: "#000000" } })
      .joinChannel(shape)
      .png()
      .toFile(path.join(dir, "ic_launcher_monochrome.png"));
  }

  const anydpi = path.join(RES, "mipmap-anydpi-v26");
  fs.mkdirSync(anydpi, { recursive: true });
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by app/scripts/generate-icons.mjs — do not edit by hand. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;
  fs.writeFileSync(path.join(anydpi, "ic_launcher.xml"), adaptive);
  fs.writeFileSync(path.join(anydpi, "ic_launcher_round.xml"), adaptive);

  const colors = path.join(RES, "values/ic_launcher_background.xml");
  fs.writeFileSync(
    colors,
    `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by app/scripts/generate-icons.mjs: the adaptive icon background = the splash colour. -->
<resources>
    <color name="ic_launcher_background">${BACKGROUND}</color>
</resources>
`
  );

  // Play Store: 512×512, full bleed (Play masks it), mark a little larger.
  await (await placed(mark, 512, 0.66, BACKGROUND)).toFile(path.join(STORE, "play-icon-512.png"));
  await sharp(mark).toFile(path.join(STORE, "mark-clean.png"));
  console.log("Icons written: mipmap-*/, mipmap-anydpi-v26/, values/ic_launcher_background.xml, store/play-icon-512.png");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
