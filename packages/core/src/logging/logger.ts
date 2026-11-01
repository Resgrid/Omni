import { Platform } from 'react-native';
import { consoleTransport, logger as rnLogs } from 'react-native-logs';

import { isDev, isJest } from '../dev';
import { sanitizeLogContext, sanitizeLogMessage, toCaptureableError } from './sanitize';
import { LOG_LEVELS, type LogContext, type LogEntry, type Logger, type LogLevel, type LogListener, type LogRecord } from './types';

/** Writes one already-sanitized line somewhere (the device console by default). */
export type LogTransport = (level: LogLevel, message: string, context: LogContext) => void;

export interface LogServiceOptions {
  /** Lowest level that is written and forwarded. Default: debug in development, warn in release builds. */
  minLevel?: LogLevel;
  /** Console transport; `null` disables console output (the default under Jest). */
  transport?: LogTransport | null;
}

/**
 * The device console transport: react-native-logs with NO colours (Responder). ANSI escape codes end up in the
 * console strings Sentry captures, and SentryCrash rejects control characters. On web it runs synchronously:
 * `async` wraps every call in setTimeout, which Sentry's timer instrumentation turns into unbounded growth (IC).
 */
export const createConsoleTransport = (): LogTransport => {
  const rn = rnLogs.createLogger<typeof consoleTransport, LogLevel>({
    levels: LOG_LEVELS,
    severity: 'debug',
    transport: consoleTransport,
    transportOptions: {},
    async: Platform.OS !== 'web',
    dateFormat: 'time',
    printLevel: true,
    printDate: true,
    fixedExtLvlLength: false,
    enabled: true,
  });
  return (level, message, context) => rn[level](message, context);
};

/**
 * Logger (omni-plan §7.1: IC's logger + Responder's transport). Every entry is sanitized once — before the console
 * and before any listener — so passwords, tokens, usernames and protected values never reach logcat, the Xcode
 * console or Sentry. Error reporting is a listener (see `forwardLogsToSentry` in the sentry module), so this
 * module has no Sentry dependency.
 */
export class LogService implements Logger {
  private minLevel: LogLevel;
  private transport: LogTransport | null;
  private globalContext: LogContext = {};
  private listeners = new Set<LogListener>();

  constructor(options: LogServiceOptions = {}) {
    this.minLevel = options.minLevel ?? (isDev() ? 'debug' : 'warn');
    this.transport = options.transport === undefined ? (isJest() ? null : createConsoleTransport()) : options.transport;
  }

  public setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  public getMinLevel(): LogLevel {
    return this.minLevel;
  }

  public setTransport(transport: LogTransport | null): void {
    this.transport = transport;
  }

  /** Context merged into every entry (e.g. variant, platform). Sanitized like entry context. */
  public setGlobalContext(context: LogContext): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  public clearGlobalContext(): void {
    this.globalContext = {};
  }

  /** Subscribes to sanitized log records at or above the minimum level. Returns the unsubscribe function. */
  public addListener(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private log(level: LogLevel, entry: LogEntry): void {
    // Bail before allocating anything on hot paths (SignalR messages, GPS fixes) when nobody would see the entry.
    if (!this.isLevelEnabled(level) || (!this.transport && this.listeners.size === 0)) return;

    const { message, operation, trace_id, context = {} } = entry;
    const safeMessage = sanitizeLogMessage(message);
    const safeContext: LogContext = {
      ...sanitizeLogContext({ ...this.globalContext, ...context }),
      ...(operation ? { operation: sanitizeLogMessage(operation) } : {}),
      ...(trace_id ? { trace_id: sanitizeLogMessage(trace_id) } : {}),
    };
    const timestamp = new Date().toISOString();

    if (this.transport) {
      try {
        this.transport(level, safeMessage, { ...safeContext, timestamp });
      } catch {
        // Logging must never throw into the caller.
      }
    }

    if (this.listeners.size) {
      // Read the error BEFORE it is sanitized: sanitizing turns every Error into a plain object, and Sentry needs a
      // real Error to group by exception type and originating stack (IC's fix).
      const record: LogRecord = { level, message: safeMessage, context: safeContext, error: toCaptureableError(context.error), timestamp };
      for (const listener of [...this.listeners]) {
        try {
          listener(record);
        } catch {
          // A failing listener (e.g. Sentry not initialised) must not break logging.
        }
      }
    }
  }

  // Arrow properties so destructured calls (`const { warn } = useLogger()`) keep their `this`.
  public debug = (entry: LogEntry): void => this.log('debug', entry);
  public info = (entry: LogEntry): void => this.log('info', entry);
  public warn = (entry: LogEntry): void => this.log('warn', entry);
  public error = (entry: LogEntry): void => this.log('error', entry);
}

/** The app-wide logger. */
export const logger = new LogService();

/** Adds a listener to the app-wide logger (used by the Sentry forwarder). */
export const addLogListener = (listener: LogListener): (() => void) => logger.addListener(listener);

/** Hook-shaped accessor kept for legacy call sites; the logger is a singleton, so this is not stateful. */
export const useLogger = (): Logger => logger;
