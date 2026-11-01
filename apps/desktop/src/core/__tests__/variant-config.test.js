const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadAllVariants, loadVariant } = require('@resgrid/config-plugins');

const { artifactPrefixFor, bundleOriginFor, createVariantConfig, loadVariantConfig, validateVariantConfig } = require('../variant-config');

describe('createVariantConfig', () => {
  it('derives every variant from its manifest', () => {
    const summary = loadAllVariants().map((manifest) => {
      const config = createVariantConfig(manifest, { version: '1.2.0' });
      return [config.variant, config.appId, config.productName, config.protocol, config.userDataDir, bundleOriginFor(config), config.settingsIpc];
    });
    expect(summary).toEqual([
      ['responder', 'com.resgrid.responder', 'Resgrid Responder', 'resgrid', 'Resgrid Responder', 'app://bundle', false],
      ['unit', 'com.resgrid.unit', 'Resgrid Unit', 'resgridunit', 'unit', 'app://bundle', false],
      ['ic', 'com.resgrid.command', 'Resgrid IC', 'resgridic', 'ic', 'app://bundle', false],
      ['dispatch', 'com.resgrid.dispatch', 'Resgrid Dispatch', 'resgriddispatch', 'dispatch', 'app://.', false],
      ['bigboard', 'com.resgrid.bigboard', 'BigBoard', null, 'resgrid-bigboard', 'http://127.0.0.1:29317', true],
    ]);
  });

  it('keeps legacy identity: Electron appIds and protocols from Appendix B', () => {
    const byId = Object.fromEntries(loadAllVariants().map((m) => [m.id, createVariantConfig(m, { version: '1.0.0' })]));
    expect(byId.unit.appId).toBe('com.resgrid.unit');
    expect(byId.ic.appId).toBe('com.resgrid.command');
    expect(byId.dispatch.protocol).toBe('resgriddispatch');
    expect(byId.bigboard.migrateUserDataFrom).toEqual({ dir: 'dispatch', marker: 'settings.json', entries: ['settings.json', 'Local Storage'] });
  });

  it('sets the update feed only with a base URL', () => {
    const manifest = loadVariant('unit');
    expect(createVariantConfig(manifest, { version: '8.12.0' }).updateFeedUrl).toBeNull();
    expect(createVariantConfig(manifest, { version: '8.12.0', channel: 'internal', updateBaseUrl: 'https://dl.resgrid.com' }).updateFeedUrl).toBe('https://dl.resgrid.com/updates/unit/internal/');
  });

  it('names release assets after the product', () => {
    expect(loadAllVariants().map(artifactPrefixFor)).toEqual(['ResgridResponder', 'ResgridUnit', 'ResgridIC', 'ResgridDispatch', 'ResgridBigBoard']);
  });
});

describe('validateVariantConfig', () => {
  const valid = () => JSON.parse(JSON.stringify(createVariantConfig(loadVariant('unit'), { version: '8.1.0' })));

  it('returns a frozen config', () => {
    const config = validateVariantConfig(valid());
    expect(Object.isFrozen(config)).toBe(true);
  });

  it.each([
    ['schemaVersion', 2],
    ['variant', 'other'],
    ['appId', 'nodots'],
    ['protocol', 'http'],
    ['protocol', 'Bad Scheme'],
    ['version', '8.1'],
    ['channel', 'beta'],
    ['updateFeedUrl', 'http://cdn.example.com/'],
    ['userDataDir', '../escape'],
    ['userDataDir', 'C:\\x'],
    ['bundleHost', 'evil.com/x'],
    ['loopback', { host: '0.0.0.0', port: 29317 }],
    ['loopback', { host: '127.0.0.1', port: 80 }],
    ['settingsIpc', 'yes'],
    ['migrateUserDataFrom', { dir: '..', marker: 'x', entries: [] }],
  ])('refuses a bad %s', (field, value) => {
    const config = valid();
    config[field] = value;
    expect(() => validateVariantConfig(config)).toThrow(/variant-config\.json/);
  });

  it('refuses non-objects', () => {
    expect(() => validateVariantConfig(null)).toThrow();
    expect(() => validateVariantConfig([])).toThrow();
  });
});

describe('loadVariantConfig', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-variant-config-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reads what the build script writes', () => {
    const file = path.join(dir, 'variant-config.json');
    fs.writeFileSync(file, JSON.stringify(createVariantConfig(loadVariant('bigboard'), { version: '4.3.0' })));
    expect(loadVariantConfig(file)).toMatchObject({ variant: 'bigboard', loopback: { host: '127.0.0.1', port: 29317 } });
  });

  it('explains a missing or broken file', () => {
    expect(() => loadVariantConfig(path.join(dir, 'missing.json'))).toThrow(/build\.mjs or scripts\/dev\.mjs/);
    fs.writeFileSync(path.join(dir, 'broken.json'), '{');
    expect(() => loadVariantConfig(path.join(dir, 'broken.json'))).toThrow(/not valid JSON/);
  });
});
