import { Env } from '@resgrid/core/env/env';
import { logger } from '@resgrid/core/logging/logger';
import { create } from 'zustand';

import { CHAT_HEARTBEAT_INTERVAL_MS, HUB_JOIN_MAX_ATTEMPTS, HUB_JOIN_RETRY_MS, REALTIME_HUB_KEYS, type RealtimeHubKey } from './constants';
import { emitRealtimeEvent, type HubJoinInfo, type RealtimeEventMap, type RealtimeEventName, toRealtimeId } from './event-bus';
import { ALL_EVENTING_EVENTS, CHAT_CONNECTED_ACK, CHAT_EVENTS, type ChatEventName, EVENTING_CONNECTED_ACK, type EventingEventName, GEOLOCATION_CONNECTED_ACK, GEOLOCATION_HUB_EVENTS, HUB_METHODS } from './events';
import { type LiveLocation, type LiveLocations, parsePersonnelLocationUpdate, parseUnitLocationUpdate, upsertLiveLocation } from './live-locations';
import { getRealtimeDependencies, getRealtimeFeatures, isChatHubAllowed, shouldConnectGeolocationHub } from './realtime-config';
import { HUB_CONNECTED_EVENT, HUB_DISCONNECTED_EVENT, HUB_RECONNECT_EXHAUSTED_EVENT, HUB_RECONNECTED_EVENT, HUB_RECONNECTING_EVENT, type HubDisconnectInfo, signalRService } from './signalr-service';

/**
 * Realtime store (omni-plan §7.5, Responder structure): hub handlers subscribed once, a join generation per hub so a
 * group join still in flight against a dead connection is a no-op, outage tracking for the realtime status banner,
 * and per-variant event sets from capabilities/modules. Consumers never read hub messages from here: they register
 * typed handlers with `onRealtimeEvent()` / `useRealtimeEvent()`.
 */

export type HubStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface HubSnapshot {
  /** Transport state. */
  status: HubStatus;
  /** In its server group on the current connection (`Connect` / `GeolocationConnect` ack / chat `Connect`). */
  joined: boolean;
  /** Epoch ms of the latest group join; 0 before the first. Positions/updates sent while away are never replayed. */
  joinedAt: number;
}

/** Feeds the banner tracks. Geolocation is cosmetic and opt-in, so it never raises an outage. */
export type OutageHubKey = 'eventing' | 'chat';

export interface RealtimeHubOutage {
  /** Epoch ms the live session dropped (kept through repeat drops within one outage). */
  since: number;
  /** Every reconnection attempt is spent; the hub is parked until the network returns. */
  exhausted: boolean;
}

export type RealtimeHubOutages = Partial<Record<OutageHubKey, RealtimeHubOutage>>;

export interface ActiveChatChannel {
  channelId: string;
  asUnitId: number | null;
}

export interface RealtimeState {
  hubs: Readonly<Record<RealtimeHubKey, HubSnapshot>>;
  /**
   * Hubs that were live and then went quiet. Only a hub that joined at least once this session can land here, so a
   * cold start, a hub that never connected and an intentional teardown (background, sign-out) never flash the banner.
   */
  outages: RealtimeHubOutages;
  /** Latest realtime position per pin (`u{UnitId}`, `p{userId}`): a per-entity map, so batched pushes never drop. */
  liveLocations: LiveLocations;
  lastLocationAt: number;
  lastEventAt: number;
  lastEventName: RealtimeEventName | null;
  /** The chat channel the user is viewing; replayed with `SetActiveChannel` after every chat (re)connect. */
  activeChatChannel: ActiveChatChannel | null;
  error: Error | null;

  connectEventingHub: () => Promise<void>;
  disconnectEventingHub: () => Promise<void>;
  connectGeolocationHub: () => Promise<void>;
  disconnectGeolocationHub: () => Promise<void>;
  /** No-op unless the variant has `realtime.chatHub` and the injected chat gate allows it. */
  connectChatHub: () => Promise<void>;
  disconnectChatHub: () => Promise<void>;
  /** Eventing, chat (when allowed) and geolocation (`options.geolocation`, else the preference / variant default). */
  connectAll: (options?: { geolocation?: boolean }) => Promise<void>;
  disconnectAll: () => Promise<void>;
  /** Marks the conversation the user is viewing (null clears it): Core suppresses chat push only for that viewer. */
  setActiveChatChannel: (channelId: string | null, asUnitId?: number | null) => Promise<void>;
  clearLiveLocations: () => void;
}

const initialHub = (): HubSnapshot => ({ status: 'disconnected', joined: false, joinedAt: 0 });

const initialData = () => ({
  hubs: { eventing: initialHub(), geolocation: initialHub(), chat: initialHub() },
  outages: {} as RealtimeHubOutages,
  liveLocations: {} as LiveLocations,
  lastLocationAt: 0,
  lastEventAt: 0,
  lastEventName: null as RealtimeEventName | null,
  activeChatChannel: null as ActiveChatChannel | null,
  error: null as Error | null,
});

/** The hub path for a key, from the client env (`CHANNEL_HUB_NAME`, `REALTIME_GEO_HUB_NAME`, `CHAT_HUB_NAME`). */
export const getHubName = (hub: RealtimeHubKey): string => (hub === 'eventing' ? Env.CHANNEL_HUB_NAME : hub === 'geolocation' ? Env.REALTIME_GEO_HUB_NAME : Env.CHAT_HUB_NAME);

const hubKeyOf = (hubName: unknown): RealtimeHubKey | null => REALTIME_HUB_KEYS.find((hub) => getHubName(hub) === hubName) ?? null;

const JOINED_EVENT = { eventing: 'eventingHubJoined', geolocation: 'geolocationHubJoined', chat: 'chatHubJoined' } as const;

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error('Unknown realtime error'));

// ---- per-hub session bookkeeping (reset by teardownRealtime) ----

interface JoinState {
  /** Bumped by every new connection and teardown; a join finishing under an older generation is ignored. */
  generation: number;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** The join in flight, shared by the lifecycle event and connect* so a connection announces itself once. */
  operation: { generation: number; promise: Promise<void> } | null;
  /** Generation that last completed a join (guards double "joined" from the invoke result plus the server ack). */
  joinedGeneration: number;
}

const newJoinState = (): JoinState => ({ generation: 0, attempts: 0, timer: null, operation: null, joinedGeneration: -1 });

const joinState: Record<RealtimeHubKey, JoinState> = { eventing: newJoinState(), geolocation: newJoinState(), chat: newJoinState() };
/** Joined at least once this session: later joins are rejoins (catch-up), and only such hubs raise outages. */
const everJoined: Record<RealtimeHubKey, boolean> = { eventing: false, geolocation: false, chat: false };
/** The app wants this hub connected (connect* sets, disconnect* clears). The watchdog repairs only wanted hubs. */
const wanted: Record<RealtimeHubKey, boolean> = { eventing: false, geolocation: false, chat: false };
let handlerUnsubscribes: (() => void)[] = [];
let chatHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
/** False while the last `SetActiveChannel` (a clear included) has not reached the server; replayed after a join. */
let activeChannelSynced = true;

export const useRealtimeStore = create<RealtimeState>()(() => ({
  ...initialData(),
  connectEventingHub: () => connectHub('eventing'),
  disconnectEventingHub: () => disconnectHub('eventing'),
  connectGeolocationHub: () => connectHub('geolocation'),
  disconnectGeolocationHub: () => disconnectHub('geolocation'),
  connectChatHub: () => connectHub('chat'),
  disconnectChatHub: () => disconnectHub('chat'),
  connectAll,
  disconnectAll,
  setActiveChatChannel,
  clearLiveLocations: () => useRealtimeStore.setState({ liveLocations: {}, lastLocationAt: 0 }),
}));

/** Hubs the app currently wants connected (for the watchdog). */
export const getWantedHubs = (): RealtimeHubKey[] => REALTIME_HUB_KEYS.filter((hub) => wanted[hub]);

// ---------------------------------------------------------------------------------------------------------------
// State helpers

function setHub(hub: RealtimeHubKey, patch: Partial<HubSnapshot>): void {
  useRealtimeStore.setState((state) => {
    const current = state.hubs[hub];
    const next = { ...current, ...patch };
    if (next.status === current.status && next.joined === current.joined && next.joinedAt === current.joinedAt) return state;
    return { hubs: { ...state.hubs, [hub]: next } };
  });
}

function markHubLost(hub: RealtimeHubKey, exhausted: boolean): void {
  if (hub === 'geolocation' || !everJoined[hub]) return;
  useRealtimeStore.setState((state) => {
    const current = state.outages[hub];
    // A repeat drop keeps the original `since` (the banner's grace period); exhausted stays exhausted.
    if (current && (current.exhausted || !exhausted)) return state;
    return { outages: { ...state.outages, [hub]: { since: current?.since ?? Date.now(), exhausted } } };
  });
}

function clearOutage(hub: RealtimeHubKey): void {
  if (hub === 'geolocation') return;
  useRealtimeStore.setState((state) => {
    if (!state.outages[hub]) return state;
    const next = { ...state.outages };
    delete next[hub];
    return { outages: next };
  });
}

function stopJoinRetry(hub: RealtimeHubKey): void {
  const js = joinState[hub];
  if (js.timer) {
    clearTimeout(js.timer);
    js.timer = null;
  }
}

/** A new connection (or teardown) invalidates every join in flight and earns a fresh retry budget. */
function newGeneration(hub: RealtimeHubKey): void {
  const js = joinState[hub];
  js.generation += 1;
  js.attempts = 0;
  stopJoinRetry(hub);
  if (hub === 'chat') stopChatHeartbeat();
}

function stopChatHeartbeat(): void {
  if (chatHeartbeatTimer) {
    clearInterval(chatHeartbeatTimer);
    chatHeartbeatTimer = null;
  }
}

function startChatHeartbeat(): void {
  stopChatHeartbeat();
  chatHeartbeatTimer = setInterval(() => {
    const name = getHubName('chat');
    // Skipped while disconnected (Dispatch): it would only throw from inside the client.
    if (!signalRService.isHubConnected(name)) return;
    signalRService.invoke(name, HUB_METHODS.chatHeartbeat).catch((error: unknown) => {
      logger.debug({ message: 'Chat hub heartbeat failed', context: { error } });
    });
  }, CHAT_HEARTBEAT_INTERVAL_MS);
}

// ---------------------------------------------------------------------------------------------------------------
// Group joins

async function sendActiveChannel(): Promise<void> {
  const marker = useRealtimeStore.getState().activeChatChannel;
  try {
    // Both arguments always: SignalR rejects invocations that omit the optional `asUnitId`.
    await signalRService.invoke(getHubName('chat'), HUB_METHODS.chatSetActiveChannel, marker?.channelId ?? null, marker?.asUnitId ?? null);
    if (useRealtimeStore.getState().activeChatChannel === marker) activeChannelSynced = true;
  } catch (error) {
    logger.debug({ message: 'SetActiveChannel not delivered; replayed after the next chat join', context: { error } });
  }
}

async function performJoin(hub: RealtimeHubKey): Promise<void> {
  const name = getHubName(hub);
  if (hub === 'eventing') {
    const departmentId = Number(getRealtimeDependencies()?.getDepartmentId() ?? NaN);
    if (!Number.isFinite(departmentId) || departmentId <= 0) throw new Error('No department id for the eventing hub');
    await signalRService.invoke(name, HUB_METHODS.eventingConnect, departmentId);
    return;
  }
  if (hub === 'geolocation') {
    // No arguments: the server rejects an invocation whose argument count differs.
    await signalRService.invoke(name, HUB_METHODS.geolocationConnect);
    return;
  }
  await signalRService.invoke(name, HUB_METHODS.chatConnect);
  // Active-channel state is per user on the server: replay the marker (or a clear that never arrived).
  if (useRealtimeStore.getState().activeChatChannel || !activeChannelSynced) await sendActiveChannel();
}

function markJoined(hub: RealtimeHubKey): void {
  const js = joinState[hub];
  if (js.joinedGeneration === js.generation && useRealtimeStore.getState().hubs[hub].joined) return;
  js.joinedGeneration = js.generation;
  const rejoin = everJoined[hub];
  everJoined[hub] = true;
  const at = Date.now();
  setHub(hub, { status: 'connected', joined: true, joinedAt: at });
  useRealtimeStore.setState({ error: null });
  clearOutage(hub);
  if (hub === 'chat') startChatHeartbeat();
  logger.info({ message: `Joined ${hub} hub group`, context: { rejoin } });
  const info: HubJoinInfo = { hub, rejoin, at };
  emitRealtimeEvent(JOINED_EVENT[hub], info);
}

async function runJoin(hub: RealtimeHubKey, generation: number): Promise<void> {
  const js = joinState[hub];
  try {
    await performJoin(hub);
    if (generation !== js.generation) return;
    stopJoinRetry(hub);
    js.attempts = 0;
    // The geolocation hub counts as joined only when the server acknowledges (`onGeolocationConnect`).
    if (hub !== 'geolocation') markJoined(hub);
  } catch (error) {
    if (generation !== js.generation) return;
    js.attempts += 1;
    logger.warn({ message: `Failed to join ${hub} hub group`, context: { error, attempt: js.attempts, maxAttempts: HUB_JOIN_MAX_ATTEMPTS } });
    // Clearing the flag is what lets connect* (and the watchdog) repair the session later.
    setHub(hub, { joined: false });
    if (js.attempts < HUB_JOIN_MAX_ATTEMPTS && signalRService.isHubConnected(getHubName(hub))) {
      stopJoinRetry(hub);
      js.timer = setTimeout(() => {
        js.timer = null;
        void joinHubGroup(hub);
      }, HUB_JOIN_RETRY_MS);
    } else {
      logger.error({ message: `Giving up joining the ${hub} hub group; the next connect or the watchdog retries`, context: { attempts: js.attempts } });
    }
  }
}

function joinHubGroup(hub: RealtimeHubKey): Promise<void> {
  const js = joinState[hub];
  const generation = js.generation;
  // Reuse only a join of this connection; one left from an older generation is a dead announce.
  if (js.operation && js.operation.generation === generation) return js.operation.promise;
  const promise = runJoin(hub, generation).finally(() => {
    if (js.operation?.promise === promise) js.operation = null;
  });
  js.operation = { generation, promise };
  return promise;
}

// ---------------------------------------------------------------------------------------------------------------
// Hub message → consumer event

type IdEventName = Exclude<EventingEventName, 'departmentUpdated' | 'outstandingRequirementsUpdated'>;
type PlainChatEventName = Exclude<ChatEventName, 'chatPresenceChanged'>;

function noteEvent(name: RealtimeEventName): void {
  useRealtimeStore.setState({ lastEventAt: Date.now(), lastEventName: name });
}

function forwardEventingEvent(name: EventingEventName, args: unknown[]): void {
  noteEvent(name);
  if (name === 'departmentUpdated') {
    emitRealtimeEvent('departmentUpdated', ...args);
  } else if (name === 'outstandingRequirementsUpdated') {
    emitRealtimeEvent('outstandingRequirementsUpdated', toRealtimeId(args[0]), args[1], ...args.slice(2));
  } else {
    const idEvent: IdEventName = name;
    const eventArgs: RealtimeEventMap[IdEventName] = [toRealtimeId(args[0]), ...args.slice(1)];
    emitRealtimeEvent(idEvent, ...eventArgs);
  }
}

function forwardChatEvent(name: ChatEventName, args: unknown[]): void {
  noteEvent(name);
  if (name === 'chatPresenceChanged') {
    emitRealtimeEvent('chatPresenceChanged', toRealtimeId(args[0]), args[1] === true || args[1] === 'true', ...args.slice(2));
  } else {
    const chatEvent: PlainChatEventName = name;
    emitRealtimeEvent(chatEvent, args[0], ...args.slice(1));
  }
}

function storeLiveLocation(event: 'personnelLocationUpdated' | 'unitLocationUpdated', payload: unknown, location: LiveLocation | null): void {
  // No payload in any log: location pushes carry precise coordinates.
  if (!location) return;
  useRealtimeStore.setState((state) => {
    const liveLocations = upsertLiveLocation(state.liveLocations, location);
    return liveLocations === state.liveLocations ? state : { liveLocations, lastLocationAt: location.receivedAt };
  });
  emitRealtimeEvent(event, location, payload);
}

// ---------------------------------------------------------------------------------------------------------------
// Service subscriptions (once per session)

function onHubConnected(hubName: unknown): void {
  const hub = hubKeyOf(hubName);
  if (!hub) return;
  // Every new connection id (first start, rebuild, automatic reconnect) belongs to no server group yet.
  newGeneration(hub);
  setHub(hub, { status: 'connected', joined: false });
  void joinHubGroup(hub);
}

function onHubReconnecting(hubName: unknown): void {
  const hub = hubKeyOf(hubName);
  if (!hub) return;
  newGeneration(hub);
  setHub(hub, { status: 'reconnecting', joined: false });
  markHubLost(hub, false);
}

function onHubDisconnected(hubName: unknown, info: unknown): void {
  const hub = hubKeyOf(hubName);
  if (!hub) return;
  newGeneration(hub);
  setHub(hub, { status: signalRService.isHubAvailable(getHubName(hub)) ? 'reconnecting' : 'disconnected', joined: false });
  if ((info as HubDisconnectInfo | undefined)?.intentional) clearOutage(hub);
  else markHubLost(hub, false);
}

function onHubExhausted(hubName: unknown): void {
  const hub = hubKeyOf(hubName);
  if (!hub) return;
  setHub(hub, { status: 'disconnected', joined: false });
  // Nothing arrives until the network returns: no reason to wait out the banner's grace period.
  markHubLost(hub, true);
}

function ensureHandlersSubscribed(): void {
  if (handlerUnsubscribes.length > 0) return;
  const on = (event: string, listener: (...args: unknown[]) => void) => handlerUnsubscribes.push(signalRService.on(event, listener));

  ALL_EVENTING_EVENTS.forEach((name) => on(name, (...args) => forwardEventingEvent(name, args)));
  CHAT_EVENTS.forEach((name) => on(name, (...args) => forwardChatEvent(name, args)));
  on(GEOLOCATION_HUB_EVENTS[0], (payload) => storeLiveLocation('personnelLocationUpdated', payload, parsePersonnelLocationUpdate(payload)));
  on(GEOLOCATION_HUB_EVENTS[1], (payload) => storeLiveLocation('unitLocationUpdated', payload, parseUnitLocationUpdate(payload)));

  on(EVENTING_CONNECTED_ACK, () => {
    if (signalRService.isHubConnected(getHubName('eventing'))) markJoined('eventing');
  });
  on(GEOLOCATION_CONNECTED_ACK, () => {
    if (signalRService.isHubConnected(getHubName('geolocation'))) markJoined('geolocation');
  });
  on(CHAT_CONNECTED_ACK, () => {
    if (signalRService.isHubConnected(getHubName('chat'))) markJoined('chat');
  });

  on(HUB_CONNECTED_EVENT, onHubConnected);
  on(HUB_RECONNECTED_EVENT, onHubConnected);
  on(HUB_RECONNECTING_EVENT, onHubReconnecting);
  on(HUB_DISCONNECTED_EVENT, onHubDisconnected);
  on(HUB_RECONNECT_EXHAUSTED_EVENT, onHubExhausted);
}

function unsubscribeHandlers(): void {
  handlerUnsubscribes.forEach((unsubscribe) => unsubscribe());
  handlerUnsubscribes = [];
}

// ---------------------------------------------------------------------------------------------------------------
// Actions

function methodsFor(hub: RealtimeHubKey): string[] {
  const features = getRealtimeFeatures();
  if (hub === 'eventing') return [...features.eventingEvents, EVENTING_CONNECTED_ACK];
  if (hub === 'geolocation') return [...GEOLOCATION_HUB_EVENTS, GEOLOCATION_CONNECTED_ACK];
  return [...features.chatEvents, CHAT_CONNECTED_ACK];
}

async function connectHub(hub: RealtimeHubKey): Promise<void> {
  const name = getHubName(hub);
  if (hub === 'chat' && !isChatHubAllowed()) {
    logger.debug({ message: 'Chat hub not used by this app or disabled for the department; skipping' });
    return;
  }
  if (useRealtimeStore.getState().hubs[hub].joined && signalRService.isHubConnected(name)) return;

  const eventingUrl = getRealtimeDependencies()?.getEventingUrl();
  if (!eventingUrl) {
    const error = new Error('EventingUrl not available; load the department config before connecting realtime');
    logger.warn({ message: error.message, context: { hub } });
    useRealtimeStore.setState({ error });
    return;
  }

  wanted[hub] = true;
  ensureHandlersSubscribed();
  if (!signalRService.isHubConnected(name)) setHub(hub, { status: 'connecting' });

  try {
    await signalRService.connectToHubWithEventingUrl({ name, eventingUrl, hubName: name, methods: methodsFor(hub) });
    if (!signalRService.isHubConnected(name) || useRealtimeStore.getState().hubs[hub].joined) return;
    // A fresh connection already started its join from the connected event: this joins that one. When the socket
    // was already open no event fired, so this starts the only join there is — with a full budget.
    const js = joinState[hub];
    if (!js.operation || js.operation.generation !== js.generation) js.attempts = 0;
    await joinHubGroup(hub);
  } catch (error) {
    logger.warn({ message: `Failed to connect ${hub} hub`, context: { error } });
    useRealtimeStore.setState({ error: toError(error) });
    setHub(hub, { status: signalRService.isHubAvailable(name) ? 'reconnecting' : 'disconnected', joined: false });
  }
}

async function disconnectHub(hub: RealtimeHubKey): Promise<void> {
  wanted[hub] = false;
  // Retire any join in flight so its completion cannot restore the joined flag after this teardown.
  newGeneration(hub);
  try {
    await signalRService.disconnectFromHub(getHubName(hub));
  } catch (error) {
    logger.warn({ message: `Failed to disconnect ${hub} hub`, context: { error } });
    useRealtimeStore.setState({ error: toError(error) });
  } finally {
    setHub(hub, { status: 'disconnected', joined: false });
    // An intentional close is not an outage (backgrounding would otherwise queue a banner behind every app switch).
    clearOutage(hub);
  }
}

async function connectAll(options: { geolocation?: boolean } = {}): Promise<void> {
  const geolocation = options.geolocation ?? (await shouldConnectGeolocationHub());
  const tasks: Promise<void>[] = [connectHub('eventing')];
  if (geolocation) tasks.push(connectHub('geolocation'));
  if (isChatHubAllowed()) tasks.push(connectHub('chat'));
  await Promise.allSettled(tasks);
}

async function disconnectAll(): Promise<void> {
  await Promise.allSettled(REALTIME_HUB_KEYS.map((hub) => disconnectHub(hub)));
}

async function setActiveChatChannel(channelId: string | null, asUnitId: number | null = null): Promise<void> {
  useRealtimeStore.setState({ activeChatChannel: channelId ? { channelId, asUnitId: asUnitId ?? null } : null });
  activeChannelSynced = false;
  if (!useRealtimeStore.getState().hubs.chat.joined || !signalRService.isHubConnected(getHubName('chat'))) return;
  await sendActiveChannel();
}

/**
 * Ends the realtime session (sign-out, department/server switch): register it with the offline reset registry's
 * teardowns so it runs while the tokens the sockets were opened with are still valid. Left alone, sockets stay
 * authenticated as the outgoing user, the chat heartbeat ticks forever and stale flags block the next user's connect.
 */
export async function teardownRealtime(): Promise<void> {
  REALTIME_HUB_KEYS.forEach((hub) => {
    newGeneration(hub);
    joinState[hub].operation = null;
    joinState[hub].joinedGeneration = -1;
    everJoined[hub] = false;
    wanted[hub] = false;
  });
  stopChatHeartbeat();
  activeChannelSynced = true;
  unsubscribeHandlers();
  // Signing out is not an outage, and the outgoing department's positions must not move the next user's pins.
  useRealtimeStore.setState(initialData());
  try {
    await signalRService.disconnectAll();
  } catch (error) {
    logger.warn({ message: 'Failed to disconnect hubs while tearing down the realtime session', context: { error } });
  }
}
