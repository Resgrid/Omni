// maplibre-gl's web worker is copied into public/ by the Metro config (metro/maplibre-worker.js) and the app points
// maplibre-gl at the same file name (map-worker.web.ts).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MAPLIBRE_WORKER_FILE, resolveWorkerSource, syncMapLibreWorker } = require('../metro/maplibre-worker');

const omniRoot = path.resolve(__dirname, '..');

describe('syncMapLibreWorker', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-maplibre-worker-'));
  });
  afterEach(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  it('copies the installed maplibre-gl worker into public/ and rewrites it only when it differs', () => {
    // resolve maplibre-gl from the real app, write into the temp project
    const source = resolveWorkerSource(omniRoot);
    const target = path.join(projectRoot, 'public', MAPLIBRE_WORKER_FILE);
    fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    fs.symlinkSync(path.dirname(path.dirname(source)), path.join(projectRoot, 'node_modules', 'maplibre-gl'), 'junction');

    expect(syncMapLibreWorker(projectRoot)).toBe(target);
    expect(fs.readFileSync(target).equals(fs.readFileSync(source))).toBe(true);

    const before = fs.statSync(target).mtimeMs;
    syncMapLibreWorker(projectRoot);
    expect(fs.statSync(target).mtimeMs).toBe(before);

    fs.writeFileSync(target, 'stale');
    syncMapLibreWorker(projectRoot);
    expect(fs.readFileSync(target).equals(fs.readFileSync(source))).toBe(true);
  });

  it('warns instead of failing when maplibre-gl is not installed', () => {
    const log = { warn: jest.fn() };
    expect(syncMapLibreWorker(projectRoot, { log })).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/maplibre-gl is not installed/));
  });

  it('uses the file name the web app asks maplibre-gl for, and the worker is a self-contained ES module', () => {
    const appSide = fs.readFileSync(path.join(omniRoot, 'map-worker.web.ts'), 'utf8');
    expect(appSide).toContain(`MAPLIBRE_WORKER_FILE = '${MAPLIBRE_WORKER_FILE}'`);
    expect(MAPLIBRE_WORKER_FILE.endsWith('.js')).toBe(true);
    // A module worker that imports a sibling chunk would need that chunk copied too.
    expect(fs.readFileSync(resolveWorkerSource(omniRoot), 'utf8')).not.toMatch(/^\s*import\s/m);
  });
});
