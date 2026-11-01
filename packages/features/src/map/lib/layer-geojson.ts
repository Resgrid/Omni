/**
 * Department map layers arrive as loosely typed GeoJSON (`Mapping/GetMapLayerGeoJSON/{layerId}`): a FeatureCollection,
 * a single Feature, a bare geometry, or any of those serialized as a string by older servers. Normalizes to a
 * FeatureCollection with only well-formed features; anything else is no layer (never a crash on the map thread).
 */

const GEOMETRY_TYPES = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isGeometry = (value: unknown): value is GeoJSON.Geometry =>
  isRecord(value) && typeof value.type === 'string' && GEOMETRY_TYPES.has(value.type) && (value.type === 'GeometryCollection' ? Array.isArray(value.geometries) : Array.isArray(value.coordinates));

const toFeature = (value: unknown): GeoJSON.Feature | null => {
  if (!isRecord(value)) return null;
  if (value.type === 'Feature') {
    return isGeometry(value.geometry)
      ? { type: 'Feature', geometry: value.geometry, properties: isRecord(value.properties) ? value.properties : {}, ...(value.id !== undefined ? { id: value.id as string | number } : {}) }
      : null;
  }
  return isGeometry(value) ? { type: 'Feature', geometry: value, properties: {} } : null;
};

export const toFeatureCollection = (raw: unknown): GeoJSON.FeatureCollection | null => {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  if (value.type === 'FeatureCollection') {
    const features = Array.isArray(value.features) ? value.features.map(toFeature).filter((feature): feature is GeoJSON.Feature => feature !== null) : [];
    return { type: 'FeatureCollection', features };
  }
  const single = toFeature(value);
  return single ? { type: 'FeatureCollection', features: [single] } : null;
};
