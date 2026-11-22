import '../../calls/__tests__/test-setup';

import { type DeskActionOutcome, useDispatcherDeskStore } from '@resgrid/data';
import { DispatcherBreakState, DispatcherDisplayState, DispatcherQueueItemKind, DispatcherQueueItemOutcome, DispatcherQueueItemState, IntakeMessageAuthor, IntakeThreadHandler, IntakeThreadState } from '@resgrid/models';
import { notificationSoundService, onPushTokenRegistered, registerAlertSuppressor } from '@resgrid/notifications';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Dimensions } from 'react-native';

import { activateVariant, hidden, setRights } from '../../calls/__tests__/test-utils';
import { DeskStatusBar } from '../components/desk-status-bar';
import { DispatcherDeskHost } from '../components/dispatcher-desk-host';
import { DeskItemDetail } from '../components/item-detail';
import { CompleteItemSheet } from '../components/item-sheets';
import { SignInSheet } from '../components/sign-in-sheet';
import { TakeBreakSheet } from '../components/take-break-sheet';
import { TeamBoard } from '../components/team-board';
import { useDeskUiStore } from '../lib/desk-ui-store';
import DeskBreaksScreen from '../screens/desk-breaks';
import DispatcherDeskScreen from '../screens/dispatcher-desk';
import { board, breakEntry, item, member } from './desk-fixtures';

jest.mock('@resgrid/notifications', () => ({
  notificationSoundService: { play: jest.fn(async () => undefined), playForNotification: jest.fn(async () => undefined) },
  soundForDeskEvent: jest.fn((event: string) => `desk-${event}`),
  isAlertSuppressed: jest.fn(() => false),
  registerAlertSuppressor: jest.fn(() => jest.fn()),
  onPushTokenRegistered: jest.fn(() => jest.fn()),
}));

const ok = (): DeskActionOutcome => ({ ok: true, refusal: null, error: null, warnings: [], result: null });
const refused = (refusal: string): DeskActionOutcome => ({ ok: false, refusal, error: null, warnings: [], result: null });

const actions = {
  fetchDesk: jest.fn(async () => undefined),
  fetchItem: jest.fn(async () => undefined),
  fetchCoverage: jest.fn(async () => undefined),
  heartbeat: jest.fn(async () => true),
  registerDevice: jest.fn(async () => true),
  disable: jest.fn(),
  accept: jest.fn(async () => ok()),
  decline: jest.fn(async () => ok()),
  release: jest.fn(async () => ok()),
  endBreak: jest.fn(async () => ok()),
  complete: jest.fn(async () => ok()),
  startBreak: jest.fn(async () => ok()),
  setAway: jest.fn(async () => ok()),
  setAvailable: jest.fn(async () => ok()),
  sendMessage: jest.fn(async () => ok()),
  addNote: jest.fn(async () => ok()),
};

const setWindow = async (width: number, height: number) => {
  const metrics = { width, height, scale: 2, fontScale: 1 };
  await act(() => Dimensions.set({ window: metrics, screen: metrics }));
};

const setDesk = (desk: ReturnType<typeof board>) => useDispatcherDeskStore.setState({ desk, items: {}, recent: [], busyKeys: [], unsupported: false, loading: {}, errors: {}, fetchedAt: { desk: 1 }, ...actions });

beforeEach(async () => {
  jest.clearAllMocks();
  activateVariant('dispatch');
  setRights({});
  useToastStore.setState({ toasts: [] });
  useDeskUiStore.setState({ sheet: null, request: {} });
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  await setWindow(375, 812);
  setDesk(board());
});

afterEach(() => useToastStore.getState().clearToasts());

describe('desk status bar', () => {
  it('offers the sign-in sheet to a dispatcher not on the desk, with the waiting count', async () => {
    setDesk(board({ Me: member('me', { IsSignedIn: false, DisplayState: DispatcherDisplayState.Offline }), Queue: [item('q1')] }));
    await render(<DeskStatusBar />);

    expect(screen.getByTestId('desk-status-bar-counts')).toHaveTextContent('dispatcher_desk.status_bar.not_signed_in:1');
    await fireEvent.press(screen.getByTestId('desk-bar-sign-in'));
    expect(useDeskUiStore.getState().sheet).toBe('signIn');
  });

  it('shows the main action on a phone and the rest behind More', async () => {
    await render(<DeskStatusBar />);

    expect(screen.getByTestId('desk-bar-take-break')).toBeTruthy();
    expect(screen.queryByTestId('desk-bar-away')).toBeNull();
    await fireEvent.press(screen.getByTestId('desk-status-bar-more'));
    await fireEvent.press(screen.getByTestId('desk-bar-away'));
    expect(actions.setAway).toHaveBeenCalled();
  });

  it('shows every action inline on a tablet', async () => {
    await setWindow(1024, 768);
    await render(<DeskStatusBar />);

    expect(screen.getByTestId('desk-bar-take-break')).toBeTruthy();
    expect(screen.getByTestId('desk-bar-away')).toBeTruthy();
    expect(screen.getByTestId('desk-bar-sign-off')).toBeTruthy();
    expect(screen.queryByTestId('desk-status-bar-more')).toBeNull();
  });

  it('counts down a break, turns red once overdue and brings the dispatcher back', async () => {
    const running = breakEntry('b1', { State: DispatcherBreakState.Active, StartedOn: new Date(Date.now() - 20 * 60000).toISOString(), ExpectedReturnOn: new Date(Date.now() - 2 * 60000).toISOString() });
    setDesk(board({ Me: member('me', { DisplayState: DispatcherDisplayState.OnBreak, ActiveBreak: running }) }));
    await render(<DeskStatusBar />);

    expect(screen.getByTestId('desk-state-chip-overdue')).toHaveTextContent('dispatcher_desk.state.on_break_overdue:2');
    await fireEvent.press(screen.getByTestId('desk-bar-end-break'));
    expect(actions.endBreak).toHaveBeenCalled();
  });

  it('draws nothing where the member is no dispatcher or the desk is off', async () => {
    setDesk(board({ IsDispatcher: false }));
    await render(<DeskStatusBar />);

    expect(screen.queryByTestId('desk-status-bar')).toBeNull();
  });
});

describe('desk host', () => {
  it('loads the board, heartbeats, follows the push token and holds alerts back while on break', async () => {
    await render(<DispatcherDeskHost />);

    expect(actions.fetchDesk).toHaveBeenCalled();
    expect(actions.heartbeat).toHaveBeenCalled();
    expect(registerAlertSuppressor).toHaveBeenCalledWith('dispatcher-desk', expect.any(Function));
    const listener = jest.mocked(onPushTokenRegistered).mock.calls[0][0];
    await act(async () => listener({ token: 'fcm', platform: 2 }));
    expect(actions.registerDevice).toHaveBeenCalledWith({ Platform: 2, Token: 'fcm' });

    const suppressor = jest.mocked(registerAlertSuppressor).mock.calls[0][1];
    expect(suppressor({ channel: 'toast' })).toBe(false);
    await act(async () => setDesk(board({ Me: member('me', { DisplayState: DispatcherDisplayState.OnBreak }) })));
    expect(suppressor({ channel: 'toast' })).toBe(true);
    expect(suppressor({ channel: 'presentation', eventCode: 'DB:b1' })).toBe(false);
  });

  it('shows an offer with its sound once, and accepting opens the item on a phone', async () => {
    const offer = item('o1', { State: DispatcherQueueItemState.Offered, AssignedUserId: 'me', OfferedOn: new Date().toISOString(), OfferExpiresOn: new Date(Date.now() + 30000).toISOString(), SourceName: 'Pat' });
    setDesk(board({ Queue: [offer] }));
    await render(<DispatcherDeskHost />);

    expect(screen.getByTestId('desk-offer-title', hidden)).toHaveTextContent('Pat');
    expect(notificationSoundService.play).toHaveBeenCalledWith('desk-offer');
    await fireEvent.press(screen.getByTestId('desk-offer-accept', hidden));
    expect(actions.accept).toHaveBeenCalledWith('o1');
    expect(router.push).toHaveBeenCalledWith('/desk/item/o1');
    expect(notificationSoundService.play).toHaveBeenCalledTimes(1);
  });
});

describe('desk screen', () => {
  const queue = [
    item('mine', { State: DispatcherQueueItemState.Accepted, AssignedUserId: 'me', SourceName: 'Pat' }),
    item('waiting', { SourceName: 'Lee' }),
    item('theirs', { State: DispatcherQueueItemState.Accepted, AssignedUserId: 'u-2', AssignedUserName: 'Sam' }),
  ];

  it('lists the member’s work and the shared queue as tabs on a phone, and taking work opens it', async () => {
    setDesk(board({ Queue: queue }));
    await render(<DispatcherDeskScreen />);

    expect(screen.getByTestId('desk-item-mine')).toBeTruthy();
    expect(screen.queryByTestId('desk-item-waiting')).toBeNull();
    await fireEvent.press(screen.getByTestId('desk-tab-waiting'));
    await fireEvent.press(screen.getByTestId('desk-item-waiting-take'));
    expect(actions.accept).toHaveBeenCalledWith('waiting');
    expect(router.push).toHaveBeenCalledWith('/desk/item/waiting');
  });

  it('opens a pushed item on a phone and the breaks for a break push', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ itemId: 'mine' });
    setDesk(board({ Queue: queue }));
    await render(<DispatcherDeskScreen />);
    expect(router.push).toHaveBeenCalledWith('/desk/item/mine');

    jest.mocked(useLocalSearchParams).mockReturnValue({ breakId: 'b1' });
    await render(<DispatcherDeskScreen />);
    expect(router.push).toHaveBeenCalledWith('/desk/breaks');
  });

  it('shows the lists beside the picked item on a tablet, and the team when none is picked', async () => {
    await setWindow(1024, 768);
    setDesk(board({ Queue: queue }));
    await render(<DispatcherDeskScreen />);

    expect(screen.getByTestId('desk-list-pane')).toBeTruthy();
    expect(screen.getByTestId('desk-team-board')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('desk-item-mine'));
    expect(screen.getByTestId('desk-item-detail')).toBeTruthy();
    expect(actions.fetchItem).toHaveBeenCalledWith('mine', { bypassCache: true });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps the split view on a tablet in portrait (768 × 1024)', async () => {
    await setWindow(768, 1024);
    setDesk(board({ Queue: queue }));
    await render(<DispatcherDeskScreen />);

    expect(screen.getByTestId('desk-list-pane')).toBeTruthy();
    expect(screen.getByTestId('desk-detail-pane')).toBeTruthy();
    expect(screen.queryByTestId('desk-tab-team')).toBeNull();
  });

  it('asks a dispatcher not on the desk to sign in, and explains when the department has the desk off', async () => {
    setDesk(board({ Me: member('me', { IsSignedIn: false }) }));
    await render(<DispatcherDeskScreen />);
    await fireEvent.press(screen.getByTestId('desk-sign-in-open'));
    expect(useDeskUiStore.getState().sheet).toBe('signIn');

    await act(async () => setDesk(board({ Enabled: false })));
    await render(<DispatcherDeskScreen />);
    expect(screen.getByTestId('dispatcher-desk-off')).toBeTruthy();
  });
});

describe('sign-in sheet', () => {
  it('closes once the board shows the member signed in, even when the answer itself never came back', async () => {
    setDesk(board({ Me: member('me', { IsSignedIn: false, DisplayState: DispatcherDisplayState.Offline }) }));
    const onClose = jest.fn();
    await render(<SignInSheet isOpen onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => setDesk(board()));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open for a member already signed in (the sheet only closes on the change)', async () => {
    const onClose = jest.fn();
    await render(<SignInSheet isOpen onClose={onClose} />);

    await act(async () => setDesk(board()));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('item detail', () => {
  it('replies on a held conversation and adds notes', async () => {
    const held = item('h1', { State: DispatcherQueueItemState.Accepted, AssignedUserId: 'me' });
    setDesk(board({ Queue: [held] }));
    useDispatcherDeskStore.setState({ items: { h1: { Item: held, Events: [], Messages: [], CanReply: true, CanConnectVoice: false } } });
    await render(<DeskItemDetail itemId="h1" />);

    await fireEvent.changeText(screen.getByTestId('desk-composer-input'), 'Units are on the way');
    await fireEvent.press(screen.getByTestId('desk-composer-send'));
    expect(actions.sendMessage).toHaveBeenCalledWith('h1', 'Units are on the way');

    await fireEvent.press(screen.getByTestId('desk-composer-note'));
    await fireEvent.changeText(screen.getByTestId('desk-composer-input'), 'Caller calm');
    await fireEvent.press(screen.getByTestId('desk-composer-send'));
    expect(actions.addNote).toHaveBeenCalledWith('h1', 'Caller calm');
    expect(screen.getByTestId('desk-item-create-call')).toBeTruthy();
  });

  it('shows an intake text thread with who is answering, and reads the item again after a reply', async () => {
    const held = item('t1', { Kind: DispatcherQueueItemKind.Text, State: DispatcherQueueItemState.Accepted, AssignedUserId: 'me', CallId: 9, IntakeConversationId: 'ic-1' });
    setDesk(board({ Queue: [held] }));
    useDispatcherDeskStore.setState({
      items: {
        t1: {
          Item: held,
          Events: [],
          Messages: [],
          CanReply: true,
          CanConnectVoice: false,
          IntakeConversation: {
            IntakeConversationId: 'ic-1',
            State: IntakeThreadState.Open,
            Handler: IntakeThreadHandler.Assistant,
            AssignedUserId: null,
            AssignedUserName: null,
            OptedOut: false,
            ParticipantName: null,
            ReplyFromAddress: '+15555550000',
            StartedOn: '2026-11-19T20:00:00Z',
            ClosedOn: null,
            CloseReason: null,
            Messages: [
              { MessageId: 'm1', Direction: 1, Author: IntakeMessageAuthor.Participant, AuthorUserId: null, AuthorName: null, Text: 'Smoke from the barn', Status: 1, CreatedOn: '2026-11-19T20:00:00Z' },
              { MessageId: 'm2', Direction: 2, Author: IntakeMessageAuthor.Assistant, AuthorUserId: null, AuthorName: null, Text: 'What is the address?', Status: 3, CreatedOn: '2026-11-19T20:00:30Z' },
            ],
          },
        },
      },
    });
    await render(<DeskItemDetail itemId="t1" />);

    expect(screen.getByTestId('desk-intake-status')).toHaveTextContent('dispatcher_desk.intake.handler_assistant');
    expect(screen.getByTestId('desk-intake-message-m1')).toHaveTextContent(/^Smoke from the barndispatcher_desk\.intake\.author_participant/);
    expect(screen.getByTestId('desk-intake-message-m2')).toHaveTextContent(/dispatcher_desk\.intake\.author_assistant/);

    await fireEvent.changeText(screen.getByTestId('desk-composer-input'), 'A crew is on the way');
    await fireEvent.press(screen.getByTestId('desk-composer-send'));
    expect(actions.sendMessage).toHaveBeenCalledWith('t1', 'A crew is on the way');
    expect(actions.fetchItem).toHaveBeenCalledWith('t1', { bypassCache: true });
  });

  const stageHeldThread = (id: string) => {
    const held = item(id, { Kind: DispatcherQueueItemKind.Text, State: DispatcherQueueItemState.Accepted, AssignedUserId: 'me', CallId: 9, IntakeConversationId: `ic-${id}` });
    setDesk(board({ Queue: [held] }));
    useDispatcherDeskStore.setState({
      items: {
        [id]: {
          Item: held,
          Events: [],
          Messages: [],
          CanReply: true,
          CanConnectVoice: false,
          IntakeConversation: {
            IntakeConversationId: `ic-${id}`,
            State: IntakeThreadState.Open,
            Handler: IntakeThreadHandler.Dispatcher,
            AssignedUserId: 'me',
            AssignedUserName: 'Me',
            OptedOut: false,
            ParticipantName: null,
            ReplyFromAddress: '+15555550000',
            StartedOn: '2026-11-19T20:00:00Z',
            ClosedOn: null,
            CloseReason: null,
            Messages: [],
          },
        },
      },
    });
  };

  it('reads an intake thread again after a reply the carrier refused, and keeps the draft', async () => {
    stageHeldThread('t3');
    actions.sendMessage.mockResolvedValueOnce(refused('ChannelUnavailable'));
    await render(<DeskItemDetail itemId="t3" />);
    actions.fetchItem.mockClear();

    await fireEvent.changeText(screen.getByTestId('desk-composer-input'), 'Stay out of the garage');
    await fireEvent.press(screen.getByTestId('desk-composer-send'));

    // The failed text is on the thread ("Not delivered"), so the screen reads it; the draft stays for another try.
    expect(actions.fetchItem).toHaveBeenCalledWith('t3', { bypassCache: true });
    expect(screen.getByTestId('desk-composer-input')).toHaveDisplayValue('Stay out of the garage');
  });

  const supervisorBoard = () => {
    const supervisor = member('me', { CanSupervise: true, IsSupervisor: true });

    return board({ Me: supervisor, Members: [supervisor, member('u-2')] });
  };

  it('lets a supervisor hand over open work someone else holds', async () => {
    const working = item('w1', { State: DispatcherQueueItemState.Accepted, AssignedUserId: 'u-2', AssignedUserName: 'Dispatcher u-2' });
    setDesk({ ...supervisorBoard(), Queue: [working] });

    await render(<DeskItemDetail itemId="w1" />);

    expect(screen.getByTestId('desk-item-transfer')).toBeTruthy();
  });

  it('offers a supervisor nothing to hand over on finished work', async () => {
    // Found live 2026-11-20: a completed text thread still offered "Hand over".
    const done = item('d1', { State: DispatcherQueueItemState.Completed, AssignedUserId: 'u-2', AssignedUserName: 'Dispatcher u-2', CompletedOn: '2026-11-19T14:55:00Z' });
    setDesk(supervisorBoard());
    useDispatcherDeskStore.setState({ recent: [done] });

    await render(<DeskItemDetail itemId="d1" />);

    expect(screen.getByTestId('desk-item-detail-state')).toBeTruthy();
    expect(screen.queryByTestId('desk-item-transfer')).toBeNull();
  });

  it('reads an intake thread again after returning it to the queue', async () => {
    stageHeldThread('t4');
    await render(<DeskItemDetail itemId="t4" />);
    actions.fetchItem.mockClear();

    await fireEvent.press(screen.getByTestId('desk-item-release'));

    expect(actions.release).toHaveBeenCalledWith('t4');
    await waitFor(() => expect(actions.fetchItem).toHaveBeenCalledWith('t4', { bypassCache: true }));
  });

  it('asks whether to tell the texter when completing an intake text thread', async () => {
    const held = item('t2', { Kind: DispatcherQueueItemKind.Text, State: DispatcherQueueItemState.Accepted, AssignedUserId: 'me', CallId: 9, IntakeConversationId: 'ic-2' });
    await render(<CompleteItemSheet item={held} isOpen onClose={jest.fn()} />);

    await fireEvent(screen.getByTestId('desk-complete-notify'), 'valueChange', false);
    await fireEvent.press(screen.getByTestId('desk-complete-submit'));
    expect(actions.complete).toHaveBeenCalledWith(expect.objectContaining({ ItemId: 't2', Outcome: DispatcherQueueItemOutcome.CallCreated, NotifyParticipant: false }));

    await render(<CompleteItemSheet item={item('p9', { Kind: DispatcherQueueItemKind.PendingCall, CallId: 9 })} isOpen onClose={jest.fn()} />);
    expect(screen.queryByTestId('desk-complete-notify')).toBeNull();
  });

  it('answers a held phone call by ringing the dispatcher', async () => {
    const connectVoice = jest.fn(async () => ok());
    const voice = item('v1', { Kind: 4, State: DispatcherQueueItemState.Accepted, AssignedUserId: 'me', CallerWaiting: true });
    setDesk(board({ Queue: [voice] }));
    useDispatcherDeskStore.setState({ connectVoice, items: { v1: { Item: voice, Events: [], Messages: [], CanReply: false, CanConnectVoice: true } } });
    await render(<DeskItemDetail itemId="v1" />);

    await fireEvent.press(screen.getByTestId('desk-voice-answer'));
    expect(connectVoice).toHaveBeenCalledWith('v1', '+15555550100');
    expect(useToastStore.getState().toasts[0]).toMatchObject({ message: 'dispatcher_desk.voice.ringing' });
  });
});

describe('take a break', () => {
  it('returns held work, warns about coverage and explains a refusal for low coverage', async () => {
    actions.startBreak.mockResolvedValueOnce(refused('CoverageTooLow'));
    setDesk(board({ Me: member('me', { ActiveItemCount: 1 }), AvailableCount: 1, MinimumAvailable: 1 }));
    await render(<TakeBreakSheet isOpen onClose={jest.fn()} />);

    expect(screen.getByTestId('desk-break-holding')).toBeTruthy();
    expect(screen.getByTestId('desk-break-coverage')).toHaveTextContent('dispatcher_desk.breaks.coverage_warning:0,1');
    await fireEvent.press(screen.getByTestId('desk-break-submit'));
    expect(actions.startBreak).toHaveBeenCalledWith({ DispatcherBreakId: null, BreakType: 2, DurationMinutes: 30, ReturnWork: true });
    expect(screen.getByTestId('desk-break-coverage')).toHaveTextContent('dispatcher_desk.breaks.coverage_refused');
  });

  it('starts the next planned break', async () => {
    const onClose = jest.fn();
    const planned = breakEntry('b1');
    setDesk(board({ Me: member('me', { NextBreak: planned }), MyBreaks: [planned] }));
    await render(<TakeBreakSheet isOpen onClose={onClose} plannedBreakId="b1" />);

    await fireEvent.press(screen.getByTestId('desk-break-submit'));
    expect(actions.startBreak).toHaveBeenCalledWith({ DispatcherBreakId: 'b1', BreakType: null, DurationMinutes: null, ReturnWork: false });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('sheets behind a refreshing board', () => {
  it('keeps the break length the member picked when the board is read again behind the open sheet', async () => {
    await render(<TakeBreakSheet isOpen onClose={jest.fn()} />);

    await fireEvent.press(screen.getByTestId('desk-break-length-15'));
    await act(async () => setDesk(board()));
    await fireEvent.press(screen.getByTestId('desk-break-submit'));
    expect(actions.startBreak).toHaveBeenCalledWith(expect.objectContaining({ DurationMinutes: 15 }));
  });

  it('asks how a pending call ended instead of assuming it was dispatched, and keeps the answer through a refresh', async () => {
    const pending = item('p1', { Kind: DispatcherQueueItemKind.PendingCall, CallId: 9, State: DispatcherQueueItemState.Accepted, AssignedUserId: 'me' });
    const view = await render(<CompleteItemSheet item={pending} isOpen onClose={jest.fn()} />);

    await fireEvent.press(screen.getByTestId('desk-complete-submit'));
    expect(actions.complete).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId(`desk-complete-outcome-${DispatcherQueueItemOutcome.LeftPending}`));
    await act(async () => view.rerender(<CompleteItemSheet item={{ ...pending }} isOpen onClose={jest.fn()} />));
    await fireEvent.press(screen.getByTestId('desk-complete-submit'));
    expect(actions.complete).toHaveBeenCalledWith(expect.objectContaining({ ItemId: 'p1', Outcome: DispatcherQueueItemOutcome.LeftPending }));
  });
});

describe('team board', () => {
  it('lets a supervisor end another dispatcher’s break', async () => {
    setDesk(board({ Me: member('me', { CanSupervise: true }), Members: [member('me', { CanSupervise: true }), member('u-2', { DisplayState: DispatcherDisplayState.OnBreak })] }));
    await render(<TeamBoard />);

    await fireEvent.press(screen.getByTestId('desk-team-board-u-2-end-break'));
    expect(actions.endBreak).toHaveBeenCalledWith('u-2');
    expect(screen.queryByTestId('desk-team-board-me-end-break')).toBeNull();
  });
});

describe('breaks screen', () => {
  const coverage = {
    FromUtc: new Date(Date.now() - 4 * 3600000).toISOString(),
    ToUtc: new Date(Date.now() + 8 * 3600000).toISOString(),
    SlotMinutes: 30,
    Duty: [],
    Breaks: [breakEntry('b2', { UserId: 'u-2', UserName: 'Sam', ScheduledStartOn: new Date(Date.now() + 3600000).toISOString(), ScheduledEndOn: new Date(Date.now() + 4500000).toISOString() })],
    Slots: [],
    Warnings: [{ Kind: 'BreaksOverlap', StartUtc: null, EndUtc: null, UserIds: ['me', 'u-2'], Available: null, Minimum: null, Minutes: null }],
    Names: { 'u-2': 'Sam' },
  };

  it('lists the member’s breaks, starts a planned one and shows the team timeline with its warnings', async () => {
    const planned = breakEntry('b1');
    setDesk(board({ MyBreaks: [planned] }));
    useDispatcherDeskStore.setState({ coverage });
    await render(<DeskBreaksScreen />);

    expect(actions.fetchCoverage).toHaveBeenCalled();
    expect(screen.getByTestId('desk-my-break-b1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('desk-my-break-b1-start'));
    expect(useDeskUiStore.getState()).toMatchObject({ sheet: 'takeBreak', request: { plannedBreakId: 'b1' } });
    expect(screen.getByTestId('desk-coverage-timeline-break-b2-planned')).toBeTruthy();
    expect(screen.getByTestId('desk-breaks-warnings')).toHaveTextContent('dispatcher_desk.warnings.breaks_overlap:0,0,0');
  });

  it('opens a dispatcher’s breaks from the timeline for a supervisor only', async () => {
    setDesk(board({ Me: member('me', { CanSupervise: true }) }));
    useDispatcherDeskStore.setState({ coverage });
    await render(<DeskBreaksScreen />);

    await fireEvent.press(screen.getByTestId('desk-coverage-timeline-name-u-2'));
    expect(screen.getByText('dispatcher_desk.plan.title_for:Sam', hidden)).toBeTruthy();
  });
});
