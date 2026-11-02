/** Distance units for spoken and shown guidance. Core's setting 122 can force one; else the device locale decides. */
export type DistanceUnits = 'metric' | 'imperial';

/** Locales (region part) that drive in miles and feet. */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM', 'GB']);

/** Imperial for the US, Liberia, Myanmar and the UK; metric everywhere else. */
export const unitsForLocale = (locale: string | null | undefined): DistanceUnits => {
  const region = (locale ?? '').replace('_', '-').split('-')[1]?.toUpperCase() ?? '';
  return IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
};

export interface FormattedDistance {
  value: number;
  /** Translation suffix: `m`, `km`, `ft` or `mi`. */
  unit: 'm' | 'km' | 'ft' | 'mi';
}

const FEET_PER_METER = 3.28084;
const METERS_PER_MILE = 1609.344;

/** A distance rounded the way drivers read it: 10 m / 50 ft steps up close, one decimal for the first 10 km / mi. */
export const formatDistance = (meters: number, units: DistanceUnits): FormattedDistance => {
  const safe = Math.max(0, meters);
  if (units === 'imperial') {
    const miles = safe / METERS_PER_MILE;
    if (miles >= 0.1) return { value: miles >= 10 ? Math.round(miles) : Math.round(miles * 10) / 10, unit: 'mi' };
    return { value: Math.max(0, Math.round((safe * FEET_PER_METER) / 50) * 50), unit: 'ft' };
  }
  if (safe >= 1000) {
    const km = safe / 1000;
    return { value: km >= 10 ? Math.round(km) : Math.round(km * 10) / 10, unit: 'km' };
  }
  return { value: Math.max(0, Math.round(safe / 10) * 10), unit: 'm' };
};

/** Whole minutes, at least 1 while any time remains. */
export const minutesRemaining = (seconds: number): number => (seconds <= 0 ? 0 : Math.max(1, Math.round(seconds / 60)));

/** Hours and minutes for long trips. */
export const splitDuration = (seconds: number): { hours: number; minutes: number } => {
  const minutes = minutesRemaining(seconds);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
};
