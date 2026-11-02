import type { CustomMapLayerResultData, IndoorMapFloorResultData } from '@resgrid/models';
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { CustomMapRasterLayer, IndoorMapFloorLayer } from '../components/department-map-layers';
import { useSignedMapUrl } from '../hooks/use-signed-map-url';
import { MapProvider } from '../provider/map-provider';
import type { MapServices } from '../provider/services';
import type { MapUrlSigner, SignedMapUrl } from '../provider/url-signer';
import { MapView } from '../rg';
import { resetMaplibreFakes } from './fakes/maplibre-react-native';

const API = 'https://api.example.org/api/v4';
const config = { MapLibreStyleUrlDay: 'https://maps.example.org/day.json' };

/** A signer that appends `?sig=<n>` (n counts signatures per URL) and renews after `lifetimeMs`; `refuse` lists URLs it will not sign. */
const fakeSigner = (lifetimeMs: number, refuse: readonly string[] = []) => {
  const counts = new Map<string, number>();
  const sign = jest.fn(async (url: string): Promise<SignedMapUrl> => {
    if (refuse.some((part) => url.includes(part))) return { url: null, refreshAt: Number.POSITIVE_INFINITY };
    const count = (counts.get(url) ?? 0) + 1;
    counts.set(url, count);
    return { url: `${url}?sig=${count}`, refreshAt: Date.now() + lifetimeMs };
  });
  const signer: MapUrlSigner = { sign, peek: () => null, clear: jest.fn() };
  return { signer, sign };
};

const services = (urlSigner: MapUrlSigner): Partial<MapServices> => ({ urlSigner, getApiBaseUrl: () => API });

const layer = (overrides: Partial<CustomMapLayerResultData>): CustomMapLayerResultData => ({
  IndoorMapFloorId: 'L1',
  IndoorMapId: 'M1',
  Name: 'Fairground',
  FloorOrder: 0,
  LayerType: 0,
  HasImage: true,
  IsTiled: false,
  TileMinZoom: null,
  TileMaxZoom: null,
  BoundsNELat: 2,
  BoundsNELon: 4,
  BoundsSWLat: 1,
  BoundsSWLon: 3,
  Opacity: 0.8,
  Regions: [],
  ...overrides,
});

describe('signed department map resources (D12)', () => {
  beforeEach(() => resetMaplibreFakes());
  afterEach(() => jest.useRealTimers());

  it('hands the raster source only the signed Mercator template', async () => {
    const { signer, sign } = fakeSigner(60 * 60 * 1000);
    const mercator = `${API}/Mapping/GetCustomMapMercatorTile/L1/{z}/{x}/{y}`;
    await render(
      <MapProvider config={config} colorScheme="light" services={services(signer)}>
        <MapView testID="map">
          <CustomMapRasterLayer layer={layer({ IsTiled: true, MercatorTileUrl: mercator })} />
        </MapView>
      </MapProvider>
    );
    expect(sign).toHaveBeenCalledWith(mercator);
    const source = await screen.findByTestId('mlrn-raster-source-custom-map-L1-tiles');
    expect(source.props.tiles).toEqual([`${mercator}?sig=1`]);
    expect(screen.getByTestId('mlrn-layer-custom-map-L1-tiles-layer').props.paint).toMatchObject({ 'raster-opacity': 0.8 });
  });

  it('draws the untiled image signed over its bounds, and nothing when the URL cannot be signed', async () => {
    const { signer } = fakeSigner(60 * 60 * 1000, ['L9']);
    await render(
      <MapProvider config={config} colorScheme="light" services={services(signer)}>
        <MapView testID="map">
          <CustomMapRasterLayer layer={layer({})} />
          <CustomMapRasterLayer layer={layer({ IndoorMapFloorId: 'L9' })} />
        </MapView>
      </MapProvider>
    );
    const image = await screen.findByTestId('mlrn-image-source-custom-map-L1-image');
    expect(image.props.url).toBe(`${API}/Mapping/GetCustomMapLayerImage/L1?sig=1`);
    expect(screen.queryByTestId('mlrn-image-source-custom-map-L9-image')).toBeNull();
  });

  it('signs indoor floor images and renews the signature before it expires', async () => {
    jest.useFakeTimers();
    const { signer, sign } = fakeSigner(10 * 60 * 1000);
    const floor = { IndoorMapFloorId: 'F1', HasImage: true, BoundsNELat: 2, BoundsNELon: 4, BoundsSWLat: 1, BoundsSWLon: 3, Opacity: 1, Zones: [] } as unknown as IndoorMapFloorResultData;
    await render(
      <MapProvider config={config} colorScheme="light" services={services(signer)}>
        <MapView testID="map">
          <IndoorMapFloorLayer floor={floor} />
        </MapView>
      </MapProvider>
    );
    const url = `${API}/Mapping/GetIndoorMapFloorImage/F1`;
    expect(screen.getByTestId('mlrn-image-source-indoor-floor-F1-image').props.url).toBe(`${url}?sig=1`);
    await act(async () => {
      jest.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(sign).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('mlrn-image-source-indoor-floor-F1-image').props.url).toBe(`${url}?sig=2`);
  });

  it('useSignedMapUrl returns null for no URL and draws a still-fresh cached signature on the first render', async () => {
    // The request never answers: only the cache can supply the URL.
    const signer: MapUrlSigner = { sign: jest.fn(() => new Promise<SignedMapUrl>(() => undefined)), peek: (url) => ({ url: `${url}?sig=cached`, refreshAt: Number.POSITIVE_INFINITY }), clear: jest.fn() };
    function Probe({ url }: { url: string | null }) {
      const signed = useSignedMapUrl(url);
      return <Text testID="signed">{signed ?? 'none'}</Text>;
    }
    const { rerender } = await render(
      <MapProvider config={config} colorScheme="light" services={services(signer)}>
        <Probe url={null} />
      </MapProvider>
    );
    expect(screen.getByTestId('signed')).toHaveTextContent('none');
    await rerender(
      <MapProvider config={config} colorScheme="light" services={services(signer)}>
        <Probe url={`${API}/Mapping/GetIndoorMapFloorImage/F2`} />
      </MapProvider>
    );
    expect(screen.getByTestId('signed')).toHaveTextContent(`${API}/Mapping/GetIndoorMapFloorImage/F2?sig=cached`);
    expect(signer.sign).toHaveBeenCalledTimes(1);
  });
});
