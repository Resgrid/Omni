import { HUB_REPAIR_BASE_BACKOFF_MS, HUB_REPAIR_MAX_BACKOFF_MS, HUB_WATCHDOG_INTERVAL_MS, SIGNALR_MAX_RECONNECT_ATTEMPTS } from '../constants';
import { useRealtimeStore } from '../realtime-store';
import { signalRService } from '../signalr-service';
import { createHubWatchdog, ensureHubConnections, HubRepairBackoff, isHubWatchdogEnabled } from '../watchdog';
import { fakeSignalR } from './fakes/signalr';
import { resetRealtime, setupRealtime, VARIANTS } from './helpers/realtime-test-env';

const EVENTING = 'eventingHub';
const GEO = 'geolocationHub';

/** Drives a connected hub into the parked (exhausted) state: no connection, nothing scheduled. */
const exhaustHub = async (hubName: string) => {
  for (let i = 0; i < SIGNALR_MAX_RECONNECT_ATTEMPTS; i += 1) fakeSignalR.startBehaviors.push(new Error('down'));
  fakeSignalR.latest(hubName).simulateClose();
  await jest.advanceTimersByTimeAsync(11 * 60 * 1000);
  expect(signalRService.isHubAvailable(hubName)).toBe(false);
};

describe('hub watchdog', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await resetRealtime();
    fakeSignalR.invokeImpl = (method, _args, connection) => {
      if (method === 'GeolocationConnect') connection.serverPush('onGeolocationConnect', 'c');
      return undefined;
    };
  });

  afterEach(async () => {
    await resetRealtime();
    jest.useRealTimers();
  });

  it('backs off 30 s → 10 min, doubling, and resets on success', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(HubRepairBackoff.delayFor)).toEqual([30000, 60000, 120000, 240000, 480000, 600000, 600000]);
    expect(HubRepairBackoff.delayFor(1)).toBe(HUB_REPAIR_BASE_BACKOFF_MS);
    expect(HubRepairBackoff.delayFor(20)).toBe(HUB_REPAIR_MAX_BACKOFF_MS);

    const backoff = new HubRepairBackoff();
    backoff.record('eventing', false, 1000);
    expect(backoff.canAttempt('eventing', 1000 + 29999)).toBe(false);
    expect(backoff.canAttempt('eventing', 1000 + 30000)).toBe(true);
    backoff.record('eventing', false, 50000);
    expect(backoff.canAttempt('eventing', 50000 + 59999)).toBe(false);
    backoff.record('eventing', true, 60000);
    expect(backoff.getFailures('eventing')).toBe(0);
    expect(backoff.canAttempt('eventing', 60000)).toBe(true);
  });

  it('is enabled by capabilities.realtime.hubWatchdog', () => {
    setupRealtime(VARIANTS.bigboard);
    expect(isHubWatchdogEnabled()).toBe(true);
    setupRealtime(VARIANTS.responder);
    expect(isHubWatchdogEnabled()).toBe(false);
  });

  it('repairs a wanted hub the service gave up on, and leaves unwanted hubs alone', async () => {
    setupRealtime(VARIANTS.bigboard);
    await useRealtimeStore.getState().connectEventingHub();
    await useRealtimeStore.getState().connectGeolocationHub();
    await exhaustHub(EVENTING);
    await useRealtimeStore.getState().disconnectGeolocationHub();
    const geoBuilt = fakeSignalR.forHub(GEO).length;

    const backoff = new HubRepairBackoff();
    await ensureHubConnections(backoff);

    expect(signalRService.isHubConnected(EVENTING)).toBe(true);
    expect(useRealtimeStore.getState().hubs.eventing.joined).toBe(true);
    expect(fakeSignalR.forHub(GEO)).toHaveLength(geoBuilt);
    expect(backoff.getFailures('eventing')).toBe(0);
  });

  it('rejoins a hub that is connected but not in its group', async () => {
    setupRealtime(VARIANTS.bigboard);
    fakeSignalR.invokeImpl = () => {
      throw new Error('refused');
    };
    await useRealtimeStore.getState().connectEventingHub();
    await jest.advanceTimersByTimeAsync(60000);
    expect(useRealtimeStore.getState().hubs.eventing.joined).toBe(false);

    fakeSignalR.invokeImpl = () => undefined;
    await ensureHubConnections(new HubRepairBackoff());
    expect(useRealtimeStore.getState().hubs.eventing.joined).toBe(true);
    expect(fakeSignalR.forHub(EVENTING)).toHaveLength(1);
  });

  it('backs off after a failed repair', async () => {
    setupRealtime(VARIANTS.bigboard);
    await useRealtimeStore.getState().connectEventingHub();
    await exhaustHub(EVENTING);
    fakeSignalR.startBehaviors.push(new Error('still down'));

    const backoff = new HubRepairBackoff();
    let now = 0;
    await ensureHubConnections(backoff, () => now);
    expect(backoff.getFailures('eventing')).toBe(1);
    const built = fakeSignalR.forHub(EVENTING).length;

    // The failed repair scheduled the service's own rebuild loop; stop it so only the watchdog acts (the hub stays wanted).
    await signalRService.disconnectFromHub(EVENTING);
    now = HUB_REPAIR_BASE_BACKOFF_MS - 1;
    await ensureHubConnections(backoff, () => now);
    expect(fakeSignalR.forHub(EVENTING)).toHaveLength(built);

    now = HUB_REPAIR_BASE_BACKOFF_MS;
    await ensureHubConnections(backoff, () => now);
    expect(fakeSignalR.forHub(EVENTING)).toHaveLength(built + 1);
    expect(signalRService.isHubConnected(EVENTING)).toBe(true);
    expect(backoff.getFailures('eventing')).toBe(0);
  });

  it('runs every 30 s while started and skips passes while lifecycle work is in progress', async () => {
    setupRealtime(VARIANTS.bigboard);
    await useRealtimeStore.getState().connectEventingHub();
    await exhaustHub(EVENTING);

    let busy = true;
    const watchdog = createHubWatchdog({ isBusy: () => busy });
    watchdog.start();
    expect(watchdog.isRunning()).toBe(true);

    await jest.advanceTimersByTimeAsync(HUB_WATCHDOG_INTERVAL_MS);
    expect(signalRService.isHubConnected(EVENTING)).toBe(false);

    busy = false;
    await jest.advanceTimersByTimeAsync(HUB_WATCHDOG_INTERVAL_MS);
    expect(signalRService.isHubConnected(EVENTING)).toBe(true);

    watchdog.stop();
    expect(watchdog.isRunning()).toBe(false);
  });
});
