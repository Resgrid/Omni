import { getActiveVariant } from '@resgrid/config';
import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import { isDev } from '../dev';
import { getAppVersionInfo, getEnv } from '../env/env';
import { addLogListener, logger } from '../logging/logger';
import type { LogRecord } from '../logging/types';
import { isElectron } from '../platform/platform';
import { sentryBeforeBreadcrumb, sentryBeforeSend, sentryBeforeSendTransaction } from './filters';

type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type NavigationIntegration = ReturnType<typeof Sentry.reactNavigationIntegration>;

// Sentry's own logger stays off: watchdog-termination tracking rewrites the native scope on every RNSentry
// turbo-module call, and `debug` floods the console with "Writing tags to disk". Pass `debug: true` temporarily
// when diagnosing Sentry itself.
const SENTRY_DEBUG = false;

// Error screenshots and error replays hide every text, image and vector. These are the SDK defaults; they are spelled
// out so a future default can never put protected values, names or addresses into an attachment.
const MASK_ALL = { maskAllText: true, maskAllImages: true, maskAllVectors: true } as const;

let navigationIntegration: NavigationIntegration | null = null;
let initialized = false;
let detachLogForwarding: (() => void) | null = null;
let reportedBoundaryErrors = new WeakSet<object>();

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

/** Tags on every event, set on the global scope (`initialScope` is deprecated in SDK 8). */
export function getSentryScopeTags(): Record<string, string> {
  const variant = variantFacts();
  const runtime = Platform.OS !== 'web' ? 'native' : isElectron() ? 'electron' : 'browser';
  return { platform: Platform.OS, runtime, ...(variant.id ? { variant: variant.id } : {}), app_env: getEnv().APP_ENV };
}

/**
 * The merged init options (omni-plan §7.1): Dispatch's init (DSN guard, release, environment, web-safe tracing),
 * Responder's breadcrumb policy and hang/watchdog tracking, Unit/IC's transaction and noise filters. The Sentry
 * project is chosen at build time (config plugin `sentryProject`); at runtime only the DSN matters.
 *
 * Collected everywhere: errors, release health (sessions, web and Electron included), sampled traces and profiles,
 * failed API requests (5xx) and the logger's warn/error records as Sentry logs. On iOS and Android also: native
 * crashes, hangs/ANRs, watchdog terminations, MetricKit diagnostics (iOS), slow/frozen frames, touch spans, and a
 * masked screenshot, view hierarchy and replay of the moments before each error.
 */
export function createSentryOptions(overrides: Partial<SentryOptions> = {}): SentryOptions {
  const env = getEnv();
  const isWeb = Platform.OS === 'web';
  const dev = isDev();
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
    integrations: [
      getSentryNavigationIntegration(),
      // 5xx responses to fetch/XHR (the API client) become events, filtered by `beforeSend` like any other. Added here
      // rather than through `enableCaptureFailedRequests`, which also turns on the native iOS network capture whose
      // events never pass through `beforeSend` (signed map URLs carry tokens in the query string).
      Sentry.httpClientIntegration(),
      ...(isWeb ? [] : [Sentry.mobileReplayIntegration(MASK_ALL)]),
    ],
    // Release health (crash-free sessions and users) on every platform. Dispatch turned it off on web together with
    // performance tracing; only the tracing hung the page.
    enableAutoSessionTracking: true,
    enableNativeFramesTracking: !isWeb,
    enableAppHangTracking: !isWeb,
    enableWatchdogTerminationTracking: !isWeb,
    // CPU, disk-write and hang diagnostics from the OS (iOS 15+): battery drain under background location shows up here.
    enableMetricKit: !isWeb,
    // Spans for taps (the root is wrapped with `wrapRootComponent`); sampled like every other transaction.
    enableUserInteractionTracing: !isWeb,
    attachScreenshot: !isWeb,
    screenshot: { maskAllText: MASK_ALL.maskAllText, maskAllImages: MASK_ALL.maskAllImages },
    attachViewHierarchy: !isWeb,
    // The masked replay of the ~30 s before an error, for every error; no whole-session recording. Native only: web
    // replay records the DOM of a dispatch console that never stops changing.
    ...(isWeb ? {} : { replaysOnErrorSampleRate: 1.0, replaysSessionSampleRate: 0 }),
    // Sentry logs, fed only by the sanitized logger (`forwardLogsToSentry`): console calls and native logs stay out.
    enableLogs: true,
    logsOrigin: 'js',
    enableAutoConsoleLogs: false,
    // Auto-instrumentation blocked fetch/XHR on web and hung the page (Dispatch).
    ...(isWeb ? { enableAutoPerformanceTracing: false } : {}),
    beforeBreadcrumb: (breadcrumb) => sentryBeforeBreadcrumb(breadcrumb),
    beforeSend: (event) => sentryBeforeSend(event, Platform.OS),
    beforeSendTransaction: (event) => sentryBeforeSendTransaction(event),
    ...overrides,
  };
}

/**
 * Forwards the logger to Sentry: info and above become Sentry logs (searchable across devices); warn and error also
 * become sanitized breadcrumbs (Responder); error is captured as an exception when it carries an Error, else as a
 * message (IC). Release builds log from warn up. Returns the detach function.
 */
export function forwardLogsToSentry(): () => void {
  return addLogListener((record: LogRecord) => {
    if (record.level === 'debug') return;
    Sentry.logger[record.level](record.message, record.context);
    if (record.level === 'info') return;
    Sentry.addBreadcrumb({ category: 'log', level: record.level === 'error' ? 'error' : 'warning', message: record.message, data: record.context, timestamp: Date.now() / 1000 });
    if (record.level !== 'error') return;
    if (record.error) Sentry.captureException(record.error, { extra: { message: record.message, ...record.context } });
    else Sentry.captureMessage(record.message, { level: 'error', extra: record.context });
  });
}

/**
 * Initialises Sentry once. Without a DSN nothing is sent and false is returned (no crash, no noise). Also wires
 * the logger to Sentry. Call it before the first render (`configureAppShell`) so errors in the first render are seen.
 */
export function initSentry(overrides: Partial<SentryOptions> = {}): boolean {
  if (initialized) return true;
  const options = createSentryOptions(overrides);
  if (!options.dsn) {
    if (isDev()) logger.info({ message: 'Sentry DSN not configured — error reporting disabled' });
    return false;
  }
  Sentry.init(options);
  Sentry.getGlobalScope().setTags(getSentryScopeTags());
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

/**
 * Wraps the app's root component (every legacy root layout did): touch breadcrumbs with rage-tap detection, the
 * spans of `enableUserInteractionTracing`, and the root profiler that ends the app-start measurement at first mount.
 * Touch breadcrumbs never copy the touched element's text — list rows show names and addresses.
 */
export function wrapRootComponent<P extends Record<string, unknown>>(component: ComponentType<P>): ComponentType<P> {
  return Sentry.wrap(component, { touchEventBoundaryProps: { extractTextFromChildren: false } });
}

/**
 * Reports an error a route error boundary caught. React hands caught render errors to the native ExceptionsManager
 * (iOS/Android) or to console.error (web), and neither reaches Sentry's global handlers, so without this the screen
 * the user saw instead of the app never shows up in Sentry. Each error is reported once, however often the boundary
 * renders.
 */
export function captureBoundaryError(error: unknown): void {
  if (!initialized) return;
  if (typeof error === 'object' && error !== null) {
    if (reportedBoundaryErrors.has(error)) return;
    reportedBoundaryErrors.add(error);
  }
  try {
    Sentry.captureException(error, { mechanism: { type: 'auto.expo_router.error_boundary', handled: true } });
  } catch {
    // Reporting must never break the fallback screen.
  }
}

/** Test helper: forget init state. Not for app code. */
export function resetSentryForTests(): void {
  detachLogForwarding?.();
  detachLogForwarding = null;
  initialized = false;
  navigationIntegration = null;
  reportedBoundaryErrors = new WeakSet<object>();
}

export { Sentry };
