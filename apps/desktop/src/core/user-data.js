'use strict';
// One-time copy of a legacy profile into this variant's own userData folder (BigBoard: legacy builds shared the
// "dispatch" folder with Dispatch). Runs before the app is ready, before the single-instance lock. No electron import
// (unit-tested).

const fs = require('fs');
const path = require('path');

/**
 * @param {{ appDataDir: string, targetDir: string, from: { dir: string, marker: string, entries: string[] } | null, fsImpl?: typeof fs }} options
 * @returns {'migrated' | 'target-exists' | 'no-legacy-profile' | 'not-configured' | 'failed'}
 */
function migrateLegacyUserData({ appDataDir, targetDir, from, fsImpl = fs }) {
  if (!from) {
    return 'not-configured';
  }
  if (fsImpl.existsSync(targetDir)) {
    return 'target-exists';
  }
  const legacyDir = path.join(appDataDir, from.dir);
  if (path.resolve(legacyDir) === path.resolve(targetDir) || !fsImpl.existsSync(path.join(legacyDir, from.marker))) {
    return 'no-legacy-profile';
  }
  try {
    fsImpl.mkdirSync(targetDir, { recursive: true });
    for (const entry of from.entries) {
      const source = path.join(legacyDir, entry);
      if (fsImpl.existsSync(source)) {
        fsImpl.cpSync(source, path.join(targetDir, entry), { recursive: true, errorOnExist: false, force: false });
      }
    }
    return 'migrated';
  } catch {
    // A half-copied profile is worse than none: start clean, the legacy folder is untouched.
    try {
      fsImpl.rmSync(targetDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    return 'failed';
  }
}

module.exports = { migrateLegacyUserData };
