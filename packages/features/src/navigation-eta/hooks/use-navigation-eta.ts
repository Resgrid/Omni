import { FeatureFlagKeys, useFeatureFlag } from '@resgrid/auth';
import { useActiveVariant } from '@resgrid/config';
import { getNavigationEta, type NavigationEta, selectCallNavigations, useNavigationEtaStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { MapMakerInfoData } from '@resgrid/models';
import { onRealtimeEvent, showsNavigationEtas } from '@resgrid/realtime';
import { useEffect, useMemo, useState } from 'react';

import { withNavigationEtaLabels } from '../lib/eta-pins';
import { navigationEtaText } from '../lib/eta-text';

/**
 * Live ETAs of navigating units on Dispatch and Big Board (MapLibre plan §9.4). Screens that show ETAs keep the
 * @resgrid/data navigation store live with {@link useNavigationEtaSync}; chips and map labels only read it, counting
 * down between reports on one shared ticker.
 */

/** How often the shown ETAs are re-read between reports (countdown, stale marking). */
export const NAVIGATION_ETA_TICK_MS = 10_000;

/**
 * While any unit is listed, how often the list is re-read anyway: Core lets a silent unit's state expire after two
 * minutes without a push (an app that died never says Ended), so only a reload clears it from the store.
 */
export const NAVIGATION_ETA_RESYNC_MS = 60_000;

// ---- gating -----------------------------------------------------------------------------------------------------

/** The department lets units navigate in the Unit app (`Navigation.InApp`); without it nobody reports an ETA. */
export const useNavigationEtaFlag = (): boolean => useFeatureFlag(FeatureFlagKeys.NavigationInApp);

/**
 * This app shows live ETAs: a module that does (dispatch console, dashboard — never the app id) and the department flag.
 * Shared screens (call detail, department map) use it; the console and the dashboard already are such a module.
 */
export function useIsNavigationEtaEnabled(): boolean {
  const variant = useActiveVariant();
  const flag = useNavigationEtaFlag();
  return flag && showsNavigationEtas(variant.modules);
}

// ---- store lifecycle --------------------------------------------------------------------------------------------

let holders = 0;
let stopSync: (() => void) | null = null;

/**
 * Keeps the navigation store live while at least one holder needs it: the first holder loads the navigations and
 * subscribes `unitNavigationUpdated` (Arrived/Ended drop the unit, every push refetches, coalesced) and the eventing hub
 * joins (the hub replays nothing, so each join re-reads), and re-reads every minute while any unit is listed. The last
 * holder to release unsubscribes. Returns the release.
 */
export function retainNavigationEtaSync(): () => void {
  holders += 1;
  if (holders === 1) {
    const offUpdated = onRealtimeEvent('unitNavigationUpdated', (id, payload) => {
      useNavigationEtaStore.getState().handleUnitNavigationUpdated(id, payload);
    });
    const offJoined = onRealtimeEvent('eventingHubJoined', () => useNavigationEtaStore.getState().requestRefresh());
    const resync = setInterval(() => {
      const store = useNavigationEtaStore.getState();
      if (Object.keys(store.navigations).length > 0) store.requestRefresh();
    }, NAVIGATION_ETA_RESYNC_MS);
    stopSync = () => {
      offUpdated();
      offJoined();
      clearInterval(resync);
    };
    void useNavigationEtaStore.getState().fetchActiveNavigations({ bypassCache: true });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders > 0) return;
    stopSync?.();
    stopSync = null;
    useNavigationEtaStore.getState().cancelPendingRefresh();
  };
}

/** Test helper: how many screens hold the sync. Not for app code. */
export const getNavigationEtaSyncHolders = (): number => holders;

/** Holds the navigation sync while the screen is mounted and `enabled` (see {@link retainNavigationEtaSync}). */
export function useNavigationEtaSync(enabled: boolean): void {
  useEffect(() => (enabled ? retainNavigationEtaSync() : undefined), [enabled]);
}

// ---- countdown ticker -------------------------------------------------------------------------------------------

const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

/** One interval for every ETA on screen; it runs only while something listens. Returns the unsubscribe. */
export function subscribeNavigationEtaTick(listener: () => void): () => void {
  tickListeners.add(listener);
  if (!tickTimer) {
    tickTimer = setInterval(() => {
      [...tickListeners].forEach((notify) => notify());
    }, NAVIGATION_ETA_TICK_MS);
  }
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0 && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

/** Re-renders the caller on the shared ticker while `active` (an ETA is shown); returns the tick count. */
export function useNavigationEtaTick(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    return subscribeNavigationEtaTick(() => setTick((value) => value + 1));
  }, [active]);
  return tick;
}

// ---- readers ----------------------------------------------------------------------------------------------------

/**
 * A unit's live ETA, or null when it is not navigating (or, with `callId`, not navigating to that call — a unit
 * dispatched to two calls drives to one). Counts down on the shared ticker.
 */
export function useUnitNavigationEta(unitId: string | number | null | undefined, callId?: string | number | null): NavigationEta | null {
  const key = unitId === null || unitId === undefined ? '' : String(unitId).trim();
  const navigation = useNavigationEtaStore((state) => (key ? (state.navigations[key] ?? null) : null));
  const offset = useNavigationEtaStore((state) => state.serverClockOffsetMs);
  const matchesCall = navigation !== null && (callId === null || callId === undefined || String(navigation.CallId) === String(callId));
  useNavigationEtaTick(matchesCall);
  return matchesCall ? getNavigationEta(navigation, Date.now(), offset) : null;
}

/** The live ETAs of the units navigating to a call, in unit order. */
export function useCallNavigationEtas(callId: string | number | null | undefined): NavigationEta[] {
  const navigations = useNavigationEtaStore((state) => state.navigations);
  const offset = useNavigationEtaStore((state) => state.serverClockOffsetMs);
  const rows = useMemo(() => selectCallNavigations(navigations, callId), [callId, navigations]);
  useNavigationEtaTick(rows.length > 0);
  const now = Date.now();
  return rows.map((row) => getNavigationEta(row, now, offset)).filter((eta): eta is NavigationEta => eta !== null);
}

/**
 * Map pins with each navigating unit's ETA as a second label line ("Engine 7" / "ETA 4 min"); the same array when no
 * unit is navigating. Draw these; keep selection and details on the original pins.
 */
export function useNavigationEtaPins(pins: readonly MapMakerInfoData[]): readonly MapMakerInfoData[] {
  const { t } = useTranslation();
  const navigations = useNavigationEtaStore((state) => state.navigations);
  const offset = useNavigationEtaStore((state) => state.serverClockOffsetMs);
  const active = Object.keys(navigations).length > 0;
  const tick = useNavigationEtaTick(active);
  return useMemo(() => {
    if (!active) return pins;
    const now = Date.now();
    return withNavigationEtaLabels(pins, (unitId) => {
      const eta = getNavigationEta(navigations[unitId], now, offset);
      return eta ? navigationEtaText(t, eta, { traffic: false }) : null;
    });
    // `tick` re-reads the clock between reports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, navigations, offset, pins, t, tick]);
}
