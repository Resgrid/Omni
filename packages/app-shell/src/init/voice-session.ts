import type { VariantManifest } from '@resgrid/config';
import { detectDeviceRegion, translate } from '@resgrid/i18n';
import { type CallKeepSetupConfig, createNotifeeForegroundService, type VoiceForegroundService } from '@resgrid/voice';

import { translateShell } from '../i18n';

/**
 * What keeps a joined voice channel alive with the app in the background (omni-plan §7.8): the Android foreground service
 * (microphone type, so a headset or BLE handset can unmute with the screen off) and the CallKeep call (CallKit on iOS,
 * a self-managed ConnectionService on Android). The legacy apps hard-coded this text in English; here it is translated.
 */

/** Android channel of the ongoing voice-session notification (silent). Never rename: a channel is fixed once created. */
export const VOICE_SESSION_CHANNEL_ID = 'voice_session';

/** Android channel CallKeep posts its call notification on. Never rename. */
export const VOICE_CALL_CHANNEL_ID = 'voice_call';

/** Regions where the App Store rejects apps that use CallKit (guideline 5; IC fix). */
export const CALLKIT_RESTRICTED_REGIONS: readonly string[] = ['CN', 'CHN'];

export const isCallKitRestrictedRegion = (region: string | null = detectDeviceRegion()): boolean => region !== null && CALLKIT_RESTRICTED_REGIONS.includes(region);

const appNameOf = (manifest: VariantManifest) => ({ appName: manifest.identity.name });

/** The Android foreground service for a voice session; its text is read each time it starts (current language). */
export function createVoiceForegroundService(manifest: VariantManifest): VoiceForegroundService {
  return createNotifeeForegroundService({
    channelId: VOICE_SESSION_CHANNEL_ID,
    text: () => ({
      channelName: translateShell('voice_session.channel_name'),
      title: translateShell('voice_session.notification_title'),
      body: translateShell('voice_session.notification_body'),
    }),
  });
}

/** CallKeep setup for the variant, translated now (the session step runs after the language has loaded). */
export function createCallKeepSetupConfig(manifest: VariantManifest): CallKeepSetupConfig {
  return {
    appName: manifest.identity.name,
    android: {
      alertTitle: translateShell('voice_session.phone_account_title'),
      alertDescription: translateShell('voice_session.phone_account_description', appNameOf(manifest)),
      cancelButton: translate('common.cancel', { defaultValue: 'Cancel' }),
      okButton: translate('common.ok', { defaultValue: 'OK' }),
      foregroundService: {
        channelId: VOICE_CALL_CHANNEL_ID,
        channelName: translateShell('voice_session.call_channel_name'),
        notificationTitle: translateShell('voice_session.call_notification_title', appNameOf(manifest)),
      },
    },
  };
}
