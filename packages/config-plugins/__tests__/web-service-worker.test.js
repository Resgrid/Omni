// Web push service worker (docs/subsystems/web-push.md): the shared public/service-worker.js gets each variant's name as the
// title of a push that arrives without one, after `expo export`.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const { SERVICE_WORKER_FILE, stampServiceWorker, stampVariantServiceWorker } = require('../src/web-service-worker');
const { VARIANT_IDS, loadVariant } = require('../src/variants');

const source = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'apps', 'omni', 'public', SERVICE_WORKER_FILE), 'utf8');

/** DEFAULT_TITLE as the stamped worker evaluates it. */
const defaultTitle = (code) => vm.runInNewContext(`${code}\nDEFAULT_TITLE`, { self: { addEventListener: () => undefined } });

describe('stampServiceWorker', () => {
  it('writes the name as a string literal the worker reads, quotes and all', () => {
    expect(defaultTitle(source)).toBe('Resgrid');
    expect(defaultTitle(stampServiceWorker(source, 'Resgrid \'Unit\' \\ "Test"'))).toBe('Resgrid \'Unit\' \\ "Test"');
  });

  it('refuses a worker without the marker, or a second stamp', () => {
    expect(() => stampServiceWorker("const DEFAULT_TITLE = 'Resgrid';", 'Resgrid Unit')).toThrow(/resgrid:app-name/);
    expect(() => stampServiceWorker(stampServiceWorker(source, 'Resgrid Unit'), 'Resgrid Unit')).toThrow(/stamp a fresh export only once/);
  });
});

describe('stampVariantServiceWorker', () => {
  let distDir;

  beforeEach(() => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-service-worker-'));
  });
  afterEach(() => fs.rmSync(distDir, { recursive: true, force: true }));

  it.each(VARIANT_IDS)('%s: stamps its own name into the exported worker', (variant) => {
    fs.writeFileSync(path.join(distDir, SERVICE_WORKER_FILE), source);

    expect(stampVariantServiceWorker({ variant, distDir })).toBe(path.join(distDir, SERVICE_WORKER_FILE));
    expect(defaultTitle(fs.readFileSync(path.join(distDir, SERVICE_WORKER_FILE), 'utf8'))).toBe(loadVariant(variant).identity.name);
  });

  it('fails the export when the worker is missing, since web push cannot work without it', () => {
    expect(() => stampVariantServiceWorker({ variant: 'unit', distDir })).toThrow(/No service-worker\.js/);
  });
});
