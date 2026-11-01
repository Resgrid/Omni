import type { Logger } from '@resgrid/core';

/**
 * Logger seam. `@resgrid/core` owns the real logger (sanitizing, Sentry transport); this package must stay importable
 * from the app entry before anything else is initialised, so the app injects the logger with `setLocationLogger()`
 * (`configureLocation({ logger })` does it). Entries carry counts, accuracies, states and error classes — never
 * coordinates, user ids, tokens or payloads.
 */
const noop = (): void => undefined;

export const noopLocationLogger: Logger = { debug: noop, info: noop, warn: noop, error: noop };

let activeLogger: Logger = noopLocationLogger;

export function setLocationLogger(logger: Logger | null): void {
  activeLogger = logger ?? noopLocationLogger;
}

/** The injected logger; read at log time so a logger set after import still applies. */
export function getLocationLogger(): Logger {
  return activeLogger;
}

/** Error description safe for logs: class, code and HTTP status only. */
export function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown; status?: unknown; kind?: unknown };
    return {
      name: error.name,
      ...(typeof withCode.kind === 'string' ? { kind: withCode.kind } : {}),
      ...(typeof withCode.code === 'string' ? { code: withCode.code } : {}),
      ...(typeof withCode.status === 'number' ? { status: withCode.status } : {}),
    };
  }
  return { name: typeof error };
}
