import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { useToastStore } from '../../toast/store';
import { HeaderBackButton } from '../header-back-button';
import { CardSkeleton, ListSkeleton, Loading, LoadingSkeleton } from '../loading';
import { OfflineStatusToast } from '../offline-status-toast';
import { REALTIME_OUTAGE_GRACE_MS, RealtimeStatusBanner } from '../realtime-status-banner';
import { ScreenHeader } from '../screen-header';
import { getTypeIconUrl, getTypeMapIcon, TypeIcon, TypeMapIconProvider } from '../type-icon';
import { ZeroState } from '../zero-state';

describe('Loading (IC)', () => {
  it('shows a spinner with the translated default text and a progress role', () => {
    render(<Loading />);

    expect(screen.getByText('Loading...')).toBeTruthy();
    const container = screen.getByTestId('loading');
    expect(container.props.accessibilityRole).toBe('progressbar');
    expect(container.props.accessibilityLabel).toBe('Loading...');
  });

  it('uses custom text, or none', () => {
    const { rerender } = render(<Loading text="Fetching calls" />);
    expect(screen.getByText('Fetching calls')).toBeTruthy();

    rerender(<Loading text="" />);
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('renders the dots and icon variants and a fullscreen overlay', () => {
    const { rerender } = render(<Loading type="dots" fullscreen />);
    expect(screen.getByTestId('loading').props.className).toContain('absolute inset-0');

    rerender(<Loading type="icon" transparent />);
    expect(screen.getByTestId('loading').props.className).toContain('bg-transparent');
  });

  it('renders skeleton placeholders until loaded', () => {
    const { rerender } = render(
      <LoadingSkeleton isLoading>
        <Text>Loaded</Text>
      </LoadingSkeleton>
    );
    expect(screen.getByTestId('loading-skeleton')).toBeTruthy();

    rerender(
      <LoadingSkeleton isLoading={false}>
        <Text>Loaded</Text>
      </LoadingSkeleton>
    );
    expect(screen.getByText('Loaded')).toBeTruthy();
  });

  it('renders list and card skeletons', () => {
    const list = render(<ListSkeleton count={3} />);
    expect(list.getAllByTestId('loading-skeleton')).toHaveLength(3);
    list.unmount();

    const card = render(<CardSkeleton hasImage={false} hasFooter={false} />);
    expect(card.getAllByTestId('loading-skeleton')).toHaveLength(4);
  });
});

describe('ZeroState', () => {
  it('shows translated defaults', () => {
    render(<ZeroState />);

    expect(screen.getByText('No data available')).toBeTruthy();
    expect(screen.getByText("There's nothing to display at the moment")).toBeTruthy();
  });

  it('shows the error state as an alert', () => {
    render(<ZeroState isError />);

    expect(screen.getByText('An error occurred')).toBeTruthy();
    expect(screen.getByTestId('zero-state').props.accessibilityRole).toBe('alert');
  });

  it('renders custom heading, description and children', () => {
    render(
      <ZeroState heading="No calls" description="Calls will appear here">
        <Text>Retry</Text>
      </ZeroState>
    );

    expect(screen.getByText('No calls')).toBeTruthy();
    expect(screen.getByText('Calls will appear here')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });
});

describe('HeaderBackButton and ScreenHeader', () => {
  it('is an accessible back button in a fixed 40x40 frame', () => {
    const onPress = jest.fn();
    render(<HeaderBackButton onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Back' });
    fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('back-button-container').props.style).toEqual({ width: 40, height: 40 });
  });

  it('renders the title as a header with the back button', () => {
    const onBack = jest.fn();
    render(<ScreenHeader title="Call 1234" onBack={onBack} right={<Text>Edit</Text>} />);

    expect(screen.getByRole('header', { name: 'Call 1234' })).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    fireEvent.press(screen.getByTestId('back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('RealtimeStatusBanner (Responder, props-driven)', () => {
  const now = new Date('2026-10-31T12:00:00Z').getTime();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays hidden when no hub has ever dropped', () => {
    render(<RealtimeStatusBanner outages={{}} />);

    act(() => jest.advanceTimersByTime(REALTIME_OUTAGE_GRACE_MS * 2));
    expect(screen.queryByTestId('realtime-status-banner')).toBeNull();
  });

  it('stays hidden through a brief reconnect and shows once an outage outlasts the grace period', () => {
    const { rerender } = render(<RealtimeStatusBanner outages={{ eventingHub: { since: now, exhausted: false } }} />);

    act(() => jest.advanceTimersByTime(REALTIME_OUTAGE_GRACE_MS - 1));
    expect(screen.queryByTestId('realtime-status-banner')).toBeNull();

    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByTestId('realtime-status-banner')).toBeTruthy();

    rerender(<RealtimeStatusBanner outages={{}} />);
    expect(screen.queryByTestId('realtime-status-banner')).toBeNull();
  });

  it('shows immediately when reconnection is exhausted or the outage predates the mount', () => {
    const { rerender } = render(<RealtimeStatusBanner outages={{ eventingHub: { since: now, exhausted: true } }} />);
    expect(screen.getByTestId('realtime-status-banner')).toBeTruthy();

    rerender(<RealtimeStatusBanner outages={{ eventingHub: { since: now - REALTIME_OUTAGE_GRACE_MS - 1, exhausted: false } }} />);
    expect(screen.getByTestId('realtime-status-banner')).toBeTruthy();
  });

  it('counts down from the oldest outage when a second hub also drops', () => {
    const { rerender } = render(<RealtimeStatusBanner outages={{ eventingHub: { since: now, exhausted: false } }} />);

    act(() => jest.advanceTimersByTime(REALTIME_OUTAGE_GRACE_MS / 2));
    rerender(
      <RealtimeStatusBanner
        outages={{
          eventingHub: { since: now, exhausted: false },
          geolocationHub: { since: now + REALTIME_OUTAGE_GRACE_MS / 2, exhausted: false },
        }}
      />
    );

    act(() => jest.advanceTimersByTime(REALTIME_OUTAGE_GRACE_MS / 2));
    expect(screen.getByTestId('realtime-status-banner')).toBeTruthy();
  });

  it('is announced to screen readers as an alert', () => {
    render(<RealtimeStatusBanner outages={{ eventingHub: { since: now, exhausted: true } }} title="Offline" description="Updates paused" />);

    const banner = screen.getByTestId('realtime-status-banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(banner.props.accessibilityLabel).toBe('Offline. Updates paused');
  });
});

describe('OfflineStatusToast (IC, props-driven)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.getState().clearToasts();
  });

  afterEach(() => {
    useToastStore.getState().clearToasts();
    jest.useRealTimers();
  });

  it('shows a tappable pending-sync toast that opens the queue', () => {
    const onOpenQueue = jest.fn();
    render(<OfflineStatusToast isOffline={false} pendingCount={2} onOpenQueue={onOpenQueue} />);

    const [toast] = useToastStore.getState().toasts;
    expect(toast).toMatchObject({ type: 'info', message: 'View sync queue', title: '2 pending' });

    act(() => toast.onPress?.());
    expect(onOpenQueue).toHaveBeenCalledTimes(1);
  });

  it('shows a warning while offline and replaces it when the state changes', () => {
    const { rerender } = render(<OfflineStatusToast isOffline pendingCount={0} />);
    expect(useToastStore.getState().toasts).toEqual([expect.objectContaining({ type: 'warning', message: 'You are offline' })]);

    rerender(<OfflineStatusToast isOffline={false} pendingCount={0} />);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does not re-post when only the callback identity changes', () => {
    const { rerender } = render(<OfflineStatusToast isOffline={false} pendingCount={1} onOpenQueue={() => undefined} />);
    const firstId = useToastStore.getState().toasts[0].id;

    rerender(<OfflineStatusToast isOffline={false} pendingCount={1} onOpenQueue={() => undefined} />);

    expect(useToastStore.getState().toasts.map((toast) => toast.id)).toEqual([firstId]);
  });

  it('removes its toast on unmount', () => {
    const { unmount } = render(<OfflineStatusToast isOffline pendingCount={3} />);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    unmount();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});

describe('TypeIcon (Dispatch/BigBoard)', () => {
  const ICON_URL = 'https://api.resgrid.dev/api/v4/TypeIcons/u12.png';
  const MAP_ICONS = { ambulance: { imgName: 'ambulance', uri: { uri: 'https://example.test/ambulance.png' } } };
  const getIcon = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });
  const queryIcon = (testID: string) => screen.queryByTestId(testID, { includeHiddenElements: true });

  it('shows the uploaded icon when the type has one', () => {
    render(<TypeIcon iconUrl={ICON_URL} mapIcon="ambulance" mapIcons={MAP_ICONS} size={30} testID="type-icon" />);

    const image = getIcon('type-icon-url');
    expect(image.props.source).toEqual({ uri: ICON_URL });
    expect(image.props.cachePolicy).toBe('memory-disk');
    expect(image.props.style).toEqual(expect.objectContaining({ width: 30, height: 30 }));
    expect(queryIcon('type-icon-map')).toBeNull();
  });

  it('falls back to the bundled map icon from the provider, matching names loosely', () => {
    render(
      <TypeMapIconProvider icons={MAP_ICONS}>
        <TypeIcon mapIcon=" Ambu-lance" testID="type-icon" />
      </TypeMapIconProvider>
    );

    expect(getIcon('type-icon-map').props.source).toBe(MAP_ICONS.ambulance.uri);
  });

  it('falls through to the map icon, then the fallback, as images fail to load', () => {
    render(<TypeIcon iconUrl={ICON_URL} mapIcon="ambulance" mapIcons={MAP_ICONS} fallback={<Text>truck</Text>} testID="type-icon" />);

    fireEvent(getIcon('type-icon-url'), 'error');
    expect(getIcon('type-icon-map')).toBeTruthy();

    fireEvent(getIcon('type-icon-map'), 'error');
    expect(screen.getByText('truck')).toBeTruthy();
  });

  it('renders nothing by default and ignores non-http(s) URLs', () => {
    const { toJSON } = render(<TypeIcon iconUrl="javascript:alert(1)" />);

    expect(toJSON()).toBeNull();
    expect(getTypeIconUrl('/relative.png')).toBeNull();
    expect(getTypeIconUrl(' https://x.test/a.png ')).toBe('https://x.test/a.png');
    expect(getTypeMapIcon('unknown', MAP_ICONS)).toBeUndefined();
  });

  it('is hidden from screen readers (the name is shown as text)', () => {
    render(<TypeIcon iconUrl={ICON_URL} testID="type-icon" />);

    expect(screen.queryByTestId('type-icon')).toBeNull();
    expect(getIcon('type-icon').props.accessibilityElementsHidden).toBe(true);
  });
});
