// Web and Electron splash (docs/build/app-icons-and-splash.md): the shared public/index.html template gets each
// variant's mark, name and colours after `expo export`.
const fs = require('fs');
const os = require('os');
const path = require('path');

const { stampWebSplash, stampVariantWebSplash } = require('../src/web-splash');
const { VARIANT_IDS, loadVariant } = require('../src/variants');

const omniRoot = path.resolve(__dirname, '..', '..', '..', 'apps', 'omni');
const variantsDir = path.join(omniRoot, 'variants');
const template = fs.readFileSync(path.join(omniRoot, 'public', 'index.html'), 'utf8');
// What Expo's createTemplateHtmlAsync does with the template before the export writes it.
const exported = (title) => template.replace('%LANG_ISO_CODE%', 'en').replace('%WEB_TITLE%', title);

describe('stampWebSplash', () => {
  const splash = { markSvg: '<svg viewBox="0 0 1 1"></svg>\n', name: 'Resgrid <Unit> & Co', background: '#2a7dd5', backgroundDark: '#0e2440' };

  it('fills the mark, the escaped name and the colours, keeping the splash inside #root', () => {
    const html = stampWebSplash(exported('Resgrid Unit'), splash);
    expect(html).toContain('<div class="rg-splash-mark"><svg viewBox="0 0 1 1"></svg></div>');
    expect(html).toContain('<div class="rg-splash-name">Resgrid &lt;Unit&gt; &amp; Co</div>');
    expect(html).toContain('<style id="resgrid-splash-colors">:root{--rg-splash-bg:#2a7dd5;--rg-splash-bg-dark:#0e2440}</style></head>');
    expect(html).not.toContain('<!--resgrid:');
    // React replaces #root's children on its first render, which is what hides the splash.
    expect(html).toMatch(/<div id="root">\s*<div id="rg-splash"/);
  });

  it('refuses a page without the markers or a second stamp', () => {
    expect(() => stampWebSplash('<html><head></head><body><div id="root"></div></body></html>', splash)).toThrow(/resgrid:splash-mark/);
    expect(() => stampWebSplash(stampWebSplash(exported('x'), splash), splash)).toThrow(/stamp a fresh export only once/);
  });

  it('rejects colours that are not #rrggbb and marks that are not SVG', () => {
    expect(() => stampWebSplash(exported('x'), { ...splash, backgroundDark: 'red;}body{' })).toThrow(/Invalid splash colour/);
    expect(() => stampWebSplash(exported('x'), { ...splash, markSvg: '<img src=x>' })).toThrow(/<svg>/);
  });
});

describe('stampVariantWebSplash', () => {
  let distDir;
  beforeEach(() => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-splash-'));
  });
  afterEach(() => fs.rmSync(distDir, { recursive: true, force: true }));

  it.each(VARIANT_IDS)('%s: stamps its own mark, name and manifest colours', (variant) => {
    const { identity } = loadVariant(variant);
    fs.writeFileSync(path.join(distDir, 'index.html'), exported(identity.name));
    stampVariantWebSplash({ variant, distDir });
    const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    const mark = fs.readFileSync(path.join(variantsDir, variant, 'assets', 'splash-mark.svg'), 'utf8').trim();
    expect(mark).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1000 1000"/);
    expect(html).toContain(`<div class="rg-splash-mark">${mark}</div>`);
    expect(html).toContain(`<div class="rg-splash-name">${identity.name}</div>`);
    expect(html).toContain(`--rg-splash-bg:${identity.splashBackground};--rg-splash-bg-dark:${identity.splashBackgroundDark}`);
  });
});
