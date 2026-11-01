/**
 * Logger seam. `@resgrid/core` owns the real logger (sanitizing, Sentry transport); offline is built
 * alongside it, so the app injects it with `setOfflineLogger()` at startup. Entries carry ids, counts,
 * types and error classes only — never payloads, keys, tokens or protected values (AGENTS.md).
 */
export interface OfflineLogEntry {
  message: string;
  context?: Record<string, unknown>;
}

export interface OfflineLogger {
  debug(entry: OfflineLogEntry): void;
  info(entry: OfflineLogEntry): void;
  warn(entry: OfflineLogEntry): void;
  error(entry: OfflineLogEntry): void;
}

const noop = (): void => undefined;

export const noopLogger: OfflineLogger = { debug: noop, info: noop, warn: noop, error: noop };

let activeLogger: OfflineLogger = noopLogger;

export function setOfflineLogger(logger: OfflineLogger | null): void {
  activeLogger = logger ?? noopLogger;
}

/** The injected logger; modules call this at log time so a logger set after import still applies. */
export function getOfflineLogger(): OfflineLogger {
  return activeLogger;
}

/** Error description safe for logs: class, code and HTTP status only, never the message body of a response. */
export function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown; status?: unknown };
    return { name: error.name, code: typeof withCode.code === 'string' ? withCode.code : undefined, status: typeof withCode.status === 'number' ? withCode.status : undefined };
  }
  return { name: typeof error };
}
