import { getEnv } from '../env/env';
import { logger } from '../logging/logger';
import { isSensitiveKey } from '../logging/sanitize';
import { countlyClient } from './countly-client';
import type { AnalyticsEventProperties, CountlyClient } from './types';

export interface AnalyticsServiceOptions {
  /** Consecutive failures before analytics pauses itself. */
  maxRetries?: number;
  enableLogging?: boolean;
  /** How long analytics stays paused after too many failures. */
  disableTimeoutMs?: number;
  /** Minimum gap between two failure log entries. */
  errorThrottleMs?: number;
}

export interface AnalyticsStatus {
  retryCount: number;
  isDisabled: boolean;
  isInitialized: boolean;
  maxRetries: number;
  disableTimeoutMinutes: number;
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Countly analytics (omni-plan §7.1): Unit's service (retry counter resets after a successful event, so isolated
 * failures hours apart never pause analytics) + Responder's initializeWithEnv / setUserProperties / endSession +
 * the Dispatch/BigBoard web sender (countly-client.web.ts). Aptabase is gone.
 *
 * Property keys that look sensitive (tokens, usernames, emails, protected values) are never sent.
 */
export class AnalyticsService {
  private retryCount = 0;
  private isDisabled = false;
  private isInitialized = false;
  private lastErrorTime = 0;
  private reenableTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxRetries: number;
  private readonly enableLogging: boolean;
  private readonly disableTimeoutMs: number;
  private readonly errorThrottleMs: number;

  constructor(
    private readonly client: CountlyClient,
    options: AnalyticsServiceOptions = {}
  ) {
    this.maxRetries = options.maxRetries ?? 2;
    this.enableLogging = options.enableLogging ?? true;
    this.disableTimeoutMs = options.disableTimeoutMs ?? 10 * 60 * 1000;
    this.errorThrottleMs = options.errorThrottleMs ?? 30_000;
  }

  /** Initialises Countly once. Rejects when the SDK fails to start. */
  public async initialize(appKey: string, serverUrl: string): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this.client.init(appKey, serverUrl, { loggingEnabled: false });
      this.isInitialized = true;
      if (this.enableLogging) logger.info({ message: 'Analytics initialized' });
    } catch (error) {
      logger.error({ message: 'Failed to initialize analytics', context: { error: errorMessage(error) } });
      throw error;
    }
  }

  /** Initialises from COUNTLY_APP_KEY / COUNTLY_SERVER_URL; skips quietly when either is missing. Never rejects. */
  public async initializeWithEnv(): Promise<void> {
    const env = getEnv();
    if (!env.COUNTLY_APP_KEY || !env.COUNTLY_SERVER_URL) {
      if (this.enableLogging) logger.debug({ message: 'Analytics not configured; skipping initialization', context: { hasAppKey: !!env.COUNTLY_APP_KEY, hasServerUrl: !!env.COUNTLY_SERVER_URL } });
      return;
    }
    try {
      await this.initialize(env.COUNTLY_APP_KEY, env.COUNTLY_SERVER_URL);
    } catch {
      // Logged by initialize(); analytics failures never block startup.
    }
  }

  public trackEvent(eventName: string, properties: AnalyticsEventProperties = {}): void {
    if (!this.isInitialized || this.isDisabled) {
      if (this.enableLogging) logger.debug({ message: 'Analytics event skipped', context: { eventName, initialized: this.isInitialized, disabled: this.isDisabled } });
      return;
    }
    try {
      this.client.recordEvent(eventName, toSegmentation(properties), 1);
      // A successful record proves the SDK is healthy. Without this reset the counter only ever grows, so two
      // unrelated errors hours apart would pause analytics for the whole disable timeout (Unit's fix).
      this.retryCount = 0;
    } catch (error) {
      this.handleError(error, eventName);
    }
  }

  /** Countly custom user properties. Sensitive-looking keys are dropped. */
  public setUserProperties(properties: AnalyticsEventProperties): void {
    if (!this.isInitialized) return;
    try {
      this.client.setUserData(toSegmentation(properties));
    } catch (error) {
      logger.error({ message: 'Failed to set analytics user properties', context: { error: errorMessage(error) } });
    }
  }

  /** Ends the analytics session (logout). */
  public endSession(): void {
    if (!this.isInitialized) return;
    try {
      this.client.endSession();
    } catch (error) {
      logger.error({ message: 'Failed to end analytics session', context: { error: errorMessage(error) } });
    }
  }

  public isAnalyticsDisabled(): boolean {
    return this.isDisabled;
  }

  public isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  public getStatus(): AnalyticsStatus {
    return {
      retryCount: this.retryCount,
      isDisabled: this.isDisabled,
      isInitialized: this.isInitialized,
      maxRetries: this.maxRetries,
      disableTimeoutMinutes: this.disableTimeoutMs / 60_000,
    };
  }

  /** Clears counters and the paused state; `full` also forgets initialization (tests). */
  public reset(full = false): void {
    this.retryCount = 0;
    this.isDisabled = false;
    this.lastErrorTime = 0;
    if (this.reenableTimer) clearTimeout(this.reenableTimer);
    this.reenableTimer = null;
    if (full) this.isInitialized = false;
  }

  private handleError(error: unknown, eventName: string): void {
    if (this.isDisabled) return;
    this.retryCount++;
    const now = Date.now();
    if (this.enableLogging && now - this.lastErrorTime > this.errorThrottleMs) {
      this.lastErrorTime = now;
      // warn, not error: an analytics hiccup is not an app defect worth a Sentry issue.
      logger.warn({ message: 'Analytics tracking error', context: { error: errorMessage(error), eventName, retryCount: this.retryCount, maxRetries: this.maxRetries } });
    }
    if (this.retryCount >= this.maxRetries) this.pause();
  }

  private pause(): void {
    if (this.isDisabled) return;
    this.isDisabled = true;
    if (this.enableLogging) logger.info({ message: 'Analytics paused after repeated errors', context: { disableTimeoutMinutes: this.disableTimeoutMs / 60_000 } });
    this.reenableTimer = setTimeout(() => {
      this.reenableTimer = null;
      this.isDisabled = false;
      this.retryCount = 0;
      this.lastErrorTime = 0;
      if (this.enableLogging) logger.info({ message: 'Analytics resumed' });
    }, this.disableTimeoutMs);
  }
}

/** Countly segmentation values are strings; sensitive-looking keys never leave the device. */
export const toSegmentation = (properties: AnalyticsEventProperties): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (isSensitiveKey(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = String(value);
  }
  return out;
};

/** The app-wide analytics service (native bridge on iOS/Android, direct post on web/Electron). */
export const analyticsService = new AnalyticsService(countlyClient);
