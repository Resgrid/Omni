// The sounds the app hands to @resgrid/notifications and @resgrid/voice (notification-sounds.ts, .native.ts,
// sound-sets/<variant>.ts and voice-sounds.ts): web and Electron load every notification sound and custom tone from its
// own file, iOS/Android point at the copies withNotificationSounds puts in the native project, and the PTT sounds are the
// files Android plays. Each app's root layout configures its own sound set: the Dispatch app's own files (desk sounds
// included), the shared files for every other app.
import fs from 'node:fs';
import path from 'node:path';

import type { NotificationSoundAssets } from '@resgrid/notifications';
import { CUSTOM_TONES, DESK_SOUNDS, MODERN_SOUNDS } from '@resgrid/notifications/sounds';

import { NOTIFICATION_SOUNDS } from '../notification-sounds';
import { NOTIFICATION_SOUNDS as BIGBOARD_SOUNDS } from '../sound-sets/bigboard';
import { NOTIFICATION_SOUNDS as DISPATCH_SOUNDS } from '../sound-sets/dispatch';
import { NOTIFICATION_SOUNDS as IC_SOUNDS } from '../sound-sets/ic';
import { NOTIFICATION_SOUNDS as RESPONDER_SOUNDS } from '../sound-sets/responder';
import { NOTIFICATION_SOUNDS as UNIT_SOUNDS } from '../sound-sets/unit';
import { VOICE_SOUNDS } from '../voice-sounds';

// The native file imports the sound lists from the package index; the pure-data module is enough here.
jest.mock('@resgrid/notifications', () => jest.requireActual('@resgrid/notifications/sounds'));

const ALL_SOUNDS = [...MODERN_SOUNDS, ...CUSTOM_TONES];
const DISPATCH_SET = [...MODERN_SOUNDS, ...DESK_SOUNDS, ...CUSTOM_TONES];

function loadNativeSounds(mockOs: 'ios' | 'android', mockBundleUri: string, mockModule = '../notification-sounds.native'): NotificationSoundAssets {
  let sounds: NotificationSoundAssets = {};
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: mockOs } }));
    jest.doMock('expo-file-system', () => ({ Paths: { bundle: { uri: mockBundleUri } } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded per platform inside isolateModules
    sounds = (require(mockModule) as { NOTIFICATION_SOUNDS: NotificationSoundAssets }).NOTIFICATION_SOUNDS;
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

describe('sound set per app', () => {
  it('gives every app but Dispatch the shared sounds', () => {
    for (const sounds of [RESPONDER_SOUNDS, UNIT_SOUNDS, IC_SOUNDS, BIGBOARD_SOUNDS]) expect(sounds).toBe(NOTIFICATION_SOUNDS);
  });

  it('gives the Dispatch web and Electron build its own files under the shared names, the desk sounds and the shared custom tones', () => {
    expect(Object.keys(DISPATCH_SOUNDS).sort()).toEqual([...DISPATCH_SET].sort());

    for (const sound of [...MODERN_SOUNDS, ...DESK_SOUNDS]) expect(DISPATCH_SOUNDS[sound]).toBe(`variants/dispatch/assets/audio/${sound}.wav`);

    for (const tone of CUSTOM_TONES) expect(DISPATCH_SOUNDS[tone]).toBe(`assets/audio/custom/${tone}.wav`);
  });

  it('gives the Dispatch iOS/Android build the native copies of its set, desk sounds included', () => {
    expect(loadNativeSounds('android', 'asset:///', '../sound-sets/dispatch.native')).toEqual(Object.fromEntries(DISPATCH_SET.map((sound) => [sound, sound])));
    const bundle = 'file:///Bundle/Dispatch.app/';

    expect(loadNativeSounds('ios', bundle, '../sound-sets/dispatch.native').moderndeskoffer).toBe(`${bundle}moderndeskoffer.wav`);
  });

  it('is configured by each root layout from its own sound set module, and only there', () => {
    for (const variant of ['responder', 'unit', 'ic', 'dispatch', 'bigboard']) {
      const layout = fs.readFileSync(path.join(__dirname, '..', 'variants', variant, 'app', '_layout.tsx'), 'utf8');

      expect(layout).toContain(`import { NOTIFICATION_SOUNDS } from '../../../sound-sets/${variant}';`);
      expect(layout).toContain('configureNotificationSounds(NOTIFICATION_SOUNDS);');
    }

    expect(fs.readFileSync(path.join(__dirname, '..', 'shell-registrations.tsx'), 'utf8')).not.toContain('configureNotificationSounds(');
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
