import type { OfflinePackFileStore } from './file-store';

export const OFFLINE_PACKS_DIRECTORY = 'resgrid-offline-maps';

/** Web/Electron: offline packs are out of scope for now (ambient caching only), so there is no pack store. */
export function createExpoPackFileStore(_options: { directoryName?: string } = {}): OfflinePackFileStore | null {
  return null;
}
