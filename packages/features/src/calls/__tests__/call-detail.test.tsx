import './test-setup';

import { buildNewCallInput } from '@resgrid/api';
import type { SecurityView } from '@resgrid/auth';
import { getActiveVariant } from '@resgrid/config';
import { useCallDetailStore, useCallsStore, useCallVideoFeedsStore, useCheckInTimersStore } from '@resgrid/data';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { BUILT_IN_CALL_DETAIL_TABS, registerBuiltInCallDetailTabs } from '../detail-tabs/built-in-tabs';
import { type CallDetailTabContext, getCallDetailTabs, registerCallDetailTab, resolveCallDetailTabs } from '../detail-tabs/registry';
import CallDetailScreen from '../screens/call-detail';
import { activateVariant, hidden, makeCall, setRights } from './test-utils';

const contextFor = (overrides: Partial<CallDetailTabContext> = {}): CallDetailTabContext => {
  const variant = getActiveVariant();
  return {
    callId: '10',
    call: makeCall('10'),
    extraData: null,
    capabilities: variant.capabilities,
    variantId: variant.id,
    security: {} as SecurityView,
    formFactor: 'phone',
    isFeatureEnabled: () => false,
    overdueCheckIns: 0,
    refresh: async () => undefined,
    openNotes: jest.fn(),
    openImages: jest.fn(),
    openFiles: jest.fn(),
    ...overrides,
  };
};

const ids = (context: CallDetailTabContext) => resolveCallDetailTabs(context).map((tab) => tab.id);

describe('call detail tab registry', () => {
  beforeEach(() => registerBuiltInCallDetailTabs());

  it('registers the shared tabs in order', () => {
    expect(getCallDetailTabs().map((tab) => tab.id)).toEqual(expect.arrayContaining(BUILT_IN_CALL_DETAIL_TABS.map((tab) => tab.id)));
    expect(BUILT_IN_CALL_DETAIL_TABS.map((tab) => tab.id)).toEqual(['info', 'protocols', 'dispatched', 'activity', 'notes', 'check-in', 'video-feeds', 'site-info', 'location-history']);
  });

  it('shows check-in only when timers run on the call or for checkIn.others, and video feeds unless videoFeeds is none', () => {
    activateVariant('responder');
    expect(ids(contextFor())).not.toContain('check-in');
    expect(ids(contextFor({ call: makeCall('10', { CheckInTimersEnabled: true }) }))).toContain('check-in');
    expect(ids(contextFor())).toContain('video-feeds');

    activateVariant('ic');
    expect(ids(contextFor())).toContain('check-in');

    activateVariant('bigboard');
    expect(ids(contextFor())).not.toContain('video-feeds');
  });

  it('hides site info when the call has no linked contacts (keeps it for older servers)', () => {
    activateVariant('dispatch');
    expect(ids(contextFor({ call: makeCall('10', { Contacts: [] }) }))).not.toContain('site-info');
    expect(ids(contextFor())).toContain('site-info');
  });

  it('lets a module add a variant-specific tab by order and hides a tab whose visibility throws', () => {
    activateVariant('ic');
    const removeIc = registerCallDetailTab({
      id: 'unit-readiness',
      order: 65,
      title: 'incident_command.tab_title',
      render: () => <Text>Readiness</Text>,
      visible: (context) => context.capabilities.incidentCommand === 'command',
    });
    const removeBroken = registerCallDetailTab({
      id: 'broken',
      order: 1,
      title: 'x',
      render: () => null,
      visible: () => {
        throw new Error('bad module');
      },
    });
    const icTabs = ids(contextFor());
    expect(icTabs.indexOf('unit-readiness')).toBe(icTabs.indexOf('check-in') + 1);
    expect(icTabs).not.toContain('broken');

    activateVariant('responder');
    expect(ids(contextFor())).not.toContain('unit-readiness');
    removeIc();
    removeBroken();
    expect(getCallDetailTabs().map((tab) => tab.id)).not.toContain('unit-readiness');
  });
});

describe('CallDetailScreen', () => {
  beforeEach(() => {
    setRights({});
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '10' });
    useCallsStore.setState({ queuedCalls: {}, callPriorities: [] });
    useCallDetailStore.setState({
      details: {
        '10': {
          call: makeCall('10', { Name: 'House fire', Nature: '<p>Flames visible</p><script>alert(1)</script>', NotesCount: 2 }),
          extraData: {
            CallFormData: '',
            Activity: [
              {
                Id: 'a',
                Timestamp: '2026-10-31T11:05:00Z',
                Type: 'Unit',
                Name: 'Engine 1',
                GroupId: '',
                Group: 'Station 1',
                Note: '',
                StatusId: 1,
                Location: '',
                StatusText: 'Responding',
                StatusColor: '#00f',
                DestinationSource: 3,
              },
            ],
            Dispatches: [{ Id: '1', Timestamp: '', Type: 'Unit', Name: 'Engine 1', GroupId: '', Group: 'Station 1', Note: '', StatusId: 0, Location: '', StatusText: '', StatusColor: '' }],
            Priority: { Id: 1, DepartmentId: 0, Name: '', Color: '', Sort: 0, IsDeleted: false, IsDefault: false, Tone: 0 },
            Protocols: [],
          },
          notes: [],
          images: null,
          files: null,
          audio: null,
          fetchedAt: 1,
        },
      },
      loading: {},
      errors: {},
      fetchCallDetail: jest.fn(async () => undefined),
      fetchCallNotes: jest.fn(async () => undefined),
      fetchCallSiteInfo: jest.fn(async () => undefined),
      fetchCallLocationHistory: jest.fn(async () => undefined),
    });
    useCheckInTimersStore.setState({ statusesByCall: {}, fetchTimerStatuses: jest.fn(async () => undefined) });
    useCallVideoFeedsStore.setState({ feedsByCall: {}, fetchFeeds: jest.fn(async () => undefined) });
  });

  it('renders the call, its nature through HtmlRenderer (sanitized) and the registered tabs', () => {
    activateVariant('responder');
    render(<CallDetailScreen />);
    expect(screen.getByTestId('call-detail-title').props.children).toBe('House fire (#C-10)');
    const html = String(screen.getAllByTestId('webview-html')[0].props.children);
    expect(html).toContain('Flames visible');
    expect(html).not.toContain('<script');
    expect(screen.getByText('call_detail.tabs.info')).toBeTruthy();
    expect(screen.getByText('call_detail.tabs.dispatched')).toBeTruthy();
    expect(screen.queryByText('check_in.tab_title')).toBeNull();
  });

  it('renders a tab a module registered', () => {
    activateVariant('responder');
    const remove = registerCallDetailTab({ id: 'records', order: 85, title: 'records.title', render: () => <Text>Records panel</Text> });
    const { unmount } = render(<CallDetailScreen />);
    expect(screen.getByText('records.title')).toBeTruthy();
    unmount();
    remove();
  });

  it('opens the menu with edit and close for users who may, and routes edit to the canonical path', () => {
    activateVariant('responder');
    render(<CallDetailScreen />);
    fireEvent.press(screen.getByTestId('call-detail-menu-button'));
    expect(screen.getByTestId('call-menu-close', hidden)).toBeTruthy();
    fireEvent.press(screen.getByTestId('call-menu-edit', hidden));
    expect(router.push).toHaveBeenCalledWith('/call/10/edit');
  });

  it('offers neither edit nor close without the CanCreateCalls right', () => {
    activateVariant('responder');
    setRights({ CanCreateCalls: false });
    render(<CallDetailScreen />);
    fireEvent.press(screen.getByTestId('call-detail-menu-button'));
    expect(screen.queryByTestId('call-menu-edit', hidden)).toBeNull();
    expect(screen.queryByTestId('call-menu-close', hidden)).toBeNull();
    expect(screen.getByTestId('call-menu-notes', hidden)).toBeTruthy();
  });

  it('shows a queued call as "not dispatched yet" and offers correction when it was rejected', () => {
    activateVariant('unit');
    const request = { name: 'Offline call', nature: 'Smoke', priority: 1 };
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'local-5' });
    useCallsStore.setState({ queuedCalls: { 'local-5': { localId: 'local-5', request, input: buildNewCallInput(request), createdAt: 1, state: 'rejected' } } });
    render(<CallDetailScreen />);
    expect(screen.getByTestId('queued-call-detail')).toBeTruthy();
    expect(screen.getByText('calls.queued.rejected_badge')).toBeTruthy();
    fireEvent.press(screen.getByTestId('queued-call-correct'));
    expect(router.push).toHaveBeenCalledWith('/call/new?correct=local-5');
  });

  it('refuses an unsafe route id', () => {
    activateVariant('responder');
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '../x' });
    render(<CallDetailScreen />);
    expect(screen.getByTestId('call-detail-invalid')).toBeTruthy();
  });
});
