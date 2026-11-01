import { Platform } from 'react-native';

type ElectronWindow = { electronAPI?: unknown; process?: { type?: string } };

/**
 * True inside the Electron shell (apps/desktop): its preload exposes `window.electronAPI`, and a
 * renderer with node integration reports `process.type === 'renderer'`. Same rule as the legacy
 * Unit/IC `lib/platform.ts`.
 */
export function detectElectron(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }
  const w = window as unknown as ElectronWindow;
  return Boolean(w.electronAPI) || w.process?.type === 'renderer';
}
