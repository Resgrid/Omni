// Foreground push modal store, ported from the Responder/Unit push-notification store tests (show/hide, parsing, sound
// before the modal) and adapted to typed targets.
import { configureNotificationSounds } from '../notification-sound';
import { parseNotificationData, usePushNotificationModalStore } from '../push-modal-store';
import { configureForTest, selectVariant } from './helpers';
import { mockAudioState, mockResetAudio } from './mocks/expo-audio';
import * as audio from './mocks/expo-audio';

const state = () => usePushNotificationModalStore.getState();

beforeEach(() => {
  selectVariant('responder');
  configureForTest();
  mockResetAudio();
  usePushNotificationModalStore.setState({ isOpen: false, notification: null });
  configureNotificationSounds({
    moderncallmedium: 'file://callmedium.wav',
    modernmessage: 'file://message.wav',
    modernchat: 'file://chat.wav',
    moderncallclosed: 'file://closed.wav',
    modernnotification: 'file://notification.wav',
  });
});

describe('usePushNotificationModalStore', () => {
  it('starts closed', () => {
    expect(state().isOpen).toBe(false);
    expect(state().notification).toBeNull();
  });

  it.each([
    ['C:1234', 'call', { kind: 'call', id: '1234' }],
    ['M:5678', 'message', { kind: 'message', id: '5678' }],
    ['T:9101', 'chat', { kind: 'chat', id: '9101', chatType: 'direct' }],
    ['G:1121', 'chat', { kind: 'chat', id: '1121', chatType: 'group' }],
    ['W:9012', 'weatherAlert', { kind: 'weatherAlert', id: '9012' }],
    ['CT:tok', 'communicationTest', { kind: 'communicationTest', id: 'tok' }],
    ['NA:req', 'signInApproval', { kind: 'signInApproval', id: 'req' }],
    ['NWO:3', 'workOrder', { kind: 'workOrder', id: '3' }],
    ['NC:5', 'call', { kind: 'call', id: '5', closed: true }],
  ])('shows %s as %s', async (eventCode, kind, target) => {
    await state().showNotificationModal({ eventCode, title: 'Title', body: 'Body' });
    expect(state().isOpen).toBe(true);
    expect(state().notification).toMatchObject({ eventCode, kind, target, title: 'Title', body: 'Body' });
  });

  it('shows an unknown code with no target', async () => {
    await state().showNotificationModal({ eventCode: 'X:1' });
    expect(state().notification).toMatchObject({ kind: 'unknown', target: null });
  });

  it('ignores a push without an event code', async () => {
    await state().showNotificationModal({ eventCode: '' });
    expect(state().isOpen).toBe(false);
  });

  it('replaces the shown notification with the newest one', async () => {
    await state().showNotificationModal({ eventCode: 'C:1' });
    await state().showNotificationModal({ eventCode: 'M:2' });
    expect(state().notification?.eventCode).toBe('M:2');
  });

  it('hides and clears the notification', async () => {
    await state().showNotificationModal({ eventCode: 'C:1' });
    state().hideNotificationModal();
    expect(state().isOpen).toBe(false);
    expect(state().notification).toBeNull();
  });

  it('plays the in-app sound first only when asked', async () => {
    await state().showNotificationModal({ eventCode: 'C:1' });
    expect(mockAudioState.played).toEqual([]);
    await state().showNotificationModal({ eventCode: 'M:2' }, { playSound: true });
    expect(mockAudioState.played).toEqual(['file://message.wav']);
    await state().showNotificationModal({ eventCode: 'NC:3' }, { playSound: true });
    expect(mockAudioState.played.at(-1)).toBe('file://closed.wav');
  });

  it('still shows the modal when the sound fails', async () => {
    audio.createAudioPlayer.mockImplementationOnce(() => {
      throw new Error('no audio');
    });
    await state().showNotificationModal({ eventCode: 't:1' }, { playSound: true });
    expect(state().isOpen).toBe(true);
  });

  it('uses the injected chatbot check', async () => {
    configureForTest({ isChatbotChannel: (id) => id === 'assistant' });
    expect(parseNotificationData({ eventCode: 't:assistant' }).target).toEqual({ kind: 'chatbot', id: 'assistant' });
  });
});
