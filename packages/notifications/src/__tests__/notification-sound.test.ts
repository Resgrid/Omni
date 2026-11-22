// In-app notification sounds (Unit/IC notification-sound.service), modern set only; the desk sounds where the app's sound
// set has them (Dispatch).
import { resetActiveVariantForTests } from '@resgrid/config';

import { KIND_SOUNDS, notificationSoundService, soundForNotification } from '../notification-sound';
import { isModernSound, soundForDeskEvent } from '../sounds';
import { selectVariant } from './helpers';
import * as audio from './mocks/expo-audio';
import { mockAudioState, mockResetAudio } from './mocks/expo-audio';

const rn = jest.requireMock('react-native') as { Platform: { OS: string } };

beforeEach(() => {
  rn.Platform.OS = 'ios';
  notificationSoundService.cleanup();
  mockResetAudio();
});

describe('soundForNotification', () => {
  it("prefers the server's sound type, with the channel mapping", () => {
    expect(soundForNotification({ kind: 'call', soundType: '7' })).toBe('moderncallemergency');
    expect(soundForNotification({ kind: 'call', soundType: '0' })).toBe('moderncallemergency');
    expect(soundForNotification({ kind: 'call', soundType: 'c12' })).toBe('c12');
    expect(soundForNotification({ kind: 'message', soundType: 24 })).toBe('modernweatheralert');
  });

  it('falls back to the meaning of the notification', () => {
    expect(soundForNotification({ kind: 'call' })).toBe('moderncallmedium');
    expect(soundForNotification({ kind: 'call', closed: true })).toBe('moderncallclosed');
    expect(soundForNotification({ kind: 'chat', soundType: 'bogus' })).toBe('modernchat');
    expect(soundForNotification({ kind: 'unknown' })).toBe('modernnotification');
  });

  it('uses only modern sounds', () => {
    for (const sound of Object.values(KIND_SOUNDS)) {
      expect(isModernSound(sound)).toBe(true);
    }
  });
});

describe('notificationSoundService', () => {
  it('loads a configured asset module once and plays it from the start', async () => {
    notificationSoundService.configure({ modernchat: 42 });
    await notificationSoundService.play('modernchat');
    await notificationSoundService.play('modernchat');
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.createAudioPlayer).toHaveBeenCalledWith({ uri: 'file://asset-42' }, { keepAudioSessionActive: true });
    expect(mockAudioState.players[0].seekTo).toHaveBeenCalledWith(0);
    expect(mockAudioState.played).toEqual(['file://asset-42', 'file://asset-42']);
    expect(mockAudioState.players[0].loop).toBe(false);
    expect(audio.setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: true, interruptionMode: 'duckOthers' }));
  });

  it('plays a URI source as given and skips the audio mode on web', async () => {
    rn.Platform.OS = 'web';
    audio.setAudioModeAsync.mockClear();
    notificationSoundService.configure({ modernmessage: 'https://app.test/modernmessage.wav' });
    await notificationSoundService.playForNotification({ kind: 'message' });
    expect(mockAudioState.played).toEqual(['https://app.test/modernmessage.wav']);
    expect(audio.setAudioModeAsync).not.toHaveBeenCalled();
  });

  it('does nothing for a sound that was not configured, and never throws', async () => {
    notificationSoundService.configure({});
    await expect(notificationSoundService.play('modernshift')).resolves.toBeUndefined();
    audio.createAudioPlayer.mockImplementationOnce(() => {
      throw new Error('decoder');
    });
    notificationSoundService.configure({ modernshift: 'file://shift.wav' });
    await expect(notificationSoundService.play('modernshift')).resolves.toBeUndefined();
  });

  it('releases every player on cleanup', async () => {
    notificationSoundService.configure({ modernchat: 'file://chat.wav' });
    await notificationSoundService.play('modernchat');
    notificationSoundService.cleanup();
    expect(mockAudioState.players[0].remove).toHaveBeenCalled();
  });
});

describe('dispatcher desk sounds (types 28–32, the Dispatch sound set)', () => {
  afterEach(() => {
    resetActiveVariantForTests();
  });

  it('maps the desk sound types to the desk sounds', () => {
    expect(soundForNotification({ kind: 'notification', soundType: '28' })).toBe('moderndeskoffer');
    expect(soundForNotification({ kind: 'notification', soundType: 29 })).toBe('moderndeskqueuealert');
    expect(soundForNotification({ kind: 'message', soundType: '30' })).toBe('moderndeskmessage');
    expect(soundForNotification({ kind: 'notification', soundType: '31' })).toBe('modernbreakreminder');
    expect(soundForNotification({ kind: 'notification', soundType: '32' })).toBe('modernbreakover');
  });

  it('plays the desk sound by name and for a desk push in the Dispatch app', async () => {
    selectVariant('dispatch');
    notificationSoundService.configure({ moderndeskoffer: 'file://desk-offer.wav', modernbreakover: 'file://break-over.wav', modernnotification: 'file://notification.wav' });
    await notificationSoundService.play(soundForDeskEvent('offer'));
    await notificationSoundService.playForNotification({ kind: 'notification', soundType: '32' });
    expect(mockAudioState.played).toEqual(['file://desk-offer.wav', 'file://break-over.wav']);
  });

  it('plays the shared sound of the same meaning in an app without desk sounds', async () => {
    selectVariant('responder');
    notificationSoundService.configure({ modernnotification: 'file://notification.wav', modernmessage: 'file://message.wav' });
    await notificationSoundService.play(soundForDeskEvent('queueAlert'));
    await notificationSoundService.playForNotification({ kind: 'message', soundType: '30' });
    expect(mockAudioState.played).toEqual(['file://notification.wav', 'file://message.wav']);
  });
});
