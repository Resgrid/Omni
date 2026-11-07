// Web push service worker (docs/subsystems/web-push.md). apps/omni/public/service-worker.js is shared by the five apps;
// scripts/web-export.mjs then writes the variant's name into the exported copy, as the title of a push that arrives
// without one.
const fs = require('fs');
const path = require('path');

const { loadVariant } = require('./variants');

const SERVICE_WORKER_FILE = 'service-worker.js';
const APP_NAME = /\/\* resgrid:app-name \*\/ '[^'\n]*'/;

/**
 * @param {string} source the service worker as Expo copied it from public/
 * @param {string} name the app's name
 * @returns {string}
 */
function stampServiceWorker(source, name) {
  if (!APP_NAME.test(source)) {
    throw new Error(`${SERVICE_WORKER_FILE} has no /* resgrid:app-name */ title: export from apps/omni so Expo copies public/${SERVICE_WORKER_FILE}, and stamp a fresh export only once.`);
  }

  return source.replace(APP_NAME, () => JSON.stringify(name));
}

/** Stamps dist/<variant>/service-worker.js in place with the variant's name. */
function stampVariantServiceWorker({ variant, distDir }) {
  const file = path.join(distDir, SERVICE_WORKER_FILE);

  if (!fs.existsSync(file)) {
    throw new Error(`No ${SERVICE_WORKER_FILE} in ${distDir}: web push needs it at the site root (apps/omni/public/${SERVICE_WORKER_FILE}).`);
  }

  fs.writeFileSync(file, stampServiceWorker(fs.readFileSync(file, 'utf8'), loadVariant(variant).identity.name));

  return file;
}

module.exports = { SERVICE_WORKER_FILE, stampServiceWorker, stampVariantServiceWorker };
