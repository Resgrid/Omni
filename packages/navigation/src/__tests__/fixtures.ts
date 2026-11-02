import type { LngLat } from '../engine/geo';
import { encodePolyline } from '../engine/polyline';

/**
 * A synthetic OSRM v5 route object (the shape Core's Valhalla/Mapbox providers return in `Route`): an L-shaped drive
 * east ~556 m, then north ~556 m, with voice and banner instructions, plus a two-leg version for route stops.
 */
export const ORIGIN: LngLat = [-121.5, 38.5];
const STEP = 0.001;

/** Points every 0.001° (~87 m east at this latitude, ~111 m north). */
export const EAST_LEG: LngLat[] = Array.from({ length: 7 }, (_, i) => [ORIGIN[0] + i * STEP * 1.1, ORIGIN[1]] as LngLat);
export const CORNER: LngLat = EAST_LEG[EAST_LEG.length - 1];
export const NORTH_LEG: LngLat[] = Array.from({ length: 6 }, (_, i) => [CORNER[0], CORNER[1] + i * STEP] as LngLat);
export const DESTINATION: LngLat = NORTH_LEG[NORTH_LEG.length - 1];

const voice = (distanceAlongGeometry: number, announcement: string) => ({ distanceAlongGeometry, announcement, ssmlAnnouncement: `<speak>${announcement}</speak>` });
const banner = (distanceAlongGeometry: number, text: string, type: string, modifier: string | null) => ({
  distanceAlongGeometry,
  primary: { text, type, modifier, components: [{ text, type: 'text' }] },
  secondary: null,
  sub: null,
});

export const buildRouteObject = (options: { withInstructions?: boolean } = {}) => {
  const withInstructions = options.withInstructions !== false;
  const steps = [
    {
      distance: 580,
      duration: 60,
      name: 'East Street',
      geometry: encodePolyline(EAST_LEG),
      maneuver: { type: 'depart', modifier: null, location: ORIGIN, bearing_before: 0, bearing_after: 90, instruction: 'Drive east on East Street' },
      voiceInstructions: withInstructions ? [voice(580, 'Drive east on East Street, then turn left'), voice(150, 'In 500 feet, turn left onto North Avenue')] : [],
      bannerInstructions: withInstructions ? [banner(580, 'North Avenue', 'turn', 'left')] : [],
    },
    {
      distance: 556,
      duration: 50,
      name: 'North Avenue',
      geometry: encodePolyline(NORTH_LEG),
      maneuver: { type: 'turn', modifier: 'left', location: CORNER, bearing_before: 90, bearing_after: 0, instruction: 'Turn left onto North Avenue' },
      voiceInstructions: withInstructions ? [voice(100, 'You have arrived at your destination')] : [],
      bannerInstructions: withInstructions ? [banner(556, 'Destination', 'arrive', null)] : [],
    },
    {
      distance: 0,
      duration: 0,
      name: 'North Avenue',
      geometry: encodePolyline([DESTINATION, DESTINATION]),
      maneuver: { type: 'arrive', modifier: null, location: DESTINATION, bearing_before: 0, bearing_after: 0, instruction: 'You have arrived' },
      voiceInstructions: [],
      bannerInstructions: [],
    },
  ];
  return {
    distance: 1136,
    duration: 110,
    geometry: encodePolyline([...EAST_LEG, ...NORTH_LEG.slice(1)]),
    legs: [{ distance: 1136, duration: 110, summary: 'East Street, North Avenue', steps }],
  };
};

/** Two legs: origin → corner (stop 1), corner → destination (stop 2). */
export const buildTwoLegRouteObject = () => {
  const one = buildRouteObject();
  const [depart, turn, arrive] = one.legs[0].steps;
  const arriveCorner = { ...arrive, geometry: encodePolyline([CORNER, CORNER]), maneuver: { ...arrive.maneuver, location: CORNER } };
  const departCorner = { ...turn, maneuver: { ...turn.maneuver, type: 'depart' } };
  return {
    distance: 1136,
    duration: 110,
    geometry: one.geometry,
    legs: [
      { distance: 580, duration: 60, summary: 'East Street', steps: [depart, arriveCorner] },
      { distance: 556, duration: 50, summary: 'North Avenue', steps: [departCorner, arrive] },
    ],
  };
};

export const fix = (point: LngLat, overrides: { heading?: number | null; speed?: number | null; accuracy?: number | null; timestamp?: number } = {}) => ({
  latitude: point[1],
  longitude: point[0],
  heading: overrides.heading ?? null,
  speed: overrides.speed ?? null,
  accuracy: overrides.accuracy ?? 5,
  timestamp: overrides.timestamp ?? 0,
});

/** A point `meters` north (positive) or south of `point`. */
export const offsetNorth = (point: LngLat, meters: number): LngLat => [point[0], point[1] + meters / 111_320];
