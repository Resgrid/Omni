// Staging a variant for packaging: web export copied (without source maps), icon and variant-config.json written.
const fs = require('fs');
const os = require('os');
const path = require('path');

const { prepareBundle } = require('../lib/prepare-bundle');

describe('prepareBundle', () => {
  let tmp;
  let web;
  const log = { warn: jest.fn() };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-prepare-'));
    web = path.join(tmp, 'dist', 'bigboard');
    fs.mkdirSync(path.join(web, '_expo', 'static', 'js'), { recursive: true });
    fs.writeFileSync(path.join(web, 'index.html'), '<html><head><title>Resgrid BigBoard</title></head></html>');
    fs.writeFileSync(path.join(web, '_expo', 'static', 'js', 'index-1.js'), 'x');
    fs.writeFileSync(path.join(web, '_expo', 'static', 'js', 'index-1.js.map'), 'map');
    log.warn.mockClear();
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('stages the export, icon and config', () => {
    const bundleDir = path.join(tmp, 'app-bundle');
    fs.mkdirSync(bundleDir);
    fs.writeFileSync(path.join(bundleDir, 'stale.txt'), 'old');

    const result = prepareBundle({ variant: 'bigboard', bundleDir, webDir: web, runNumber: 3, channel: 'internal', updateBaseUrl: 'https://dl.resgrid.com', log });

    expect(fs.existsSync(path.join(bundleDir, 'web', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(bundleDir, 'web', '_expo', 'static', 'js', 'index-1.js'))).toBe(true);
    expect(fs.existsSync(path.join(bundleDir, 'web', '_expo', 'static', 'js', 'index-1.js.map'))).toBe(false);
    expect(fs.existsSync(path.join(bundleDir, 'stale.txt'))).toBe(false);
    expect(fs.statSync(path.join(bundleDir, 'icon.png')).size).toBeGreaterThan(0);
    const config = JSON.parse(fs.readFileSync(path.join(bundleDir, 'variant-config.json'), 'utf8'));
    expect(config).toMatchObject({ variant: 'bigboard', version: '4.3.0', channel: 'internal', updateFeedUrl: 'https://dl.resgrid.com/updates/bigboard/internal/' });
    expect(result.webBytes).toBeGreaterThan(0);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('warns when the export looks like another variant', () => {
    prepareBundle({ variant: 'unit', bundleDir: path.join(tmp, 'b'), webDir: web, log });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('expected "Resgrid Unit"'));
  });

  it('explains how to build a missing export', () => {
    expect(() => prepareBundle({ variant: 'ic', bundleDir: path.join(tmp, 'b'), webDir: path.join(tmp, 'nope'), log })).toThrow(/expo export -p web --output-dir dist\/ic/);
  });

  it('can stage without an export for dev-server runs', () => {
    const bundleDir = path.join(tmp, 'dev');
    prepareBundle({ variant: 'unit', bundleDir, webDir: null, log });
    expect(fs.existsSync(path.join(bundleDir, 'variant-config.json'))).toBe(true);
    expect(fs.existsSync(path.join(bundleDir, 'web'))).toBe(false);
  });
});

describe('stageApp', () => {
  let tmp;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-stage-'));
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('stages the shell, the export and the runtime dependency closure', () => {
    const web = path.join(tmp, 'web');
    fs.mkdirSync(web);
    fs.writeFileSync(path.join(web, 'index.html'), '<html><head><title>Resgrid Unit</title></head></html>');

    const { stageApp } = require('../lib/prepare-bundle');
    const staged = stageApp({ variant: 'unit', webDir: web, runNumber: 12, appDir: path.join(tmp, 'app'), modulesDir: path.join(tmp, 'modules'), log: { warn: jest.fn() } });

    expect(JSON.parse(fs.readFileSync(path.join(tmp, 'app', 'package.json'), 'utf8'))).toMatchObject({ name: 'resgrid-unit', version: '8.12.0', main: 'src/main.js' });
    expect(fs.existsSync(path.join(tmp, 'app', 'src', 'main.js'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'app', 'src', 'preload.js'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'app', 'src', 'core', '__tests__'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'app', 'app-bundle', 'web', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'app', 'app-bundle', 'variant-config.json'))).toBe(true);

    const names = staged.modules.map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(['@eneris/push-receiver', 'electron-updater', 'protobufjs']));
    expect(names.some((name) => /^(react|react-native|expo|electron|@resgrid\/.*)$/.test(name))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'modules', 'electron-updater', 'package.json'))).toBe(true);
    expect(staged.modulesBytes).toBeLessThan(20 * 1024 * 1024);
  });
});

describe('stageRuntimeModules', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-modules-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const pkg = (dir, json) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json));
    fs.writeFileSync(path.join(dir, 'index.js'), '');
    fs.writeFileSync(path.join(dir, 'README.md'), 'docs');
  };

  it('copies the closure as Node resolves it, nested versions included, optional ones skipped', () => {
    const { stageRuntimeModules } = require('../lib/runtime-modules');
    const root = path.join(tmp, 'repo');
    const app = path.join(root, 'apps', 'desktop');
    pkg(app, { name: 'desktop' });
    pkg(path.join(root, 'node_modules', 'a'), { name: 'a', version: '1.0.0', dependencies: { b: '^1' }, optionalDependencies: { gone: '*' } });
    pkg(path.join(root, 'node_modules', 'b'), { name: 'b', version: '1.0.0', dependencies: { c: '^2' } });
    pkg(path.join(root, 'node_modules', 'c'), { name: 'c', version: '1.0.0' });
    pkg(path.join(root, 'node_modules', 'b', 'node_modules', 'c'), { name: 'c', version: '2.0.0' });
    pkg(path.join(root, 'node_modules', 'unused'), { name: 'unused', version: '1.0.0' });

    const out = path.join(tmp, 'out');
    const modules = stageRuntimeModules({ dependencies: ['a'], fromDir: app, roots: [path.join(app, 'node_modules'), path.join(root, 'node_modules')], outDir: out });

    expect(modules).toEqual([
      { name: 'a', version: '1.0.0', path: 'a' },
      { name: 'b', version: '1.0.0', path: 'b' },
      { name: 'c', version: '2.0.0', path: 'b/node_modules/c' },
    ]);
    expect(fs.existsSync(path.join(out, 'b', 'node_modules', 'c', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'c'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'unused'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'a', 'README.md'))).toBe(false);
  });

  it('fails loudly when a required dependency is missing', () => {
    const { stageRuntimeModules } = require('../lib/runtime-modules');
    const app = path.join(tmp, 'app');
    pkg(app, { name: 'desktop' });
    expect(() => stageRuntimeModules({ dependencies: ['not-installed-anywhere-xyz'], fromDir: app, roots: [path.join(tmp, 'node_modules')], outDir: path.join(tmp, 'out') })).toThrow(/not installed/);
  });
});
