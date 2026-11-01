import { logger } from '@resgrid/core';
import { Linking, Platform } from 'react-native';

import { getNavigationApp, type NavigationApp } from './navigation-app';

// ---------------------------------------------------------------------------------------------------------------------
// Turn-by-turn hand-off to the navigation app chosen in Settings (Responder/Unit/IC `lib/navigation.ts`, for every
// variant — omni-plan §7.10). Opening an external app is not a provider call: no address or position leaves the device
// except in the link the member's chosen app receives.
//
// - default:     Android geo: intent (default app or chooser); iOS Apple Maps; web / desktop Google Maps in the browser.
// - google_maps: Android google.navigation: intent; iOS comgooglemaps:// when installed; else Google Maps on the web.
// - apple_maps:  iOS only (elsewhere it behaves as default).
// - waze:        waze:// when installed, else the waze.com/ul universal link.
// - gaia_gps, here_wego, mapquest, onx_offroad, organic_maps, osmand: iOS and Android only; several open at the destination
//   instead of a route; a destination one of them cannot take (mostly an address) goes to the device default chain.
// Every chain ends with the Google Maps https URL, used only if everything before it failed to open.
//
// `waze` and `comgooglemaps` are only probed with `Linking.canOpenURL` (declared for querying in the config plugin);
// everything else is opened directly and the chain moves on when `openURL` rejects — `canOpenURL('geo:…')` is false on
// Android 11+ without a <queries> entry, which used to divert every Android tap to Google Maps.
// ---------------------------------------------------------------------------------------------------------------------

interface NavigationCoordinates {
  latitude: string;
  longitude: string;
}

interface NavigationDestination {
  coordinates: NavigationCoordinates | null;
  address: string | null;
  label: string | null;
  origin: NavigationCoordinates | null;
}

interface NavigationAttempt {
  url: string;
  requiresInstalledApp?: boolean;
}

/** One coordinate as a number, or null when missing, not numeric or out of range (accepts a decimal comma). */
const parseCoordinate = (value: number | string | null | undefined, limit: number): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  let numeric: number;
  if (typeof value === 'number') {
    numeric = value;
  } else {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    numeric = Number(/^-?\d+,\d+$/.test(trimmed) ? trimmed.replace(',', '.') : trimmed);
  }
  return Number.isFinite(numeric) && Math.abs(numeric) <= limit ? numeric : null;
};

/** Locale-invariant decimal text: a dot separator, no exponent notation, no trailing zeros. */
const formatCoordinate = (value: number): string => {
  const formatted = value.toFixed(6).replace(/\.?0+$/, '');
  return formatted === '-0' ? '0' : formatted;
};

/** Both components as URL-ready text, or null when either is unusable. (0,0) is the server's "no location" sentinel. */
export const toNavigationCoordinates = (latitude: number | string | null | undefined, longitude: number | string | null | undefined): NavigationCoordinates | null => {
  const lat = parseCoordinate(latitude, 90);
  const lng = parseCoordinate(longitude, 180);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) {
    return null;
  }
  return { latitude: formatCoordinate(lat), longitude: formatCoordinate(lng) };
};

const toNonEmpty = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const toPair = (coordinates: NavigationCoordinates): string => `${coordinates.latitude},${coordinates.longitude}`;

const toDestinationParam = ({ coordinates, address }: NavigationDestination): string => (coordinates ? toPair(coordinates) : encodeURIComponent(address ?? ''));

const encodeGeoLabel = (label: string): string => encodeURIComponent(label).replace(/\(/g, '%28').replace(/\)/g, '%29');

const googleMapsWebUrl = (destination: NavigationDestination): string => {
  const origin = destination.origin ? `&origin=${toPair(destination.origin)}` : '';
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${toDestinationParam(destination)}&travelmode=driving`;
};

const appleMapsUrl = (destination: NavigationDestination): string => {
  const origin = destination.origin ? `saddr=${toPair(destination.origin)}&` : '';
  return `maps://maps.apple.com/?${origin}daddr=${toDestinationParam(destination)}&dirflg=d`;
};

const googleMapsIosUrl = (destination: NavigationDestination): string => {
  const origin = destination.origin ? `saddr=${toPair(destination.origin)}&` : '';
  return `comgooglemaps://?${origin}daddr=${toDestinationParam(destination)}&directionsmode=driving`;
};

const googleNavigationUrl = (destination: NavigationDestination): string => `google.navigation:q=${toDestinationParam(destination)}`;

const geoUrl = ({ coordinates, address, label }: NavigationDestination): string => {
  if (coordinates) {
    const pair = toPair(coordinates);
    return `geo:${pair}?q=${pair}${label ? `(${encodeGeoLabel(label)})` : ''}`;
  }
  return `geo:0,0?q=${encodeURIComponent(address ?? '')}`;
};

const wazeQuery = ({ coordinates, address }: NavigationDestination): string => (coordinates ? `ll=${toPair(coordinates)}` : `q=${encodeURIComponent(address ?? '')}`);

const GAIA_GPS_ZOOM = 14;

const organicMapsPath = ({ coordinates, address, label, origin }: NavigationDestination): string => {
  if (coordinates && origin) {
    return `route?sll=${toPair(origin)}&saddr=&dll=${toPair(coordinates)}&daddr=${encodeURIComponent(label ?? toPair(coordinates))}&type=vehicle`;
  }
  if (coordinates) {
    return `map?v=1&ll=${toPair(coordinates)}${label ? `&n=${encodeURIComponent(label)}` : ''}`;
  }
  return `search?query=${encodeURIComponent(address ?? '')}`;
};

const osmandAttempts = ({ coordinates, address, label, origin }: NavigationDestination, platform: string): NavigationAttempt[] | null => {
  if (coordinates) {
    const routePlanner: NavigationAttempt = { url: `https://osmand.net/map/navigate/?end=${toPair(coordinates)}&profile=car` };
    const name = label ? encodeURIComponent(label) : null;
    return platform === 'android'
      ? [{ url: `osmand.api://navigate?dest_lat=${coordinates.latitude}&dest_lon=${coordinates.longitude}${name ? `&dest_name=${name}` : ''}&profile=car` }, routePlanner]
      : [{ url: `osmandmaps://navigate?lat=${coordinates.latitude}&lon=${coordinates.longitude}${name ? `&title=${name}` : ''}` }, routePlanner];
  }
  return platform === 'android' && origin
    ? [{ url: `osmand.api://navigate_search?dest_search_query=${encodeURIComponent(address ?? '')}&search_lat=${origin.latitude}&search_lon=${origin.longitude}&profile=car` }]
    : null;
};

const buildMobileAppAttempts = (destination: NavigationDestination, app: NavigationApp, platform: string): NavigationAttempt[] | null => {
  const { coordinates } = destination;
  switch (app) {
    case 'gaia_gps': {
      if (!coordinates) {
        return null;
      }
      const universalLink: NavigationAttempt = { url: `https://www.gaiagps.com/map/?lat=${coordinates.latitude}&lon=${coordinates.longitude}&zoom=${GAIA_GPS_ZOOM}` };
      return platform === 'ios' ? [{ url: `gaiagps://map?lat=${coordinates.latitude}&lng=${coordinates.longitude}&z=${GAIA_GPS_ZOOM}` }, universalLink] : [universalLink];
    }
    case 'here_wego': {
      if (!coordinates) {
        return null;
      }
      const name = destination.label ? `,${encodeURIComponent(destination.label)}` : '';
      return [{ url: `https://share.here.com/r/mylocation/${toPair(coordinates)}${name}?m=d` }];
    }
    case 'mapquest':
      return [{ url: `quest://search?q=${toDestinationParam(destination)}` }];
    case 'onx_offroad':
      return coordinates ? [{ url: `https://offroad.onxmaps.com/offroad/map/query/${toPair(coordinates)}` }] : null;
    case 'organic_maps': {
      const path = organicMapsPath(destination);
      return [{ url: `om://${path}` }, { url: `https://omaps.app/${path}` }];
    }
    case 'osmand':
      return osmandAttempts(destination, platform);
    default:
      return null;
  }
};

/** The URLs to try, in order, for a navigation app on a platform (exported for tests and the variant route contract). */
export const buildNavigationAttempts = (destination: NavigationDestination, app: NavigationApp, platform: string): NavigationAttempt[] => {
  const webFallback: NavigationAttempt = { url: googleMapsWebUrl(destination) };
  const isNativePlatform = platform === 'ios' || platform === 'android';

  if (app === 'waze') {
    const universalLink: NavigationAttempt = { url: `https://waze.com/ul?${wazeQuery(destination)}&navigate=yes` };
    return isNativePlatform ? [{ url: `waze://?${wazeQuery(destination)}&navigate=yes`, requiresInstalledApp: true }, universalLink, webFallback] : [universalLink, webFallback];
  }

  const mobileAppAttempts = isNativePlatform ? buildMobileAppAttempts(destination, app, platform) : null;
  if (mobileAppAttempts) {
    return [...mobileAppAttempts, webFallback];
  }

  if (platform === 'ios') {
    return app === 'google_maps' ? [{ url: googleMapsIosUrl(destination), requiresInstalledApp: true }, webFallback] : [{ url: appleMapsUrl(destination) }, webFallback];
  }

  if (platform === 'android') {
    return app === 'google_maps' ? [{ url: googleNavigationUrl(destination) }, webFallback] : [{ url: geoUrl(destination) }, webFallback];
  }

  return [webFallback];
};

const openFirstAvailable = async (attempts: NavigationAttempt[], navigationApp: NavigationApp): Promise<boolean> => {
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      if (attempt.requiresInstalledApp && !(await Linking.canOpenURL(attempt.url))) {
        continue;
      }
      await Linking.openURL(attempt.url);
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  // Only the schemes are logged: the URLs carry the incident address and location.
  logger.error({
    message: 'Failed to open a navigation app',
    context: { errorType: lastError instanceof Error ? lastError.name : typeof lastError, navigationApp, platform: Platform.OS, schemes: attempts.map((attempt) => attempt.url.split(':')[0]) },
  });
  return false;
};

const openNavigation = async (destination: NavigationDestination): Promise<boolean> => {
  if (!destination.coordinates && !destination.address) {
    logger.warn({ message: 'Navigation requested without usable coordinates or an address' });
    return false;
  }
  const navigationApp = getNavigationApp();
  return openFirstAvailable(buildNavigationAttempts(destination, navigationApp, Platform.OS), navigationApp);
};

/** Starts navigation to an address in the navigation app chosen in Settings. False for a blank address. */
export const openMapsWithAddress = async (address: string): Promise<boolean> => {
  const destinationAddress = toNonEmpty(address);
  return openNavigation({ coordinates: null, address: destinationAddress, label: destinationAddress, origin: null });
};

/**
 * Starts navigation to coordinates in the navigation app chosen in Settings. Missing, non-numeric, out-of-range and (0,0)
 * coordinates are not navigable: `fallbackAddress` is used instead when given, otherwise nothing opens (false).
 */
export const openMapsWithDirections = async (
  destinationLatitude: number | string | null | undefined,
  destinationLongitude: number | string | null | undefined,
  destinationName?: string,
  originLatitude?: number | string,
  originLongitude?: number | string,
  fallbackAddress?: string | null
): Promise<boolean> => {
  const coordinates = toNavigationCoordinates(destinationLatitude, destinationLongitude);
  const address = coordinates ? null : toNonEmpty(fallbackAddress);
  return openNavigation({ coordinates, address, label: toNonEmpty(destinationName) ?? address, origin: toNavigationCoordinates(originLatitude, originLongitude) });
};
