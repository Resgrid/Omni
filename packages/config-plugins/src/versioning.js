// Version numbers derived from Omni's release.yml run number (omni-plan D13, Appendix B).
// Mirror of packages/config/src/versioning.ts — a shared test asserts both agree.

/**
 * @param {{ versioning: { major: number, buildNumberBase: number, tagPrefix: string } }} manifest
 * @param {number} runNumber
 */
function computeVariantVersion(manifest, runNumber) {
  if (!Number.isInteger(runNumber) || runNumber < 0) {
    throw new Error(`Invalid release run number: ${runNumber}`);
  }
  const { major, buildNumberBase, tagPrefix } = manifest.versioning;
  const version = `${major}.${runNumber}`;
  return {
    version,
    buildNumber: buildNumberBase + runNumber,
    electronVersion: `${major}.${runNumber}.0`,
    tag: `${tagPrefix}${version}`,
  };
}

/** Local builds have no release run; they report run 0 (e.g. `8.0`). */
function runNumberFromEnv(env = process.env) {
  const raw = env.RELEASE_RUN_NUMBER;
  if (raw === undefined || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`RELEASE_RUN_NUMBER must be a non-negative integer, got "${raw}".`);
  return n;
}

module.exports = { computeVariantVersion, runNumberFromEnv };
