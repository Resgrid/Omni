import fs from 'node:fs';
import path from 'node:path';

import { getActiveVariant, getCapability, hasModule, parseVariantManifest, resetActiveVariantForTests, setActiveVariant } from '../index';

const manifest = (id: string) => parseVariantManifest(JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../../apps/omni/variants/${id}/variant.json`), 'utf8')));

describe('active variant', () => {
  afterEach(() => resetActiveVariantForTests());

  it('throws before a variant is set', () => {
    expect(() => getActiveVariant()).toThrow(/No active variant/);
  });

  it('exposes capabilities and modules of the active variant', () => {
    setActiveVariant(manifest('dispatch'));
    expect(getCapability('calls').queues).toBe(true);
    expect(getCapability('incidentCommand')).toBe('assist');
    expect(hasModule('dispatch-console')).toBe(true);
    expect(hasModule('dashboard')).toBe(false);
  });

  it('refuses to switch variants at runtime', () => {
    setActiveVariant(manifest('unit'));
    expect(() => setActiveVariant(manifest('ic'))).toThrow(/cannot switch/);
  });
});
