import { type CurrentLocation, subscribeCurrentLocation } from '@resgrid/location';
import { useEffect } from 'react';

import type { NavFix } from '../engine/progress';
import { createRouteSimulator } from '../engine/simulation';
import { useNavigationStore } from '../store/navigation-store';

/** Interval of simulated fixes. */
const SIMULATION_TICK_MS = 1_000;

/**
 * Feeds the session: device fixes from the location store (the transmitter's watcher runs the `navigation` profile
 * while a session is active), or — in simulation — fixes replayed along the route at `simulationSpeedMps`.
 */
export function useNavigationFixes(options: { simulationSpeedMps: number | null }): void {
  const status = useNavigationStore((state) => state.status);
  const route = useNavigationStore((state) => state.route);
  const active = status === 'navigating' || status === 'arrived';
  const speed = options.simulationSpeedMps;

  useEffect(() => {
    if (!active || speed !== null) return undefined;
    const toFix = (state: CurrentLocation | null): NavFix | null =>
      state ? { latitude: state.latitude, longitude: state.longitude, heading: state.heading, speed: state.speed, accuracy: state.accuracy, timestamp: state.timestamp } : null;
    return subscribeCurrentLocation((state) => {
      const fix = toFix(state);
      if (fix) useNavigationStore.getState().handleFix(fix);
    });
  }, [active, speed]);

  // A reroute replaces the route: the simulator restarts from the new route's start (the vehicle's position).
  useEffect(() => {
    if (!active || speed === null || !route) return undefined;
    const startAt = Date.now();
    const simulator = createRouteSimulator(route, { speedMps: speed, startAt });
    const timer = setInterval(() => {
      const fix = simulator.fixAt(Date.now() - startAt);
      if (fix) useNavigationStore.getState().handleFix(fix);
    }, SIMULATION_TICK_MS);
    return () => clearInterval(timer);
  }, [active, speed, route]);
}
