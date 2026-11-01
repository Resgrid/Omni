import { APP_STATE_DEBOUNCE_MS, resetAppLifecycleForTests } from '@resgrid/core/lifecycle/app-lifecycle';

import { BACKGROUND_DISCONNECT_GRACE_MS, RESUME_RECONNECT_DELAY_MS } from '../constants';
import { createRealtimeLifecycle, type RealtimeLifecycleController } from '../lifecycle';
import { type RealtimeState, useRealtimeStore } from '../realtime-store';
import { type HubWatchdog } from '../watchdog';
import { appStateListenerCount, emitAppState, Platform } from './fakes/react-native';
import { fakeSignalR } from './fakes/signalr';
import { flush, resetRealtime, setupRealtime, VARIANTS } from './helpers/realtime-test-env';

const GEO = 'geolocationHub';

/** Moves the app to a state through core's debounced lifecycle. */
const moveTo = (appState: string) => {
  emitAppState(appState);
  jest.advanceTimersByTime(APP_STATE_DEBOUNCE_MS);
};

describe('realtime lifecycle', () => {
  let original: Pick<RealtimeState, 'connectAll' | 'disconnectAll'>;
  let connectAll: jest.Mock;
  let disconnectAll: jest.Mock;
  let controller: RealtimeLifecycleController | null = null;

  const useSpies = () => {
    connectAll = jest.fn().mockResolvedValue(undefined);
    disconnectAll = jest.fn().mockResolvedValue(undefined);
    useRealtimeStore.setState({ connectAll, disconnectAll });
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    await resetRealtime();
    original = { connectAll: useRealtimeStore.getState().connectAll, disconnectAll: useRealtimeStore.getState().disconnectAll };
    Platform.OS = 'ios';
    emitAppState('active');
    resetAppLifecycleForTests();
  });

  afterEach(async () => {
    controller?.stop();
    controller = null;
    useRealtimeStore.setState(original);
    Platform.OS = 'ios';
    resetAppLifecycleForTests();
    await resetRealtime();
    jest.useRealTimers();
  });

  describe('native', () => {
    beforeEach(() => {
      setupRealtime(VARIANTS.responder);
      useSpies();
      controller = createRealtimeLifecycle({ watchdog: null });
      controller.start();
    });

    it('connects when signed in and ready in the foreground', async () => {
      controller?.setSession({ isSignedIn: true, isReady: false });
      expect(connectAll).not.toHaveBeenCalled();
      controller?.setSession({ isSignedIn: true, isReady: true });
      await flush();
      expect(connectAll).toHaveBeenCalledTimes(1);
    });

    it('disconnects after the 2 s background grace', async () => {
      controller?.setSession({ isSignedIn: true, isReady: true });
      await flush();

      moveTo('background');
      jest.advanceTimersByTime(BACKGROUND_DISCONNECT_GRACE_MS - 1);
      expect(disconnectAll).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      await flush();
      expect(disconnectAll).toHaveBeenCalledTimes(1);
    });

    it('keeps the hubs through a quick app switch', async () => {
      controller?.setSession({ isSignedIn: true, isReady: true });
      await flush();

      moveTo('background');
      jest.advanceTimersByTime(1000);
      moveTo('active');
      jest.advanceTimersByTime(BACKGROUND_DISCONNECT_GRACE_MS * 2);
      await flush();
      expect(disconnectAll).not.toHaveBeenCalled();
    });

    it('reconnects on resume after the resume delay', async () => {
      controller?.setSession({ isSignedIn: true, isReady: true });
      await flush();
      moveTo('background');
      jest.advanceTimersByTime(BACKGROUND_DISCONNECT_GRACE_MS);
      await flush();

      moveTo('active');
      jest.advanceTimersByTime(RESUME_RECONNECT_DELAY_MS);
      await flush();
      expect(connectAll).toHaveBeenCalledTimes(2);
    });

    it('closes every hub and drops live positions on sign-out', async () => {
      controller?.setSession({ isSignedIn: true, isReady: true });
      await flush();
      useRealtimeStore.setState({ liveLocations: { u1: { pinId: 'u1', latitude: 1, longitude: 1, timestamp: null, receivedAt: 1 } } });

      controller?.setSession({ isSignedIn: false, isReady: false });
      await flush();
      expect(disconnectAll).toHaveBeenCalledTimes(1);
      expect(useRealtimeStore.getState().liveLocations).toEqual({});
    });
  });

  it('reconnects the geolocation hub on resume only when the preference allows (Responder rule)', async () => {
    let geoAllowed = true;
    setupRealtime(VARIANTS.unit, { isRealtimeGeolocationEnabled: () => geoAllowed });
    fakeSignalR.invokeImpl = (method, _args, connection) => {
      if (method === 'GeolocationConnect') connection.serverPush('onGeolocationConnect', 'c');
      return undefined;
    };
    controller = createRealtimeLifecycle({ watchdog: null });
    controller.start();
    controller.setSession({ isSignedIn: true, isReady: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(fakeSignalR.forHub(GEO)).toHaveLength(1);

    moveTo('background');
    await jest.advanceTimersByTimeAsync(BACKGROUND_DISCONNECT_GRACE_MS);
    expect(useRealtimeStore.getState().hubs.geolocation.status).toBe('disconnected');

    geoAllowed = false;
    moveTo('active');
    await jest.advanceTimersByTimeAsync(RESUME_RECONNECT_DELAY_MS);
    expect(fakeSignalR.forHub(GEO)).toHaveLength(1);
    expect(useRealtimeStore.getState().hubs.eventing.joined).toBe(true);
  });

  it('never disconnects on web because the tab is hidden or the window minimised', async () => {
    Platform.OS = 'web';
    resetAppLifecycleForTests();
    setupRealtime(VARIANTS.dispatch);
    useSpies();
    controller = createRealtimeLifecycle({ watchdog: null });
    controller.start();
    controller.setSession({ isSignedIn: true, isReady: true });
    await flush();
    expect(connectAll).toHaveBeenCalledTimes(1);
    expect(appStateListenerCount()).toBe(0);

    moveTo('background');
    jest.advanceTimersByTime(60000);
    await flush();
    expect(disconnectAll).not.toHaveBeenCalled();
  });

  it('runs the watchdog only while signed in and in the foreground', async () => {
    setupRealtime(VARIANTS.bigboard);
    useSpies();
    const watchdog: HubWatchdog = { start: jest.fn(), stop: jest.fn(), isRunning: jest.fn(), runOnce: jest.fn() };
    controller = createRealtimeLifecycle({ watchdog });
    controller.start();
    expect(watchdog.start).not.toHaveBeenCalled();

    controller.setSession({ isSignedIn: true, isReady: true });
    expect(watchdog.start).toHaveBeenCalled();

    moveTo('background');
    expect(watchdog.stop).toHaveBeenCalled();
  });

  it('creates its own watchdog when the variant asks for one', () => {
    setupRealtime(VARIANTS.bigboard);
    useSpies();
    controller = createRealtimeLifecycle();
    controller.start();
    controller.setSession({ isSignedIn: true, isReady: true });
    // One interval for the watchdog.
    expect(jest.getTimerCount()).toBeGreaterThanOrEqual(1);
  });
});
