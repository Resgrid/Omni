import '../../status/__tests__/test-setup';

import { securityStore, useAuthStore } from '@resgrid/auth';
import { useMessagesStore } from '@resgrid/data';
import type { DepartmentRightsResultData, MessageResultData, RecipientsResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { ComposeMessageSheet } from '../components/compose-message-sheet';
import { MessageDetails } from '../components/message-details';
import { buildMessageList, canRespondToMessage, getMessageTypeKey, getResponseKey, isMessageExpired, MessageType, recipientInputType, recipientsForTab } from '../lib/message-format';
import { messageRoutes } from '../routes';
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
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void | (() => void)) => React.useEffect(effect, [effect]));
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

afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
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

  it('offers answers only on received callbacks and polls that are open', () => {
    expect(canRespondToMessage(message('1', { Type: MessageType.Poll }), false)).toBe(true);
    expect(canRespondToMessage(message('1', { Type: MessageType.Normal }), false)).toBe(false);
    expect(canRespondToMessage(message('1', { Type: MessageType.Callback }), true)).toBe(false);
    expect(canRespondToMessage(message('1', { Type: MessageType.Callback, Responded: true }), false)).toBe(false);
  });

  it('maps recipients to tabs and Core input types and never offers units', () => {
    expect(recipientsForTab(RECIPIENTS, 'groups', '').map((item) => item.Id)).toEqual(['G:1']);
    expect(recipientsForTab(RECIPIENTS, 'personnel', 'kim').map((item) => item.Id)).toEqual(['P:u1']);
    expect(RECIPIENTS.map(recipientInputType)).toEqual([0, 2, 3, 1, 1]);
    expect(['personnel', 'groups', 'roles'].flatMap((tab) => recipientsForTab(RECIPIENTS, tab as never, '')).some((item) => item.Type === 'Unit')).toBe(false);
  });

  it('builds safe routes', () => {
    expect(messageRoutes.detail('12')).toBe('/messages/12');
    expect(messageRoutes.compose()).toBe('/messages?compose=1');
    expect(() => messageRoutes.detail('a/b')).toThrow();
  });
});

describe('MessagesScreen', () => {
  it('loads both lists on focus, marks unread, filters and searches', () => {
    useMessagesStore.setState({ inboxMessages: [message('1'), message('2', { RespondedOn: '2030-05-10T11:00:00' })], sentMessages: [message('9', { Subject: 'Drill tonight', SendingUserId: 'me' })] });
    render(<MessagesScreen />);
    expect(store.fetchInboxMessages).toHaveBeenCalledWith({ bypassCache: false });
    expect(store.fetchSentMessages).toHaveBeenCalledWith({ bypassCache: false });
    expect(screen.getByTestId('message-card-1')).toHaveAccessibleName(/messages\.unread/);
    expect(screen.getByTestId('message-card-2')).not.toHaveAccessibleName(/messages\.unread/);

    fireEvent.press(screen.getByTestId('messages-filter-sent'));
    expect(screen.queryByTestId('message-card-1')).toBeNull();
    expect(screen.getByTestId('message-card-9')).toBeTruthy();

    fireEvent.press(screen.getByTestId('messages-filter-all'));
    fireEvent.changeText(screen.getByTestId('messages-search-input'), 'drill');
    expect(screen.getByTestId('message-card-9')).toBeTruthy();
    expect(screen.queryByTestId('message-card-1')).toBeNull();
  });

  it('opens a message in the sheet, which marks it read and loads the detail', () => {
    useMessagesStore.setState({ inboxMessages: [message('5')] });
    render(<MessagesScreen />);
    fireEvent.press(screen.getByTestId('message-card-5'));
    expect(screen.getByTestId('message-details', q)).toBeTruthy();
    expect(store.markMessageRead).toHaveBeenCalledWith('5');
    expect(store.fetchMessageDetails).toHaveBeenCalledWith('5', { bypassCache: true });
  });

  it('long press selects; deleting the selection asks first', async () => {
    useMessagesStore.setState({ inboxMessages: [message('1'), message('2')] });
    render(<MessagesScreen />);
    fireEvent(screen.getByTestId('message-card-1'), 'longPress');
    expect(screen.getByTestId('messages-selection-bar')).toBeTruthy();
    expect(screen.queryByTestId('messages-compose-fab')).toBeNull();
    fireEvent.press(screen.getByTestId('message-card-2'));
    fireEvent.press(screen.getByTestId('messages-delete-selected'));
    fireEvent.press(screen.getByTestId('messages-confirm-sheet-confirm', q));
    await waitFor(() => expect(store.deleteMessages).toHaveBeenCalledWith(['1', '2']));
    expect(toasts()).toContain('success:messages.deleted');
    expect(screen.queryByTestId('messages-selection-bar')).toBeNull();
  });

  it('shows queued (offline) messages and hides compose without the right', () => {
    securityStore.setState({ rights: { CanCreateMessage: false } as DepartmentRightsResultData });
    useMessagesStore.setState({ queuedMessages: { q1: { localId: 'q1', input: { Title: 'Pending drill', Body: 'x', Type: 0, Recipients: [] }, createdAt: 1, state: 'queued' } } });
    render(<MessagesScreen />);
    expect(screen.getByTestId('queued-message-q1')).toHaveTextContent(/messages\.waiting_to_send/);
    expect(screen.queryByTestId('messages-compose-fab')).toBeNull();
  });

  it('opens compose from the route param', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ compose: '1' });
    render(<MessagesScreen />);
    expect(store.fetchRecipients).toHaveBeenCalledWith({ includeUnits: false });
  });
});

describe('MessageDetails', () => {
  it('answers a poll with Yes / Maybe / No and a note', async () => {
    useMessagesStore.setState({
      messageDetailsById: { '12': message('12', { Type: MessageType.Poll, Recipients: [{ MessageId: '12', UserId: 'u2', Name: 'Pat', RespondedOn: '2030-05-10T11:00:00', Response: '1', Note: 'on my way' }] }) },
    });
    render(<MessageDetails messageId="12" />);
    expect(screen.getByTestId('message-recipient-u2')).toHaveTextContent(/messages\.response_yes/);
    fireEvent.press(screen.getByTestId('message-respond-button'));
    expect(screen.getByTestId('message-respond-send')).toBeDisabled();
    fireEvent.press(screen.getByTestId('message-response-2'));
    fireEvent.changeText(screen.getByTestId('message-response-note'), ' late ');
    fireEvent.press(screen.getByTestId('message-respond-send'));
    await waitFor(() => expect(store.respondToMessage).toHaveBeenCalledWith({ Id: 12, Type: 2, Note: 'late' }));
    expect(toasts()).toContain('success:messages.response_sent');
    expect(store.fetchInboxMessages).toHaveBeenCalledWith({ bypassCache: true });
  });

  it('RSVPs to a calendar invitation (1 = attending, 3 = not attending)', async () => {
    useMessagesStore.setState({ messageDetailsById: { '7': message('7', { Type: MessageType.CalendarRsvp, CalendarItemId: 'c1' }) } });
    render(<MessageDetails messageId="7" />);
    expect(screen.queryByTestId('message-respond-button')).toBeNull();
    fireEvent.press(screen.getByTestId('message-rsvp-not-attending'));
    await waitFor(() => expect(store.respondToMessage).toHaveBeenCalledWith({ Id: 7, Type: 3, Note: '' }));
  });

  it('deletes after an inline confirmation and reports a failure', async () => {
    useMessagesStore.setState({ messageDetailsById: { '3': message('3') } });
    const onDeleted = jest.fn();
    store.deleteMessages.mockResolvedValueOnce(false);
    render(<MessageDetails messageId="3" onDeleted={onDeleted} />);
    fireEvent.press(screen.getByTestId('message-delete-button'));
    fireEvent.press(screen.getByTestId('message-delete-confirm'));
    await waitFor(() => expect(toasts()).toContain('error:messages.delete_failed'));
    expect(onDeleted).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('message-delete-confirm'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it('shows a protected label instead of a withheld subject or body', () => {
    useMessagesStore.setState({ messageDetailsById: { '4': message('4', { Subject: 'REDACTED', Body: 'REDACTED' }) } });
    render(<MessageDetails messageId="4" />);
    expect(screen.getByTestId('message-details-subject-protected')).toBeTruthy();
    expect(screen.getByTestId('message-details-body-protected')).toBeTruthy();
    expect(screen.queryByText('REDACTED')).toBeNull();
  });

  it('marks an expired message and offers no answer', () => {
    useMessagesStore.setState({ messageDetailsById: { '8': message('8', { Type: MessageType.Callback, ExpiredOn: '2000-01-01T00:00:00' }) } });
    render(<MessageDetails messageId="8" />);
    expect(screen.getByTestId('message-details-expired')).toBeTruthy();
    expect(screen.queryByTestId('message-respond-button')).toBeNull();
  });
});

describe('ComposeMessageSheet', () => {
  it('validates, keeps Everyone exclusive and sends through the outbox', async () => {
    const onClose = jest.fn();
    render(<ComposeMessageSheet isOpen onClose={onClose} />);
    fireEvent.press(screen.getByTestId('compose-send', q));
    expect(screen.getByTestId('compose-subject-error', q)).toBeTruthy();
    expect(screen.getByTestId('compose-recipients-error', q)).toBeTruthy();
    expect(store.sendNewMessage).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('compose-subject', q), ' Drill ');
    fireEvent.changeText(screen.getByTestId('compose-body', q), 'Tonight 7pm');
    fireEvent.press(screen.getByTestId('compose-type-2', q));
    fireEvent.press(screen.getByTestId('recipient-0', q));
    fireEvent.press(screen.getByTestId('compose-tab-groups', q));
    fireEvent.press(screen.getByTestId('recipient-G:1', q));
    expect(screen.getByTestId('compose-recipient-count', q)).toHaveTextContent('messages.recipients_selected:1');
    fireEvent.press(screen.getByTestId('compose-tab-roles', q));
    fireEvent.press(screen.getByTestId('recipient-R:2', q));
    expect(screen.queryByTestId('recipient-U:5', q)).toBeNull();

    fireEvent.press(screen.getByTestId('compose-send', q));
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
    expect(onClose).toHaveBeenCalled();
  });

  it('says a message composed offline will be sent later; a refusal keeps the form', async () => {
    store.sendNewMessage.mockResolvedValueOnce({ outcome: 'queued', id: 'evt-2' }).mockResolvedValueOnce({ outcome: 'rejected', id: 'evt-3' });
    const onClose = jest.fn();
    render(<ComposeMessageSheet isOpen onClose={onClose} />);
    const fill = () => {
      fireEvent.changeText(screen.getByTestId('compose-subject', q), 'Drill');
      fireEvent.changeText(screen.getByTestId('compose-body', q), 'Body');
      fireEvent.press(screen.getByTestId('recipient-0', q));
    };
    fill();
    fireEvent.press(screen.getByTestId('compose-send', q));
    await waitFor(() => expect(toasts()).toContain('success:messages.queued_offline'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fill();
    fireEvent.press(screen.getByTestId('compose-send', q));
    await waitFor(() => expect(toasts()).toContain('error:messages.send_failed'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('compose-subject', q).props.value).toBe('Drill');
  });

  it('asks before discarding a draft', () => {
    const onClose = jest.fn();
    render(<ComposeMessageSheet isOpen onClose={onClose} />);
    fireEvent.changeText(screen.getByTestId('compose-subject', q), 'Draft');
    fireEvent.press(screen.getByTestId('compose-cancel', q));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('compose-discard', q));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('MessageDetailScreen', () => {
  it('loads a message by route id and refuses unsafe ids', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '44' });
    const { unmount } = render(<MessageDetailScreen />);
    expect(store.fetchMessageDetails).toHaveBeenCalledWith('44', { bypassCache: true });
    unmount();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '..' });
    render(<MessageDetailScreen />);
    expect(screen.getByTestId('message-detail-invalid')).toBeTruthy();
  });
});
