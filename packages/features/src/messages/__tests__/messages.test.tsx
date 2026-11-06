import '../../status/__tests__/test-setup';

import { securityStore, useAuthStore } from '@resgrid/auth';
import { useMessagesStore } from '@resgrid/data';
import type { DepartmentRightsResultData, MessageResultData, RecipientsResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect, useLocalSearchParams, usePreventRemove } from 'expo-router';
import React from 'react';

import { MessageDetails } from '../components/message-details';
import {
  buildMessageList,
  canRespondToMessage,
  getMessageTypeKey,
  getResponseKey,
  isMessageExpired,
  isOwnMessage,
  messageRecipientCount,
  MessageType,
  recipientSections,
  toMessageRecipients,
} from '../lib/message-format';
import { messageRoutes } from '../routes';
import MessageComposeScreen from '../screens/message-compose';
import MessageDetailScreen from '../screens/message-detail';
import MessagesScreen from '../screens/messages';

const q = { includeHiddenElements: true } as const;

const message = (MessageId: string, overrides: Partial<MessageResultData> = {}): MessageResultData =>
  ({
    MessageId,
    Subject: `Subject ${MessageId}`,
    SendingName: 'Chief Lee',
    SendingUserId: 'chief',
    Body: `Body ${MessageId}`,
    SentOn: '',
    SentOnUtc: '2030-05-10T10:00:00',
    Type: MessageType.Normal,
    ExpiredOn: '',
    Responded: false,
    Note: '',
    RespondedOn: '',
    ResponseType: '',
    IsSystem: false,
    Recipients: [],
    ...overrides,
  }) as MessageResultData;

const recipient = (Id: string, Type: string, Name: string): RecipientsResultData => ({ Id, Type, Name, Selected: false }) as RecipientsResultData;

const RECIPIENTS = [recipient('0', '', 'Everyone'), recipient('G:1', 'Groups', 'Station 1'), recipient('R:2', 'Roles', 'Medics'), recipient('P:u1', 'Personnel', 'Alex Kim'), recipient('U:5', 'Unit', 'Engine 5')];

let store: Record<string, jest.Mock>;

beforeEach(() => {
  jest.useFakeTimers();
  useToastStore.getState().clearToasts();
  useAuthStore.setState({ userId: 'me' });
  securityStore.setState({ rights: { CanCreateMessage: true } as DepartmentRightsResultData, isLoaded: true });
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.mocked(useFocusEffect).mockImplementation((effect) => React.useEffect(effect, [effect]));
  jest.mocked(usePreventRemove).mockImplementation(() => jest.fn());
  jest.mocked(router.canGoBack).mockReturnValue(true);
  store = {
    fetchInboxMessages: jest.fn(async () => undefined),
    fetchSentMessages: jest.fn(async () => undefined),
    fetchRecipients: jest.fn(async () => undefined),
    fetchMessageDetails: jest.fn(async () => null),
    sendNewMessage: jest.fn(async () => ({ outcome: 'sent' as const, id: 'evt-1' })),
    deleteMessages: jest.fn(async () => true),
    respondToMessage: jest.fn(async () => true),
    markMessageRead: jest.fn(),
  };
  useMessagesStore.setState({ inboxMessages: [], sentMessages: [], recipients: RECIPIENTS, messageDetailsById: {}, readMessageIds: [], queuedMessages: {}, loading: {}, errors: {}, writeError: null, ...store } as never);
});

afterEach(async () => {
  await act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

const toasts = () => useToastStore.getState().toasts.map((toast) => `${toast.type}:${toast.message}`);

describe('message format', () => {
  it('labels types the way Core defines them (1 = callback, 2 = poll)', () => {
    expect(getMessageTypeKey(1)).toBe('messages.types.callback');
    expect(getMessageTypeKey(2)).toBe('messages.types.poll');
    expect(getMessageTypeKey(3)).toBe('messages.types.weather_alert');
    expect(getResponseKey('2')).toBe('messages.response_maybe');
    expect(getResponseKey('Yes')).toBe('messages.response_yes');
    expect(getResponseKey('Later')).toBeNull();
  });

  it('reads a zone-less ExpiredOn as UTC', () => {
    const noon = Date.UTC(2030, 4, 10, 12, 0, 0);
    expect(isMessageExpired('2030-05-10T11:59:00', noon)).toBe(true);
    expect(isMessageExpired('2030-05-10T12:01:00', noon)).toBe(false);
    expect(isMessageExpired('', noon)).toBe(false);
    expect(isMessageExpired('garbage', noon)).toBe(false);
  });

  it('builds the list newest first without duplicates, by filter and search', () => {
    const inbox = [message('1', { SentOnUtc: '2030-05-10T08:00:00' }), message('3', { SentOnUtc: '2030-05-10T12:00:00', Subject: 'Hydrant out' })];
    const sent = [message('2', { SentOnUtc: '2030-05-10T10:00:00' }), message('3', { SentOnUtc: '2030-05-10T12:00:00' })];
    expect(buildMessageList(inbox, sent, 'all', '').map((item) => `${item.message.MessageId}:${item.isOwn}`)).toEqual(['3:false', '2:true', '1:false']);
    expect(buildMessageList(inbox, sent, 'sent', '').map((item) => item.message.MessageId)).toEqual(['3', '2']);
    expect(buildMessageList(inbox, sent, 'all', 'hydrant').map((item) => item.message.MessageId)).toEqual(['3']);
  });

  it("treats a message as the caller's own the way the list does: inbox copies can be answered, outbox-only ones cannot", () => {
    const lists = { inbox: [message('1', { SendingUserId: 'me' })], sent: [message('1', { SendingUserId: 'me' }), message('2', { SendingUserId: 'me' })] };
    expect(isOwnMessage('1', lists, null, 'me')).toBe(false);
    expect(isOwnMessage('2', lists, null, 'me')).toBe(true);
    expect(isOwnMessage('3', lists, message('3', { SendingUserId: 'me' }), 'me')).toBe(true);
    expect(isOwnMessage('3', lists, message('3', { SendingUserId: 'me', IsSystem: true }), 'me')).toBe(false);
    expect(isOwnMessage('3', lists, null, 'me')).toBe(false);
  });

  it('offers answers only on received callbacks and polls that are open', () => {
    expect(canRespondToMessage(message('1', { Type: MessageType.Poll }), false)).toBe(true);
    expect(canRespondToMessage(message('1', { Type: MessageType.Normal }), false)).toBe(false);
    expect(canRespondToMessage(message('1', { Type: MessageType.Callback }), true)).toBe(false);
    expect(canRespondToMessage(message('1', { Type: MessageType.Callback, Responded: true }), false)).toBe(false);
  });

  it('maps recipients to picker sections and Core input types and never offers units', () => {
    const sections = recipientSections(RECIPIENTS, { personnel: 'People', groups: 'Groups', roles: 'Roles' });
    expect(sections.map((section) => [section.key, section.label, section.entries.map((entry) => entry.id)])).toEqual([
      ['personnel', 'People', ['P:u1']],
      ['groups', 'Groups', ['G:1']],
      ['roles', 'Roles', ['R:2']],
    ]);
  });

  it('turns a picker selection into Core recipients: "Everyone" alone, else people, groups and roles by section', () => {
    expect(toMessageRecipients({ everyone: true, ids: { groups: ['G:1'] } }, RECIPIENTS)).toEqual([{ Id: '0', Type: 0, Name: 'Everyone' }]);
    expect(toMessageRecipients({ everyone: false, ids: { roles: ['R:2'], personnel: ['P:u1', 'P:gone'], groups: ['G:1'] } }, RECIPIENTS)).toEqual([
      { Id: 'P:u1', Type: 1, Name: 'Alex Kim' },
      { Id: 'P:gone', Type: 1, Name: '' },
      { Id: 'G:1', Type: 2, Name: 'Station 1' },
      { Id: 'R:2', Type: 3, Name: 'Medics' },
    ]);
    expect(messageRecipientCount({ everyone: true, ids: {} })).toBe(1);
    expect(messageRecipientCount({ everyone: false, ids: { personnel: ['P:u1'], roles: ['R:2'] } })).toBe(2);
  });

  it('builds safe routes', () => {
    expect(messageRoutes.detail('12')).toBe('/messages/12');
    expect(messageRoutes.compose()).toBe('/messages/new');
    expect(messageRoutes.detail('a/b')).toBeNull();
  });
});

describe('MessagesScreen', () => {
  it('loads both lists on focus, marks unread, filters and searches', async () => {
    useMessagesStore.setState({ inboxMessages: [message('1'), message('2', { RespondedOn: '2030-05-10T11:00:00' })], sentMessages: [message('9', { Subject: 'Drill tonight', SendingUserId: 'me' })] });
    await render(<MessagesScreen />);
    expect(store.fetchInboxMessages).toHaveBeenCalledWith({ bypassCache: false });
    expect(store.fetchSentMessages).toHaveBeenCalledWith({ bypassCache: false });
    expect(screen.getByTestId('message-card-1')).toHaveAccessibleName(/messages\.unread/);
    expect(screen.getByTestId('message-card-2')).not.toHaveAccessibleName(/messages\.unread/);

    await fireEvent.press(screen.getByTestId('messages-filter-sent'));
    expect(screen.queryByTestId('message-card-1')).toBeNull();
    expect(screen.getByTestId('message-card-9')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('messages-filter-all'));
    await fireEvent.changeText(screen.getByTestId('messages-search-input'), 'drill');
    expect(screen.getByTestId('message-card-9')).toBeTruthy();
    expect(screen.queryByTestId('message-card-1')).toBeNull();
  });

  it('opens a message on its own page', async () => {
    useMessagesStore.setState({ inboxMessages: [message('5')] });
    await render(<MessagesScreen />);
    await fireEvent.press(screen.getByTestId('message-card-5'));
    expect(router.push).toHaveBeenCalledWith('/messages/5');
    expect(screen.queryByTestId('message-details', q)).toBeNull();
  });

  it('long press selects; deleting the selection asks first', async () => {
    useMessagesStore.setState({ inboxMessages: [message('1'), message('2')] });
    await render(<MessagesScreen />);
    await fireEvent(screen.getByTestId('message-card-1'), 'longPress');
    expect(screen.getByTestId('messages-selection-bar')).toBeTruthy();
    expect(screen.queryByTestId('messages-compose-fab')).toBeNull();
    await fireEvent.press(screen.getByTestId('message-card-2'));
    expect(router.push).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('messages-delete-selected'));
    await fireEvent.press(screen.getByTestId('messages-confirm-sheet-confirm', q));
    await waitFor(() => expect(store.deleteMessages).toHaveBeenCalledWith(['1', '2']));
    expect(toasts()).toContain('success:messages.deleted');
    expect(screen.queryByTestId('messages-selection-bar')).toBeNull();
  });

  it('shows queued (offline) messages and hides compose without the right', async () => {
    securityStore.setState({ rights: { CanCreateMessage: false } as DepartmentRightsResultData });
    useMessagesStore.setState({ queuedMessages: { q1: { localId: 'q1', input: { Title: 'Pending drill', Body: 'x', Type: 0, Recipients: [] }, createdAt: 1, state: 'queued' } } });
    await render(<MessagesScreen />);
    expect(screen.getByTestId('queued-message-q1')).toHaveTextContent(/messages\.waiting_to_send/);
    expect(screen.queryByTestId('messages-compose-fab')).toBeNull();
  });

  it('opens the compose page from the button and from the empty list', async () => {
    await render(<MessagesScreen />);
    await fireEvent.press(screen.getByTestId('messages-compose-fab'));
    await fireEvent.press(screen.getByTestId('messages-empty-compose'));
    expect(router.push).toHaveBeenNthCalledWith(1, '/messages/new');
    expect(router.push).toHaveBeenNthCalledWith(2, '/messages/new');
    expect(store.fetchRecipients).not.toHaveBeenCalled();
  });
});

describe('MessageDetails', () => {
  it('answers a poll with Yes / Maybe / No and a note', async () => {
    useMessagesStore.setState({
      messageDetailsById: { '12': message('12', { Type: MessageType.Poll, Recipients: [{ MessageId: '12', UserId: 'u2', Name: 'Pat', RespondedOn: '2030-05-10T11:00:00', Response: '1', Note: 'on my way' }] }) },
    });
    await render(<MessageDetails messageId="12" />);
    expect(screen.getByTestId('message-recipient-u2')).toHaveTextContent(/messages\.response_yes/);
    await fireEvent.press(screen.getByTestId('message-respond-button'));
    expect(screen.getByTestId('message-respond-send')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('message-response-2'));
    await fireEvent.changeText(screen.getByTestId('message-response-note'), ' late ');
    await fireEvent.press(screen.getByTestId('message-respond-send'));
    await waitFor(() => expect(store.respondToMessage).toHaveBeenCalledWith({ Id: 12, Type: 2, Note: 'late' }));
    expect(toasts()).toContain('success:messages.response_sent');
    expect(store.fetchInboxMessages).toHaveBeenCalledWith({ bypassCache: true });
  });

  it('RSVPs to a calendar invitation (1 = attending, 3 = not attending)', async () => {
    useMessagesStore.setState({ messageDetailsById: { '7': message('7', { Type: MessageType.CalendarRsvp, CalendarItemId: 'c1' }) } });
    await render(<MessageDetails messageId="7" />);
    expect(screen.queryByTestId('message-respond-button')).toBeNull();
    await fireEvent.press(screen.getByTestId('message-rsvp-not-attending'));
    await waitFor(() => expect(store.respondToMessage).toHaveBeenCalledWith({ Id: 7, Type: 3, Note: '' }));
  });

  it('deletes after an inline confirmation and reports a failure', async () => {
    useMessagesStore.setState({ messageDetailsById: { '3': message('3') } });
    const onDeleted = jest.fn();
    store.deleteMessages.mockResolvedValueOnce(false);
    await render(<MessageDetails messageId="3" onDeleted={onDeleted} />);
    await fireEvent.press(screen.getByTestId('message-delete-button'));
    await fireEvent.press(screen.getByTestId('message-delete-confirm'));
    await waitFor(() => expect(toasts()).toContain('error:messages.delete_failed'));
    expect(onDeleted).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('message-delete-confirm'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it('shows a protected label instead of a withheld subject or body', async () => {
    useMessagesStore.setState({ messageDetailsById: { '4': message('4', { Subject: 'REDACTED', Body: 'REDACTED' }) } });
    await render(<MessageDetails messageId="4" />);
    expect(screen.getByTestId('message-details-subject-protected')).toBeTruthy();
    expect(screen.getByTestId('message-details-body-protected')).toBeTruthy();
    expect(screen.queryByText('REDACTED')).toBeNull();
  });

  it('marks an expired message and offers no answer', async () => {
    useMessagesStore.setState({ messageDetailsById: { '8': message('8', { Type: MessageType.Callback, ExpiredOn: '2000-01-01T00:00:00' }) } });
    await render(<MessageDetails messageId="8" />);
    expect(screen.getByTestId('message-details-expired')).toBeTruthy();
    expect(screen.queryByTestId('message-respond-button')).toBeNull();
  });
});

describe('MessageComposeScreen', () => {
  const pickEveryone = async () => {
    await fireEvent.press(screen.getByTestId('compose-recipients', q));
    await fireEvent(screen.getByTestId('compose-recipient-picker-everyone', q), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('compose-recipient-picker-confirm', q));
  };

  it('validates, picks recipients in the shared recipient picker and sends through the outbox', async () => {
    await render(<MessageComposeScreen />);
    expect(store.fetchRecipients).toHaveBeenCalledWith({ includeUnits: false });
    await fireEvent.press(screen.getByTestId('compose-send', q));
    expect(screen.getByTestId('compose-subject-error', q)).toBeTruthy();
    expect(screen.getByTestId('compose-recipients-error', q)).toBeTruthy();
    expect(store.sendNewMessage).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('compose-subject', q), ' Drill ');
    await fireEvent.changeText(screen.getByTestId('compose-body', q), 'Tonight 7pm');
    await fireEvent.press(screen.getByTestId('compose-type-2', q));

    await fireEvent.press(screen.getByTestId('compose-recipients', q));
    expect(screen.getByTestId('compose-recipient-picker-personnel', q)).toBeTruthy();
    expect(screen.queryByText('Engine 5', q)).toBeNull();
    // "Everyone" clears the picks; a pick after it ends "Everyone".
    await fireEvent(screen.getByTestId('compose-recipient-picker-everyone', q), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('recipient-groups-G:1', q));
    expect(screen.getByTestId('compose-recipient-picker-everyone', q).props.value).toBe(false);
    await fireEvent.changeText(screen.getByTestId('compose-recipient-picker-search', q), 'med');
    expect(screen.queryByTestId('recipient-personnel-P:u1', q)).toBeNull();
    await fireEvent.press(screen.getByTestId('recipient-roles-R:2', q));
    await fireEvent.press(screen.getByTestId('compose-recipient-picker-confirm', q));
    expect(screen.queryByTestId('compose-recipients-error', q)).toBeNull();
    expect(screen.getByTestId('compose-recipient-count', q)).toHaveTextContent('messages.recipients_selected:2');
    expect(screen.getByTestId('compose-recipient-summary', q)).toHaveTextContent('Station 1, Medics');

    await fireEvent.press(screen.getByTestId('compose-send', q));
    await waitFor(() =>
      expect(store.sendNewMessage).toHaveBeenCalledWith({
        Title: 'Drill',
        Body: 'Tonight 7pm',
        Type: 2,
        Recipients: [
          { Id: 'G:1', Type: 2, Name: 'Station 1' },
          { Id: 'R:2', Type: 3, Name: 'Medics' },
        ],
      })
    );
    expect(toasts()).toContain('success:messages.send_success');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('keeps the selection when the picker is closed without Done', async () => {
    await render(<MessageComposeScreen />);
    await fireEvent.press(screen.getByTestId('compose-recipients', q));
    await fireEvent.press(screen.getByTestId('recipient-personnel-P:u1', q));
    await fireEvent.press(screen.getByTestId('compose-recipient-picker-close', q));
    expect(screen.getByTestId('compose-recipient-summary', q)).toHaveTextContent('common.none');

    await pickEveryone();
    expect(screen.getByTestId('compose-recipient-summary', q)).toHaveTextContent('messages.everyone');
  });

  it('shows the recipients loading, and offers no "Everyone" switch when Core lists no Everyone row', async () => {
    useMessagesStore.setState({ recipients: [], loading: { recipients: true } });
    const { rerender } = await render(<MessageComposeScreen />);
    await fireEvent.press(screen.getByTestId('compose-recipients', q));
    expect(screen.getByTestId('compose-recipient-picker-loading', q)).toBeTruthy();

    await act(async () => useMessagesStore.setState({ recipients: RECIPIENTS.filter((item) => item.Id !== '0'), loading: {} }));
    await rerender(<MessageComposeScreen />);
    expect(screen.queryByTestId('compose-recipient-picker-everyone', q)).toBeNull();
    expect(screen.getByTestId('recipient-personnel-P:u1', q)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('compose-recipient-picker-search', q), 'nobody');
    expect(screen.getByTestId('compose-recipient-picker-empty', q)).toBeTruthy();
  });

  it('keeps the picks and the search when the Everyone row arrives while the picker is open', async () => {
    useMessagesStore.setState({ recipients: RECIPIENTS.filter((item) => item.Id !== '0'), loading: { recipients: true } });
    const { rerender } = await render(<MessageComposeScreen />);
    await fireEvent.press(screen.getByTestId('compose-recipients', q));
    await fireEvent.press(screen.getByTestId('recipient-personnel-P:u1', q));
    await fireEvent.changeText(screen.getByTestId('compose-recipient-picker-search', q), 'alex');

    await act(async () => useMessagesStore.setState({ recipients: RECIPIENTS, loading: {} }));
    await rerender(<MessageComposeScreen />);

    expect(screen.getByTestId('compose-recipient-picker-everyone', q)).toBeTruthy();
    expect(screen.getByTestId('recipient-personnel-P:u1', q).props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('compose-recipient-picker-search', q).props.value).toBe('alex');
  });

  it('says a message composed offline will be sent later; a refusal keeps the form', async () => {
    store.sendNewMessage.mockResolvedValueOnce({ outcome: 'queued', id: 'evt-2' }).mockResolvedValueOnce({ outcome: 'rejected', id: 'evt-3' });
    await render(<MessageComposeScreen />);

    const fill = async () => {
      await fireEvent.changeText(screen.getByTestId('compose-subject', q), 'Drill');
      await fireEvent.changeText(screen.getByTestId('compose-body', q), 'Body');
      await pickEveryone();
    };

    await fill();
    await fireEvent.press(screen.getByTestId('compose-send', q));
    await waitFor(() => expect(toasts()).toContain('success:messages.queued_offline'));
    expect(store.sendNewMessage).toHaveBeenLastCalledWith({ Title: 'Drill', Body: 'Body', Type: 0, Recipients: [{ Id: '0', Type: 0, Name: 'Everyone' }] });
    expect(router.back).toHaveBeenCalledTimes(1);

    await fill();
    await fireEvent.press(screen.getByTestId('compose-send', q));
    await waitFor(() => expect(toasts()).toContain('error:messages.send_failed'));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('compose-subject', q).props.value).toBe('Drill');
  });

  it('keeps the form and lets it be sent again when the message cannot even be queued', async () => {
    store.sendNewMessage.mockRejectedValueOnce(new Error('storage unavailable'));
    await render(<MessageComposeScreen />);
    await fireEvent.changeText(screen.getByTestId('compose-subject', q), 'Drill');
    await fireEvent.changeText(screen.getByTestId('compose-body', q), 'Body');
    await pickEveryone();

    await fireEvent.press(screen.getByTestId('compose-send', q));
    await waitFor(() => expect(toasts()).toContain('error:messages.send_failed'));
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByTestId('compose-subject', q).props.value).toBe('Drill');
    expect(screen.getByTestId('compose-send', q).props.accessibilityState).toMatchObject({ disabled: false });

    await fireEvent.press(screen.getByTestId('compose-send', q));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });

  it('asks before discarding a draft from Cancel; an empty form just leaves', async () => {
    const { unmount } = await render(<MessageComposeScreen />);
    await fireEvent.press(screen.getByTestId('compose-cancel', q));
    expect(router.back).toHaveBeenCalledTimes(1);
    await unmount();

    await render(<MessageComposeScreen />);
    await fireEvent.changeText(screen.getByTestId('compose-subject', q), 'Draft');
    await fireEvent.press(screen.getByTestId('compose-cancel', q));
    expect(screen.getByTestId('compose-discard-confirm')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('compose-keep-editing'));
    expect(screen.queryByTestId('compose-discard-confirm')).toBeNull();
    expect(router.back).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('compose-cancel', q));
    await fireEvent.press(screen.getByTestId('compose-discard', q));
    expect(router.back).toHaveBeenCalledTimes(2);
  });

  it('holds back leaving with a draft (app bar back, Android back) until Discard, then replays it', async () => {
    const disablePrevention = jest.fn();
    let blocked: Parameters<typeof usePreventRemove>[1];
    jest.mocked(usePreventRemove).mockImplementation((prevent, callback) => {
      blocked = prevent ? callback : undefined;

      return disablePrevention;
    });
    await render(<MessageComposeScreen />);
    expect(blocked).toBeUndefined();

    await fireEvent.changeText(screen.getByTestId('compose-body', q), 'Draft');
    expect(blocked).toBeDefined();
    const repeat = jest.fn();
    await act(async () => blocked?.({ data: { action: { type: 'GO_BACK' } }, repeat }));
    expect(screen.getByTestId('compose-discard-confirm')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('compose-discard'));
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
    expect(blocked).toBeUndefined();
  });

  it('leaves to the list when there is no history (opened by link), without asking again after sending', async () => {
    const disablePrevention = jest.fn();
    jest.mocked(usePreventRemove).mockReturnValue(disablePrevention);
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await render(<MessageComposeScreen />);
    await fireEvent.changeText(screen.getByTestId('compose-subject', q), 'Drill');
    await fireEvent.changeText(screen.getByTestId('compose-body', q), 'Body');
    await pickEveryone();
    await fireEvent.press(screen.getByTestId('compose-send', q));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/messages'));
    expect(disablePrevention).toHaveBeenCalled();
  });

  it('refuses members without the right to send messages', async () => {
    securityStore.setState({ rights: { CanCreateMessage: false } as DepartmentRightsResultData });
    await render(<MessageComposeScreen />);
    expect(screen.getByTestId('message-compose-not-allowed')).toBeTruthy();
    expect(screen.queryByTestId('compose-send')).toBeNull();
  });
});

describe('MessageDetailScreen', () => {
  it('loads a message by route id and refuses unsafe ids', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '44' });
    const { unmount } = await render(<MessageDetailScreen />);
    expect(store.fetchMessageDetails).toHaveBeenCalledWith('44', { bypassCache: true });
    await unmount();
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '..' });
    await render(<MessageDetailScreen />);
    expect(screen.getByTestId('message-detail-invalid')).toBeTruthy();
  });

  it('shows the list copy at once, answers inbox messages and not outbox-only ones', async () => {
    useMessagesStore.setState({ inboxMessages: [message('5', { Type: MessageType.Poll })], sentMessages: [message('6', { Type: MessageType.Poll, SendingUserId: 'me' })] });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '5' });
    const { unmount } = await render(<MessageDetailScreen />);
    expect(screen.getByTestId('message-details-body')).toHaveTextContent('Body 5');
    expect(store.markMessageRead).toHaveBeenCalledWith('5');
    expect(screen.getByTestId('message-respond-button')).toBeTruthy();
    await unmount();

    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '6' });
    await render(<MessageDetailScreen />);
    expect(screen.getByTestId('message-details-body')).toHaveTextContent('Body 6');
    expect(screen.queryByTestId('message-respond-button')).toBeNull();
  });

  it('goes back after a delete, or to the list when opened without history', async () => {
    useMessagesStore.setState({ inboxMessages: [message('5')] });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '5' });
    jest.mocked(router.canGoBack).mockReturnValueOnce(true).mockReturnValueOnce(false);
    const { unmount } = await render(<MessageDetailScreen />);
    await fireEvent.press(screen.getByTestId('message-delete-button'));
    await fireEvent.press(screen.getByTestId('message-delete-confirm'));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    await unmount();

    await render(<MessageDetailScreen />);
    await fireEvent.press(screen.getByTestId('message-delete-button'));
    await fireEvent.press(screen.getByTestId('message-delete-confirm'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/messages'));
  });
});
