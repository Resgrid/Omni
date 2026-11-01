import type { LogEntry, Logger } from '@resgrid/core/logging/types';

/**
 * Logger seam. `@resgrid/core` owns the sanitizing logger (console + Sentry forwarding); the app shell hands it over
 * with `configureAuth({ logger })`, so this package never loads the console/Sentry transports itself (and its tests run
 * in Node). Entries carry codes, statuses and counts only — never passwords, tokens, usernames, transaction secrets,
 * codes or protected values (AGENTS.md).
 */
const noop = (_entry: LogEntry): void => undefined;

export const noopAuthLogger: Logger = { debug: noop, info: noop, warn: noop, error: noop };

let active: Logger = noopAuthLogger;

export function setAuthLogger(logger: Logger | null): void {
  active = logger ?? noopAuthLogger;
}

/** Resolved at log time, so a logger set after import still applies. */
export const authLogger: Logger = {
  debug: (entry) => active.debug(entry),
  info: (entry) => active.info(entry),
  warn: (entry) => active.warn(entry),
  error: (entry) => active.error(entry),
};

/** A safe description of an error for log context: class, kind, HTTP status and code — never a body or a message from the server. */
export function describeError(error: unknown): Record<string, unknown> {
  if (typeof error !== 'object' || error === null) {
    return { errorType: typeof error };
  }
  const candidate = error as { name?: unknown; kind?: unknown; status?: unknown; code?: unknown; response?: { status?: unknown } };
  const status = typeof candidate.status === 'number' ? candidate.status : typeof candidate.response?.status === 'number' ? candidate.response.status : undefined;
  return {
    errorType: typeof candidate.name === 'string' ? candidate.name : 'Error',
    ...(typeof candidate.kind === 'string' ? { kind: candidate.kind } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(typeof candidate.code === 'string' ? { code: candidate.code } : {}),
  };
}
