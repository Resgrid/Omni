// Copies maplibre-gl's worker module into public/ so the web export serves it (omni-plan §6.4, resgrid-maps). maplibre-gl
// 6 starts its tile worker from `dist/maplibre-gl-worker.mjs`, located through import.meta.url; Metro bundles the library
// but not that file. `expo start` serves public/ at the web root and `expo export` copies it into dist/<variant> (which
// Docker and Electron ship), and the app points maplibre-gl at it (map-worker.web.ts → MapProvider `webWorkerUrl`).
// Saved as .js so every server (nginx, Electron's app:// handler, the e2e static server) sends a JavaScript MIME type,
// which module workers require.
const fs = require('fs');
const path = require('path');

/** Keep in sync with MAPLIBRE_WORKER_FILE in map-worker.web.ts (a test checks it). */
const MAPLIBRE_WORKER_FILE = 'maplibre-gl-worker.js';

function resolveWorkerSource(fromDir) {
  const pkg = require.resolve('maplibre-gl/package.json', { paths: [fromDir] });
  return path.join(path.dirname(pkg), 'dist', 'maplibre-gl-worker.mjs');
}

/**
 * Writes public/maplibre-gl-worker.js when it is missing or differs from the installed maplibre-gl's worker (a version
 * bump replaces it). Returns the target path, or null when maplibre-gl is not installed (logged, never thrown: native-only
 * work must not fail on it).
 */
function syncMapLibreWorker(projectRoot, { log = console } = {}) {
  let source;
  try {
    source = resolveWorkerSource(projectRoot);
  } catch {
    log.warn('[metro] maplibre-gl is not installed; the web map worker was not copied.');
    return null;
  }
  const target = path.join(projectRoot, 'public', MAPLIBRE_WORKER_FILE);
  const content = fs.readFileSync(source);
  let current = null;
  try {
    current = fs.readFileSync(target);
  } catch {
    current = null;
  }
  if (!current || !current.equals(content)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return target;
}

module.exports = { MAPLIBRE_WORKER_FILE, resolveWorkerSource, syncMapLibreWorker };
