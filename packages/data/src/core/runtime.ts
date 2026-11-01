import type { ApiContext } from '@resgrid/api';
import { getActiveVariant, type VariantManifest } from '@resgrid/config';
import type { DrainOptions, DrainResult, EnqueueInput, EnqueueResult, OfflineScope } from '@resgrid/offline';

/**
 * Composition points for @resgrid/data (layer L4). The data layer never imports auth, realtime or
 * any higher package: the app shell injects the API context, the signed-in session scope, the
 * outbox and a logger once at start-up (omni-plan §5.2, §5.5).
 */

/** The signed-in session as the data layer sees it. Never log `userId` or `displayName`. */
export interface DataSessionScope extends OfflineScope {
  /** Shown on optimistic local rows (queued notes, chat messages); never sent to logs or analytics. */
  displayName?: string;
}

/** The slice of `@resgrid/offline`'s Outbox the stores use. */
export interface DataOutbox {
  enqueue<P>(input: EnqueueInput<P>): Promise<EnqueueResult>;
  drain(options?: DrainOptions): Promise<DrainResult>;
  /** Correct a rejected write and queue it again under the same id (offline call correction). */
  amend?<P>(id: string, payload: P): Promise<boolean>;
}

export interface DataLogEntry {
  message: string;
  context?: Record<string, unknown>;
}

export interface DataLogger {
  debug(entry: DataLogEntry): void;
  info(entry: DataLogEntry): void;
  warn(entry: DataLogEntry): void;
  error(entry: DataLogEntry): void;
}

const noop = (): void => undefined;
export const noopDataLogger: DataLogger = { debug: noop, info: noop, warn: noop, error: noop };

/** Thrown when a store is used before the app shell configured the data layer. */
export class DataNotConfiguredError extends Error {
  constructor(public readonly dependency: 'api' | 'outbox') {
    super(`@resgrid/data used before ${dependency === 'api' ? 'setDataApiContext()' : 'setDataOutbox()'} was called.`);
    this.name = 'DataNotConfiguredError';
  }
}

/** Last known device position, supplied by @resgrid/location through the app shell (statuses carry GPS). */
export interface DataLocationFix {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
}

interface RuntimeState {
  location: (() => DataLocationFix | null) | null;
  api: ApiContext | null;
  session: (() => DataSessionScope | null) | null;
  outbox: DataOutbox | null;
  logger: DataLogger;
  now: () => number;
  generateId: () => string;
  variant: VariantManifest | null;
}

const hex = (count: number): string => {
  let out = '';
  for (let i = 0; i < count; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
};

/** RFC 4122 v4 from the platform when it has one (web, Electron, Hermes with crypto), else Math.random. */
export const defaultIdGenerator = (): string => {
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoLike && typeof cryptoLike.randomUUID === 'function') return cryptoLike.randomUUID();
  const variantNibble = ((Math.random() * 4) | 8).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variantNibble}${hex(3)}-${hex(12)}`;
};

const initial = (): RuntimeState => ({ location: null, api: null, session: null, outbox: null, logger: noopDataLogger, now: () => Date.now(), generateId: defaultIdGenerator, variant: null });

let state: RuntimeState = initial();

/** The API context every endpoint function receives (client + cache + per-variant cache policy). */
export function setDataApiContext(ctx: ApiContext | null): void {
  state.api = ctx;
}

export function getDataApiContext(): ApiContext {
  if (!state.api) throw new DataNotConfiguredError('api');
  return state.api;
}

export function hasDataApiContext(): boolean {
  return state.api !== null;
}

/** Provider for the signed-in session scope (server + department + user + unit), or null when signed out. */
export function setDataSessionScopeProvider(provider: (() => DataSessionScope | null) | null): void {
  state.session = provider;
}

export function getDataSessionScope(): DataSessionScope | null {
  try {
    return state.session ? state.session() : null;
  } catch {
    return null;
  }
}

/** The durable outbox from `initOffline()` (or a test outbox). Writes in a variant's offline scope go through it. */
export function setDataOutbox(outbox: DataOutbox | null): void {
  state.outbox = outbox;
}

export function getDataOutbox(): DataOutbox {
  if (!state.outbox) throw new DataNotConfiguredError('outbox');
  return state.outbox;
}

export function hasDataOutbox(): boolean {
  return state.outbox !== null;
}

/** Provider for the last known position (statuses fill GPS from it when the caller passed none). */
export function setDataLocationProvider(provider: (() => DataLocationFix | null) | null): void {
  state.location = provider;
}

export function getDataLocationFix(): DataLocationFix | null {
  try {
    return state.location ? state.location() : null;
  } catch {
    return null;
  }
}

/** Sanitizing logger from the app shell (`@resgrid/core`). Default: silent. */
export function setDataLogger(logger: DataLogger | null): void {
  state.logger = logger ?? noopDataLogger;
}

export function getDataLogger(): DataLogger {
  return state.logger;
}

export function setDataClock(now: (() => number) | null): void {
  state.now = now ?? (() => Date.now());
}

export function dataNow(): number {
  return state.now();
}

/** Client ids for local-only rows (staged files). Outbox events get their id from the outbox itself. */
export function setDataIdGenerator(generate: (() => string) | null): void {
  state.generateId = generate ?? defaultIdGenerator;
}

export function generateDataId(): string {
  return state.generateId();
}

/** The variant manifest (defaults to `getActiveVariant()`); decides cache policy, origin client and offline scope. */
export function setDataVariant(manifest: VariantManifest | null): void {
  state.variant = manifest;
}

export function getDataVariant(): VariantManifest | null {
  if (state.variant) return state.variant;
  try {
    return getActiveVariant();
  } catch {
    return null;
  }
}

/** Test helper: clears every injected dependency. Not for app code. */
export function resetDataRuntimeForTests(): void {
  state = initial();
}
