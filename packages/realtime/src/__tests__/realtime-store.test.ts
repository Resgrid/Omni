import { HUB_JOIN_MAX_ATTEMPTS, HUB_JOIN_RETRY_MS, reconnectDelayForAttempt } from '../constants';
import { type HubJoinInfo, onRealtimeEvent } from '../event-bus';
import { COMMON_EVENTING_EVENTS, resolveRealtimeFeatures } from '../events';
import { getWantedHubs, teardownRealtime, useRealtimeStore } from '../realtime-store';
import { signalRService } from '../signalr-service';
import { type FakeHubConnection, fakeSignalR } from './fakes/signalr';
import { createTestConnectivity, flush, resetRealtime, setupRealtime, VARIANTS } from './helpers/realtime-test-env';

const EVENTING = 'eventingHub';
const GEO = 'geolocationHub';
const CHAT = 'chatHub';

const state = () => useRealtimeStore.getState();

/** Makes the server acknowledge group joins the way Core does (caller message before the invocation completes). */
const acknowledgeJoins = () => {
  fakeSignalR.invokeImpl = (method, _args, connection) => {
    if (method === 'GeolocationConnect') connection.serverPush('onGeolocationConnect', connection.connectionId);
    return undefined;
  };
};

describe('resolveRealtimeFeatures (per-variant event sets)', () => {
  it('gives every app the common events, and extras only by capability/module', () => {
    const responder = resolveRealtimeFeatures(VARIANTS.responder);
    const unit = resolveRealtimeFeatures(VARIANTS.unit);
    const ic = resolveRealtimeFeatures(VARIANTS.ic);
    const dispatch = resolveRealtimeFeatures(VARIANTS.dispatch);
    const bigboard = resolveRealtimeFeatures(VARIANTS.bigboard);

    [responder, unit, ic, dispatch, bigboard].forEach((features) => expect(features.eventingEvents).toEqual(expect.arrayContaining([...COMMON_EVENTING_EVENTS])));
    expect(responder.eventingEvents).toEqual([...COMMON_EVENTING_EVENTS]);
    expect(unit.eventingEvents).toEqual([...COMMON_EVENTING_EVENTS]);
    expect(ic.eventingEvents).toEqual([...COMMON_EVENTING_EVENTS, 'checkInUpdated']);
    expect(dispatch.eventingEvents).toEqual([...COMMON_EVENTING_EVENTS, 'unitActiveRolesUpdated', 'checkInUpdated', 'outstandingRequirementsUpdated']);
    expect(bigboard.eventingEvents).toEqual([...COMMON_EVENTING_EVENTS, 'unitStatusAlertUpdated']);
    expect(COMMON_EVENTING_EVENTS).toEqual(expect.arrayContaining(['weatherAlertReceived', 'weatherAlertUpdated', 'weatherAlertExpired', 'checklistUpdated', 'departmentUpdated']));
  });

  it('enables the chat hub, watchdog, geo default and coalesced board refresh from capabilities', () => {
    expect(resolveRealtimeFeatures(VARIANTS.bigboard)).toMatchObject({ chatHub: false, chatEvents: [], hubWatchdog: true, geoHubDefault: true });
    expect(resolveRealtimeFeatures(VARIANTS.dispatch)).toMatchObject({ chatHub: true, hubWatchdog: true });
    expect(resolveRealtimeFeatures(VARIANTS.responder)).toMatchObject({ chatHub: true, hubWatchdog: false, geoHubDefault: false, coalescedBoardRefresh: false });
    expect(resolveRealtimeFeatures(VARIANTS.ic).coalescedBoardRefresh).toBe(true);
    expect(resolveRealtimeFeatures(VARIANTS.unit).chatEvents).toEqual(expect.arrayContaining(['chatMessageReceived', 'chatAccessRevoked', 'chatTyping', 'chatPresenceChanged']));
  });
});

describe('realtime store', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await resetRealtime();
    acknowledgeJoins();
  });

  afterEach(async () => {
    await resetRealtime();
    jest.useRealTimers();
  });

  describe('eventing hub', () => {
    it('connects, registers the variant event set and joins the department group', async () => {
      setupRealtime(VARIANTS.dispatch);
      const joined = jest.fn();
      onRealtimeEvent('eventingHubJoined', joined);

      await state().connectEventingHub();

      const connection = fakeSignalR.latest(EVENTING);
      expect([...connection.handlers.keys()]).toEqual(expect.arrayContaining(['unitActiveRolesUpdated', 'checkInUpdated', 'outstandingRequirementsUpdated', 'onConnected']));
      expect(connection.handlers.has('unitStatusAlertUpdated')).toBe(false);
      expect(connection.invocationsOf('Connect')).toEqual([[42]]);
      expect(state().hubs.eventing).toMatchObject({ status: 'connected', joined: true });
      expect(joined).toHaveBeenCalledWith(expect.objectContaining({ hub: 'eventing', rejoin: false }));
      expect(getWantedHubs()).toEqual(['eventing']);
    });

    it('re-invokes Connect(departmentId) after an automatic reconnect and tracks the outage meanwhile', async () => {
      setupRealtime(VARIANTS.responder);
      const joined: HubJoinInfo[] = [];
      onRealtimeEvent('eventingHubJoined', (info) => joined.push(info));
      await state().connectEventingHub();
      const connection = fakeSignalR.latest(EVENTING);

      connection.simulateReconnecting();
      expect(state().hubs.eventing).toMatchObject({ status: 'reconnecting', joined: false });
      expect(state().outages.eventing).toEqual({ since: expect.any(Number), exhausted: false });

      await connection.simulateReconnected();
      await flush();

      expect(connection.invocationsOf('Connect')).toEqual([[42], [42]]);
      expect(state().hubs.eventing.joined).toBe(true);
      expect(state().outages.eventing).toBeUndefined();
      expect(joined.map((info) => info.rejoin)).toEqual([false, true]);
    });

    it('re-invokes Connect on the new connection after a close and rebuild', async () => {
      setupRealtime(VARIANTS.unit);
      await state().connectEventingHub();
      fakeSignalR.latest(EVENTING).simulateClose(new Error('token expired'));
      expect(state().hubs.eventing.status).toBe('reconnecting');

      await jest.advanceTimersByTimeAsync(reconnectDelayForAttempt(1));

      const connections = fakeSignalR.forHub(EVENTING);
      expect(connections).toHaveLength(2);
      expect(connections[1].invocationsOf('Connect')).toEqual([[42]]);
      expect(state().hubs.eventing.joined).toBe(true);
    });

    it('retries a failed join a few times, then gives up until the next connect', async () => {
      setupRealtime(VARIANTS.responder);
      fakeSignalR.invokeImpl = (method) => {
        if (method === 'Connect') throw new Error('hub refused');
      };

      await state().connectEventingHub();
      expect(state().hubs.eventing.joined).toBe(false);

      await jest.advanceTimersByTimeAsync(HUB_JOIN_RETRY_MS * (HUB_JOIN_MAX_ATTEMPTS + 2));
      expect(fakeSignalR.latest(EVENTING).invocationsOf('Connect')).toHaveLength(HUB_JOIN_MAX_ATTEMPTS);

      acknowledgeJoins();
      await state().connectEventingHub();
      expect(state().hubs.eventing.joined).toBe(true);
    });

    it('ignores a join that completes after its connection was torn down (generation guard)', async () => {
      setupRealtime(VARIANTS.responder);
      let releaseJoin: () => void = () => undefined;
      fakeSignalR.invokeImpl = (method) =>
        method === 'Connect'
          ? new Promise<void>((resolve) => {
              releaseJoin = resolve;
            })
          : undefined;

      const connecting = state().connectEventingHub();
      await flush(10);
      fakeSignalR.latest(EVENTING).simulateReconnecting();
      releaseJoin();
      await connecting;

      expect(state().hubs.eventing.joined).toBe(false);
      expect(state().hubs.eventing.status).toBe('reconnecting');
    });

    it('does not let a stale joined flag block a repair', async () => {
      setupRealtime(VARIANTS.responder);
      useRealtimeStore.setState((current) => ({ hubs: { ...current.hubs, eventing: { status: 'connected', joined: true, joinedAt: 1 } } }));
      await state().connectEventingHub();
      expect(fakeSignalR.forHub(EVENTING)).toHaveLength(1);
      expect(fakeSignalR.latest(EVENTING).invocationsOf('Connect')).toEqual([[42]]);
    });

    it('needs a department id to join', async () => {
      setupRealtime(VARIANTS.responder, { getDepartmentId: () => null });
      await state().connectEventingHub();
      expect(fakeSignalR.latest(EVENTING).invocationsOf('Connect')).toHaveLength(0);
      expect(state().hubs.eventing.joined).toBe(false);
    });

    it('records an error and connects nothing without an EventingUrl', async () => {
      setupRealtime(VARIANTS.responder, { getEventingUrl: () => null });
      await state().connectEventingHub();
      expect(fakeSignalR.connections).toHaveLength(0);
      expect(state().error?.message).toContain('EventingUrl');
    });
  });

  describe('typed consumer events', () => {
    it('normalizes ids and forwards every further argument', async () => {
      setupRealtime(VARIANTS.dispatch);
      const calls = jest.fn();
      const requirements = jest.fn();
      const department = jest.fn();
      const alerts = jest.fn();
      onRealtimeEvent('callsUpdated', calls);
      onRealtimeEvent('outstandingRequirementsUpdated', requirements);
      onRealtimeEvent('departmentUpdated', department);
      onRealtimeEvent('weatherAlertReceived', alerts);
      await state().connectEventingHub();
      const connection = fakeSignalR.latest(EVENTING);

      connection.serverPush('callsUpdated', 123);
      connection.serverPush('outstandingRequirementsUpdated', '9', { Missing: 2 }, 'extra');
      connection.serverPush('departmentUpdated');
      connection.serverPush('weatherAlertReceived', { AlertId: 'a-1' });

      expect(calls).toHaveBeenCalledWith('123');
      expect(requirements).toHaveBeenCalledWith('9', { Missing: 2 }, 'extra');
      expect(department).toHaveBeenCalledWith();
      expect(alerts).toHaveBeenCalledWith('a-1');
      expect(state().lastEventName).toBe('weatherAlertReceived');
    });

    it('isolates a throwing consumer from the others', async () => {
      setupRealtime(VARIANTS.responder);
      const healthy = jest.fn();
      onRealtimeEvent('unitStatusUpdated', () => {
        throw new Error('consumer bug');
      });
      onRealtimeEvent('unitStatusUpdated', healthy);
      await state().connectEventingHub();

      fakeSignalR.latest(EVENTING).serverPush('unitStatusUpdated', '3');
      expect(healthy).toHaveBeenCalledWith('3');
    });
  });

  describe('geolocation hub', () => {
    it('joins with GeolocationConnect and counts as joined only on the server ack', async () => {
      setupRealtime(VARIANTS.dispatch);
      fakeSignalR.invokeImpl = () => undefined;
      await state().connectGeolocationHub();
      const connection = fakeSignalR.latest(GEO);
      expect(connection.invocationsOf('GeolocationConnect')).toEqual([[]]);
      expect(state().hubs.geolocation.joined).toBe(false);

      connection.serverPush('onGeolocationConnect', 'c');
      expect(state().hubs.geolocation).toMatchObject({ joined: true, joinedAt: expect.any(Number) });
    });

    it('re-invokes GeolocationConnect after a reconnect', async () => {
      setupRealtime(VARIANTS.dispatch);
      await state().connectGeolocationHub();
      const connection = fakeSignalR.latest(GEO);
      const firstJoin = state().hubs.geolocation.joinedAt;

      connection.simulateReconnecting();
      jest.advanceTimersByTime(10);
      await connection.simulateReconnected();
      await flush();

      expect(connection.invocationsOf('GeolocationConnect')).toHaveLength(2);
      expect(state().hubs.geolocation.joined).toBe(true);
      expect(state().hubs.geolocation.joinedAt).toBeGreaterThan(firstJoin);
      // Geolocation is cosmetic: never an outage.
      expect(state().outages).toEqual({});
    });

    it('merges live locations, drops older fixes and emits parsed location events', async () => {
      setupRealtime(VARIANTS.bigboard);
      const units = jest.fn();
      onRealtimeEvent('unitLocationUpdated', units);
      await state().connectGeolocationHub();
      const connection = fakeSignalR.latest(GEO);

      connection.serverPush('onUnitLocationUpdated', { UnitId: 12, Latitude: 39.5, Longitude: -104.9, Timestamp: '2026-10-31T10:00:05Z' });
      connection.serverPush('onPersonnelLocationUpdated', JSON.stringify({ userId: 'ABC', latitude: 40, longitude: -105 }));
      connection.serverPush('onUnitLocationUpdated', { UnitId: 12, Latitude: 1, Longitude: 1, Timestamp: '2026-10-31T10:00:00Z' });
      connection.serverPush('onUnitLocationUpdated', { UnitId: 13, Latitude: 0, Longitude: 0 });

      const live = state().liveLocations;
      expect(Object.keys(live).sort()).toEqual(['pabc', 'u12']);
      expect(live.u12).toMatchObject({ latitude: 39.5, longitude: -104.9 });
      expect(units).toHaveBeenCalledWith(expect.objectContaining({ pinId: 'u12' }), expect.anything());

      state().clearLiveLocations();
      expect(state().liveLocations).toEqual({});
    });
  });

  describe('chat hub', () => {
    it('is skipped when the variant has no chat hub (BigBoard)', async () => {
      setupRealtime(VARIANTS.bigboard);
      await state().connectAll({ geolocation: false });
      await state().connectChatHub();
      expect(fakeSignalR.forHub(CHAT)).toHaveLength(0);
      expect(fakeSignalR.forHub(EVENTING)).toHaveLength(1);
    });

    it('is skipped when the injected chat gate is off', async () => {
      setupRealtime(VARIANTS.responder, { isChatEnabled: () => false });
      await state().connectChatHub();
      expect(fakeSignalR.forHub(CHAT)).toHaveLength(0);
    });

    it('arms with Connect, starts the heartbeat and replays SetActiveChannel after every reconnect', async () => {
      setupRealtime(VARIANTS.unit);
      const joined = jest.fn();
      onRealtimeEvent('chatHubJoined', joined);
      await state().connectChatHub();
      const connection = fakeSignalR.latest(CHAT);
      expect(connection.invocationsOf('Connect')).toEqual([[]]);
      expect(connection.invocationsOf('SetActiveChannel')).toEqual([]);

      await state().setActiveChatChannel('chan-1', 77);
      expect(connection.invocationsOf('SetActiveChannel')).toEqual([['chan-1', 77]]);

      connection.simulateReconnecting();
      await connection.simulateReconnected();
      await flush(10);

      expect(connection.invocationsOf('Connect')).toEqual([[], []]);
      expect(connection.invocationsOf('SetActiveChannel')).toEqual([
        ['chan-1', 77],
        ['chan-1', 77],
      ]);
      expect(joined).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(45000);
      expect(connection.invocationsOf('Heartbeat')).toHaveLength(1);

      connection.simulateReconnecting();
      await jest.advanceTimersByTimeAsync(90000);
      expect(connection.invocationsOf('Heartbeat')).toHaveLength(1);
    });

    it('replays a clear that never reached the server', async () => {
      setupRealtime(VARIANTS.responder);
      await state().connectChatHub();
      const connection = fakeSignalR.latest(CHAT);
      await state().setActiveChatChannel('chan-2');
      connection.simulateReconnecting();
      await state().setActiveChatChannel(null);
      expect(connection.invocationsOf('SetActiveChannel')).toEqual([['chan-2', null]]);

      await connection.simulateReconnected();
      await flush(10);
      expect(connection.invocationsOf('SetActiveChannel')).toEqual([
        ['chan-2', null],
        [null, null],
      ]);
    });

    it('forwards presence as (userId, isOnline)', async () => {
      setupRealtime(VARIANTS.responder);
      const presence = jest.fn();
      onRealtimeEvent('chatPresenceChanged', presence);
      await state().connectChatHub();
      fakeSignalR.latest(CHAT).serverPush('chatPresenceChanged', 'user-1', true);
      expect(presence).toHaveBeenCalledWith('user-1', true);
    });
  });

  describe('connectAll and the geolocation preference', () => {
    it('connects the geolocation hub only when the preference allows', async () => {
      setupRealtime(VARIANTS.unit, { isRealtimeGeolocationEnabled: () => false });
      await state().connectAll();
      expect(fakeSignalR.forHub(GEO)).toHaveLength(0);
      expect(fakeSignalR.forHub(EVENTING)).toHaveLength(1);
      expect(fakeSignalR.forHub(CHAT)).toHaveLength(1);
    });

    it('falls back to the variant default when no preference is set', async () => {
      setupRealtime(VARIANTS.unit, { isRealtimeGeolocationEnabled: async () => undefined });
      await state().connectAll();
      expect(fakeSignalR.forHub(GEO)).toHaveLength(1);

      await resetRealtime();
      acknowledgeJoins();
      setupRealtime(VARIANTS.responder);
      await state().connectAll();
      expect(fakeSignalR.forHub(GEO)).toHaveLength(0);
    });
  });

  describe('outage tracking', () => {
    it('raises no outage for a hub that never joined or for an intentional disconnect', async () => {
      setupRealtime(VARIANTS.responder);
      fakeSignalR.startBehaviors.push(new Error('offline'));
      await state().connectEventingHub();
      expect(state().outages).toEqual({});
      await jest.advanceTimersByTimeAsync(reconnectDelayForAttempt(1));
      expect(state().hubs.eventing.joined).toBe(true);

      await state().disconnectEventingHub();
      expect(state().outages).toEqual({});
      expect(state().hubs.eventing).toMatchObject({ status: 'disconnected', joined: false });
      expect(getWantedHubs()).toEqual([]);
    });

    it('flags an exhausted outage and clears it when connectivity brings the hub back', async () => {
      const connectivity = createTestConnectivity(true);
      setupRealtime(VARIANTS.responder, { connectivity });
      await state().connectEventingHub();
      for (let i = 0; i < 10; i += 1) fakeSignalR.startBehaviors.push(new Error('down'));

      fakeSignalR.latest(EVENTING).simulateClose();
      const since = state().outages.eventing?.since;
      await jest.advanceTimersByTimeAsync(11 * 60 * 1000);
      expect(state().outages.eventing).toEqual({ since, exhausted: true });

      connectivity.setOnline(false);
      connectivity.setOnline(true);
      await jest.advanceTimersByTimeAsync(0);
      await flush();
      expect(state().hubs.eventing.joined).toBe(true);
      expect(state().outages).toEqual({});
    });
  });

  describe('teardown', () => {
    it('disconnects every hub, stops timers and resets state', async () => {
      setupRealtime(VARIANTS.unit);
      await state().connectAll();
      await state().setActiveChatChannel('chan-9');
      fakeSignalR.latest(GEO).serverPush('onUnitLocationUpdated', { UnitId: 1, Latitude: 10, Longitude: 10 });
      const connections: FakeHubConnection[] = [...fakeSignalR.connections];

      await teardownRealtime();

      expect(connections.every((connection) => connection.stopCalls === 1)).toBe(true);
      expect(state().hubs.eventing).toEqual({ status: 'disconnected', joined: false, joinedAt: 0 });
      expect(state().liveLocations).toEqual({});
      expect(state().activeChatChannel).toBeNull();
      expect(state().outages).toEqual({});
      expect(signalRService.getTotalEventListenerCount()).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
