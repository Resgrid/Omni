import type { ApiContext } from '@resgrid/api';
import type { DurableKv } from '@resgrid/offline';

/**
 * Everything the voice package needs from the app is injected here once at startup (`configureVoice`), so voice never
 * imports auth, notifications, the app's assets or its translations:
 * - the signed-in API context (auth owns the HTTP client and token),
 * - durable storage for device preferences (the preferred Bluetooth device keeps its legacy key),
 * - the PTT/room sound assets (they live in the app bundle),
 * - the Android foreground service that keeps a voice call alive in the background (notifications owns notifee channels).
 */

/** Asset modules (`require('…mp3')`) or URLs for the PTT sounds. */
export type VoiceSoundSource = number | string | { uri: string };

export type VoiceSoundName = 'startTransmitting' | 'stopTransmitting' | 'connectedDevice' | 'connectedToAudioRoom' | 'disconnectedFromAudioRoom';

export type VoiceSoundAssets = Partial<Record<VoiceSoundName, VoiceSoundSource>>;

/** Starts/stops the Android foreground service (microphone type) that keeps PTT alive in the background. */
export interface VoiceForegroundService {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** The subset of `DurableKv` voice uses (device preferences that survive logout). */
export type VoicePreferenceStorage = Pick<DurableKv, 'getJSON' | 'setJSON' | 'delete'>;

export interface VoiceRuntimeOptions {
  /** The signed-in API context, or null while signed out. Read at call time. */
  getApiContext: () => ApiContext | null;
  storage?: VoicePreferenceStorage | null;
  sounds?: VoiceSoundAssets;
  foregroundService?: VoiceForegroundService | null;
}

interface VoiceRuntime {
  getApiContext: () => ApiContext | null;
  storage: VoicePreferenceStorage | null;
  sounds: VoiceSoundAssets;
  foregroundService: VoiceForegroundService | null;
}

const DEFAULT_RUNTIME: VoiceRuntime = { getApiContext: () => null, storage: null, sounds: {}, foregroundService: null };

let runtime: VoiceRuntime = DEFAULT_RUNTIME;

export function configureVoice(options: VoiceRuntimeOptions): void {
  runtime = {
    getApiContext: options.getApiContext,
    storage: options.storage ?? null,
    sounds: options.sounds ?? {},
    foregroundService: options.foregroundService ?? null,
  };
}

export function getVoiceRuntime(): VoiceRuntime {
  return runtime;
}

/** Test helper: restores the unconfigured runtime. Not for app code. */
export function resetVoiceRuntimeForTests(): void {
  runtime = DEFAULT_RUNTIME;
}

/** Legacy storage key (R/U/I `use-preferred-bluetooth-device`), JSON-encoded `{ id, name }`. Never rename. */
export const PREFERRED_BLUETOOTH_DEVICE_KEY = 'preferredBluetoothDevice';

/** Keys voice stores that are device preferences and must survive logout/department switch. */
export const VOICE_PRESERVED_KEYS: readonly string[] = [PREFERRED_BLUETOOTH_DEVICE_KEY];
