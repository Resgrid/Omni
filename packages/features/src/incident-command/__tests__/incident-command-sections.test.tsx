import './test-setup';

import { securityStore } from '@resgrid/auth';
import { IC_EVENT, useCommandSupportStore, useIncidentAssistantStore } from '@resgrid/data';
import type { DepartmentRightsResultData, IncidentNeed } from '@resgrid/models';
import { IncidentNeedStatus } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { useVoiceChannels } from '@resgrid/voice';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { MessagesSquare } from 'lucide-react-native';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { CommandBoardView } from '../components/command-board-view';
import { IncidentChatSection } from '../components/incident-chat-section';
import { AssistantSheet } from '../components/sheets/assistant-sheet';
import { VoiceSection } from '../components/voice-section';
import { WorkTimeLight } from '../components/work-time-light';
import { makeBoard, mockDispatch, node, seedBoard } from './fixtures';

const lastToast = () => useToastStore.getState().toasts.at(-1);

beforeEach(() => {
  activateVariant('ic');
  useToastStore.getState().clearToasts();
  securityStore.setState({ rights: { CanCreateCalls: true } as DepartmentRightsResultData, isLoaded: true });
  seedBoard();
});

describe('lane edit and delete', () => {
  it('edits a lane keeping the server fields', async () => {
    render(<CommandBoardView callId="7" tier="command" />);
    fireEvent.press(screen.getByTestId('lane-edit-n1'));
    expect(screen.getByTestId('lane-sheet-name', hidden).props.value).toBe('Division A');
    fireEvent.changeText(screen.getByTestId('lane-sheet-name', hidden), 'Division Alpha');
    fireEvent.press(screen.getByTestId('lane-sheet-color-#22c55e', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('lane-sheet-submit', hidden)));
    expect(mockDispatch).toHaveBeenCalledWith(IC_EVENT.updateNode, {
      callId: '7',
      body: expect.objectContaining({ CommandStructureNodeId: 'n1', IncidentCommandId: 'ic-7', Name: 'Division Alpha', Color: '#22c55e', MinUnits: 2 }),
    });
  });

  it('moves a deleted lane’s resources to the pool before deleting it, in order', async () => {
    render(<CommandBoardView callId="7" tier="command" />);
    fireEvent.press(screen.getByTestId('lane-edit-n1'));
    fireEvent.press(screen.getByTestId('lane-sheet-delete', hidden));
    expect(screen.getByText('incident_command.delete_lane_with_resources:1', hidden)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('lane-sheet-delete-pool', hidden)));
    expect(mockDispatch.mock.calls.map((call) => call[0])).toEqual([IC_EVENT.moveResource, IC_EVENT.deleteNode]);
    expect(mockDispatch.mock.calls[1][1]).toEqual({ callId: '7', params: { commandStructureNodeId: 'n1' } });
  });
});

describe('needs, notes and ad-hoc resources', () => {
  const need: IncidentNeed = {
    IncidentNeedId: 'nd1',
    IncidentCommandId: 'ic-7',
    DepartmentId: 1,
    CallId: 7,
    Name: 'Engines',
    Category: 0,
    Status: IncidentNeedStatus.Open,
    QuantityRequested: 3,
    QuantityFulfilled: 1,
    Priority: 0,
    CreatedOn: '',
    SortOrder: 0,
  };

  it('adds a need and records fulfilment with a note', async () => {
    seedBoard('7', makeBoard({ Needs: [need] }));
    render(<CommandBoardView callId="7" tier="command" />);
    expect(screen.getByText('incident_command.need_quantity_progress:1,3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('command-needs-add'));
    fireEvent.changeText(screen.getByTestId('need-sheet-name', hidden), 'Water tender');
    fireEvent.changeText(screen.getByTestId('need-sheet-quantity', hidden), '2');
    await act(async () => fireEvent.press(screen.getByTestId('need-sheet-submit', hidden)));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.saveNeed, expect.objectContaining({ body: expect.objectContaining({ Name: 'Water tender', QuantityRequested: 2, Status: IncidentNeedStatus.Open }) }));

    fireEvent.press(screen.getByTestId('command-needs-item-nd1'));
    fireEvent.press(screen.getByTestId('need-status-sheet-status-1', hidden));
    fireEvent.changeText(screen.getByTestId('need-status-sheet-fulfilled', hidden), '2');
    fireEvent.changeText(screen.getByTestId('need-status-sheet-note', hidden), 'Mutual aid');
    await act(async () => fireEvent.press(screen.getByTestId('need-status-sheet-submit', hidden)));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.setNeedStatus, { callId: '7', body: { IncidentNeedId: 'nd1', Status: 1, QuantityFulfilled: 2, Note: 'Mutual aid' } });
  });

  it('adds a public note and an outside unit', async () => {
    render(<CommandBoardView callId="7" tier="command" />);
    fireEvent.press(screen.getByTestId('command-notes-add'));
    fireEvent.changeText(screen.getByTestId('note-sheet-body', hidden), 'Fire under control');
    fireEvent.press(screen.getByTestId('note-sheet-visibility-1', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('note-sheet-submit', hidden)));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.addNote, expect.objectContaining({ body: expect.objectContaining({ Body: 'Fire under control', Visibility: 1 }) }));

    fireEvent.press(screen.getByTestId('command-add-adhoc'));
    fireEvent.changeText(screen.getByTestId('adhoc-sheet-name', hidden), 'County Engine 5');
    fireEvent.changeText(screen.getByTestId('adhoc-sheet-agency', hidden), 'County FD');
    await act(async () => fireEvent.press(screen.getByTestId('adhoc-sheet-submit', hidden)));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.createAdHocUnit, expect.objectContaining({ body: expect.objectContaining({ Name: 'County Engine 5', ExternalAgencyName: 'County FD' }) }));
  });

  it('starts a timer with a client id', async () => {
    render(<CommandBoardView callId="7" tier="command" />);
    fireEvent.press(screen.getByTestId('command-timers-add'));
    fireEvent.changeText(screen.getByTestId('timer-sheet-name', hidden), 'PAR');
    fireEvent.press(screen.getByTestId('timer-sheet-interval-10', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('timer-sheet-submit', hidden)));
    expect(mockDispatch).toHaveBeenLastCalledWith(IC_EVENT.startTimer, expect.objectContaining({ body: expect.objectContaining({ Name: 'PAR', IntervalSeconds: 600, IncidentTimerId: expect.any(String) }) }));
  });
});

describe('WorkTimeLight', () => {
  it('flags a resource past the lane rotation time', () => {
    const nowMs = Date.UTC(2026, 10, 1, 12, 0, 0);
    render(<WorkTimeLight assignedOn="2026-11-01T11:00:00Z" node={node('n1', { MaxTimeInRole: 45 })} nowMs={nowMs} testID="light" />);
    expect(screen.getByTestId('light-rotation')).toBeTruthy();
    expect(screen.getByTestId('light-dot-rotation')).toBeTruthy();
    expect(screen.getByText('incident_command.minutes_short:60')).toBeTruthy();
  });
});

describe('IncidentChatSection', () => {
  it('lists only the channels the server gave and contacts with a message action for Resgrid users', () => {
    const onOpen = jest.fn();
    const onMessage = jest.fn();
    render(
      <IncidentChatSection
        channels={[
          { key: 'incident', label: 'Incident', icon: MessagesSquare, channelId: 'ch1' },
          { key: 'command', label: 'Command', icon: MessagesSquare, channelId: null },
        ]}
        contacts={[
          { key: 'ic', label: 'Commander', name: 'Pat', userId: 'u1' },
          { key: 'ext', label: 'Liaison', name: 'Outside', userId: null },
        ]}
        isFrozen
        onOpenChannel={onOpen}
        onMessage={onMessage}
      />
    );
    expect(screen.getByTestId('incident-chat-frozen')).toBeTruthy();
    expect(screen.queryByTestId('incident-chat-command')).toBeNull();
    fireEvent.press(screen.getByTestId('incident-chat-incident'));
    expect(onOpen).toHaveBeenCalledWith('ch1');
    expect(screen.queryByTestId('incident-chat-contact-ext-message')).toBeNull();
    fireEvent.press(screen.getByTestId('incident-chat-contact-ic-message'));
    expect(onMessage).toHaveBeenCalledWith('u1');
  });

  it('renders nothing with no channels and no contacts', () => {
    render(<IncidentChatSection channels={[]} contacts={[]} onOpenChannel={jest.fn()} onMessage={jest.fn()} />);
    expect(screen.toJSON()).toBeNull();
  });
});

describe('VoiceSection', () => {
  it('is hidden without department voice', () => {
    render(<VoiceSection callId="7" canManage />);
    expect(screen.toJSON()).toBeNull();
  });

  it('lists incident channels, joins one and creates a preset channel', async () => {
    const refresh = jest.fn(async () => ({ ok: true as const }));
    jest.mocked(useVoiceChannels).mockReturnValue({
      channels: [{ Id: 'v1', Name: 'Tac 1', ConferenceNumber: 1, IsDefault: false, Token: 'tok' }],
      selectedChannel: null,
      defaultChannel: null,
      isVoiceEnabled: true,
      isLoading: false,
      error: null,
      refresh,
      selectChannel: jest.fn(),
    });
    const createVoiceChannel = jest.fn(async () => null);
    useCommandSupportStore.setState({ voiceChannelsByCall: { '7': [{ DepartmentVoiceChannelId: 'v1', DepartmentId: 1, Name: 'Tac 1', IsOnDemand: true }] }, createVoiceChannel });
    const { mockPtt } = jest.requireMock('@resgrid/voice') as { mockPtt: { connect: jest.Mock } };
    render(<VoiceSection callId="7" canManage />);
    await act(async () => fireEvent.press(screen.getByTestId('command-voice-join-v1')));
    expect(mockPtt.connect).toHaveBeenCalledWith(expect.objectContaining({ Id: 'v1' }));

    fireEvent.press(screen.getByTestId('command-voice-add'));
    await act(async () => fireEvent.press(screen.getByTestId('command-voice-preset-0')));
    expect(createVoiceChannel).toHaveBeenCalledWith('7', 'incident_command.voice_preset_tactical');
  });

  it('explains a failed channel create', async () => {
    jest
      .mocked(useVoiceChannels)
      .mockReturnValue({ channels: [], selectedChannel: null, defaultChannel: null, isVoiceEnabled: true, isLoading: false, error: null, refresh: jest.fn(async () => ({ ok: true as const })), selectChannel: jest.fn() });
    useCommandSupportStore.setState({ createVoiceChannel: jest.fn(async () => Promise.reject(new Error('offline'))) });
    render(<VoiceSection callId="7" canManage />);
    fireEvent.press(screen.getByTestId('command-voice-add'));
    await act(async () => fireEvent.press(screen.getByTestId('command-voice-preset-1')));
    expect(lastToast()).toMatchObject({ type: 'error', message: 'incident_command.voice_create_failed' });
  });
});

describe('AssistantSheet', () => {
  it('asks questions online and shows suggestions', async () => {
    const ask = jest.fn(async () => undefined);
    const fetchSuggestions = jest.fn(async () => undefined);
    useIncidentAssistantStore.setState({
      messagesByCallId: { '7': [{ id: 'm1', role: 'assistant', text: '', createdOn: '', unanswered: true }] },
      suggestionsByCallId: { '7': { IncidentType: 'Structure fire', IncidentTypeKey: 'structure_fire', Questions: ['What is PAR?'] } },
      askingCallId: null,
      askError: null,
      ask,
      fetchSuggestions,
    });
    render(<AssistantSheet isOpen onClose={jest.fn()} callId="7" isOnline />);
    expect(fetchSuggestions).toHaveBeenCalledWith('7');
    expect(screen.getByText('incident_command.assistant_unanswered', hidden)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('What is PAR?', hidden));
    expect(ask).toHaveBeenCalledWith('7', 'What is PAR?');
    fireEvent.changeText(screen.getByTestId('assistant-sheet-input', hidden), 'How many units?');
    fireEvent.press(screen.getByTestId('assistant-sheet-send', hidden));
    expect(ask).toHaveBeenLastCalledWith('7', 'How many units?');
  });

  it('does not send while offline', () => {
    const ask = jest.fn(async () => undefined);
    useIncidentAssistantStore.setState({ messagesByCallId: {}, suggestionsByCallId: {}, askingCallId: null, askError: null, ask, fetchSuggestions: jest.fn(async () => undefined) });
    render(<AssistantSheet isOpen onClose={jest.fn()} callId="7" isOnline={false} />);
    expect(screen.getByTestId('assistant-sheet-offline', hidden)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('assistant-sheet-input', hidden), 'PAR?');
    fireEvent.press(screen.getByTestId('assistant-sheet-send', hidden));
    expect(ask).not.toHaveBeenCalled();
  });
});
