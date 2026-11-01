import fs from 'node:fs';
import path from 'node:path';

import { computeVariantVersion, parseVariantManifest, VARIANT_IDS, type VariantManifest } from '../index';

const variantsDir = path.resolve(__dirname, '../../../../apps/omni/variants');
const load = (id: string): VariantManifest => parseVariantManifest(JSON.parse(fs.readFileSync(path.join(variantsDir, id, 'variant.json'), 'utf8')));

describe('variant manifests', () => {
  it.each(VARIANT_IDS)('%s matches the schema and its folder', (id) => {
    expect(load(id).id).toBe(id);
  });

  it('keeps identities unique across apps', () => {
    const manifests = VARIANT_IDS.map(load);
    const unique = (values: string[]) => new Set(values).size === values.length;
    expect(unique(manifests.map((m) => m.identity.ios.bundleIdentifier))).toBe(true);
    expect(unique(manifests.map((m) => m.identity.android.package))).toBe(true);
    expect(unique(manifests.map((m) => m.identity.easProjectId))).toBe(true);
    expect(unique(manifests.map((m) => m.identity.sentryProject))).toBe(true);
    expect(unique(manifests.map((m) => m.identity.electron.appId))).toBe(true);
    expect(unique(manifests.map((m) => m.versioning.tagPrefix))).toBe(true);
  });

  // Store continuity (AGENTS.md): these values are what the published apps use today. Changing one
  // needs a migration and an upgrade test, not an edit here.
  it.each([
    ['responder', 'com.wavetech.Resgrid', 'wtdt.resgrid.andriod', 'ResgridResponder'],
    ['unit', 'com.resgrid.unit', 'com.resgrid.unit', 'ResgridUnit'],
    ['ic', 'com.resgrid.command', 'com.resgrid.command', 'ResgridIC'],
    ['dispatch', 'com.resgrid.dispatch', 'com.resgrid.dispatch', 'ResgridDispatch'],
    ['bigboard', 'com.resgrid.bigboard', 'com.resgrid.bigboard', 'ResgridUnit'],
  ])('%s keeps its released bundle id, package and storage id', (id, bundle, pkg, mmkvId) => {
    const m = load(id);
    expect(m.identity.ios.bundleIdentifier).toBe(bundle);
    expect(m.identity.android.package).toBe(pkg);
    expect(m.storage.mmkvId).toBe(mmkvId);
  });

  // Every Omni build must sort above every legacy build (omni-plan Appendix B).
  it.each([
    ['responder', '10.312', 5080657],
    ['unit', '7.652', 7652],
    ['ic', '1.185', 1185],
    ['dispatch', '1.229', 229],
    ['bigboard', '1.134', 134],
  ])('%s run 1 is above the last legacy release %s / %d', (id, legacyVersion, legacyBuild) => {
    const v = computeVariantVersion(load(id), 1);
    expect(Number(v.version.split('.')[0])).toBeGreaterThan(Number(legacyVersion.split('.')[0]));
    expect(v.buildNumber).toBeGreaterThan(legacyBuild);
  });

  it('only declares background modes and permissions that match capabilities', () => {
    for (const m of VARIANT_IDS.map(load)) {
      const bgLocation = m.native.iosBackgroundModes.includes('location');
      expect(bgLocation).toBe(m.capabilities.location.background);
      if (!m.capabilities.voice.ptt) expect(m.native.androidPermissions).not.toContain('android.permission.RECORD_AUDIO');
      if (m.capabilities.voice.callKeep) expect(m.native.modules).toContain('callkeep');
    }
  });
});
