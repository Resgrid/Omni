import { logger } from '@resgrid/core';

import { useBluetoothAudioStore } from '../bluetooth/bluetooth-audio-store';
import { getVoiceRuntime, HEADSET_BUTTON_PTT_ENABLED_KEY } from '../runtime';

/**
 * Settings → Voice → "Talk with the earbud button": whether the call button of earbuds and headsets starts and stops
 * talking in a voice channel (the default) or, during the channel's call, leaves the channel as the system intends. A
 * device preference: it is kept per device and survives sign-out (`VOICE_PRESERVED_KEYS`).
 */
export function setHeadsetButtonPttEnabled(enabled: boolean): void {
  useBluetoothAudioStore.getState().setMediaButtonPTTEnabled(enabled);

  try {
    getVoiceRuntime().storage?.set(HEADSET_BUTTON_PTT_ENABLED_KEY, enabled);
  } catch (error) {
    logger.warn({ message: 'Failed to save the headset button preference', context: { error } });
  }
}

/** Applies the stored preference (voice startup); nothing stored keeps the default (on). */
export function restoreHeadsetButtonPttPreference(): void {
  try {
    const stored = getVoiceRuntime().storage?.getBoolean(HEADSET_BUTTON_PTT_ENABLED_KEY);

    if (stored !== undefined) useBluetoothAudioStore.getState().setMediaButtonPTTEnabled(stored);
  } catch (error) {
    logger.warn({ message: 'Failed to read the headset button preference', context: { error } });
  }
}
