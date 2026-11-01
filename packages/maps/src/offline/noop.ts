import type { MapOfflineOptions, OfflineMapPackRecord, OfflinePackRegistry, OfflineStyleComposer } from './types';

/** A registry with nothing in it: the default until the §19.5 download manager lands. */
export const noopOfflinePackRegistry: OfflinePackRegistry = {
  list: async (): Promise<OfflineMapPackRecord[]> => [],
  get: async (): Promise<OfflineMapPackRecord | null> => null,
  upsert: async (): Promise<void> => undefined,
  remove: async (): Promise<void> => undefined,
  markUsed: async (): Promise<void> => undefined,
  totalBytes: async (): Promise<number> => 0,
  wipe: async (): Promise<void> => undefined,
};

/** Never produces an offline style, so maps stay on the online department style. */
export const noopOfflineStyleComposer: OfflineStyleComposer = {
  compose: () => null,
};

/** Offline options that keep every map online. */
export const onlineOnlyOfflineOptions: MapOfflineOptions = {
  mode: 'online',
  getStyle: () => null,
};
