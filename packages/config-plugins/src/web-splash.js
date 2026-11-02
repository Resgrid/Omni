// Web and Electron splash (docs/build/app-icons-and-splash.md). apps/omni/public/index.html is the template Expo
// exports for every variant; scripts/web-export.mjs then stamps the variant's mark, name and splash colours into it.
const fs = require('fs');
const path = require('path');

const { loadVariant } = require('./variants');

const MARK_MARKER = '<!--resgrid:splash-mark-->';
const NAME_MARKER = '<!--resgrid:splash-name-->';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param {string} html exported index.html
 * @param {{ markSvg: string, name: string, background: string, backgroundDark: string }} splash
 * @returns {string}
 */
function stampWebSplash(html, { markSvg, name, background, backgroundDark }) {
  for (const marker of [MARK_MARKER, NAME_MARKER]) {
    if (!html.includes(marker)) {
      throw new Error(`index.html has no ${marker}: export from apps/omni so Expo uses public/index.html, and stamp a fresh export only once.`);
    }
  }
  if (!markSvg.trimStart().startsWith('<svg')) {
    throw new Error('The splash mark must be an <svg> element.');
  }
  for (const color of [background, backgroundDark]) {
    if (!HEX_COLOR.test(color)) throw new Error(`Invalid splash colour "${color}".`);
  }
  const colors = `<style id="resgrid-splash-colors">:root{--rg-splash-bg:${background};--rg-splash-bg-dark:${backgroundDark}}</style>`;
  return html
    .replace(MARK_MARKER, () => markSvg.trim())
    .replace(NAME_MARKER, () => escapeHtml(name))
    .replace('</head>', () => `${colors}</head>`);
}

/** Stamps dist/<variant>/index.html in place with the variant's splash-mark.svg and manifest colours. */
function stampVariantWebSplash({ variant, distDir }) {
  const manifest = loadVariant(variant);
  const assets = path.resolve(__dirname, '..', '..', '..', 'apps', 'omni', 'variants', variant, 'assets');
  const index = path.join(distDir, 'index.html');
  const html = stampWebSplash(fs.readFileSync(index, 'utf8'), {
    markSvg: fs.readFileSync(path.join(assets, 'splash-mark.svg'), 'utf8'),
    name: manifest.identity.name,
    background: manifest.identity.splashBackground,
    backgroundDark: manifest.identity.splashBackgroundDark,
  });
  fs.writeFileSync(index, html);
  return index;
}

module.exports = { stampWebSplash, stampVariantWebSplash };
