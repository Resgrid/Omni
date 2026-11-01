export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  message: string;
  operation?: string;
  trace_id?: string;
  context?: LogContext;
}

export interface Logger {
  debug: (entry: LogEntry) => void;
  info: (entry: LogEntry) => void;
  warn: (entry: LogEntry) => void;
  error: (entry: LogEntry) => void;
}

/** What a log listener (e.g. the Sentry forwarder) receives. Everything in it is already sanitized. */
export interface LogRecord {
  level: LogLevel;
  message: string;
  /** Sanitized context, including global context, `operation` and `trace_id`. */
  context: LogContext;
  /**
   * When the entry's `context.error` was an Error: a bare copy carrying only name, message and stack, safe to
   * hand to `Sentry.captureException` (the original may be an AxiosError holding the request body).
   */
  error: Error | null;
  timestamp: string;
}

export type LogListener = (record: LogRecord) => void;
