import { Protocol } from 'pmtiles';

import { withMapLibre } from '../rg/maplibre-loader.web';
import type { PmtilesProtocolHandle } from './register-pmtiles';

export type { PmtilesProtocolHandle } from './register-pmtiles';

let protocol: Protocol | null = null;

/**
 * Registers the `pmtiles://` protocol with maplibre-gl once per page (idempotent; later calls return the same handle).
 * Offline packs (§19.6) then add their archives through `handle.add(new PMTiles(source))`. maplibre-gl loads with the
 * first map; the protocol is installed then, before that map is created.
 */
export const registerPmtilesProtocol = (): PmtilesProtocolHandle => {
  if (!protocol) {
    const instance = new Protocol({ metadata: true });
    withMapLibre(({ addProtocol }) => addProtocol('pmtiles', instance.tile));
    protocol = instance;
  }
  return protocol;
};

export const isPmtilesProtocolRegistered = (): boolean => protocol !== null;

/** Test helper: forget the registration. Not for app code. */
export const resetPmtilesProtocolForTests = (): void => {
  protocol = null;
};
