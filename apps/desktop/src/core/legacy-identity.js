'use strict';
// Desktop identity that predates Omni and is not in the variant manifest yet. These values are persisted-storage identity
// (AGENTS.md: never change without a migration and an upgrade test):
//
// - userDataDir: the profile folder under the OS app-data directory. Electron derives it from the packaged package.json
//   `name`, which was "unit", "ic" and "dispatch" in the legacy repos — and "dispatch" for BigBoard too, a copy-paste
//   leftover that made BigBoard and Dispatch share one profile and one single-instance lock. Omni gives BigBoard its own
//   folder and copies its settings and localStorage across once (migrateFrom).
// - bundleHost: the host of the app:// origin. localStorage (server URL, sign-in, preferences) is keyed by origin, so it
//   must match what each legacy app loaded: Unit and IC `app://bundle`, Dispatch `app://.`.
// - loopback: BigBoard served its export from a fixed loopback origin instead of app://; existing boards keep it.
// - settingsIpc: BigBoard's main-process settings store (server URL survives an origin change).
//
// TODO(manifest): move these into `identity.electron` of each variant manifest and validate them in @resgrid/config.

/** @type {Record<string, { userDataDir: string, bundleHost: string, loopback?: { host: string, port: number }, settingsIpc?: boolean, migrateFrom?: { dir: string, marker: string, entries: string[] } }>} */
const LEGACY_DESKTOP_IDENTITY = {
  // New on desktop in Omni: Electron's default folder name for its product name.
  responder: { userDataDir: 'Resgrid Responder', bundleHost: 'bundle' },
  unit: { userDataDir: 'unit', bundleHost: 'bundle' },
  ic: { userDataDir: 'ic', bundleHost: 'bundle' },
  dispatch: { userDataDir: 'dispatch', bundleHost: '.' },
  bigboard: {
    userDataDir: 'resgrid-bigboard',
    bundleHost: 'bundle',
    loopback: { host: '127.0.0.1', port: 29317 },
    settingsIpc: true,
    // settings.json is written only by BigBoard, so its presence marks a legacy BigBoard profile (not a Dispatch one).
    migrateFrom: { dir: 'dispatch', marker: 'settings.json', entries: ['settings.json', 'Local Storage'] },
  },
};

module.exports = { LEGACY_DESKTOP_IDENTITY };
