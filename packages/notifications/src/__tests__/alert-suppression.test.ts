// Quiet alerts (dispatchers-on-duty plan D6): a registered suppressor holds back the push modal and its sound and the
// in-app notification sounds, never `play()` itself (the Settings sound test); the push token listeners replay the
// token the server took to a subscriber that follows it (the Dispatch desk).
import { clearAlertSuppressorsForTests, isAlertSuppressed, registerAlertSuppressor } from '../alert-suppression';
import { configureNotificationSounds, notificationSoundService } from '../notification-sound';
import { usePushNotificationModalStore } from '../push-modal-store';
import { clearRegisteredPushToken, getRegisteredPushToken, notifyPushTokenRegistered, onPushTokenRegistered, resetPushTokenListenersForTests } from '../push-token-listeners';
import { configureForTest, selectVariant } from './helpers';
import { mockAudioState, mockResetAudio } from './mocks/expo-audio';

beforeEach(() => {
  selectVariant('dispatch');
  configureForTest();
  mockResetAudio();
  notificationSoundService.cleanup();
  clearAlertSuppressorsForTests();
  resetPushTokenListenersForTests();
  usePushNotificationModalStore.setState({ isOpen: false, notification: null });
  configureNotificationSounds({ moderncallmedium: 'file://callmedium.wav', modernnotification: 'file://notification.wav' });
});

afterAll(() => clearAlertSuppressorsForTests());

describe('alert suppression', () => {
  it('holds an alert back while any suppressor says so, and lets it through once removed', () => {
    expect(isAlertSuppressed({ channel: 'toast' })).toBe(false);
    const remove = registerAlertSuppressor('desk', (alert) => alert.channel !== 'sound');

    expect(isAlertSuppressed({ channel: 'toast' })).toBe(true);
    expect(isAlertSuppressed({ channel: 'sound' })).toBe(false);
    remove();
    expect(isAlertSuppressed({ channel: 'toast' })).toBe(false);
  });

  it('never lets a broken suppressor silence an alert', () => {
    registerAlertSuppressor('broken', () => {
      throw new Error('boom');
    });

    expect(isAlertSuppressed({ channel: 'presentation', eventCode: 'C1234' })).toBe(false);
  });

  it('replaces a suppressor registered under the same id, and an old remover leaves the new one alone', () => {
    const removeFirst = registerAlertSuppressor('desk', () => false);
    registerAlertSuppressor('desk', () => true);
    removeFirst();

    expect(isAlertSuppressed({ channel: 'modal' })).toBe(true);
  });

  it('shows no push modal and plays no sound for a push held back, and still shows a break push', async () => {
    registerAlertSuppressor('desk', (alert) => !(alert.eventCode ?? '').startsWith('DB:'));

    await usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 'C:1234', title: 'Structure fire' }, { playSound: true });
    expect(usePushNotificationModalStore.getState().isOpen).toBe(false);
    expect(mockAudioState.played).toEqual([]);

    await usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 'DB:b-1', title: 'Break over' });
    expect(usePushNotificationModalStore.getState().isOpen).toBe(true);
  });

  it('holds in-app notification sounds back, but never a sound played on purpose', async () => {
    registerAlertSuppressor('desk', () => true);

    await notificationSoundService.playForNotification({ kind: 'call' });
    expect(mockAudioState.played).toEqual([]);

    await notificationSoundService.play('modernnotification');
    expect(mockAudioState.played).toEqual(['file://notification.wav']);
  });
});

describe('push token listeners', () => {
  it('tells listeners about each accepted token, replays the current one to a late listener and forgets it at sign-out', () => {
    const early = jest.fn();
    const stop = onPushTokenRegistered(early);

    notifyPushTokenRegistered({ token: 'fcm-1', platform: 2 });
    expect(early).toHaveBeenCalledWith({ token: 'fcm-1', platform: 2 });

    const late = jest.fn();
    onPushTokenRegistered(late);
    expect(late).toHaveBeenCalledWith({ token: 'fcm-1', platform: 2 });

    stop();
    notifyPushTokenRegistered({ token: 'fcm-2', platform: 2 });
    expect(early).toHaveBeenCalledTimes(1);
    expect(getRegisteredPushToken()).toEqual({ token: 'fcm-2', platform: 2 });

    clearRegisteredPushToken();
    const after = jest.fn();
    onPushTokenRegistered(after);
    expect(after).not.toHaveBeenCalled();
  });

  it('ignores an empty token and keeps telling the others when one listener throws', () => {
    const good = jest.fn();
    onPushTokenRegistered(() => {
      throw new Error('boom');
    });
    onPushTokenRegistered(good);

    notifyPushTokenRegistered({ token: '', platform: 3 });
    expect(good).not.toHaveBeenCalled();
    notifyPushTokenRegistered({ token: 'web-1', platform: 3 });
    expect(good).toHaveBeenCalledWith({ token: 'web-1', platform: 3 });
  });
});
