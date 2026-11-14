import { gzipSync, strToU8 } from 'fflate';

import { decodeOfflineDepartmentData, MAX_DEPARTMENT_DATA_BYTES, toOfflineDepartmentData } from '../department-data';

/** Core's bundle shape (OfflineMapPackService.GetDepartmentDataAsync). */
const BUNDLE = {
  layers: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { layerId: 'l1', layerName: 'Hydrant zones', layerColor: '#f00', onByDefault: true } }],
  },
  stations: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-121.5, 38.5] }, properties: { groupId: 3, name: 'Station 3', kind: 'station' } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { groupId: 3, name: 'Station 3', color: '#00f', kind: 'boundary' } },
    ],
  },
  pois: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-121.4, 38.6] }, properties: { poiId: 9, name: 'Hospital' } }] },
  customMapRegions: { type: 'FeatureCollection', features: [] },
  indoorZones: { type: 'FeatureCollection', features: [] },
};

describe('decodeOfflineDepartmentData', () => {
  it('gunzips Core’s bundle (the gzip file itself) and keeps every section', () => {
    const data = decodeOfflineDepartmentData(gzipSync(strToU8(JSON.stringify(BUNDLE))));
    expect(Object.keys(data ?? {})).toEqual(['layers', 'stations', 'pois', 'customMapRegions', 'indoorZones']);
    expect(data?.stations.features).toHaveLength(2);
    expect(data?.layers.features[0].properties).toMatchObject({ layerId: 'l1', onByDefault: true });
  });

  it('gives the layers section its checked colours, as the online layers get, and leaves other sections as sent', () => {
    const data = toOfflineDepartmentData({
      ...BUNDLE,
      layers: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [3.7, 51.05] }, properties: { layerId: 'l1', layerColor: '#f00', color: '#00ff00', name: 'Food truck' } },
          { type: 'Feature', geometry: { type: 'Point', coordinates: [3.7, 51.05] }, properties: { layerId: 'l1', layerColor: '#f00', color: 'chartreuse-ish' } },
          { type: 'Feature', geometry: { type: 'Point', coordinates: [3.7, 51.05] }, properties: { layerId: 'l2', layerColor: 'nope' } },
        ],
      },
    });

    expect(data?.layers.features.map((feature) => feature.properties?.rgColor)).toEqual(['#00ff00', '#f00', undefined]);
    expect(data?.stations.features[1].properties).toEqual({ groupId: 3, name: 'Station 3', color: '#00f', kind: 'boundary' });
  });

  it('reads plain JSON too (an older server) and drops what is not GeoJSON', () => {
    const data = decodeOfflineDepartmentData(
      strToU8(
        JSON.stringify({
          pois: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: {} }, { type: 'Point', coordinates: [1, 2] }, null, 'x'] },
          legend: { items: [] },
          'bad key!': { type: 'FeatureCollection', features: [] },
          hydrants: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 1] }, properties: null }] },
        })
      )
    );
    expect(Object.keys(data ?? {})).toEqual(['pois', 'hydrants']);
    expect(data?.pois.features).toHaveLength(1);
  });

  it('uses the inner geometry of a region saved as a whole Feature, and drops one with none', () => {
    const nested = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      properties: {},
    };
    const data = toOfflineDepartmentData({
      customMapRegions: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: nested, properties: { id: 'r1' } },
          { type: 'Feature', geometry: { type: 'Feature', geometry: null }, properties: { id: 'r2' } },
        ],
      },
    });
    expect(data?.customMapRegions.features).toHaveLength(1);
    expect(data?.customMapRegions.features[0]).toMatchObject({ geometry: { type: 'Polygon' }, properties: { id: 'r1' } });
  });

  it('is null for unreadable, empty or oversized bundles', () => {
    expect(decodeOfflineDepartmentData(strToU8('not json'))).toBeNull();
    expect(decodeOfflineDepartmentData(gzipSync(strToU8('[]')))).toBeNull();
    expect(decodeOfflineDepartmentData(gzipSync(strToU8('{}')))).toBeNull();
    // A truncated gzip stream.
    expect(decodeOfflineDepartmentData(gzipSync(strToU8(JSON.stringify(BUNDLE))).slice(0, 30))).toBeNull();
    // The gzip trailer declares more than the limit: refused before inflating.
    const bomb = gzipSync(strToU8(JSON.stringify(BUNDLE)));
    const size = MAX_DEPARTMENT_DATA_BYTES + 1;
    bomb.set([size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, (size >>> 24) & 0xff], bomb.length - 4);
    expect(decodeOfflineDepartmentData(bomb)).toBeNull();
    expect(toOfflineDepartmentData(null)).toBeNull();
  });
});
