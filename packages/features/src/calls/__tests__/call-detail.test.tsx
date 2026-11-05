import './test-setup';

import { buildNewCallInput } from '@resgrid/api';
import { featureFlagsStore, type SecurityView, useAuthStore } from '@resgrid/auth';
import { getActiveVariant } from '@resgrid/config';
import { useCallDetailStore, useCallQueueActionsStore, useCallsStore, useCallVideoFeedsStore, useCheckInTimersStore, useNavigationEtaStore } from '@resgrid/data';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Dimensions, Text } from 'react-native';

import { CallDispatchedPanel } from '../components/detail/call-dispatched-panel';
import { BUILT_IN_CALL_DETAIL_TABS, registerBuiltInCallDetailTabs } from '../detail-tabs/built-in-tabs';
import { type CallDetailTabContext, getCallDetailTabs, registerCallDetailTab, resolveCallDetailTabs } from '../detail-tabs/registry';
import { registerCallFormHookPoints, resetCallFormHookPointsForTests } from '../hook-points';
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

  it('renders the call, its nature through HtmlRenderer (sanitized) and the registered tabs', async () => {
    activateVariant('responder');
    await render(<CallDetailScreen />);
    expect(screen.getByTestId('call-detail-title').props.children).toBe('House fire (#C-10)');
    const html = String(screen.getAllByTestId('webview-html')[0].props.children);
    expect(html).toContain('Flames visible');
    expect(html).not.toContain('<script');
    expect(screen.getByText('call_detail.tabs.info')).toBeTruthy();
    expect(screen.getByText('call_detail.tabs.dispatched')).toBeTruthy();
    expect(screen.queryByText('check_in.tab_title')).toBeNull();
  });

  it('renders a tab a module registered', async () => {
    activateVariant('responder');
    const remove = registerCallDetailTab({ id: 'records', order: 85, title: 'records.title', render: () => <Text>Records panel</Text> });
    const { unmount } = await render(<CallDetailScreen />);
    expect(screen.getByText('records.title')).toBeTruthy();
    await unmount();
    remove();
  });

  it('keeps the selected tab in the route, so Back from a chat channel opened on a tab remounts on that tab', async () => {
    activateVariant('responder');
    const first = await render(<CallDetailScreen />);
    await fireEvent.press(screen.getByTestId('shared-tab-dispatched'));
    expect(router.setParams).toHaveBeenCalledWith({ tab: 'dispatched' });
    await first.unmount();

    // The Slot shell unmounted the screen; Back restores the route with the params it had.
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '10', tab: 'dispatched' });
    await render(<CallDetailScreen />);

    expect(screen.getByTestId('shared-tab-dispatched').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(screen.getByTestId('shared-tab-info').props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  });

  it('sizes the action buttons to their labels and wraps the row rather than squeezing each into a fifth', async () => {
    activateVariant('responder');
    await render(<CallDetailScreen />);

    for (const id of ['notes', 'images', 'files', 'audio', 'route']) {
      const className = String(screen.getByTestId(`call-detail-${id}`).props.className ?? '');
      expect(className).toMatch(/\bgrow\b/);
      expect(className).not.toMatch(/\bflex-1\b/);
    }

    expect(screen.getByText('call_detail.images').props.numberOfLines).toBe(1);
  });

  it('stacks the tabs at full width under the summary on a landscape tablet', async () => {
    activateVariant('dispatch');
    const initial = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
    const board = { width: 1366, height: 1024, scale: 2, fontScale: 1 };
    await act(() => Dimensions.set({ window: board, screen: board }));

    try {
      await render(<CallDetailScreen />);
      const scroll = within(screen.getByTestId('call-detail-scroll'));
      expect(scroll.getByTestId('call-detail-summary')).toBeTruthy();
      expect(scroll.getByTestId('call-detail-notes')).toBeTruthy();
      expect(scroll.getByTestId('call-detail-tabs')).toBeTruthy();
    } finally {
      await act(() => Dimensions.set(initial));
    }
  });

  it('opens the menu with edit and close for users who may, and routes edit to the canonical path', async () => {
    activateVariant('responder');
    await render(<CallDetailScreen />);
    await fireEvent.press(screen.getByTestId('call-detail-menu-button'));
    expect(screen.getByTestId('call-menu-close', hidden)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('call-menu-edit', hidden));
    expect(router.push).toHaveBeenCalledWith('/call/10/edit');
  });

  it('offers neither edit nor close without the CanCreateCalls right', async () => {
    activateVariant('responder');
    setRights({ CanCreateCalls: false });
    await render(<CallDetailScreen />);
    await fireEvent.press(screen.getByTestId('call-detail-menu-button'));
    expect(screen.queryByTestId('call-menu-edit', hidden)).toBeNull();
    expect(screen.queryByTestId('call-menu-close', hidden)).toBeNull();
    expect(screen.getByTestId('call-menu-notes', hidden)).toBeTruthy();
  });

  const lastToast = () => useToastStore.getState().toasts[useToastStore.getState().toasts.length - 1];

  const setCall = (overrides: Parameters<typeof makeCall>[1]) =>
    useCallDetailStore.setState((state) => ({ details: { ...state.details, '10': { ...state.details['10'], call: makeCall('10', { Name: 'House fire', ...overrides }) } } }));

  it('scrolls a long nature in the summary and shows the whole nature as text above the note on the Info tab', async () => {
    activateVariant('responder');
    setCall({ Nature: '<p>Smoke showing</p><p>Second floor &amp; attic</p>', Note: '<p>Gate code 1234</p>' });
    await render(<CallDetailScreen />);

    const summaryNature = screen.getByTestId('call-detail-nature');
    expect(summaryNature.props.scrollEnabled).toBe(true);
    expect(summaryNature.props.nestedScrollEnabled).toBe(true);
    expect(summaryNature.props.showsVerticalScrollIndicator).toBe(true);

    const panel = within(screen.getByTestId('call-info-panel'));
    expect(panel.getByText('Smoke showing\nSecond floor & attic')).toBeTruthy();
    // Directly above the note, which scrolls too when it is long.
    expect(panel.getAllByTestId(/^call-info-(nature|note-html)$/).map((element) => element.props.testID)).toEqual(['call-info-nature', 'call-info-note-html']);
    expect(screen.getByTestId('call-info-note-html').props.nestedScrollEnabled).toBe(true);
  });

  it('shows the protected label for a withheld nature on the Info tab, never the sentinel', async () => {
    activateVariant('responder');
    setCall({ Nature: 'REDACTED', RedactedFields: ['calls.natureofcall'] });
    await render(<CallDetailScreen />);

    expect(screen.getByTestId('call-info-nature').props.accessibilityLabel).toBe('call_detail.nature: data_protection.protected_value');
    expect(screen.queryByText('REDACTED')).toBeNull();
  });

  it('offers dispatch more and delete on an active call, reschedule only while it is scheduled, and no close once closed (Dispatch menu)', async () => {
    activateVariant('ic');
    const { unmount } = await render(<CallDetailScreen />);
    await fireEvent.press(screen.getByTestId('call-detail-menu-button'));
    expect(screen.getByTestId('call-menu-dispatch-more', hidden)).toBeTruthy();
    expect(screen.getByTestId('call-menu-delete', hidden)).toBeTruthy();
    expect(screen.queryByTestId('call-menu-reschedule', hidden)).toBeNull();
    await unmount();

    setCall({ DispatchedOnUtc: new Date(Date.now() + 3_600_000).toISOString() });
    const scheduled = await render(<CallDetailScreen />);
    expect(screen.getByTestId('scheduled-call-banner')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('call-detail-menu-button'));
    expect(screen.getByTestId('call-menu-reschedule', hidden)).toBeTruthy();
    await scheduled.unmount();

    setCall({ State: 1 });
    await render(<CallDetailScreen />);
    await fireEvent.press(screen.getByTestId('call-detail-menu-button'));
    expect(screen.queryByTestId('call-menu-close', hidden)).toBeNull();
    expect(screen.queryByTestId('call-menu-dispatch-more', hidden)).toBeNull();
  });

  it('offers close and delete by their own permissions, and edit and dispatch more only to an admin or the member who logged the call', async () => {
    activateVariant('ic');
    useAuthStore.setState({ userId: 'member-7' });
    const menuIds = ['edit', 'dispatch-more', 'close', 'delete'];

    const openMenu = async () => {
      const view = await render(<CallDetailScreen />);
      await fireEvent.press(screen.getByTestId('call-detail-menu-button'));
      const offered = menuIds.filter((id) => screen.queryByTestId(`call-menu-${id}`, hidden) !== null);
      await view.unmount();

      return offered;
    };

    try {
      setRights({ CanCloseCalls: false, CanDeleteCalls: false });
      setCall({ ReportingUserId: 'someone-else' });
      expect(await openMenu()).toEqual([]);

      setRights({ CanCloseCalls: true, CanDeleteCalls: true });
      expect(await openMenu()).toEqual(['close', 'delete']);

      // Ids compare without case; a call nobody logged (an email import) is only an admin's to edit.
      setCall({ ReportingUserId: 'MEMBER-7' });
      expect(await openMenu()).toEqual(menuIds);

      setCall({ ReportingUserId: null });
      expect(await openMenu()).toEqual(['close', 'delete']);

      setRights({ IsAdmin: true, CanCloseCalls: true, CanDeleteCalls: true });
      expect(await openMenu()).toEqual(menuIds);
    } finally {
      useAuthStore.setState({ userId: null });
    }
  });

  it('asks before deleting a call, then deletes it and leaves the screen', async () => {
    const deleteCall = jest.fn(async () => undefined);
    useCallDetailStore.setState({ deleteCall });
    useCallsStore.setState({ fetchCalls: jest.fn(async () => undefined), refreshQueuedCallLists: jest.fn(async () => undefined) });
    activateVariant('unit');
    await render(<CallDetailScreen />);
    await fireEvent.press(screen.getByTestId('call-detail-menu-button'));
    await fireEvent.press(screen.getByTestId('call-menu-delete', hidden));
    expect(deleteCall).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByTestId('call-delete-confirm-confirm', hidden)));
    expect(deleteCall).toHaveBeenCalledWith('10');
    expect(lastToast().message).toBe('call_detail.delete_call_success');
    expect(router.back).toHaveBeenCalled();
  });

  it('dispatches a Pending call from its banner with the proposed recipients preselected', async () => {
    const dispatchNow = jest.fn(async () => ({ ok: true, error: null }));
    useCallQueueActionsStore.setState({ dispatchNow });
    setCall({ State: 8 });
    activateVariant('dispatch');
    await render(<CallDetailScreen />);
    expect(screen.getByTestId('pending-call-banner')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('pending-call-dispatch-button')));
    await act(async () => fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden)));
    expect(dispatchNow).toHaveBeenCalledWith('10', { dispatchList: 'U:1' });
  });

  it('routes to the call through the navigation hand-off, and says so when the call has no location', async () => {
    useToastStore.getState().clearToasts();
    setCall({ Address: '' });
    activateVariant('responder');
    await render(<CallDetailScreen />);
    await act(async () => fireEvent.press(screen.getByTestId('call-detail-route')));
    expect(lastToast().message).toBe('call_detail.no_location_for_routing');
  });

  it("shows the app's map of the call and toggles to its destination", async () => {
    resetCallFormHookPointsForTests();
    registerCallFormHookPoints({ StaticLocationMap: ({ latitude, longitude, address }) => <Text testID="static-map">{`${latitude},${longitude} ${address ?? ''}`}</Text> });
    setCall({ Latitude: '39.5', Longitude: '-105', DestinationLatitude: 39.6, DestinationLongitude: -105.1, DestinationName: 'County Hospital' });
    activateVariant('dispatch');

    try {
      await render(<CallDetailScreen />);
      expect(screen.getByTestId('static-map')).toHaveTextContent('39.5,-105 10 Main St');
      await fireEvent.press(screen.getByTestId('call-detail-map-destination'));
      expect(screen.getByTestId('static-map')).toHaveTextContent('39.6,-105.1 County Hospital');
    } finally {
      resetCallFormHookPointsForTests();
    }
  });

  it('shows a queued call as "not dispatched yet" and offers correction when it was rejected', async () => {
    activateVariant('unit');
    const request = { name: 'Offline call', nature: 'Smoke', priority: 1 };
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'local-5' });
    useCallsStore.setState({ queuedCalls: { 'local-5': { localId: 'local-5', request, input: buildNewCallInput(request), createdAt: 1, state: 'rejected' } } });
    await render(<CallDetailScreen />);
    expect(screen.getByTestId('queued-call-detail')).toBeTruthy();
    expect(screen.getByText('calls.queued.rejected_badge')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('queued-call-correct'));
    expect(router.push).toHaveBeenCalledWith('/call/new?correct=local-5');
  });

  it('refuses an unsafe route id', async () => {
    activateVariant('responder');
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '../x' });
    await render(<CallDetailScreen />);
    expect(screen.getByTestId('call-detail-invalid')).toBeTruthy();
  });
});

describe('CallDispatchedPanel live ETAs', () => {
  const dispatches = [
    { Id: '7', Type: 'Unit', Name: 'Engine 7' },
    { Id: 'u-1', Type: 'User', Name: 'Pat Doe' },
  ] as never;

  const navigation = (CallId: number) => ({
    UnitId: 7,
    CallId,
    RouteInstanceId: null,
    RouteInstanceStopId: null,
    State: 1,
    EtaUtc: new Date(Date.now() + 6 * 60_000).toISOString(),
    RemainingSeconds: 360,
    RemainingMeters: 5000,
    IsTrafficAware: false,
    Provider: 'valhalla',
    ReportedOn: new Date().toISOString(),
    IsStale: false,
  });

  const fetchActiveNavigations = jest.fn(async () => undefined);

  beforeEach(() => {
    fetchActiveNavigations.mockClear();
    featureFlagsStore.setState({ flags: { 'Navigation.InApp': { enabled: true } } as never, isLoaded: true });
    useNavigationEtaStore.setState({ navigations: { '7': navigation(12) }, serverClockOffsetMs: 0, fetchActiveNavigations });
  });

  // Still mounted here (RNTL unmounts after): reset inside act.
  afterEach(async () => {
    await act(() => {
      featureFlagsStore.setState({ flags: {} });
      useNavigationEtaStore.setState(useNavigationEtaStore.getInitialState());
    });
  });

  it("shows a dispatched unit's ETA to this call where the app shows ETAs (Dispatch)", async () => {
    activateVariant('dispatch');
    await render(<CallDispatchedPanel dispatches={dispatches} callId="12" />);
    expect(fetchActiveNavigations).toHaveBeenCalledWith({ bypassCache: true });
    expect(screen.getByTestId('call-dispatched-7-eta')).toHaveTextContent('navigation_eta.minutes:6');
    expect(screen.queryByTestId('call-dispatched-u-1-eta')).toBeNull();
  });

  it('shows no ETA for a unit navigating to another call', async () => {
    activateVariant('dispatch');
    useNavigationEtaStore.setState({ navigations: { '7': navigation(30) } });
    await render(<CallDispatchedPanel dispatches={dispatches} callId="12" />);
    expect(screen.queryByTestId('call-dispatched-7-eta')).toBeNull();
  });

  it('neither loads nor shows ETAs in apps without an ETA module (Responder)', async () => {
    activateVariant('responder');
    await render(<CallDispatchedPanel dispatches={dispatches} callId="12" />);
    expect(fetchActiveNavigations).not.toHaveBeenCalled();
    expect(screen.queryByTestId('call-dispatched-7-eta')).toBeNull();
    expect(screen.getByText('Engine 7')).toBeTruthy();
  });
});
