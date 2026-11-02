import { pointAtDistance } from './geo';
import type { NavFix } from './progress';
import type { NavRoute } from './route-model';

/**
 * Simulation (MapLibre plan §9.2, dev/QA and docs screenshots): replays the route at a fixed speed as if the vehicle
 * drove it, so guidance, prompts and arrival can be checked without driving.
 */
export interface RouteSimulator {
  /** The fix `elapsedMs` after the start, or null once the end is reached. */
  fixAt(elapsedMs: number): NavFix | null;
}

export function createRouteSimulator(route: NavRoute, options: { speedMps: number; startAt: number; startDistance?: number }): RouteSimulator {
  const speed = Math.max(1, options.speedMps);
  const startDistance = Math.max(0, options.startDistance ?? 0);
  return {
    fixAt: (elapsedMs) => {
      const distance = startDistance + (speed * Math.max(0, elapsedMs)) / 1000;
      if (distance > route.distance + speed) return null;
      const { point, bearing } = pointAtDistance(route.coordinates, route.cumulative, distance);
      return { latitude: point[1], longitude: point[0], heading: bearing, speed, accuracy: 5, timestamp: options.startAt + elapsedMs };
    },
  };
}

/** Simulation speeds offered in the QA toggle (m/s): about 30, 50 and 80 km/h. */
export const SIMULATION_SPEEDS_MPS = [8.3, 13.9, 22.2] as const;
