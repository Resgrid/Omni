import '../../calls/__tests__/test-setup';

import { featureFlagsStore } from '@resgrid/auth';
import { useAwaitingResourcesStore } from '@resgrid/data';
import { getCallDetailTabs } from '@resgrid/features/calls';
import { OutstandingRequirementsAlertKind } from '@resgrid/models';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { activateVariant, hidden, setRights } from '../../calls/__tests__/test-utils';
import { AwaitingResourcesBanner } from '../components/awaiting-resources-banner';
import { AwaitingResourcesHost } from '../components/awaiting-resources-host';
import { CallOutstandingRequirements } from '../components/call-outstanding-requirements';
import { awaitingCallLabel, findResponseCode, unitLabel } from '../lib/awaiting-format';
import { awaitingResourcesNav } from '../nav';
import { OUTSTANDING_REQUIREMENTS_TAB_ID, registerAwaitingResourcesCallDetailTab } from '../register';
import AwaitingResourcesScreen from '../screens/awaiting-resources';

const NOW = Date.parse('2026-10-31T12:00:00Z');

const waitingCall = (CallId: number, overrides: Record<string, unknown> = {}) => ({
  CallId,
  CallNumber: `26-${CallId}`,
  CallName: 'Structure fire',
  Priority: 1,
  PriorityName: 'High',
  PriorityColor: '#ff0000',
  Address: '1 Main St',
  LoggedOn: '2026-10-31T11:50:00',
  Requirements: [
    {
      CallOutstandingRequirementId: 50 + CallId,
      Label: 'MUG',
      RequiredCount: 1,
      ResolvedCount: 0,
      SentInstead: 'PIT P-21',
      ResponseCode: 'C3',
      ResponseCodeId: 3,
      CreatedOn: '2026-10-31T11:54:00',
      AvailableUnits: [{ UnitId: 7, UnitName: 'M-7', UnitTypeName: 'MUG', ResponseSeconds: 245 }],
    },
  ],
  ...overrides,
});

const enable = (conditions = true) =>
  featureFlagsStore.setState({ flags: { 'Dispatch.RunCards': { enabled: true }, ...(conditions ? { 'Dispatch.RunCardConditions': { enabled: true } } : {}) } as never, isLoaded: true });

const mockFetchAwaiting = jest.fn(async () => undefined);
const mockDispatchUnit = jest.fn(async () => ({ ok: true, message: 'M-7 added', error: null }));
const mockDismiss = jest.fn(async () => ({ ok: true, message: null, error: null }));

beforeEach(() => {
  activateVariant('dispatch');
  setRights({});
  enable();
  useToastStore.setState({ toasts: [] });
  useAwaitingResourcesStore.setState({
    calls: [waitingCall(1) as never],
    unitAlerts: [],
    busyKey: null,
    loading: {},
    errors: {},
    fetchedAt: { calls: 1 },
    allResponseCodes: [{ Id: 3, Code: 'C3', Name: 'Hot', Color: '#ff0000', SortOrder: 0, Retired: false, Description: null }],
    requirementsByCall: {},
    lastPushAt: 0,
    fetchAwaitingCalls: mockFetchAwaiting,
    fetchResponseCodes: jest.fn(async () => undefined),
    dispatchUnit: mockDispatchUnit,
    dismissRequirement: mockDismiss,
  });
});

afterEach(() => useToastStore.getState().clearToasts());

describe('awaiting-resources helpers and nav', () => {
  it('labels calls, units and codes', () => {
    expect(awaitingCallLabel({ CallId: 4, CallNumber: ' ' })).toBe('4');
    expect(unitLabel('M-1', 'MUG')).toBe('M-1 (MUG)');
    const catalog = [{ Id: 3, Code: 'C3' }] as never;
    expect(findResponseCode(catalog, 'C3', 9)?.Id).toBe(3);
    expect(findResponseCode(catalog, null, 3)).toBeUndefined();
  });

  it('declares the flag- and capability-gated nav entry', () => {
    expect(awaitingResourcesNav[0]).toMatchObject({ href: '/awaiting-resources', requiresFlag: ['Dispatch.RunCards', 'Dispatch.RunCardConditions'] });
    expect(awaitingResourcesNav[0].requiresCapability?.({ calls: { runCards: false } } as never)).toBe(false);
  });
});

describe('AwaitingResourcesScreen', () => {
  it('lists waiting calls with what went instead and dispatches a matching unit in one step', async () => {
    render(<AwaitingResourcesScreen now={() => NOW} />);
    expect(mockFetchAwaiting).toHaveBeenCalledWith({ bypassCache: true });
    expect(screen.getByText('26-1 · Structure fire')).toBeTruthy();
    expect(screen.getByText('awaiting_resources.sent_instead:PIT P-21')).toBeTruthy();
    expect(screen.getByText('awaiting_resources.waiting_minutes:6')).toBeTruthy();
    expect(screen.getByText('awaiting_resources.response_time:4:05')).toBeTruthy();
    expect(screen.getByTestId('awaiting-requirement-51-code')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('awaiting-requirement-51-unit-7-dispatch')));
    expect(mockDispatchUnit).toHaveBeenCalledWith(1, 7);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'M-7 added' });
  });

  it('dismisses a requirement with a note after confirming', async () => {
    render(<AwaitingResourcesScreen now={() => NOW} />);
    fireEvent.press(screen.getByTestId('awaiting-requirement-51-dismiss'));
    fireEvent.changeText(screen.getByTestId('dismiss-requirement-note', hidden), '  covered by mutual aid ');
    await act(async () => fireEvent.press(screen.getByTestId('dismiss-requirement-dialog-confirm', hidden)));
    expect(mockDismiss).toHaveBeenCalledWith(1, 51, 'covered by mutual aid');
  });

  it('hides actions without the create-calls right and opens the call', () => {
    setRights({ CanCreateCalls: false });
    render(<AwaitingResourcesScreen now={() => NOW} />);
    expect(screen.queryByTestId('awaiting-requirement-51-dismiss')).toBeNull();
    expect(screen.queryByTestId('awaiting-requirement-51-unit-7-dispatch')).toBeNull();
    fireEvent.press(screen.getByTestId('awaiting-call-1-open'));
    expect(router.push).toHaveBeenCalledWith('/call/1');
  });

  it('shows the empty state, and "not enabled" once flags resolved off', () => {
    act(() => useAwaitingResourcesStore.setState({ calls: [] }));
    const { unmount } = render(<AwaitingResourcesScreen now={() => NOW} />);
    expect(screen.getByText('awaiting_resources.empty_title')).toBeTruthy();
    unmount();
    mockFetchAwaiting.mockClear();
    act(() => enable(false));
    render(<AwaitingResourcesScreen now={() => NOW} />);
    expect(screen.getByText('awaiting_resources.not_enabled')).toBeTruthy();
    expect(mockFetchAwaiting).not.toHaveBeenCalled();
  });
});

describe('banner, alerts and sync', () => {
  it('shows the banner while calls wait, opening the screen', () => {
    const { rerender } = render(<AwaitingResourcesBanner />);
    fireEvent.press(screen.getByTestId('awaiting-resources-banner'));
    expect(router.push).toHaveBeenCalledWith('/awaiting-resources');
    rerender(<AwaitingResourcesBanner hidden />);
    expect(screen.queryByTestId('awaiting-resources-banner')).toBeNull();
  });

  it('syncs on mount, raises alerts from pushes and announces automatic dispatch', async () => {
    const handle = jest.fn(() => ({ kind: OutstandingRequirementsAlertKind.AutoDispatched, unitId: 7, unitName: 'M-7', unitTypeName: null, message: 'M-7 auto-dispatched', calls: [] }));
    useAwaitingResourcesStore.setState({ handleOutstandingRequirementsUpdated: handle });
    render(<AwaitingResourcesHost />);
    expect(mockFetchAwaiting).toHaveBeenCalled();
    act(() => emitRealtimeEvent('outstandingRequirementsUpdated', '0', '{}'));
    expect(handle).toHaveBeenCalledWith('0', '{}');
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'info', message: 'M-7 auto-dispatched' });

    act(() =>
      useAwaitingResourcesStore.setState({
        unitAlerts: [
          {
            id: 'unit-7',
            unitId: 7,
            unitName: 'M-7',
            unitTypeName: 'MUG',
            message: null,
            receivedAt: NOW,
            calls: [{ callId: 1, callNumber: '26-1', callName: null, priority: 1, label: 'MUG', responseSeconds: 60, ageMinutes: 3 }],
          },
        ],
      })
    );
    expect(screen.getByText('awaiting_resources.unit_available_title:M-7 (MUG)')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('unit-available-alert-7-dispatch-1')));
    expect(mockDispatchUnit).toHaveBeenCalledWith(1, 7);
  });

  it('clears the store when the department turns conditions off', () => {
    const disable = jest.fn();
    useAwaitingResourcesStore.setState({ disable });
    enable(false);
    render(<AwaitingResourcesHost />);
    expect(disable).toHaveBeenCalled();
  });
});

describe('call outstanding requirements', () => {
  it('loads the call’s requirements and dismisses one', async () => {
    const fetchCallRequirements = jest.fn(async () => undefined);
    useAwaitingResourcesStore.setState({
      fetchCallRequirements,
      requirementsByCall: { '9': [{ CallOutstandingRequirementId: 5, CallId: 9, Label: 'Ladder', RequiredCount: 1, ResolvedCount: 0, SentInstead: null, ResponseCode: null, ResponseCodeId: null } as never] },
    });
    render(<CallOutstandingRequirements callId="9" canDismiss />);
    expect(fetchCallRequirements).toHaveBeenCalledWith('9', { bypassCache: false });
    expect(screen.getByText('awaiting_resources.requirement_progress:Ladder,0,1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('call-outstanding-requirements-5-dismiss'));
    await act(async () => fireEvent.press(screen.getByTestId('dismiss-requirement-dialog-confirm', hidden)));
    expect(mockDismiss).toHaveBeenCalledWith(9, 5, undefined);
  });

  it('registers the call detail tab for open calls with conditions on', () => {
    const unregister = registerAwaitingResourcesCallDetailTab();
    const tab = getCallDetailTabs().find((entry) => entry.id === OUTSTANDING_REQUIREMENTS_TAB_ID);
    const context = { capabilities: { calls: { runCards: true } }, isFeatureEnabled: () => true, call: { State: 0 } } as never;
    expect(tab?.visible?.(context)).toBe(true);
    expect(tab?.visible?.({ ...(context as object), call: { State: 1 } } as never)).toBe(false);
    unregister();
  });
});
