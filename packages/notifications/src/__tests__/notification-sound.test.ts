// In-app notification sounds (Unit/IC notification-sound.service), modern set only.
import { KIND_SOUNDS, notificationSoundService, soundForNotification } from '../notification-sound';
import { isModernSound } from '../sounds';
import { mockAudioState, mockResetAudio } from './mocks/expo-audio';
import * as audio from './mocks/expo-audio';

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
