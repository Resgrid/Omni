import type { Capabilities } from '@resgrid/config';
import type { RollbackReason } from '@resgrid/offline';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import {
  BACKGROUND_DRAIN_TIMEOUT_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_MAX_ACCURACY_METERS,
  DEFAULT_MIN_TRANSMIT_DISTANCE_METERS,
  DEFAULT_MIN_TRANSMIT_INTERVAL_MS,
  HEARTBEAT_STALE_FRACTION,
  LOCATION_TASK_NAME,
  MIN_HEARTBEAT_INTERVAL_MS,
  REJECTION_BACKOFF_BASE_MS,
  REJECTION_BACKOFF_MAX_MS,
} from './constants';
import { newestFix, toLocationFix } from './geo';
import { LOCATION_I18N_KEYS, translateOr } from './i18n-keys';
import { currentLocationAsFix, type LocationTransmissionStatus, patchTransmissionStatus, setCurrentLocation, type TransmissionMode } from './location-store';
import { describeError, getLocationLogger } from './logger';
import type { LocationEvent } from './outbox-handlers';
import { buildPersonLocationPayload, buildUnitLocationPayload, coalesceKeyFor, eventTypeFor, targetKeyFor } from './payload';
import { getBackgroundLocationPermission, getForegroundLocationPermission, type LocationPermissionFlowResult, type PermissionAnswer, requestForegroundLocationPermission, runLocationPermissionFlow } from './permissions';
import { buildTaskOptions, hasSameTaskOptions, LOCATION_PROFILES, type LocationProfile, type LocationProfileId, profileForTarget } from './task-options';
import type { LocationTaskConsumer, LocationTaskContext } from './task-runtime';
import { settleWithin } from './timeouts';
import { LocationTransmissionGate, type LocationTransmissionGateOptions, type TransmissionRecord } from './transmission-gate';
import type { FixSource, LocationFix, LocationOutbox, LocationServerConfig, LocationSession, LocationSettings, LocationTarget, LocationWatch, TransmissionTarget } from './types';
import { type GeolocationLike, getBrowserGeolocation, queryBrowserPermission, watchBrowserPosition } from './web-geolocation';

/** The variant's location capability (`capabilities.location` in the manifest). */
export type LocationCapability = Capabilities['location'];

/**
 * - `always` (Responder): a foreground fix always goes out — the open app reports where the responder is; Realtime
 *   Geolocation only governs receiving others' positions.
 * - `realtime-setting` (Unit): foreground transmission follows Realtime Geolocation (default on for units).
 * Background transmission always follows Background Geolocation (and the background capability).
 */
export type ForegroundTransmissionPolicy = 'always' | 'realtime-setting';

export interface LocationTransmitterOptions {
  capability: LocationCapability;
  /** The outbox (null until offline storage is open; fixes are then not queued). */
  getOutbox: () => LocationOutbox | null;
  isSignedIn: () => boolean;
  getSession: () => LocationSession | null;
  /** Unit: the unit the device reports for (null until one is selected). */
  getActiveUnitId: () => string | number | null | undefined;
  getSettings: () => LocationSettings | Promise<LocationSettings>;
  /** Department thresholds (`Config/GetConfig`); read on every start/refresh. */
  getServerConfig?: () => LocationServerConfig | null | undefined;
  /** Notifies on sign-in, sign-out and active-unit change; the transmitter then starts or stops itself. */
  subscribeSession?: (listener: () => void) => () => void;
  /** Notifies when location settings change; the transmitter re-syncs (task re-registration, watcher). */
  subscribeSettings?: (listener: () => void) => () => void;
  /** Start on sign-in through `subscribeSession`. Default: true for person/unit targets, false for 'none'. */
  autoStart?: boolean;
  foregroundTransmission?: ForegroundTransmissionPolicy;
  profile?: LocationProfileId;
  maxAccuracyMeters?: number;
  now?: () => number;
  /** Testing seam; defaults to `navigator.geolocation`. */
  getBrowserGeolocation?: () => GeolocationLike | null;
}

interface Backoff {
  key: string;
  count: number;
  until: number;
}

interface QueuedFix {
  eventId: string;
  key: string;
  record: TransmissionRecord;
}

const isWebPlatform = (): boolean => Platform.OS === 'web';

const positive = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);

/** Gate thresholds for a target: server min-distance and stale threshold when present, legacy defaults otherwise. */
export function gateOptionsFor(target: TransmissionTarget, config: LocationServerConfig | null | undefined): LocationTransmissionGateOptions {
  const minMeters = positive(target === 'unit' ? config?.UnitLocationMinMeters : config?.PersonnelLocationMinMeters);
  const staleSeconds = positive(target === 'unit' ? config?.UnitLocationStaleSeconds : config?.PersonnelLocationStaleSeconds);
  const heartbeat = staleSeconds === null ? DEFAULT_HEARTBEAT_INTERVAL_MS : Math.min(DEFAULT_HEARTBEAT_INTERVAL_MS, Math.max(MIN_HEARTBEAT_INTERVAL_MS, Math.floor(staleSeconds * 1000 * HEARTBEAT_STALE_FRACTION)));
  return { minIntervalMs: DEFAULT_MIN_TRANSMIT_INTERVAL_MS, minDistanceMeters: minMeters ?? DEFAULT_MIN_TRANSMIT_DISTANCE_METERS, stationaryIntervalMs: heartbeat };
}

/**
 * Settings defaults for a variant (for the data layer's settings store, and used when the injected getter fails):
 * Realtime Geolocation per `capabilities.location.geoHubDefault` (Responder off, Unit on), Background Geolocation off
 * until the user turns it on and grants "always".
 */
export const defaultLocationSettings = (capability: LocationCapability): LocationSettings => ({ realtimeGeolocation: capability.geoHubDefault, backgroundGeolocation: false });

/**
 * One location transmitter for a person or unit target (omni-plan §7.7): Responder's task registration from the entry
 * and heartbeat + Unit's transmission gate, automotive profile, task re-registration on option change and browser
 * geolocation on web + IC's foreground-only local tracking (target 'none'). Every transmitted fix is a coalesced
 * outbox write (plan §8.3/§8.5), so it survives offline stretches and app kills and only the newest is replayed.
 */
export class LocationTransmitter implements LocationTaskConsumer {
  readonly target: TransmissionTarget;
  readonly capability: LocationCapability;
  readonly profile: LocationProfile;

  private readonly options: LocationTransmitterOptions;
  private readonly foregroundPolicy: ForegroundTransmissionPolicy;
  private readonly maxAccuracyMeters: number;
  private readonly gate: LocationTransmissionGate;

  private tracking = false;
  private watch: LocationWatch | null = null;
  private watchStarting: Promise<void> | null = null;
  // Bumped whenever the watcher is released; a watcher resolving afterwards belongs to a released request.
  private watchGeneration = 0;
  private taskRegistered = false;
  private pending: LocationFix | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  // Newest fix accepted for transmission, sent or not: what the heartbeat re-reports (Responder).
  private latestFix: LocationFix | null = null;
  private backoff: Backoff | null = null;
  private lastQueued: QueuedFix | null = null;
  // Bumped by stop(): work in flight across a sign-out belongs to the session that ended.
  private sessionGeneration = 0;
  private opQueue: Promise<void> = Promise.resolve();
  private lastAppState: string;
  private disposers: (() => void)[] = [];
  private attached = false;

  constructor(options: LocationTransmitterOptions) {
    this.options = options;
    this.capability = options.capability;
    this.target = options.capability.transmission;
    this.profile = LOCATION_PROFILES[options.profile ?? profileForTarget(this.target)];
    this.foregroundPolicy = options.foregroundTransmission ?? (this.target === 'unit' ? 'realtime-setting' : 'always');
    this.maxAccuracyMeters = options.maxAccuracyMeters ?? DEFAULT_MAX_ACCURACY_METERS;
    this.gate = new LocationTransmissionGate(gateOptionsFor(this.target, this.readServerConfig()));
    this.lastAppState = this.appStateNow();
    patchTransmissionStatus({ target: this.target });
  }

  // ------------------------------------------------------------------ lifecycle

  /** Subscribes to app state (native), session and settings. Idempotent. */
  attach(): void {
    if (this.attached) return;
    this.attached = true;
    if (!isWebPlatform()) {
      const subscription = AppState.addEventListener('change', this.handleAppStateChange);
      this.disposers.push(() => subscription.remove());
    }
    if (this.options.subscribeSession) this.disposers.push(this.options.subscribeSession(() => this.syncWithSession()));
    if (this.options.subscribeSettings) this.disposers.push(this.options.subscribeSettings(() => void this.refresh()));
    if (this.options.subscribeSession && this.autoStart()) this.syncWithSession();
  }

  /**
   * Detach this instance (replaced by a new `configureLocation`, or tests): listeners, watcher, held fix and heartbeat.
   * A registered OS task is left alone — the next instance adopts it; `stop()` is what ends tracking.
   */
  dispose(): void {
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
    this.attached = false;
    this.sessionGeneration += 1;
    this.releaseWatcher();
    this.cancelPending();
    this.cancelHeartbeat();
  }

  /**
   * Start tracking for the signed-in session. Prompts for "when in use" only when `prompt` (default) and the app is in
   * the foreground; never prompts for "always" (that follows the user's own action: `requestBackgroundTracking`).
   * Resolves once the watcher/task are in place; a refused permission shows as `mode: 'permission-denied'`.
   */
  start(options: { prompt?: boolean } = {}): Promise<void> {
    this.tracking = true;
    patchTransmissionStatus({ tracking: true });
    const prompt = options.prompt !== false;
    return this.enqueueOp(() => this.sync(prompt));
  }

  /**
   * Stop everything (sign-out). A fix held or queued-in-flight for the outgoing session is never attributed to the next
   * one; already queued outbox events stay with their session (the outbox never replays them as another user).
   */
  stop(): Promise<void> {
    this.tracking = false;
    this.sessionGeneration += 1;
    this.releaseWatcher();
    this.cancelPending();
    this.cancelHeartbeat();
    this.gate.reset();
    this.backoff = null;
    this.latestFix = null;
    this.lastQueued = null;
    patchTransmissionStatus({ tracking: false, mode: 'stopped', watcherActive: false, transmissionAllowed: null, awaitingDelivery: false, backoffUntil: null });
    return this.enqueueOp(async () => {
      if (this.tracking) return; // restarted while this was queued
      await this.stopTaskIfRegistered();
      patchTransmissionStatus({ backgroundTaskRegistered: false });
    });
  }

  /**
   * Re-read settings, server thresholds and permissions and bring the task and watcher in line — including
   * re-registering the task when its stored options differ (new profile values, notification language). Never prompts.
   */
  refresh(): Promise<void> {
    return this.enqueueOp(async () => {
      if (this.tracking) await this.sync(false);
    });
  }

  /** Starts or stops with the session (signed in, and for a unit target a selected unit). */
  syncWithSession(): void {
    const shouldTrack = this.safe(() => this.options.isSignedIn(), false) && (this.target !== 'unit' || this.activeUnitId() !== null);
    if (shouldTrack && !this.tracking) {
      void this.start();
    } else if (!shouldTrack && this.tracking) {
      void this.stop();
    } else if (shouldTrack) {
      void this.refresh();
    }
  }

  /**
   * The user turned Background Geolocation on: run "when in use" → "always" and re-sync. Save the setting only when
   * the outcome is `granted`; the settings subscription (or a `refresh()`) then registers the task. Show
   * `getLocationPermissionRationale('background')` before calling this.
   */
  async requestBackgroundTracking(): Promise<LocationPermissionFlowResult> {
    if (!this.capability.background || isWebPlatform()) {
      const foreground = await getForegroundLocationPermission();
      return { outcome: 'unsupported', foreground, background: null };
    }
    const result = await runLocationPermissionFlow({ background: true, prompt: true });
    await this.refresh();
    return result;
  }

  isTracking(): boolean {
    return this.tracking;
  }

  // ------------------------------------------------------------------ task batches (LocationTaskConsumer)

  async handleTaskLocations(fixes: LocationFix[], context: LocationTaskContext): Promise<void> {
    const fix = newestFix(fixes);
    if (!fix) return;
    // The OS task keeps delivering in the foreground; a running watcher already records and transmits those (Unit).
    if (context.appState === 'active' && this.watch) return;
    getLocationLogger().info({ message: 'Background location batch received', context: { batchSize: fixes.length, appState: context.appState, accuracy: fix.coords.accuracy } });
    await this.processFix(fix, 'task', context.appState);
  }

  // ------------------------------------------------------------------ outbox callbacks

  /** The server acknowledged a queued fix. */
  notifyDelivered(target: LocationTarget, event: LocationEvent): void {
    const now = this.now();
    const key = this.keyForEvent(target, event);
    if (this.backoff && this.backoff.key === key) this.backoff = null;
    const patch: Partial<LocationTransmissionStatus> = { lastDeliveredAt: now, backoffUntil: this.backoff?.until ?? null };
    if (!this.lastQueued || this.lastQueued.eventId === event.id) patch.awaitingDelivery = false;
    patchTransmissionStatus(patch);
  }

  /**
   * A queued fix was dead-lettered (the server refused it) or discarded by the user. A refusal backs this target off —
   * 30 s doubling to 15 min — so a unit the server keeps rejecting does not post every 15 s forever (Unit), and the
   * refused position no longer counts as "on the server" for the gate.
   */
  notifyRejected(target: LocationTarget, event: LocationEvent, reason: RollbackReason): void {
    const now = this.now();
    const isLatest = this.lastQueued?.eventId === event.id;
    if (isLatest && this.lastQueued) this.gate.markRejected(this.lastQueued.record);
    if (reason !== 'dead') {
      if (isLatest) patchTransmissionStatus({ awaitingDelivery: false });
      return;
    }
    const key = this.keyForEvent(target, event);
    const count = this.backoff && this.backoff.key === key ? this.backoff.count + 1 : 1;
    const delay = Math.min(REJECTION_BACKOFF_BASE_MS * 2 ** (count - 1), REJECTION_BACKOFF_MAX_MS);
    this.backoff = { key, count, until: now + delay };
    getLocationLogger().warn({ message: 'Location fix refused by the server; backing off', context: { target, consecutiveRejections: count, backoffMs: delay, status: event.lastError?.status } });
    patchTransmissionStatus({ lastRejectedAt: now, backoffUntil: this.backoff.until, ...(isLatest ? { awaitingDelivery: false } : {}) });
  }

  // ------------------------------------------------------------------ sync

  private async sync(prompt: boolean): Promise<void> {
    if (!this.tracking) return;
    this.gate.updateOptions(gateOptionsFor(this.target, this.readServerConfig()));
    if (isWebPlatform()) {
      await this.syncWeb(prompt);
      return;
    }

    const active = this.isAppActive();
    let foreground = await getForegroundLocationPermission();
    if (foreground.status !== 'granted' && prompt && active && foreground.canAskAgain) {
      foreground = await requestForegroundLocationPermission();
    }
    if (!this.tracking) return;
    const background: PermissionAnswer = this.capability.background ? await getBackgroundLocationPermission() : { status: 'denied', canAskAgain: false };
    patchTransmissionStatus({ foregroundPermission: foreground.status, backgroundPermission: background.status });

    if (foreground.status !== 'granted') {
      this.releaseWatcher();
      await this.stopTaskIfRegistered();
      patchTransmissionStatus({ mode: 'permission-denied', backgroundTaskRegistered: this.taskRegistered });
      return;
    }

    const settings = await this.readSettings();
    if (!this.tracking) return;
    const wantsTask = this.capability.background && this.target !== 'none' && settings.backgroundGeolocation && background.status === 'granted';
    if (wantsTask) {
      this.taskRegistered = await this.ensureTaskRegistered(active);
    } else {
      if (this.capability.background && settings.backgroundGeolocation && background.status !== 'granted') {
        getLocationLogger().warn({ message: 'Background geolocation is on but "always" access is not granted; tracking in the foreground only' });
      }
      await this.stopTaskIfRegistered();
    }
    if (!this.tracking) return;

    if (this.isAppActive() && (!this.taskRegistered || this.profile.watcherWithTask)) {
      await this.ensureWatcher();
    } else {
      this.releaseWatcher();
    }
    this.ensureHeartbeatScheduled();
    patchTransmissionStatus({ backgroundTaskRegistered: this.taskRegistered, mode: this.currentMode() });
  }

  private async syncWeb(prompt: boolean): Promise<void> {
    const geolocation = (this.options.getBrowserGeolocation ?? getBrowserGeolocation)();
    if (!geolocation) {
      patchTransmissionStatus({ mode: 'unavailable', foregroundPermission: 'denied', backgroundPermission: 'denied' });
      return;
    }
    if (!this.watch) {
      const permission = (await queryBrowserPermission()) ?? 'undetermined';
      patchTransmissionStatus({ foregroundPermission: permission, backgroundPermission: 'denied' });
      if (!this.tracking) return;
      if (permission === 'denied') {
        patchTransmissionStatus({ mode: 'permission-denied' });
        return;
      }
      // The browser prompts on watchPosition itself; a resume must not raise a prompt nobody asked for.
      if (permission === 'undetermined' && !prompt) return;
      const generation = this.watchGeneration;
      this.watch = watchBrowserPosition(
        geolocation,
        (fix) => {
          if (generation === this.watchGeneration) void this.processFix(fix, 'web', 'active');
        },
        (error) => {
          getLocationLogger().warn({ message: 'Browser geolocation error', context: { code: error.code } });
          if (error.code === 1 && generation === this.watchGeneration) {
            this.releaseWatcher();
            patchTransmissionStatus({ mode: 'permission-denied', foregroundPermission: 'denied' });
          }
        }
      );
      patchTransmissionStatus({ watcherActive: true });
    }
    this.ensureHeartbeatScheduled();
    patchTransmissionStatus({ mode: this.currentMode() });
  }

  /**
   * Register the OS task, or re-register it when its stored options are out of date (Unit). Android refuses to start
   * the location foreground service from the background, so outside the foreground an existing registration is kept
   * and refreshed on the next resume. A failed registration falls back to the foreground watcher (Responder).
   */
  private async ensureTaskRegistered(active: boolean): Promise<boolean> {
    const options = buildTaskOptions(this.profile.id, Platform.OS, {
      notificationTitle: translateOr(LOCATION_I18N_KEYS.trackingNotificationTitle),
      notificationBody: translateOr(LOCATION_I18N_KEYS.trackingNotificationBody),
    });
    const registered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME).catch(() => false);
    if (registered) {
      let current: unknown = null;
      try {
        current = await TaskManager.getTaskOptionsAsync(LOCATION_TASK_NAME);
      } catch (error) {
        // Unreadable options are treated as stale: re-registering only updates them in place.
        getLocationLogger().debug({ message: 'Could not read background location task options', context: { error: describeError(error) } });
      }
      if (hasSameTaskOptions(current, options)) return true;
    }
    if (!active) return registered;
    if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
      // The entry did not define it (the build says no background location): fixes would go nowhere.
      getLocationLogger().error({ message: 'Background location task is not defined in this build; staying on the foreground watcher' });
      return false;
    }
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, options);
      getLocationLogger().info({ message: registered ? 'Background location task options refreshed' : 'Background location task registered', context: { profile: this.profile.id } });
      return true;
    } catch (error) {
      getLocationLogger().error({ message: 'Failed to register the background location task; falling back to the foreground watcher', context: { error: describeError(error) } });
      return false;
    }
  }

  private async stopTaskIfRegistered(): Promise<void> {
    if (!this.capability.background || isWebPlatform()) {
      this.taskRegistered = false;
      return;
    }
    try {
      if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        getLocationLogger().info({ message: 'Stopped a background location task the current session or settings do not allow' });
      }
    } catch (error) {
      getLocationLogger().warn({ message: 'Failed to stop the background location task', context: { error: describeError(error) } });
    }
    this.taskRegistered = false;
  }

  /** Single-flight watcher start; a watcher resolving after it was released (backgrounded, stopped) is thrown away. */
  private ensureWatcher(): Promise<void> {
    if (this.watch) return Promise.resolve();
    if (this.watchStarting) return this.watchStarting;
    const generation = this.watchGeneration;
    const starting = Location.watchPositionAsync(
      this.profile.watcherOptions,
      (location) => {
        const fix = toLocationFix(location);
        if (fix && generation === this.watchGeneration) void this.processFix(fix, 'watcher', this.appStateNow());
      },
      // Without a handler expo-location drops watcher errors silently.
      (reason) => getLocationLogger().warn({ message: 'Foreground location watcher failed', context: { reason: typeof reason === 'string' ? reason.slice(0, 120) : typeof reason } })
    )
      .then((subscription) => {
        if (generation !== this.watchGeneration || !this.tracking) {
          subscription.remove();
          getLocationLogger().info({ message: 'Discarded a foreground location watcher that resolved after it was released' });
          return;
        }
        this.watch = subscription;
        patchTransmissionStatus({ watcherActive: true });
      })
      .catch((error: unknown) => {
        getLocationLogger().error({ message: 'Failed to start the foreground location watcher', context: { error: describeError(error) } });
      })
      .finally(() => {
        if (this.watchStarting === starting) this.watchStarting = null;
      });
    this.watchStarting = starting;
    return starting;
  }

  private releaseWatcher(): void {
    // Invalidate first, unconditionally: a start still in flight must learn its result is stale.
    this.watchGeneration += 1;
    if (!this.watch) return;
    try {
      this.watch.remove();
    } catch (error) {
      getLocationLogger().debug({ message: 'Removing the location watcher failed', context: { error: describeError(error) } });
    }
    this.watch = null;
    patchTransmissionStatus({ watcherActive: false });
  }

  /**
   * The watcher holds the GPS on while subscribed and Android keeps it running after the app is backgrounded — with
   * background tracking off that tracked someone who asked not to be (Responder). It is dropped on the way out and
   * re-subscribed on the way back; the OS task covers the background when allowed.
   */
  private handleAppStateChange = (next: AppStateStatus): void => {
    const previous = this.lastAppState;
    this.lastAppState = next;
    if (next === 'background') {
      this.releaseWatcher();
      if (this.tracking) patchTransmissionStatus({ mode: this.currentMode() });
    } else if (next === 'active' && previous !== 'active' && this.tracking) {
      // Never prompts: access is usually fixed in the OS settings while the app was away (Unit).
      void this.enqueueOp(() => this.sync(false));
    }
  };

  // ------------------------------------------------------------------ transmission

  private async processFix(fix: LocationFix, source: FixSource, appState: string): Promise<void> {
    const generation = this.sessionGeneration;
    if (source !== 'heartbeat' && source !== 'deferred') {
      setCurrentLocation(fix, source);
      patchTransmissionStatus({ lastFixAt: fix.timestamp });
    }
    if (this.target === 'none') return;
    if (source !== 'task' && !this.tracking) return;
    if (!this.safe(() => this.options.isSignedIn(), false)) return;

    if (fix.coords.accuracy !== null && fix.coords.accuracy > this.maxAccuracyMeters) {
      getLocationLogger().debug({ message: 'Skipping a low-accuracy location fix', context: { accuracy: fix.coords.accuracy } });
      return;
    }

    const allowed = await this.isTransmissionAllowed(appState);
    if (generation !== this.sessionGeneration) return;
    patchTransmissionStatus({ transmissionAllowed: allowed });
    if (!allowed) {
      // The newest fix says not to transmit; an older one held back must not go out after it (Unit).
      this.cancelPending();
      return;
    }
    this.latestFix = fix;

    const id = this.targetId();
    if (!id) {
      getLocationLogger().debug({ message: this.target === 'unit' ? 'No active unit selected; not transmitting the fix' : 'No signed-in user; not transmitting the fix' });
      return;
    }
    const target: LocationTarget = this.target;
    const key = targetKeyFor(target, id);
    const now = this.now();

    // A refusal only says something about the target it was recorded for; another unit is a fresh start.
    if (this.backoff && this.backoff.key !== key) {
      this.backoff = null;
      patchTransmissionStatus({ backoffUntil: null });
    }
    if (this.backoff && this.backoff.until > now) {
      getLocationLogger().debug({ message: 'Not queueing a location fix while backing off after a server refusal', context: { consecutiveRejections: this.backoff.count } });
      return;
    }

    const decision = this.gate.evaluate(key, fix.coords, now);
    if (decision.action === 'skip') {
      // Newer than anything held back and no farther from the last transmission: the held fix is out of date.
      this.cancelPending();
      return;
    }
    if (decision.action === 'defer') {
      // Only the newest held-back fix matters. Without it a target that stops right after a transmission would be shown
      // up to 15 s short of where it parked — a stationary device produces no further fixes (Responder/Unit).
      this.pending = fix;
      if (!this.pendingTimer) this.pendingTimer = setTimeout(() => this.flushPending(), decision.retryInMs);
      return;
    }

    this.cancelPending();
    // Recorded before the enqueue resolves: fixes arriving meanwhile must see it.
    const record = this.gate.record(key, fix.coords, now);
    this.scheduleHeartbeat();
    await this.queueFix(target, id, key, record, fix, appState, generation);
  }

  private async queueFix(target: LocationTarget, id: string, key: string, record: TransmissionRecord, fix: LocationFix, appState: string, generation: number): Promise<void> {
    const outbox = this.safe(() => this.options.getOutbox(), null);
    if (!outbox) {
      this.gate.markRejected(record);
      getLocationLogger().warn({ message: 'Offline storage is not ready; location fix not queued' });
      return;
    }
    const payload = target === 'person' ? buildPersonLocationPayload(id, fix) : buildUnitLocationPayload(id, fix);
    try {
      const result = await outbox.enqueue({ type: eventTypeFor(target), payload, coalesceKey: coalesceKeyFor(target, id), coalesceAt: fix.timestamp });
      if (generation !== this.sessionGeneration) return;
      this.lastQueued = { eventId: result.id, key, record };
      patchTransmissionStatus({ lastQueuedAt: this.now(), awaitingDelivery: true });
    } catch (error) {
      if (generation === this.sessionGeneration) this.gate.markRejected(record);
      getLocationLogger().warn({ message: 'Failed to queue a location fix', context: { error: describeError(error) } });
      return;
    }

    // Outside the foreground the outbox's timer trigger may not run (Android pauses JS timers), so deliver now while the
    // OS keeps the task alive. Bounded: the task must finish inside the OS window.
    if (appState !== 'active' && !isWebPlatform() && outbox.drain) {
      try {
        await settleWithin(outbox.drain(), BACKGROUND_DRAIN_TIMEOUT_MS);
      } catch (error) {
        getLocationLogger().debug({ message: 'Background drain after a location fix failed', context: { error: describeError(error) } });
      }
    }
  }

  private flushPending(): void {
    this.pendingTimer = null;
    const fix = this.pending;
    this.pending = null;
    // Held since before the interval ended — perhaps before the app was backgrounded — so the setting that governs it
    // is read again now (Responder).
    if (fix) void this.processFix(fix, 'deferred', this.appStateNow());
  }

  private cancelPending(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.pending = null;
  }

  private async isTransmissionAllowed(appState: string): Promise<boolean> {
    const settings = await this.readSettings();
    if (isWebPlatform() || appState === 'active') return this.foregroundPolicy === 'always' ? true : settings.realtimeGeolocation;
    return this.capability.background && settings.backgroundGeolocation;
  }

  // ------------------------------------------------------------------ heartbeat

  /**
   * A stationary device produces no fixes (every consumer filters by distance), yet the department's map ages markers
   * by timestamp and a trapped or unresponsive responder is exactly the one whose marker must not age off. The latest
   * accepted fix is re-reported with a fresh timestamp after a quiet stretch. Where JS timers stop (Android
   * background) the task's distance-filter-free batches carry the heartbeat through the gate instead.
   */
  private scheduleHeartbeat(delayMs: number = this.gate.getOptions().stationaryIntervalMs): void {
    this.cancelHeartbeat();
    if (this.target === 'none') return;
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTimer = null;
      void this.sendHeartbeat();
    }, delayMs);
  }

  /** Start the countdown unless one runs, measured from the last transmission: one overdue while away fires now (Unit). */
  private ensureHeartbeatScheduled(): void {
    if (this.heartbeatTimer || this.target === 'none' || !this.tracking) return;
    const last = this.gate.getLastTransmittedAt();
    const since = last === null ? 0 : Math.max(0, this.now() - last);
    this.scheduleHeartbeat(Math.max(0, this.gate.getOptions().stationaryIntervalMs - since));
  }

  private cancelHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.tracking || this.target === 'none') return;
    const generation = this.sessionGeneration;
    const appState = this.appStateNow();
    const allowed = await this.isTransmissionAllowed(appState);
    // A stop during the await already cancelled the countdown; rearming would leave a stale timer behind.
    if (!this.tracking || generation !== this.sessionGeneration) return;
    if (!allowed) {
      getLocationLogger().debug({ message: 'Skipping the location heartbeat: transmission is not allowed in the current app state' });
      return;
    }
    // Keep counting even if nothing is found to send; a transmission restarts the countdown itself.
    this.scheduleHeartbeat();
    const fix = this.latestFix ?? currentLocationAsFix() ?? (await this.lastKnownPosition());
    if (!fix || !this.tracking || generation !== this.sessionGeneration) return;
    getLocationLogger().info({ message: 'Re-reporting the location of a target that has not moved' });
    await this.processFix({ ...fix, timestamp: this.now() }, 'heartbeat', appState);
  }

  /** What the OS already knows, without powering up the hardware (native only). */
  private async lastKnownPosition(): Promise<LocationFix | null> {
    if (isWebPlatform()) return null;
    try {
      return toLocationFix(await Location.getLastKnownPositionAsync());
    } catch (error) {
      getLocationLogger().debug({ message: 'Could not read the last known position for the heartbeat', context: { error: describeError(error) } });
      return null;
    }
  }

  // ------------------------------------------------------------------ helpers

  private enqueueOp(op: () => Promise<void>): Promise<void> {
    const run = this.opQueue.then(op).catch((error: unknown) => {
      getLocationLogger().error({ message: 'Location tracking update failed', context: { error: describeError(error) } });
    });
    this.opQueue = run;
    return run;
  }

  private currentMode(): TransmissionMode {
    if (!this.tracking) return 'stopped';
    if (isWebPlatform()) return this.watch ? 'web' : 'unavailable';
    if (this.isAppActive() && this.watch) return 'foreground';
    if (this.taskRegistered) return 'background-task';
    return this.isAppActive() ? 'foreground' : 'stopped';
  }

  private async readSettings(): Promise<LocationSettings> {
    try {
      return await this.options.getSettings();
    } catch (error) {
      getLocationLogger().warn({ message: 'Reading location settings failed; using defaults', context: { error: describeError(error) } });
      return defaultLocationSettings(this.capability);
    }
  }

  private readServerConfig(): LocationServerConfig | null {
    return this.safe(() => this.options.getServerConfig?.() ?? null, null);
  }

  private activeUnitId(): string | null {
    const raw = this.safe(() => this.options.getActiveUnitId(), null);
    if (raw === null || raw === undefined) return null;
    const value = String(raw).trim();
    return value.length > 0 && value !== '0' ? value : null;
  }

  private targetId(): string | null {
    if (this.target === 'unit') return this.activeUnitId();
    if (this.target === 'person') {
      const userId = this.safe(() => this.options.getSession()?.userId ?? null, null);
      return userId && userId.trim().length > 0 ? userId : null;
    }
    return null;
  }

  private keyForEvent(target: LocationTarget, event: LocationEvent): string {
    const payload = event.payload as Partial<{ UserId: string; UnitId: string }>;
    return targetKeyFor(target, (target === 'person' ? payload.UserId : payload.UnitId) ?? '');
  }

  private autoStart(): boolean {
    return this.options.autoStart ?? this.target !== 'none';
  }

  private isAppActive(): boolean {
    return isWebPlatform() || this.appStateNow() === 'active';
  }

  private appStateNow(): string {
    try {
      return typeof AppState.currentState === 'string' ? AppState.currentState : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private safe<T>(read: () => T, fallback: T): T {
    try {
      return read();
    } catch {
      return fallback;
    }
  }
}

export function createLocationTransmitter(options: LocationTransmitterOptions): LocationTransmitter {
  return new LocationTransmitter(options);
}
