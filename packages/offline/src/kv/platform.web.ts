import type { KvBackendFactory, KvPlatform, KvStorageFiles } from './types';
import { createWebKvBackendFactory, type WebKeyLayout } from './web-backend';

/** Web/Electron default: localStorage with the variant's legacy key layout (never origin-wide clears). */
export const KV_PLATFORM: KvPlatform = 'web';

export function createDefaultKvBackendFactory(options: { webLayout: WebKeyLayout }): KvBackendFactory {
  return createWebKvBackendFactory({ layout: options.webLayout });
}

/** Web storage is never encrypted, so legacy web data always carries over: nothing is deleted. */
export function createDefaultKvStorageFiles(): KvStorageFiles | null {
  return null;
}
