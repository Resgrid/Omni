import { createMmkvBackendFactory, createMmkvStorageFiles } from './mmkv-backend';
import type { KvBackendFactory, KvPlatform, KvStorageFiles } from './types';
import type { WebKeyLayout } from './web-backend';

/** Native (iOS/Android) default: react-native-mmkv. Metro picks `platform.web.ts` on web/Electron. */
export const KV_PLATFORM: KvPlatform = 'native';

export function createDefaultKvBackendFactory(_options: { webLayout: WebKeyLayout }): KvBackendFactory {
  return createMmkvBackendFactory();
}

export function createDefaultKvStorageFiles(): KvStorageFiles | null {
  return createMmkvStorageFiles();
}
