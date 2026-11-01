import { getActiveVariant } from '@resgrid/config';
import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

import { isDev } from '../dev';
import { getAppVersionInfo, getEnv } from '../env/env';
import { addLogListener, logger } from '../logging/logger';
import type { LogRecord } from '../logging/types';
import { sentryBeforeBreadcrumb, sentryBeforeSend, sentryBeforeSendTransaction } from './filters';

type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type NavigationIntegration = ReturnType<typeof Sentry.reactNavigationIntegration>;

// Sentry's own logger stays off: watchdog-termination tracking rewrites the native scope on every RNSentry
// turbo-module call, and `debug` floods the console with "Writing tags to disk". Pass `debug: true` temporarily
// when diagnosing Sentry itself.
const SENTRY_DEBUG = false;

let navigationIntegration: NavigationIntegration | null = null;
let initialized = false;
let detachLogForwarding: (() => void) | null = null;

/**
 * The React Navigation integration (one instance per app). The root layout registers the navigation container
 * with it: `getSentryNavigationIntegration().registerNavigationContainer(ref)`.
 */
export function getSentryNavigationIntegration(): NavigationIntegration {
  if (!navigationIntegration) {
    // Time-to-initial-display off: it produced "fallback timestamp" errors in every app.
    navigationIntegration = Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: false });
  }
  return navigationIntegration;
}

const variantFacts = (): { id: string | null; appId: string | null } => {
  try {
    const v = getActiveVariant();
    return { id: v.id, appId: v.identity.electron.appId };
  } catch {
    return { id: null, appId: null };
  }
};

/**
 * Release name for web and Electron builds, from `extra.version` (`<appId>@<version>+<buildNumber>`). iOS and
 * Android keep the SDK's native release (bundle id @ version + build), which is what the Xcode/Gradle source-map
 * upload of @sentry/react-native/expo uses — overriding it there would break symbolication.
 */
export function getSentryRelease(): string | undefined {
  const version = getAppVersionInfo();
  if (!version) return undefined;
  const appId = variantFacts().appId ?? 'resgrid';
  return `${appId}@${version.version}+${version.buildNumber}`;
}

/**
 * The merged init options (omni-plan §7.1): Dispatch's init (DSN guard, release, environment, web-safe tracing),
 * Responder's breadcrumb policy and hang/watchdog tracking, Unit/IC's transaction and noise filters. The Sentry
 * project is chosen at build time (config plugin `sentryProject`); at runtime only the DSN matters.
 */
export function createSentryOptions(overrides: Partial<SentryOptions> = {}): SentryOptions {
  const env = getEnv();
  const isWeb = Platform.OS === 'web';
  const dev = isDev();
  const variant = variantFacts();
  return {
    dsn: env.SENTRY_DSN,
    debug: SENTRY_DEBUG,
    environment: env.APP_ENV,
    ...(isWeb ? { release: getSentryRelease(), dist: getAppVersionInfo()?.buildNumber?.toString() } : {}),
    // 10% in development (low, to keep setTimeout wrapping overhead down), 20% in production.
    tracesSampleRate: dev ? 0.1 : 0.2,
    // Relative to tracesSampleRate: 0.2 × 0.1 = 2% of transactions profiled in production (low-end handsets).
    profilesSampleRate: 0.1,
    sendDefaultPii: false,
    initialScope: { tags: { platform: Platform.OS, ...(variant.id ? { variant: variant.id } : {}), app_env: env.APP_ENV } },
    integrations: [getSentryNavigationIntegration()],
    enableNativeFramesTracking: !isWeb,
    enableAppHangTracking: !isWeb,
    enableWatchdogTerminationTracking: !isWeb,
    // Auto-instrumentation blocked fetch/XHR on web and hung the page (Dispatch).
    ...(isWeb ? { enableAutoPerformanceTracing: false, enableAutoSessionTracking: false } : {}),
    beforeBreadcrumb: (breadcrumb) => sentryBeforeBreadcrumb(breadcrumb),
    beforeSend: (event) => sentryBeforeSend(event, Platform.OS),
    beforeSendTransaction: (event) => sentryBeforeSendTransaction(event),
    ...overrides,
  };
}

/**
 * Forwards the logger to Sentry: warn and error become sanitized breadcrumbs (Responder), error is captured as
 * an exception when it carries an Error, else as a message (IC). Returns the detach function.
 */
export function forwardLogsToSentry(): () => void {
  return addLogListener((record: LogRecord) => {
    if (record.level !== 'warn' && record.level !== 'error') return;
    Sentry.addBreadcrumb({ category: 'log', level: record.level === 'error' ? 'error' : 'warning', message: record.message, data: record.context, timestamp: Date.now() / 1000 });
    if (record.level !== 'error') return;
    if (record.error) Sentry.captureException(record.error, { extra: { message: record.message, ...record.context } });
    else Sentry.captureMessage(record.message, { level: 'error', extra: record.context });
  });
}

/**
 * Initialises Sentry once. Without a DSN nothing is sent and false is returned (no crash, no noise). Also wires
 * the logger to Sentry.
 */
export function initSentry(overrides: Partial<SentryOptions> = {}): boolean {
  if (initialized) return true;
  const options = createSentryOptions(overrides);
  if (!options.dsn) {
    if (isDev()) logger.info({ message: 'Sentry DSN not configured — error reporting disabled' });
    return false;
  }
  Sentry.init(options);
  initialized = true;
  detachLogForwarding = forwardLogsToSentry();
  return true;
}

export function isSentryInitialized(): boolean {
  return initialized;
}

/** Identifies the signed-in user by id only — never username or email (AGENTS.md). Pass null on logout. */
export function setSentryUser(userId: string | null): void {
  if (!initialized) return;
  try {
    Sentry.setUser(userId ? { id: userId } : null);
  } catch {
    // Reporting must never break the caller.
  }
}

/** Test helper: forget init state. Not for app code. */
export function resetSentryForTests(): void {
  detachLogForwarding?.();
  detachLogForwarding = null;
  initialized = false;
  navigationIntegration = null;
}

export { Sentry };
