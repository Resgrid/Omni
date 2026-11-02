#!/usr/bin/env node
// Renders every app icon, splash image and favicon of the five Omni variants from the vector masters in art.mjs into
// apps/omni/variants/<variant>/assets (docs/build/app-icons-and-splash.md). Run after changing the artwork:
//
//   pnpm --dir scripts/brand-assets install --ignore-workspace
//   node scripts/brand-assets/generate.mjs [variant ...] [--out <dir>]
//
// --out writes into <dir>/<variant>/ instead (for previews). Output is deterministic: unchanged art, unchanged bytes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import { BRAND, gradientBackground, longShadow, mark, notificationIcon, place, roundedRect, svg, VARIANTS } from './art.mjs';
import { encodeIco, encodePng } from './encode.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const variantsDir = path.resolve(here, '..', '..', 'apps', 'omni', 'variants');

const ICON = 1024;
const ICON_MARK = 600; // store icons: the mark spans ~59% of the full-bleed square
const ADAPTIVE_MARK = 448; // Android adaptive foreground: inside the 66 dp safe circle of the 108 dp canvas
const SPLASH_MARK = 640; // splash image: inside the circle Android 12+ masks the icon to (imageWidth 200 of 288 dp)
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

function render(markup, width) {
  const image = new Resvg(markup, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false }, shapeRendering: 2 }).render();
  // resvg hands out premultiplied pixels; the encoders want straight alpha.
  const rgba = Buffer.from(image.pixels);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a > 0 && a < 255) {
      rgba[i] = Math.min(255, Math.round((rgba[i] * 255) / a));
      rgba[i + 1] = Math.min(255, Math.round((rgba[i + 1] * 255) / a));
      rgba[i + 2] = Math.min(255, Math.round((rgba[i + 2] * 255) / a));
    }
  }
  return { width: image.width, height: image.height, rgba };
}

// Android themed icons use only the alpha channel: grey level becomes coverage, the colour is white.
function luminanceToAlpha(image) {
  const rgba = Buffer.from(image.rgba);
  for (let i = 0; i < rgba.length; i += 4) {
    const luminance = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    rgba[i + 3] = Math.round(luminance * rgba[i + 3]);
    rgba[i] = 255;
    rgba[i + 1] = 255;
    rgba[i + 2] = 255;
  }
  return { ...image, rgba };
}

/** Full-bleed artwork (gradient, long shadow, mark) inside an optional clip shape, on a canvas of `canvas` units. */
function artwork(variant, { canvas, markSize, shape }) {
  const id = `${variant}-art`;
  const clip = shape ? `<clipPath id="${id}-clip"><path d="${shape}"/></clipPath>` : '';
  const body = [gradientBackground(id, canvas), place(`${longShadow(id)}${mark(variant, 'light', id)}`, { canvas, size: markSize })].join('');
  return `${clip}<g${shape ? ` clip-path="url(#${id}-clip)"` : ''}>${body}</g>`;
}

// macOS Big Sur+ app icon grid: an 824 pt rounded rectangle centred on the 1024 canvas, with a soft drop shadow.
function desktopIcon(variant) {
  const inset = 100;
  const size = ICON - inset * 2;
  const shape = roundedRect(inset, inset, size, size, { tl: 185, tr: 185, br: 185, bl: 185 });
  const shadow = `<filter id="${variant}-drop" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.3"/></filter>`;
  const art = `<g transform="translate(${inset} ${inset}) scale(${size / ICON})">${artwork(variant, { canvas: ICON, markSize: ICON_MARK })}</g>`;
  return svg(ICON, `${shadow}<path d="${shape}" fill="${BRAND.gradientEnd}" filter="url(#${variant}-drop)"/><clipPath id="${variant}-desk"><path d="${shape}"/></clipPath><g clip-path="url(#${variant}-desk)">${art}</g>`);
}

// Rounded square that fills the canvas: favicons and the Windows .ico.
function roundedSquareIcon(variant, canvas) {
  const inset = canvas / 32;
  const size = canvas - inset * 2;
  const r = size * 0.225;
  const shape = roundedRect(inset, inset, size, size, { tl: r, tr: r, br: r, bl: r });
  return svg(canvas, artwork(variant, { canvas, markSize: canvas * 0.6, shape }));
}

function targets(variant) {
  return [
    // Expo `icon`, the iOS light icon and the Android 7 launcher icon; a badge target for non-store builds.
    { file: 'icon.png', png: () => render(svg(ICON, artwork(variant, { canvas: ICON, markSize: ICON_MARK })), ICON), channels: 3 },
    { file: 'ios-icon-dark.png', png: () => render(svg(ICON, place(mark(variant, 'dark'), { canvas: ICON, size: ICON_MARK })), ICON) },
    { file: 'ios-icon-tinted.png', png: () => render(svg(ICON, `<rect width="${ICON}" height="${ICON}" fill="#000"/>${place(mark(variant, 'tinted'), { canvas: ICON, size: ICON_MARK })}`), ICON), channels: 3 },
    { file: 'adaptive-icon.png', png: () => render(svg(ICON, place(`${longShadow(variant)}${mark(variant, 'light')}`, { canvas: ICON, size: ADAPTIVE_MARK })), ICON) },
    { file: 'adaptive-icon-background.png', png: () => render(svg(ICON, gradientBackground(variant, ICON)), ICON), channels: 3 },
    { file: 'adaptive-icon-monochrome.png', png: () => luminanceToAlpha(render(svg(ICON, place(mark(variant, 'monochrome'), { canvas: ICON, size: ADAPTIVE_MARK })), ICON)) },
    { file: 'splash-icon.png', png: () => render(svg(ICON, place(mark(variant, 'light'), { canvas: ICON, size: SPLASH_MARK })), ICON) },
    { file: 'favicon.png', png: () => render(roundedSquareIcon(variant, 512), 512) },
    { file: 'desktop-icon.png', png: () => render(desktopIcon(variant), ICON) },
    { file: 'notification-icon.png', png: () => render(notificationIcon(variant, 96), 96) },
    { file: 'icon.ico', bytes: () => encodeIco(ICO_SIZES.map((size) => render(roundedSquareIcon(variant, 256), size))) },
    {
      // Inlined into the web/Electron splash. The view box is the mark's box, so it centres like the native splash;
      // glyph parts outside it (Responder's check, Unit's sign) show through overflow="visible".
      file: 'splash-mark.svg',
      bytes: () => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" overflow="visible" aria-hidden="true">${mark(variant, 'light', `rg-splash-${variant}`)}</svg>\n`, 'utf8'),
    },
  ];
}

function main(argv) {
  const args = [...argv];
  const outIndex = args.indexOf('--out');
  const outRoot = outIndex >= 0 ? path.resolve(args.splice(outIndex, 2)[1]) : null;
  const unknown = args.filter((arg) => !VARIANTS.includes(arg));
  if (unknown.length) {
    console.error(`Unknown variant(s): ${unknown.join(', ')}. Expected: ${VARIANTS.join(', ')}.`);
    process.exit(1);
  }
  const variants = args.length ? args : VARIANTS;

  for (const variant of variants) {
    const dir = outRoot ? path.join(outRoot, variant) : path.join(variantsDir, variant, 'assets');
    fs.mkdirSync(dir, { recursive: true });
    for (const target of targets(variant)) {
      const bytes = target.bytes ? target.bytes() : encodePng({ ...target.png(), channels: target.channels ?? 4 });
      fs.writeFileSync(path.join(dir, target.file), bytes);
    }
    console.log(`${variant}: ${targets(variant).length} files -> ${path.relative(process.cwd(), dir) || '.'}`);
  }
}

main(process.argv.slice(2));
