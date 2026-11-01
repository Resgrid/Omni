import { type HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { logger } from '@resgrid/core/logging/logger';
import { isElectron, isWeb } from '@resgrid/core/platform/platform';
import type { ConnectivitySource } from '@resgrid/offline';

import { reconnectDelayForAttempt, SIGNALR_AUTOMATIC_RECONNECT_DELAYS_MS, SIGNALR_MAX_RECONNECT_ATTEMPTS, SIGNALR_SERVER_TIMEOUT_MS } from './constants';

/**
 * SignalR service (omni-plan §7.5). Dispatch's service is the base — Electron skips visibility handling, 60 s server
 * timeout, abort controllers for pending connects, `connection.off` cleanup, connected check in `invoke`, hub-scoped
 * lifecycle events — with:
 * - the token read at call time in `accessTokenFactory` (Dispatch replayed the connect-time token on reconnect);
 * - no access token in the URL for any hub: the client itself adds a fresh `access_token` to browser WebSocket URLs
 *   (Core's Eventing accepts it for /geolocationHub and /chatHub) and sends `Authorization` on React Native;
 * - Responder's recovery of hubs that exhausted their retries when connectivity returns, intentional-disconnect
 *   tracking and typed `invoke<T>`;
 * - Unit's stop-on-empty-refresh and 10-attempt linear backoff capped at 60 s;
 * - per-listener try/catch in `emit` and every hub argument forwarded.
 */

/** Token access the auth package provides (injected; this package never imports auth). */
export interface RealtimeAuth {
  /** The current access token, read at call time. */
  getAccessToken(): string | null | undefined;
  /** Refreshes the access token. An empty token afterwards means the session is gone. */
  refreshAccessToken(): Promise<unknown>;
}

export interface SignalRServiceDependencies {
  auth?: RealtimeAuth;
  /** Network reachability; a hub parked after exhausting its retries is retried when it reports online. */
  connectivity?: ConnectivitySource | null;
}

export interface HubConnectConfig {
  /** Connection key (Omni uses the hub path, e.g. `eventingHub`). */
  name: string;
  /** `Config.EventingUrl`; the hub path is appended. */
  eventingUrl: string;
  /** Hub path segment. */
  hubName: string;
  /** Server → client methods to forward as events. */
  methods: readonly string[];
}

export interface ConnectOptions {
  /** On failure, schedule the rebuild loop as for a dropped connection (default true). */
  retryOnFailure?: boolean;
}

/** Hub events can carry several positional arguments; listeners receive all of them. */
export type SignalREventListener = (...args: unknown[]) => void;

export interface HubDisconnectInfo {
  /** True when the app closed the hub (backgrounding, sign-out); never an outage. */
  intentional: boolean;
}

export enum HubConnectingState {
  IDLE = 'idle',
  RECONNECTING = 'reconnecting',
  DIRECT_CONNECTING = 'direct-connecting',
}

/** Per-hub lifecycle signals, raised unqualified and as `${event}:${hubName}`. Listener args: `(hubName, info?)`. */
export const HUB_CONNECTED_EVENT = '__hubConnected';
export const HUB_RECONNECTING_EVENT = '__hubReconnecting';
export const HUB_RECONNECTED_EVENT = '__hubReconnected';
export const HUB_DISCONNECTED_EVENT = '__hubDisconnected';
export const HUB_RECONNECT_EXHAUSTED_EVENT = '__hubReconnectExhausted';

// Location pushes arrive every few seconds for every unit and person: never logged, not even the method name.
const UNLOGGED_HUB_METHODS = new Set(['onunitlocationupdated', 'onpersonnellocationupdated']);

export const isUnloggedHubMethod = (method: string): boolean => UNLOGGED_HUB_METHODS.has(method.toLowerCase());

interface HubMethodHandler {
  method: string;
  handler: SignalREventListener;
}

class CancelledError extends Error {
  constructor() {
    super('Connection attempt was cancelled');
    this.name = 'CancelledError';
  }
}

/** The hub URL: `eventingUrl` path + hub segment, existing query kept, never a token. */
export function buildHubUrl(eventingUrl: string, hubName: string): string {
  const url = new URL(eventingUrl);
  const pathWithHub = url.pathname.endsWith('/') ? `${url.pathname}${hubName}` : `${url.pathname}/${hubName}`;
  return `${url.protocol}//${url.host}${pathWithHub}${url.search}`;
}

export class SignalRService {
  private auth: RealtimeAuth | null = null;
  private connectivity: ConnectivitySource | null = null;
  private connectivityUnsubscribe: (() => void) | null = null;

  private connections = new Map<string, HubConnection>();
  private hubConfigs = new Map<string, HubConnectConfig>();
  private reconnectAttempts = new Map<string, number>();
  private connectionLocks = new Map<string, Promise<void>>();
  private hubStates = new Map<string, HubConnectingState>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private hubMethodHandlers = new Map<string, HubMethodHandler[]>();
  private pendingConnections = new Map<string, AbortController>();
  private intentionalDisconnects = new Set<string>();
  private exhaustedHubs = new Set<string>();
  /** Web (not Electron) only: rebuilds deferred while the page is hidden, run on the next visibility resume. */
  private parkedWhileHidden = new Set<string>();
  private eventListeners = new Map<string, Set<SignalREventListener>>();

  private isPageVisible = true;
  private visibilityHandler: (() => void) | null = null;

  constructor(dependencies: SignalRServiceDependencies = {}) {
    this.configure(dependencies);
  }

  /** Wires token access and connectivity. Safe to call again (e.g. after the app shell restarts its services). */
  public configure(dependencies: SignalRServiceDependencies): void {
    if (dependencies.auth !== undefined) this.auth = dependencies.auth;
    if (dependencies.connectivity !== undefined) {
      this.connectivityUnsubscribe?.();
      this.connectivityUnsubscribe = null;
      this.connectivity = dependencies.connectivity;
      if (this.exhaustedHubs.size > 0) this.ensureConnectivityListener();
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Connect

  public async connectToHubWithEventingUrl(config: HubConnectConfig, options: ConnectOptions = {}): Promise<void> {
    const existingLock = this.connectionLocks.get(config.name);
    if (existingLock) {
      logger.debug({ message: `Connection to hub ${config.name} already in progress, waiting` });
      await existingLock;
      // The attempt we waited on may have failed; a live connection is the only reason to stop here.
      if (this.isHubConnected(config.name)) return;
      const currentLock = this.connectionLocks.get(config.name);
      if (currentLock && currentLock !== existingLock) {
        await currentLock;
        return;
      }
    }

    const attempt = this.connectInternal(config);
    this.connectionLocks.set(config.name, attempt);
    try {
      await attempt;
    } catch (error) {
      if ((options.retryOnFailure ?? true) && this.hubConfigs.has(config.name) && !this.reconnectTimers.has(config.name)) {
        // A cold start without network or with an expired token would otherwise leave the hub down until the next
        // resume. The rebuild loop refreshes the token, backs off, and stops if the session is gone.
        this.scheduleReconnect(config.name);
      }
      throw error;
    } finally {
      if (this.connectionLocks.get(config.name) === attempt) this.connectionLocks.delete(config.name);
    }
  }

  private async connectInternal(config: HubConnectConfig): Promise<void> {
    const abortController = new AbortController();
    this.pendingConnections.get(config.name)?.abort();
    this.pendingConnections.set(config.name, abortController);

    try {
      const existing = this.connections.get(config.name);
      if (existing) {
        if (existing.state !== HubConnectionState.Disconnected) {
          logger.debug({ message: `Already connected to hub: ${config.name}` });
          return;
        }
        // A closed connection still mapped (a close while the page was hidden) would make connecting a no-op.
        this.dropConnection(config.name, existing);
      }

      if (this.hubStates.get(config.name) === HubConnectingState.DIRECT_CONNECTING) {
        logger.debug({ message: `Hub ${config.name} is already connecting, skipping duplicate attempt` });
        return;
      }

      this.setHubState(config.name, HubConnectingState.DIRECT_CONNECTING);

      if (!config.eventingUrl) throw new Error('EventingUrl is required for SignalR connection');
      const fullUrl = buildHubUrl(config.eventingUrl, config.hubName);

      // Kept for rebuilds: through closes, exhausted retries and connectivity recovery, until an explicit disconnect.
      // Stored before the token check so a token that is mid-refresh is retried (and an ended session stops it).
      this.hubConfigs.set(config.name, config);
      this.ensureVisibilityHandling();

      if (!this.currentToken()) throw new Error('No authentication token available');
      logger.info({ message: `Connecting to hub: ${config.name}`, context: { url: fullUrl } });

      if (abortController.signal.aborted) throw new CancelledError();

      const connection = new HubConnectionBuilder()
        .withUrl(fullUrl, {
          // Read at call time: the client calls this on every transport connect, including automatic reconnects.
          accessTokenFactory: () => this.currentToken() ?? '',
        })
        .withAutomaticReconnect([...SIGNALR_AUTOMATIC_RECONNECT_DELAYS_MS])
        .withServerTimeout(SIGNALR_SERVER_TIMEOUT_MS)
        .configureLogging(LogLevel.Warning)
        .build();

      connection.onclose((error?: Error) => {
        // Only the hub's current connection may drive reconnects; a replaced one closing late is noise.
        const current = this.connections.get(config.name);
        if (current && current !== connection) return;
        this.handleConnectionClose(config.name, error);
      });

      connection.onreconnecting((error?: Error) => {
        logger.warn({ message: `Reconnecting to hub: ${config.name}`, context: { error } });
        this.emitHubLifecycle(HUB_RECONNECTING_EVENT, config.name);
      });

      connection.onreconnected(() => {
        logger.info({ message: `Reconnected to hub: ${config.name}` });
        this.reconnectAttempts.set(config.name, 0);
        // A reconnect issues a new connection id outside every server group: subscribers must re-announce.
        this.emitHubLifecycle(HUB_RECONNECTED_EVENT, config.name);
      });

      const handlers: HubMethodHandler[] = [];
      config.methods.forEach((method) => {
        const handler: SignalREventListener = (...args) => {
          // Never log payloads: they carry personal data (chat, call details, precise coordinates).
          if (!isUnloggedHubMethod(method)) logger.debug({ message: `Received ${method} from hub: ${config.name}` });
          this.emit(method, ...args);
        };
        connection.on(method, handler);
        handlers.push({ method, handler });
      });
      this.hubMethodHandlers.set(config.name, handlers);

      if (abortController.signal.aborted) {
        this.cleanupHubMethodHandlers(config.name, connection);
        throw new CancelledError();
      }

      try {
        await connection.start();
      } catch (error) {
        // The failed connection is discarded; don't leave our handlers attached to it.
        this.cleanupHubMethodHandlers(config.name, connection);
        throw error;
      }
      this.connections.set(config.name, connection);
      this.reconnectAttempts.set(config.name, 0);
      this.exhaustedHubs.delete(config.name);
      this.parkedWhileHidden.delete(config.name);
      this.setHubState(config.name, HubConnectingState.IDLE);
      this.cancelPendingReconnect(config.name);

      logger.info({ message: `Connected to hub: ${config.name}` });
      // A new connection id belongs to no group — including rebuilds, which raise no reconnected event.
      this.emitHubLifecycle(HUB_CONNECTED_EVENT, config.name);
    } catch (error) {
      if (this.hubStates.get(config.name) === HubConnectingState.DIRECT_CONNECTING) this.setHubState(config.name, HubConnectingState.IDLE);
      if (abortController.signal.aborted || error instanceof CancelledError) {
        logger.debug({ message: `Connection attempt to hub ${config.name} was cancelled` });
        return;
      }
      // Transient and retried: warn, don't report every attempt as an error.
      logger.warn({ message: `Failed to connect to hub: ${config.name}`, context: { error } });
      throw error;
    } finally {
      if (this.pendingConnections.get(config.name) === abortController) this.pendingConnections.delete(config.name);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Close and rebuild

  private handleConnectionClose(hubName: string, error?: Error): void {
    // No stored config means the app already let the hub go (a close that lands after its disconnect finished).
    const intentional = this.consumeIntentionalDisconnect(hubName) || !this.hubConfigs.has(hubName);
    const connection = this.connections.get(hubName);
    if (connection) this.dropConnection(hubName, connection);

    if (intentional) {
      logger.debug({ message: `Hub ${hubName} closed by an intentional disconnect; not reconnecting` });
    } else {
      logger.warn({ message: `Hub ${hubName} closed; scheduling rebuild`, context: { error } });
      this.reconnectAttempts.set(hubName, 0);
      this.scheduleReconnect(hubName);
    }

    // Raised after scheduling, so listeners already see the hub as "available" (a rebuild is pending).
    const info: HubDisconnectInfo = { intentional };
    this.emitHubLifecycle(HUB_DISCONNECTED_EVENT, hubName, info);
  }

  /** Schedules the next rebuild with linear backoff, or parks the hub once the attempt budget is spent. */
  private scheduleReconnect(hubName: string, options: { immediate?: boolean } = {}): void {
    this.cancelPendingReconnect(hubName);
    if (!this.hubConfigs.has(hubName)) {
      this.setHubState(hubName, HubConnectingState.IDLE);
      return;
    }

    const attempts = this.reconnectAttempts.get(hubName) ?? 0;
    if (attempts >= SIGNALR_MAX_RECONNECT_ATTEMPTS) {
      this.parkExhaustedHub(hubName);
      return;
    }

    const attempt = attempts + 1;
    this.reconnectAttempts.set(hubName, attempt);
    const delay = options.immediate ? 0 : reconnectDelayForAttempt(attempt);
    this.setHubState(hubName, HubConnectingState.RECONNECTING);
    logger.info({ message: `Scheduling rebuild ${attempt}/${SIGNALR_MAX_RECONNECT_ATTEMPTS} for hub: ${hubName}`, context: { delay } });

    const timer = setTimeout(() => {
      if (this.reconnectTimers.get(hubName) === timer) this.reconnectTimers.delete(hubName);
      void this.runReconnectAttempt(hubName, attempt);
    }, delay);
    this.reconnectTimers.set(hubName, timer);
  }

  private async runReconnectAttempt(hubName: string, attempt: number): Promise<void> {
    const config = this.hubConfigs.get(hubName);
    if (!config || this.intentionalDisconnects.has(hubName)) {
      this.setHubState(hubName, HubConnectingState.IDLE);
      return;
    }

    if (isWeb() && !isElectron() && !this.isPageVisible) {
      // Browsers throttle hidden tabs; the visibility resume rebuilds it. Electron never gets here (minimise = hidden).
      logger.debug({ message: `Deferring rebuild of hub ${hubName} until the page is visible` });
      this.parkedWhileHidden.add(hubName);
      this.setHubState(hubName, HubConnectingState.IDLE);
      return;
    }

    if (this.isHubConnected(hubName)) {
      this.reconnectAttempts.set(hubName, 0);
      this.setHubState(hubName, HubConnectingState.IDLE);
      return;
    }

    try {
      logger.info({ message: `Refreshing token before rebuilding hub: ${hubName}` });
      await this.auth?.refreshAccessToken();

      // Disconnected (sign-out, background) while the refresh ran.
      if (!this.hubConfigs.has(hubName) || this.intentionalDisconnects.has(hubName)) {
        this.setHubState(hubName, HubConnectingState.IDLE);
        return;
      }

      if (!this.currentToken()) {
        // The refresh was rejected and the session is gone: stop instead of retrying forever (Unit). The auth
        // layer owns the sign-out; a later sign-in connects again from scratch.
        logger.warn({ message: `No access token after refresh; stopping reconnects for hub: ${hubName}` });
        this.forgetHub(hubName);
        return;
      }

      logger.info({ message: `Rebuilding hub: ${hubName} (attempt ${attempt}/${SIGNALR_MAX_RECONNECT_ATTEMPTS})` });
      await this.connectToHubWithEventingUrl(config, { retryOnFailure: false });
      if (!this.isHubConnected(hubName)) throw new Error(`Hub ${hubName} did not connect`);
      this.reconnectAttempts.set(hubName, 0);
    } catch (error) {
      if (!this.hubConfigs.has(hubName)) return;
      this.setHubState(hubName, HubConnectingState.IDLE);
      logger.warn({ message: `Rebuild attempt ${attempt}/${SIGNALR_MAX_RECONNECT_ATTEMPTS} failed for hub: ${hubName}`, context: { error } });
      // The closed connection raises no further events: without rescheduling here the hub would stay dead.
      this.scheduleReconnect(hubName);
    }
  }

  private parkExhaustedHub(hubName: string): void {
    logger.error({ message: `Max reconnection attempts (${SIGNALR_MAX_RECONNECT_ATTEMPTS}) reached for hub: ${hubName}; waiting for the network` });
    const connection = this.connections.get(hubName);
    if (connection) this.dropConnection(hubName, connection);
    this.reconnectAttempts.delete(hubName);
    this.setHubState(hubName, HubConnectingState.IDLE);
    // Keep the config (Responder): deleting it made the outage permanent until the next resume.
    this.exhaustedHubs.add(hubName);
    this.ensureConnectivityListener();
    this.emitHubLifecycle(HUB_RECONNECT_EXHAUSTED_EVENT, hubName);
  }

  private ensureConnectivityListener(): void {
    if (this.connectivityUnsubscribe || !this.connectivity) return;
    this.connectivityUnsubscribe = this.connectivity.subscribe((online) => {
      if (online) this.retryExhaustedHubs();
    });
  }

  /** Restarts the rebuild loop, with a fresh budget, for every parked hub. Called when connectivity returns. */
  public retryExhaustedHubs(): void {
    if (this.exhaustedHubs.size === 0) return;
    // Snapshot and clear first: repeated online events must not stack retries.
    const hubNames = Array.from(this.exhaustedHubs);
    this.exhaustedHubs.clear();

    for (const hubName of hubNames) {
      if (this.isHubConnected(hubName) || this.reconnectTimers.has(hubName) || this.isHubConnecting(hubName) || !this.hubConfigs.has(hubName)) continue;
      logger.info({ message: `Network reachable again; restarting reconnection for hub: ${hubName}` });
      this.reconnectAttempts.set(hubName, 0);
      this.scheduleReconnect(hubName, { immediate: true });
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Disconnect

  public async disconnectFromHub(hubName: string): Promise<void> {
    this.cancelPendingReconnect(hubName);
    this.pendingConnections.get(hubName)?.abort();
    this.pendingConnections.delete(hubName);
    // An explicit disconnect ends any outage: no network-triggered or visibility-triggered retries.
    this.exhaustedHubs.delete(hubName);
    this.parkedWhileHidden.delete(hubName);
    this.intentionalDisconnects.add(hubName);

    try {
      const existingLock = this.connectionLocks.get(hubName);
      if (existingLock) {
        try {
          await existingLock;
        } catch (error) {
          logger.debug({ message: `Connection attempt failed while waiting to disconnect hub ${hubName}`, context: { error } });
        }
      }

      // A connect that finished while we waited may have scheduled a rebuild.
      this.cancelPendingReconnect(hubName);
      this.hubConfigs.delete(hubName);
      this.reconnectAttempts.delete(hubName);

      const connection = this.connections.get(hubName);
      if (connection) {
        this.cleanupHubMethodHandlers(hubName, connection);
        try {
          await connection.stop();
          logger.info({ message: `Disconnected from hub: ${hubName}` });
        } catch (error) {
          logger.error({ message: `Error disconnecting from hub: ${hubName}`, context: { error } });
          throw error;
        } finally {
          if (this.connections.get(hubName) === connection) this.connections.delete(hubName);
        }
      }
    } finally {
      this.intentionalDisconnects.delete(hubName);
      this.setHubState(hubName, HubConnectingState.IDLE);
    }
  }

  /** Disconnects every hub the service knows: connected, connecting, waiting to rebuild or parked. */
  public async disconnectAll(): Promise<void> {
    const hubNames = new Set<string>([...this.connections.keys(), ...this.hubConfigs.keys(), ...this.reconnectTimers.keys(), ...this.pendingConnections.keys()]);
    await Promise.all(Array.from(hubNames, (hubName) => this.disconnectFromHub(hubName)));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Invoke

  public async invoke<TResult = unknown>(hubName: string, method: string, ...args: unknown[]): Promise<TResult> {
    const existingLock = this.connectionLocks.get(hubName);
    if (existingLock) {
      try {
        await existingLock;
      } catch {
        // Reported by the connection check below.
      }
    }

    const connection = this.connections.get(hubName);
    if (!connection) {
      const reason = this.hubStates.get(hubName) === HubConnectingState.RECONNECTING ? 'hub is currently reconnecting' : 'hub is not connected';
      throw new Error(`Cannot invoke method ${method} on hub ${hubName}: ${reason}`);
    }

    // withAutomaticReconnect keeps the connection object while the transport is down; invoking then throws from
    // inside the client with no hint of the hub.
    if (connection.state !== HubConnectionState.Connected) {
      logger.warn({ message: `Skipping invoke of ${method} on hub: ${hubName} - not connected`, context: { state: connection.state } });
      throw new Error(`Cannot invoke method ${method} on hub ${hubName}: hub is not connected`);
    }

    try {
      return await connection.invoke<TResult>(method, ...args);
    } catch (error) {
      // A drop between the state check and the send is transport noise, not a hub fault.
      if (connection.state !== HubConnectionState.Connected) {
        logger.warn({ message: `Invoke of ${method} on hub ${hubName} was interrupted by a connection drop`, context: { error } });
      } else {
        logger.error({ message: `Error invoking ${method} on hub: ${hubName}`, context: { error } });
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // State queries

  public isHubConnected(hubName: string): boolean {
    return this.connections.get(hubName)?.state === HubConnectionState.Connected;
  }

  /**
   * Connected, connecting, reconnecting in place, waiting for a rebuild or deferred until the page is visible.
   * False means nothing will bring the hub back by itself (never connected, parked after exhausting retries, or
   * stopped because the session ended) — what the watchdog repairs.
   */
  public isHubAvailable(hubName: string): boolean {
    return this.connections.has(hubName) || this.isHubConnecting(hubName) || this.reconnectTimers.has(hubName) || this.connectionLocks.has(hubName) || this.parkedWhileHidden.has(hubName);
  }

  public getHubConnectionState(hubName: string): HubConnectionState | null {
    return this.connections.get(hubName)?.state ?? null;
  }

  public isHubReconnecting(hubName: string): boolean {
    return this.hubStates.get(hubName) === HubConnectingState.RECONNECTING || this.connections.get(hubName)?.state === HubConnectionState.Reconnecting;
  }

  public getExhaustedHubs(): string[] {
    return Array.from(this.exhaustedHubs);
  }

  public isHubReconnectExhausted(hubName: string): boolean {
    return this.exhaustedHubs.has(hubName);
  }

  public getReconnectAttempts(hubName: string): number {
    return this.reconnectAttempts.get(hubName) ?? 0;
  }

  public isVisible(): boolean {
    return this.isPageVisible;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Events

  public on(event: string, listener: SignalREventListener): () => void {
    const listeners = this.eventListeners.get(event) ?? new Set<SignalREventListener>();
    listeners.add(listener);
    this.eventListeners.set(event, listeners);
    return () => this.off(event, listener);
  }

  public off(event: string, listener: SignalREventListener): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) this.eventListeners.delete(event);
  }

  public offAll(event: string): void {
    this.eventListeners.delete(event);
  }

  public removeAllListeners(): void {
    this.eventListeners.clear();
  }

  public getEventListenerCount(event: string): number {
    return this.eventListeners.get(event)?.size ?? 0;
  }

  public getTotalEventListenerCount(): number {
    let total = 0;
    this.eventListeners.forEach((listeners) => {
      total += listeners.size;
    });
    return total;
  }

  private emitHubLifecycle(event: string, hubName: string, info?: HubDisconnectInfo): void {
    const args: unknown[] = info ? [hubName, info] : [hubName];
    this.emit(event, ...args);
    this.emit(`${event}:${hubName}`, ...args);
  }

  /** Every listener runs even when one throws (Responder's emit had no guard). */
  private emit(event: string, ...args: unknown[]): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      try {
        listener(...args);
      } catch (error) {
        logger.error({ message: `Error in SignalR listener for event: ${event}`, context: { error } });
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Visibility (web browsers only; Electron minimise reports hidden and must not stall reconnects)

  private ensureVisibilityHandling(): void {
    if (this.visibilityHandler || !isWeb() || isElectron() || typeof document === 'undefined') return;
    this.visibilityHandler = () => {
      const wasVisible = this.isPageVisible;
      this.isPageVisible = document.visibilityState !== 'hidden';
      if (!wasVisible && this.isPageVisible) void this.reconnectOnVisibilityResume();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private async reconnectOnVisibilityResume(): Promise<void> {
    for (const [hubName, config] of this.hubConfigs) {
      if (this.isHubConnected(hubName) || this.isHubConnecting(hubName) || this.reconnectTimers.has(hubName)) continue;
      const connection = this.connections.get(hubName);
      // One still inside its automatic reconnect will recover or close and schedule its own rebuild.
      if (connection && connection.state !== HubConnectionState.Disconnected) continue;
      this.parkedWhileHidden.delete(hubName);
      this.reconnectAttempts.set(hubName, 0);
      try {
        await this.connectToHubWithEventingUrl(config);
      } catch (error) {
        logger.warn({ message: `Failed to reconnect hub ${hubName} after visibility resume`, context: { error } });
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Internals

  private currentToken(): string | null {
    try {
      const token = this.auth?.getAccessToken();
      return typeof token === 'string' && token.length > 0 ? token : null;
    } catch {
      return null;
    }
  }

  private isHubConnecting(hubName: string): boolean {
    const state = this.hubStates.get(hubName);
    return state === HubConnectingState.RECONNECTING || state === HubConnectingState.DIRECT_CONNECTING;
  }

  private setHubState(hubName: string, state: HubConnectingState): void {
    if (state === HubConnectingState.IDLE) this.hubStates.delete(hubName);
    else this.hubStates.set(hubName, state);
  }

  private consumeIntentionalDisconnect(hubName: string): boolean {
    if (!this.intentionalDisconnects.has(hubName)) return false;
    this.intentionalDisconnects.delete(hubName);
    return true;
  }

  private cancelPendingReconnect(hubName: string): void {
    const timer = this.reconnectTimers.get(hubName);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.reconnectTimers.delete(hubName);
    }
  }

  private dropConnection(hubName: string, connection: HubConnection): void {
    this.cleanupHubMethodHandlers(hubName, connection);
    if (this.connections.get(hubName) === connection) this.connections.delete(hubName);
  }

  private cleanupHubMethodHandlers(hubName: string, connection: HubConnection): void {
    const handlers = this.hubMethodHandlers.get(hubName);
    if (!handlers) return;
    handlers.forEach(({ method, handler }) => {
      try {
        connection.off(method, handler);
      } catch {
        // The connection may already be disposed.
      }
    });
    this.hubMethodHandlers.delete(hubName);
  }

  /** Stops tracking a hub entirely (session ended): no rebuilds, no connectivity recovery. */
  private forgetHub(hubName: string): void {
    this.cancelPendingReconnect(hubName);
    this.hubConfigs.delete(hubName);
    this.reconnectAttempts.delete(hubName);
    this.exhaustedHubs.delete(hubName);
    this.parkedWhileHidden.delete(hubName);
    this.setHubState(hubName, HubConnectingState.IDLE);
  }

  /** Test helper: drops every connection, timer and listener without network calls. Not for app code. */
  public resetForTests(): void {
    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.reconnectTimers.clear();
    this.pendingConnections.forEach((controller) => controller.abort());
    this.pendingConnections.clear();
    this.connections.forEach((connection, hubName) => this.cleanupHubMethodHandlers(hubName, connection));
    this.connections.clear();
    this.hubConfigs.clear();
    this.reconnectAttempts.clear();
    this.connectionLocks.clear();
    this.hubStates.clear();
    this.intentionalDisconnects.clear();
    this.exhaustedHubs.clear();
    this.parkedWhileHidden.clear();
    this.eventListeners.clear();
    this.connectivityUnsubscribe?.();
    this.connectivityUnsubscribe = null;
    if (this.visibilityHandler && typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.visibilityHandler = null;
    this.isPageVisible = true;
  }
}

/** The app-wide service. The app shell wires auth and connectivity through `configureRealtime()`. */
export const signalRService = new SignalRService();
