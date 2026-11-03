// The sounds the app hands to @resgrid/notifications and @resgrid/voice (notification-sounds.ts, .native.ts and
// voice-sounds.ts): web and Electron load every notification sound and custom tone from its own file, iOS/Android point
// at the copies withNotificationSounds puts in the native project, and the PTT sounds are the files Android plays.
import type { NotificationSoundAssets } from '@resgrid/notifications';
import { CUSTOM_TONES, MODERN_SOUNDS } from '@resgrid/notifications/sounds';

import { NOTIFICATION_SOUNDS } from '../notification-sounds';
import { VOICE_SOUNDS } from '../voice-sounds';

// The native file imports the sound lists from the package index; the pure-data module is enough here.
jest.mock('@resgrid/notifications', () => jest.requireActual('@resgrid/notifications/sounds'));

const ALL_SOUNDS = [...MODERN_SOUNDS, ...CUSTOM_TONES];

function loadNativeSounds(mockOs: 'ios' | 'android', mockBundleUri: string): NotificationSoundAssets {
  let sounds: NotificationSoundAssets = {};
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: mockOs } }));
    jest.doMock('expo-file-system', () => ({ Paths: { bundle: { uri: mockBundleUri } } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded per platform inside isolateModules
    sounds = (require('../notification-sounds.native') as { NOTIFICATION_SOUNDS: NotificationSoundAssets }).NOTIFICATION_SOUNDS;
  });
  return sounds;
}

describe('notification sounds on web and Electron', () => {
  it('bundles every modern sound and custom tone from its own file', () => {
    expect(Object.keys(NOTIFICATION_SOUNDS).sort()).toEqual([...ALL_SOUNDS].sort());
    for (const sound of MODERN_SOUNDS) {
      expect(NOTIFICATION_SOUNDS[sound]).toBe(`assets/audio/${sound}.wav`);
    }
    for (const tone of CUSTOM_TONES) {
      expect(NOTIFICATION_SOUNDS[tone]).toBe(`assets/audio/custom/${tone}.wav`);
    }
  });
});

describe('notification sounds on iOS and Android', () => {
  it('Android plays each sound from res/raw by its bare name', () => {
    expect(loadNativeSounds('android', 'asset:///')).toEqual(Object.fromEntries(ALL_SOUNDS.map((sound) => [sound, sound])));
  });

  it('iOS plays each sound from the root of the app bundle', () => {
    const bundle = 'file:///private/var/containers/Bundle/Application/ABC/Resgrid.app/';
    expect(loadNativeSounds('ios', bundle)).toEqual(Object.fromEntries(ALL_SOUNDS.map((sound) => [sound, `${bundle}${sound}.wav`])));
  });

  it('iOS adds the separator when the bundle URI has none', () => {
    expect(loadNativeSounds('ios', 'file:///Bundle/Resgrid.app').moderncallemergency).toBe('file:///Bundle/Resgrid.app/moderncallemergency.wav');
  });
});

describe('voice sounds', () => {
  it('are the PTT and room files withInCallAudioModule copies to res/raw', () => {
    expect(VOICE_SOUNDS).toEqual({
      startTransmitting: 'assets/audio/ui/space_notification1.mp3',
      stopTransmitting: 'assets/audio/ui/space_notification2.mp3',
      connectedDevice: 'assets/audio/ui/positive_interface_beep.mp3',
      connectedToAudioRoom: 'assets/audio/ui/software_interface_start.mp3',
      disconnectedFromAudioRoom: 'assets/audio/ui/software_interface_back.mp3',
    });
  });
});
