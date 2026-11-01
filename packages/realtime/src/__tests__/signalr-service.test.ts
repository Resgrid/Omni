import { addLogListener, logger } from '@resgrid/core/logging/logger';
import type { LogRecord } from '@resgrid/core/logging/types';

import { reconnectDelayForAttempt, SIGNALR_MAX_RECONNECT_ATTEMPTS, SIGNALR_SERVER_TIMEOUT_MS } from '../constants';
import {
  buildHubUrl,
  HUB_CONNECTED_EVENT,
  HUB_DISCONNECTED_EVENT,
  HUB_RECONNECT_EXHAUSTED_EVENT,
  HUB_RECONNECTED_EVENT,
  HUB_RECONNECTING_EVENT,
  type HubConnectConfig,
  type RealtimeAuth,
  SignalRService,
} from '../signalr-service';
import { fakeSignalR, HubConnectionState, LogLevel } from './fakes/signalr';
import { createTestConnectivity, flush } from './helpers/realtime-test-env';

const EVENTING = 'eventingHub';
const GEO = 'geolocationHub';

const config = (hubName: string, methods: string[] = ['callsUpdated', 'outstandingRequirementsUpdated', 'onUnitLocationUpdated']): HubConnectConfig => ({
  name: hubName,
  eventingUrl: 'https://events.example.com/realtime?region=us',
  hubName,
  methods,
});

interface MutableAuth extends RealtimeAuth {
  token: string | null;
  refreshed: string | null;
  refreshCalls: number;
}

const createAuth = (token: string | null = 'token-1'): MutableAuth => {
  const auth: MutableAuth = {
    token,
    refreshed: token,
    refreshCalls: 0,
    getAccessToken: () => auth.token,
    refreshAccessToken: async () => {
      auth.refreshCalls += 1;
      auth.token = auth.refreshed;
    },
  };
  return auth;
};

/** Fails every `start()` from now on (until reset). */
const failAllStarts = (count = 50) => {
  for (let i = 0; i < count; i += 1) fakeSignalR.startBehaviors.push(new Error('network down'));
};

describe('SignalRService', () => {
  let auth: MutableAuth;
  let service: SignalRService;

  beforeEach(() => {
    jest.useFakeTimers();
    fakeSignalR.reset();
    auth = createAuth();
    service = new SignalRService({ auth });
  });

  afterEach(() => {
    service.resetForTests();
    jest.useRealTimers();
  });

  describe('connecting', () => {
    it('appends the hub to the eventing URL path, keeps its query and never puts a token in the URL', async () => {
      await service.connectToHubWithEventingUrl(config(GEO));
      const connection = fakeSignalR.latest(GEO);
      expect(connection.url).toBe('https://events.example.com/realtime/geolocationHub?region=us');
      expect(connection.url).not.toContain('access_token');
      expect(buildHubUrl('https://events.example.com', 'eventingHub')).toBe('https://events.example.com/eventingHub');
      expect(buildHubUrl('https://events.example.com/', 'eventingHub')).toBe('https://events.example.com/eventingHub');
    });

    it('authenticates every hub (geolocation included) through accessTokenFactory', async () => {
      await service.connectToHubWithEventingUrl(config(GEO));
      await service.connectToHubWithEventingUrl(config(EVENTING));
      expect(fakeSignalR.latest(GEO).tokensSeen).toEqual(['token-1']);
      expect(fakeSignalR.latest(EVENTING).tokensSeen).toEqual(['token-1']);
    });

    it('configures the 60 s server timeout, warning-level logging and the in-place reconnect schedule', async () => {
      await service.connectToHubWithEventingUrl(config(EVENTING));
      const connection = fakeSignalR.latest(EVENTING);
      expect(connection.serverTimeoutMs).toBe(SIGNALR_SERVER_TIMEOUT_MS);
      expect(connection.logLevel).toBe(LogLevel.Warning);
      expect(connection.automaticReconnect).toEqual([0, 2000, 5000, 10000, 30000]);
    });

    it('registers every configured method and emits CONNECTED scoped by hub name', async () => {
      const generic = jest.fn();
      const scoped = jest.fn();
      const otherHub = jest.fn();
      service.on(HUB_CONNECTED_EVENT, generic);
      service.on(`${HUB_CONNECTED_EVENT}:${EVENTING}`, scoped);
      service.on(`${HUB_CONNECTED_EVENT}:${GEO}`, otherHub);

      await service.connectToHubWithEventingUrl(config(EVENTING));

      expect([...fakeSignalR.latest(EVENTING).handlers.keys()]).toEqual(['callsUpdated', 'outstandingRequirementsUpdated', 'onUnitLocationUpdated']);
      expect(generic).toHaveBeenCalledWith(EVENTING);
      expect(scoped).toHaveBeenCalledWith(EVENTING);
      expect(otherHub).not.toHaveBeenCalled();
      expect(service.isHubConnected(EVENTING)).toBe(true);
    });

    it('does not build a second connection when already connected, and concurrent connects share one attempt', async () => {
      await Promise.all([service.connectToHubWithEventingUrl(config(EVENTING)), service.connectToHubWithEventingUrl(config(EVENTING))]);
      await service.connectToHubWithEventingUrl(config(EVENTING));
      expect(fakeSignalR.forHub(EVENTING)).toHaveLength(1);
    });

    it('throws without a token and without an eventing URL', async () => {
      auth.token = null;
      auth.refreshed = null;
      await expect(service.connectToHubWithEventingUrl(config(EVENTING))).rejects.toThrow('No authentication token available');
      await expect(service.connectToHubWithEventingUrl({ ...config(GEO), eventingUrl: '' })).rejects.toThrow('EventingUrl is required');
    });
  });

  describe('token read at call time', () => {
    it('sends the current token on automatic reconnect, not the connect-time token (Dispatch bug)', async () => {
      await service.connectToHubWithEventingUrl(config(EVENTING));
      const connection = fakeSignalR.latest(EVENTING);

      auth.token = 'token-2';
      connection.simulateReconnecting(new Error('transport lost'));
      await connection.simulateReconnected();

      expect(connection.tokensSeen).toEqual(['token-1', 'token-2']);
    });

    it('refreshes the token before rebuilding a closed hub and connects with the refreshed token', async () => {
      await service.connectToHubWithEventingUrl(config(GEO));
      auth.refreshed = 'token-3';

      fakeSignalR.latest(GEO).simulateClose(new Error('token expired'));
      await jest.advanceTimersByTimeAsync(reconnectDelayForAttempt(1));

      expect(auth.refreshCalls).toBe(1);
      expect(fakeSignalR.forHub(GEO)).toHaveLength(2);
      expect(fakeSignalR.latest(GEO).tokensSeen).toEqual(['token-3']);
      expect(fakeSignalR.latest(GEO).url).not.toContain('access_token');
      expect(service.isHubConnected(GEO)).toBe(true);
    });
  });

  describe('rebuild loop', () => {
    it('stops retrying when the token refresh comes back empty (Unit)', async () => {
      await service.connectToHubWithEventingUrl(config(EVENTING));
      auth.refreshed = null;

      fakeSignalR.latest(EVENTING).simulateClose();
      await jest.advanceTimersByTimeAsync(reconnectDelayForAttempt(1));

      expect(auth.refreshCalls).toBe(1);
      expect(fakeSignalR.forHub(EVENTING)).toHaveLength(1);
      expect(jest.getTimerCount()).toBe(0);
      expect(service.isHubAvailable(EVENTING)).toBe(false);
      expect(service.isHubReconnectExhausted(EVENTING)).toBe(false);

      await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(auth.refreshCalls).toBe(1);
    });

    it('retries 10 times with linear backoff (5 s steps, capped at 60 s) and then parks the hub', async () => {
      const exhausted = jest.fn();
      service.on(HUB_RECONNECT_EXHAUSTED_EVENT, exhausted);
      await service.connectToHubWithEventingUrl(config(EVENTING));
      failAllStarts();

      fakeSignalR.latest(EVENTING).simulateClose();

      for (let attempt = 1; attempt <= SIGNALR_MAX_RECONNECT_ATTEMPTS; attempt += 1) {
        const builtBefore = fakeSignalR.forHub(EVENTING).length;
        const delay = reconnectDelayForAttempt(attempt);
        expect(delay).toBe(Math.min(5000 * attempt, 60000));
        await jest.advanceTimersByTimeAsync(delay - 1);
        expect(fakeSignalR.forHub(EVENTING)).toHaveLength(builtBefore);
        await jest.advanceTimersByTimeAsync(1);
        expect(fakeSignalR.forHub(EVENTING)).toHaveLength(builtBefore + 1);
      }

      expect(auth.refreshCalls).toBe(SIGNALR_MAX_RECONNECT_ATTEMPTS);
      expect(exhausted).toHaveBeenCalledWith(EVENTING);
      expect(service.isHubReconnectExhausted(EVENTING)).toBe(true);
      expect(service.isHubAvailable(EVENTING)).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
      expect(reconnectDelayForAttempt(12)).toBe(60000);
      expect(reconnectDelayForAttempt(50)).toBe(60000);
    });

    it('schedules the rebuild loop when the first connect fails (cold start without network)', async () => {
      fakeSignalR.startBehaviors.push(new Error('offline'));
      await expect(service.connectToHubWithEventingUrl(config(EVENTING))).rejects.toThrow('offline');
      expect(service.isHubAvailable(EVENTING)).toBe(true);

      await jest.advanceTimersByTimeAsync(reconnectDelayForAttempt(1));
      expect(service.isHubConnected(EVENTING)).toBe(true);
    });

    it('lets a direct connect through while a rebuild is scheduled, and cancels the scheduled rebuild', async () => {
      await service.connectToHubWithEventingUrl(config(EVENTING));
      fakeSignalR.latest(EVENTING).simulateClose();
      expect(service.isHubReconnecting(EVENTING)).toBe(true);

      await service.connectToHubWithEventingUrl(config(EVENTING));
      expect(service.isHubConnected(EVENTING)).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(60000);
      expect(fakeSignalR.forHub(EVENTING)).toHaveLength(2);
    });

    it('emits CONNECTED for a rebuilt connection so subscribers re-announce', async () => {
      const connected = jest.fn();
      await service.connectToHubWithEventingUrl(config(EVENTING));
      service.on(HUB_CONNECTED_EVENT, connected);

      fakeSignalR.latest(EVENTING).simulateClose();
      await jest.advanceTimersByTimeAsync(reconnectDelayForAttempt(1));

      expect(connected).toHaveBeenCalledTimes(1);
      expect(service.getReconnectAttempts(EVENTING)).toBe(0);
    });

    it('recovers an exhausted hub when connectivity returns, with a fresh budget (Responder)', async () => {
      const connectivity = createTestConnectivity(true);
      service.configure({ connectivity });
      await service.connectToHubWithEventingUrl(config(EVENTING));
      failAllStarts(SIGNALR_MAX_RECONNECT_ATTEMPTS);

      fakeSignalR.latest(EVENTING).simulateClose();
      await jest.advanceTimersByTimeAsync(11 * 60 * 1000);
      expect(service.isHubReconnectExhausted(EVENTING)).toBe(true);
      expect(connectivity.listenerCount()).toBe(1);

      connectivity.setOnline(false);
      expect(service.isHubConnected(EVENTING)).toBe(false);
      connectivity.setOnline(true);
      await jest.advanceTimersByTimeAsync(0);

      expect(service.isHubConnected(EVENTING)).toBe(true);
      expect(service.isHubReconnectExhausted(EVENTING)).toBe(false);
      expect(service.getReconnectAttempts(EVENTING)).toBe(0);
    });

    it('does not stack retries on repeated online events', async () => {
      const connectivity = createTestConnectivity(true);
      service.configure({ connectivity });
      await service.connectToHubWithEventingUrl(config(EVENTING));
      failAllStarts(SIGNALR_MAX_RECONNECT_ATTEMPTS);
      fakeSignalR.latest(EVENTING).simulateClose();
      await jest.advanceTimersByTimeAsync(11 * 60 * 1000);
      const built = fakeSignalR.forHub(EVENTING).length;

      connectivity.setOnline(false);
      connectivity.setOnline(true);
      connectivity.setOnline(false);
      connectivity.setOnline(true);
      await jest.advanceTimersByTimeAsync(0);

      expect(fakeSignalR.forHub(EVENTING)).toHaveLength(built + 1);
    });
  });

  describe('intentional disconnect', () => {
    it('does not reconnect and reports the close as intentional', async () => {
      const disconnected = jest.fn();
      service.on(HUB_DISCONNECTED_EVENT, disconnected);
      await service.connectToHubWithEventingUrl(config(EVENTING));

      await service.disconnectFromHub(EVENTING);
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000);

      expect(disconnected).toHaveBeenCalledWith(EVENTING, { intentional: true });
      expect(fakeSignalR.forHub(EVENTING)).toHaveLength(1);
      expect(auth.refreshCalls).toBe(0);
      expect(service.isHubAvailable(EVENTING)).toBe(false);
    });

    it('cancels a pending rebuild', async () => {
      await service.connectToHubWithEventingUrl(config(EVENTING));
      fakeSignalR.latest(EVENTING).simulateClose();
      expect(jest.getTimerCount()).toBe(1);

      await service.disconnectFromHub(EVENTING);
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(60000);
      expect(fakeSignalR.forHub(EVENTING)).toHaveLength(1);
    });

    it('stops a rebuild whose token refresh was still running', async () => {
      await service.connectToHubWithEventingUrl(config(EVENTING));
      let releaseRefresh: () => void = () => undefined;
      auth.refreshAccessToken = () =>
        new Promise<void>((resolve) => {
          releaseRefresh = resolve;
        });

      fakeSignalR.latest(EVENTING).simulateClose();
      await jest.advanceTimersByTimeAsync(reconnectDelayForAttempt(1));
      await service.disconnectFromHub(EVENTING);
      releaseRefresh();
      await flush();

      expect(fakeSignalR.forHub(EVENTING)).toHaveLength(1);
      expect(service.isHubAvailable(EVENTING)).toBe(false);
    });

    it('removes its method handlers from the connection (connection.off cleanup)', async () => {
      await service.connectToHubWithEventingUrl(config(EVENTING));
      const connection = fakeSignalR.latest(EVENTING);
      await service.disconnectFromHub(EVENTING);
      expect([...connection.handlers.values()].every((set) => set.size === 0)).toBe(true);
    });

    it('waits for a connect in progress, then closes the connection it produced', async () => {
      const connecting = service.connectToHubWithEventingUrl(config(EVENTING));
      const disconnecting = service.disconnectFromHub(EVENTING);
      await Promise.all([connecting, disconnecting]);
      expect(service.isHubConnected(EVENTING)).toBe(false);
      expect(service.isHubAvailable(EVENTING)).toBe(false);
      await jest.advanceTimersByTimeAsync(60000);
      expect(fakeSignalR.forHub(EVENTING)).toHaveLength(1);
    });

    it('disconnectAll also clears hubs that are only waiting to rebuild or parked', async () => {
      await service.connectToHubWithEventingUrl(config(EVENTING));
      await service.connectToHubWithEventingUrl(config(GEO));
      fakeSignalR.latest(GEO).simulateClose();

      await service.disconnectAll();

      expect(jest.getTimerCount()).toBe(0);
      expect(service.isHubAvailable(EVENTING)).toBe(false);
      expect(service.isHubAvailable(GEO)).toBe(false);
    });
  });

  describe('automatic reconnect events', () => {
    it('emits RECONNECTING and RECONNECTED scoped by hub', async () => {
      const reconnecting = jest.fn();
      const reconnected = jest.fn();
      const otherHub = jest.fn();
      service.on(`${HUB_RECONNECTING_EVENT}:${EVENTING}`, reconnecting);
      service.on(`${HUB_RECONNECTED_EVENT}:${EVENTING}`, reconnected);
      service.on(`${HUB_RECONNECTED_EVENT}:${GEO}`, otherHub);
      await service.connectToHubWithEventingUrl(config(EVENTING));

      const connection = fakeSignalR.latest(EVENTING);
      connection.simulateReconnecting();
      expect(service.isHubConnected(EVENTING)).toBe(false);
      expect(service.isHubAvailable(EVENTING)).toBe(true);
      await connection.simulateReconnected();

      expect(reconnecting).toHaveBeenCalledWith(EVENTING);
      expect(reconnected).toHaveBeenCalledWith(EVENTING);
      expect(otherHub).not.toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('forwards every hub argument to listeners (BigBoard forwarded only the first)', async () => {
      const listener = jest.fn();
      service.on('outstandingRequirementsUpdated', listener);
      await service.connectToHubWithEventingUrl(config(EVENTING));

      fakeSignalR.latest(EVENTING).serverPush('outstandingRequirementsUpdated', '17', { Requirements: [1, 2] });

      expect(listener).toHaveBeenCalledWith('17', { Requirements: [1, 2] });
    });

    it('keeps delivering to the other listeners when one throws (Responder lacked the guard)', async () => {
      const failing = jest.fn(() => {
        throw new Error('listener bug');
      });
      const healthy = jest.fn();
      service.on('callsUpdated', failing);
      service.on('callsUpdated', healthy);
      await service.connectToHubWithEventingUrl(config(EVENTING));

      expect(() => fakeSignalR.latest(EVENTING).serverPush('callsUpdated', '5')).not.toThrow();
      expect(failing).toHaveBeenCalled();
      expect(healthy).toHaveBeenCalledWith('5');
    });

    it('unsubscribes through the returned function and off()', () => {
      const listener = jest.fn();
      const off = service.on('callsUpdated', listener);
      expect(service.getEventListenerCount('callsUpdated')).toBe(1);
      off();
      expect(service.getEventListenerCount('callsUpdated')).toBe(0);
      service.on('callsUpdated', listener);
      service.off('callsUpdated', listener);
      expect(service.getTotalEventListenerCount()).toBe(0);
    });

    it('never logs location pushes or any message payload', async () => {
      const records: LogRecord[] = [];
      logger.setMinLevel('debug');
      const removeListener = addLogListener((record) => records.push(record));
      try {
        await service.connectToHubWithEventingUrl(config(EVENTING));
        const connection = fakeSignalR.latest(EVENTING);
        connection.serverPush('onUnitLocationUpdated', { UnitId: 4, Latitude: 39.1234, Longitude: -104.5678 });
        connection.serverPush('callsUpdated', 'secret-call-payload');
      } finally {
        removeListener();
        logger.setMinLevel('warn');
      }
      const text = JSON.stringify(records);
      expect(text).not.toContain('onUnitLocationUpdated');
      expect(text).not.toContain('39.1234');
      expect(text).not.toContain('secret-call-payload');
      expect(text).not.toContain('token-1');
      expect(records.some((record) => record.message.includes('Received callsUpdated'))).toBe(true);
    });
  });

  describe('invoke', () => {
    it('returns typed results', async () => {
      fakeSignalR.invokeImpl = (method, args) => ({ method, args });
      await service.connectToHubWithEventingUrl(config(EVENTING));
      const result = await service.invoke<{ method: string; args: unknown[] }>(EVENTING, 'Connect', 42);
      expect(result).toEqual({ method: 'Connect', args: [42] });
    });

    it('throws for a hub that is not connected, and while reconnecting without touching the transport', async () => {
      await expect(service.invoke(EVENTING, 'Connect', 1)).rejects.toThrow('hub is not connected');

      await service.connectToHubWithEventingUrl(config(EVENTING));
      const connection = fakeSignalR.latest(EVENTING);
      connection.simulateReconnecting();
      await expect(service.invoke(EVENTING, 'Connect', 1)).rejects.toThrow('hub is not connected');
      expect(connection.invocations).toHaveLength(0);
      expect(connection.state).toBe(HubConnectionState.Reconnecting);
    });

    it('waits for a connect in progress before invoking', async () => {
      const connecting = service.connectToHubWithEventingUrl(config(EVENTING));
      const invoking = service.invoke(EVENTING, 'Connect', 7);
      await connecting;
      await invoking;
      expect(fakeSignalR.latest(EVENTING).invocationsOf('Connect')).toEqual([[7]]);
    });
  });
});
