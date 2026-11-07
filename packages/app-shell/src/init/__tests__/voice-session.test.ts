import { createNotifeeForegroundService } from '@resgrid/voice';

import { activateVariant } from '../../__tests__/helpers/variants';
import { createCallKeepSetupConfig, createVoiceForegroundService, isCallKitRestrictedRegion, VOICE_CALL_CHANNEL_ID, VOICE_SESSION_CHANNEL_ID } from '../voice-session';

describe('voice session', () => {
  it('builds the CallKeep setup with the app name and translated text', () => {
    const manifest = activateVariant('dispatch');
    const config = createCallKeepSetupConfig(manifest);

    expect(config.appName).toBe('Resgrid Dispatch');
    expect(config.android.alertTitle).toBe('Permissions required');
    expect(config.android.alertDescription).toContain('Resgrid Dispatch');
    expect(config.android.foregroundService).toEqual({ channelId: VOICE_CALL_CHANNEL_ID, channelName: 'Voice calls', notificationTitle: 'Resgrid Dispatch voice call' });
  });

  it('creates the Android foreground service on its own silent channel, with text read when it starts', () => {
    const manifest = activateVariant('responder');
    createVoiceForegroundService(manifest);
    const options = jest.mocked(createNotifeeForegroundService).mock.calls.at(-1)?.[0];

    expect(options?.channelId).toBe(VOICE_SESSION_CHANNEL_ID);
    expect(options?.text()).toEqual({ channelName: 'Voice channel', title: 'Voice channel active', body: 'Push-to-talk keeps working while the app is in the background.' });
  });

  // App Store guideline 5 (IC fix): no CallKit where the device region is China.
  it('restricts CallKit only in China', () => {
    expect(isCallKitRestrictedRegion('CN')).toBe(true);
    expect(isCallKitRestrictedRegion('CHN')).toBe(true);
    expect(isCallKitRestrictedRegion('US')).toBe(false);
    expect(isCallKitRestrictedRegion(null)).toBe(false);
  });
});
