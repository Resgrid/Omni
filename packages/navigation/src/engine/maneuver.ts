/**
 * Maneuver icon keys from the OSRM / Mapbox maneuver `type` + `modifier` (MapLibre plan §9.2 banner). The UI maps each
 * key to an icon; keeping the mapping here keeps it testable and identical on every platform.
 */
export type ManeuverIconKey =
  'depart' | 'arrive' | 'straight' | 'slight-left' | 'left' | 'sharp-left' | 'slight-right' | 'right' | 'sharp-right' | 'uturn' | 'merge' | 'fork-left' | 'fork-right' | 'roundabout' | 'ramp-left' | 'ramp-right';

const turnFor = (modifier: string | null): ManeuverIconKey => {
  switch (modifier) {
    case 'uturn':
      return 'uturn';
    case 'sharp left':
      return 'sharp-left';
    case 'left':
      return 'left';
    case 'slight left':
      return 'slight-left';
    case 'sharp right':
      return 'sharp-right';
    case 'right':
      return 'right';
    case 'slight right':
      return 'slight-right';
    default:
      return 'straight';
  }
};

const sideOf = (modifier: string | null): 'left' | 'right' => (modifier !== null && modifier.includes('left') ? 'left' : 'right');

export const maneuverIconKey = (type: string, modifier: string | null): ManeuverIconKey => {
  switch (type) {
    case 'depart':
      return 'depart';
    case 'arrive':
      return 'arrive';
    case 'merge':
      return 'merge';
    case 'fork':
      return sideOf(modifier) === 'left' ? 'fork-left' : 'fork-right';
    case 'on ramp':
    case 'off ramp':
      return sideOf(modifier) === 'left' ? 'ramp-left' : 'ramp-right';
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
    case 'exit roundabout':
    case 'exit rotary':
      return 'roundabout';
    default:
      return turnFor(modifier);
  }
};
