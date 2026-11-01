import { getActiveVariant } from '@resgrid/config';
import { isNative, isWeb } from '@resgrid/core';

/**
 * Voice capabilities of the running app: the variant manifest (`capabilities.voice`, omni-plan §5.3) narrowed by what
 * the current platform can do. Every voice service checks these before touching a native module, so a variant without
 * CallKeep or Bluetooth never loads (or links) those modules.
 */
export interface VoiceCapabilities {
  /** LiveKit push-to-talk channels. */
  ptt: boolean;
  /** CallKit / ConnectionService call for background audio (R/U/I, iOS and Android only). */
  callKeep: boolean;
  /** BLE PTT handsets (Aina, Inrico, HYS): react-native-ble-manager on native, Web Bluetooth on web/Electron. */
  bluetoothPtt: boolean;
  /** AirPods / AVRCP media-button PTT (native only). */
  headsetButtonPtt: boolean;
  /** Keyboard / console hotkey PTT (web and Electron only). */
  desktopPtt: boolean;
  /** The variant declares background audio (`audio` background mode): scanner streams keep playing and show OS media controls. */
  backgroundAudio: boolean;
}

const NONE: VoiceCapabilities = { ptt: false, callKeep: false, bluetoothPtt: false, headsetButtonPtt: false, desktopPtt: false, backgroundAudio: false };

const hasWebBluetooth = (): boolean => typeof navigator !== 'undefined' && navigator !== null && 'bluetooth' in navigator && Boolean((navigator as { bluetooth?: unknown }).bluetooth);

export function getVoiceCapabilities(): VoiceCapabilities {
  let manifest: ReturnType<typeof getActiveVariant>;
  try {
    manifest = getActiveVariant();
  } catch {
    // No variant yet (tests, early startup): everything off rather than guessing.
    return NONE;
  }
  const voice = manifest.capabilities.voice;
  const native = isNative();
  const web = isWeb();
  return {
    ptt: voice.ptt,
    callKeep: voice.ptt && voice.callKeep && native,
    bluetoothPtt: voice.ptt && voice.bluetoothPtt && (native || (web && hasWebBluetooth())),
    headsetButtonPtt: voice.ptt && voice.headsetButtonPtt && native,
    desktopPtt: voice.ptt && voice.desktopPtt && web,
    backgroundAudio: manifest.native.iosBackgroundModes.includes('audio'),
  };
}
