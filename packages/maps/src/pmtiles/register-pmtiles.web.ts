import { addProtocol } from 'maplibre-gl';
import { Protocol } from 'pmtiles';

import type { PmtilesProtocolHandle } from './register-pmtiles';

export type { PmtilesProtocolHandle } from './register-pmtiles';

let protocol: Protocol | null = null;

/**
 * Registers the `pmtiles://` protocol with maplibre-gl once per page (idempotent; later calls return the same handle).
 * Offline packs (§19.6) then add their archives through `handle.add(new PMTiles(source))`.
 */
export const registerPmtilesProtocol = (): PmtilesProtocolHandle => {
  if (!protocol) {
    const instance = new Protocol({ metadata: true });
    addProtocol('pmtiles', instance.tile);
    protocol = instance;
  }
  return protocol;
};

export const isPmtilesProtocolRegistered = (): boolean => protocol !== null;

/** Test helper: forget the registration. Not for app code. */
export const resetPmtilesProtocolForTests = (): void => {
  protocol = null;
};
