import type { VariantManifest } from './schema';

/**
 * Version numbers are derived from the run number of Omni's `release.yml` (omni-plan D13,
 * Appendix B). Majors and bases are chosen so every Omni build sorts above every legacy build.
 * Keep in sync with `packages/config-plugins/src/versioning.js` (used by app.config.ts and CI);
 * the shared test `versioning.test.ts` asserts both produce the same numbers.
 */
export interface VariantVersion {
  /** Store marketing version, e.g. `8.12`. */
  version: string;
  /** Android versionCode and iOS CFBundleVersion. */
  buildNumber: number;
  /** electron-builder requires semver. */
  electronVersion: string;
  /** Git tag / GitHub Release name, e.g. `unit-v8.12`. */
  tag: string;
}

export function computeVariantVersion(manifest: Pick<VariantManifest, 'versioning'>, runNumber: number): VariantVersion {
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
