import { parseUtcMs } from '@resgrid/api';
import { type UnitNavigationData, UnitNavigationState } from '@resgrid/models';

/**
 * Pure helpers behind the live ETAs of navigating units (MapLibre plan §9.4): reading the `unitNavigationUpdated` push
 * and turning a `GetActiveNavigations` row into what a chip shows — the minutes left, counted down against the clock
 * between reports, and whether the report has gone stale. No stores, no React: the store, the chips and the tests share
 * them.
 *
 * Times are compared on the server's clock: the store records how far the device clock is from the response's envelope
 * `Timestamp` (`serverClockOffsetMs`, device minus server), so a phone or a wall board whose clock is minutes off still
 * counts down correctly.
 */

/** Core marks a report stale after 60 seconds without a newer one (`UnitNavigationData.IsStale`). */
export const NAVIGATION_STALE_AFTER_MS = 60_000;

/** Core drops a unit's state two minutes after its last report (`UnitNavigationStateService.StateLifetime`). */
export const NAVIGATION_EXPIRES_AFTER_MS = 120_000;

/** States that end a navigation: the unit is no longer on its way. */
const ENDED_STATES: ReadonlySet<number> = new Set<number>([UnitNavigationState.Arrived, UnitNavigationState.Ended]);

/** True for Arrived and Ended (the server clears the unit's state for both). */
export const isEndedNavigationState = (state: number | null | undefined): boolean => typeof state === 'number' && ENDED_STATES.has(state);

/** The `unitNavigationUpdated` payload: ids and state only (Core `UnitNavigationStateService.AnnounceAsync`). */
export interface UnitNavigationUpdate {
  unitId: string | null;
  callId: number | null;
  routeInstanceId: string | null;
  /** `UnitNavigationState`; null when the payload carried none. */
  state: number | null;
}

const readField = (record: Record<string, unknown>, camel: string): unknown => (camel in record ? record[camel] : record[camel.charAt(0).toUpperCase() + camel.slice(1)]);

const toId = (value: unknown): string | null => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? String(value) : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

const toPositiveInt = (value: unknown): number | null => {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Reads the push: a camel-cased JSON string (what Core sends) or, tolerated, an object in either casing. The hub's
 * first argument (the unit id) fills in a payload without one. Null when there is nothing usable.
 */
export function parseUnitNavigationUpdate(payload: unknown, fallbackUnitId: unknown = null): UnitNavigationUpdate | null {
  let value: unknown = payload;
  if (typeof value === 'string') {
    try {
      value = value.trim() ? (JSON.parse(value) as unknown) : null;
    } catch {
      value = null;
    }
  }
  const record = value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const unitId = (record ? toId(readField(record, 'unitId')) : null) ?? toId(fallbackUnitId);
  if (!unitId) return null;
  const state = record ? readField(record, 'state') : null;
  return {
    unitId,
    callId: record ? toPositiveInt(readField(record, 'callId')) : null,
    routeInstanceId: record ? toId(readField(record, 'routeInstanceId')) : null,
    state: typeof state === 'number' && Number.isInteger(state) ? state : null,
  };
}

/** Device minus server clock (ms) from a response's envelope `Timestamp` received at `receivedAt`; 0 when unknown. */
export function serverClockOffset(timestamp: unknown, receivedAt: number): number {
  const serverAt = parseUtcMs(timestamp);
  return serverAt === null ? 0 : receivedAt - serverAt;
}

/** Milliseconds since the unit's last report on the server's clock; null when the report time is unreadable. */
export function navigationReportAgeMs(navigation: Pick<UnitNavigationData, 'ReportedOn'>, now: number, serverClockOffsetMs: number = 0): number | null {
  const reportedAt = parseUtcMs(navigation.ReportedOn);
  return reportedAt === null ? null : Math.max(0, now - serverClockOffsetMs - reportedAt);
}

/** Stale: Core already said so when it answered, or no report has come for 60 seconds since. */
export function isNavigationStale(navigation: Pick<UnitNavigationData, 'IsStale' | 'ReportedOn'>, now: number, serverClockOffsetMs: number = 0): boolean {
  if (navigation.IsStale === true) return true;
  const age = navigationReportAgeMs(navigation, now, serverClockOffsetMs);
  return age !== null && age > NAVIGATION_STALE_AFTER_MS;
}

/** What a chip shows for a navigating unit. */
export interface NavigationEta {
  unitId: string;
  /** The call the unit is navigating to; null on a route. */
  callId: number | null;
  /** Seconds left on the server's clock (negative once the ETA has passed). */
  remainingSeconds: number;
  /** Whole minutes left, rounded up; 0 once the unit is due ("arriving"). */
  minutes: number;
  /** The ETA as an instant on this device's clock (epoch ms), or null when the report carried none. */
  etaAt: number | null;
  isTrafficAware: boolean;
  isStale: boolean;
}

/**
 * The display ETA of a navigation at `now` (device epoch ms): counted down from `EtaUtc` (or from `ReportedOn` +
 * `RemainingSeconds` when the ETA is unreadable). Null when the navigation has ended, or when its last report is older
 * than the server keeps state (two minutes) — the unit stopped reporting, so its ETA means nothing any more.
 */
export function getNavigationEta(navigation: UnitNavigationData | null | undefined, now: number, serverClockOffsetMs: number = 0): NavigationEta | null {
  if (!navigation || isEndedNavigationState(navigation.State)) return null;
  const unitId = toId(navigation.UnitId);
  if (!unitId) return null;

  const age = navigationReportAgeMs(navigation, now, serverClockOffsetMs);
  if (age !== null && age > NAVIGATION_EXPIRES_AFTER_MS) return null;

  const serverNow = now - serverClockOffsetMs;
  const reportedAt = parseUtcMs(navigation.ReportedOn);
  const remainingAtReport = Number.isFinite(navigation.RemainingSeconds) ? Math.max(0, navigation.RemainingSeconds) : null;
  const etaServerAt = parseUtcMs(navigation.EtaUtc) ?? (reportedAt !== null && remainingAtReport !== null ? reportedAt + remainingAtReport * 1000 : null);
  const remainingMs = etaServerAt !== null ? etaServerAt - serverNow : remainingAtReport !== null ? remainingAtReport * 1000 : null;
  if (remainingMs === null) return null;

  const remainingSeconds = Math.round(remainingMs / 1000);
  return {
    unitId,
    callId: toPositiveInt(navigation.CallId),
    remainingSeconds,
    minutes: remainingSeconds > 0 ? Math.ceil(remainingSeconds / 60) : 0,
    etaAt: etaServerAt !== null ? etaServerAt + serverClockOffsetMs : null,
    isTrafficAware: navigation.IsTrafficAware === true,
    isStale: isNavigationStale(navigation, now, serverClockOffsetMs),
  };
}

/** Navigations by unit id (string), dropping ended rows and rows without a usable unit id. */
export function navigationsByUnit(rows: readonly UnitNavigationData[]): Record<string, UnitNavigationData> {
  const byUnit: Record<string, UnitNavigationData> = {};
  for (const row of rows) {
    const unitId = row ? toId(row.UnitId) : null;
    if (!unitId || isEndedNavigationState(row.State)) continue;
    byUnit[unitId] = row;
  }
  return byUnit;
}
