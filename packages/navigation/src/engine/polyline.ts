import type { LngLat } from './geo';

/**
 * Decodes Google's encoded polyline algorithm at the given precision (6 for the polyline6 Core asks every routing
 * provider for, 5 for OSRM/Google defaults) into `[lon, lat]` pairs. Malformed input stops at the last whole point.
 */
export const decodePolyline = (encoded: string, precision = 6): LngLat[] => {
  const factor = 10 ** precision;
  const points: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && shift < 35);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    const dLat = next();
    const dLon = next();
    if (dLat === null || dLon === null) break;
    lat += dLat;
    lon += dLon;
    points.push([lon / factor, lat / factor]);
  }
  return points;
};

/** Encodes `[lon, lat]` pairs (tests and fixtures). */
export const encodePolyline = (points: readonly LngLat[], precision = 6): string => {
  const factor = 10 ** precision;
  let output = '';
  let previousLat = 0;
  let previousLon = 0;
  const encodeValue = (value: number): void => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      output += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    output += String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of points) {
    const latE = Math.round(lat * factor);
    const lonE = Math.round(lon * factor);
    encodeValue(latE - previousLat);
    encodeValue(lonE - previousLon);
    previousLat = latE;
    previousLon = lonE;
  }
  return output;
};
