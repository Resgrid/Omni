import { act, render, screen } from '@testing-library/react-native';
import React, { createRef } from 'react';

import { MapProvider } from '../provider/map-provider';
import { Camera, CircleLayer, Images, LineLayer, MapView, MarkerView, ShapeSource, SymbolLayer } from '../rg';
import type { CameraRef } from '../rg/types';
import { mockCameraCalls, mockMountCounts, resetMaplibreFakes } from './fakes/maplibre-react-native';

const DAY = 'https://maps.example.org/day.json';
const NIGHT = 'https://maps.example.org/night.json';
const config = { MapLibreStyleUrlDay: DAY, MapLibreStyleUrlNight: NIGHT, MapAttribution: '© OpenStreetMap' };

const line = {
  type: 'Feature' as const,
  properties: {},
  geometry: {
    type: 'LineString' as const,
    coordinates: [
      [0, 0],
      [1, 1],
    ],
  },
};

describe('rg wrapper — native renderer', () => {
  beforeEach(() => resetMaplibreFakes());

  it('renders the provider style with attribution on and the logo off', () => {
    render(
      <MapProvider config={config} colorScheme="light">
        <MapView testID="map" compassEnabled={true} scrollEnabled={false} />
      </MapProvider>
    );
    const map = screen.getByTestId('map');
    expect(map.props.mapStyle).toBe(DAY);
    expect(map.props.attribution).toBe(true);
    expect(map.props.logo).toBe(false);
    expect(map.props.compass).toBe(true);
    expect(map.props.dragPan).toBe(false);
    expect(map.props.touchZoom).toBe(true);
  });

  it('uses an explicit mapStyle / styleURL over the provider and turns every gesture off when not interactive', () => {
    render(
      <MapProvider config={config} colorScheme="light">
        <MapView testID="map" styleURL="https://other.example.org/style.json" interactive={false} />
      </MapProvider>
    );
    const map = screen.getByTestId('map');
    expect(map.props.mapStyle).toBe('https://other.example.org/style.json');
    expect([map.props.dragPan, map.props.touchZoom, map.props.touchRotate, map.props.touchPitch]).toEqual([false, false, false, false]);
  });

  it('hides the map when there is no style', () => {
    render(
      <MapProvider config={{}} colorScheme="light">
        <MapView testID="map" />
      </MapProvider>
    );
    expect(screen.getByTestId('map-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('map')).toBeNull();
  });

  it('normalizes press and camera events', () => {
    const onPress = jest.fn();
    const onCameraChanged = jest.fn();
    render(
      <MapProvider config={config} colorScheme="light">
        <MapView testID="map" onPress={onPress} onCameraChanged={onCameraChanged} />
      </MapProvider>
    );
    const map = screen.getByTestId('map');
    map.props.onPress({ nativeEvent: { lngLat: [3.7, 50.9], point: [10, 20] } });
    expect(onPress).toHaveBeenCalledWith({ coordinates: [3.7, 50.9], point: [10, 20], geometry: { type: 'Point', coordinates: [3.7, 50.9] } });
    map.props.onRegionDidChange({ nativeEvent: { center: [1, 2], zoom: 12, bearing: 90, pitch: 30, bounds: [0, 1, 2, 3], animated: false, userInteraction: true } });
    expect(onCameraChanged).toHaveBeenCalledWith(expect.objectContaining({ center: [1, 2], zoom: 12, heading: 90, isUserInteraction: true, properties: { isUserInteraction: true } }));
  });

  it('converts camelCase layer styles to paint/layout and passes the parent source to layers', () => {
    render(
      <MapProvider config={config} colorScheme="light">
        <MapView testID="map">
          <ShapeSource id="route" shape={line}>
            <LineLayer id="route-line" style={{ lineColor: '#f00', lineWidth: 4, lineCap: 'round' }} />
            <SymbolLayer id="route-label" style={{ textField: ['get', 'name'], textColor: '#000', iconImage: 'pin' }} filter={['==', ['get', 'kind'], 'a']} minZoomLevel={10} />
          </ShapeSource>
          <CircleLayer id="standalone" sourceID="composite" sourceLayerID="poi" style={{ circleRadius: 3 }} belowLayerID="labels" />
        </MapView>
      </MapProvider>
    );
    const lineLayer = screen.getByTestId('mlrn-layer-route-line');
    expect(lineLayer.props).toMatchObject({ type: 'line', source: 'route', paint: { 'line-color': '#f00', 'line-width': 4 }, layout: { 'line-cap': 'round' } });
    const symbol = screen.getByTestId('mlrn-layer-route-label');
    expect(symbol.props).toMatchObject({ type: 'symbol', minzoom: 10, filter: ['==', ['get', 'kind'], 'a'], paint: { 'text-color': '#000' }, layout: { 'text-field': ['get', 'name'], 'icon-image': 'pin' } });
    expect(screen.getByTestId('mlrn-layer-standalone').props).toMatchObject({ source: 'composite', 'source-layer': 'poi', beforeId: 'labels' });
  });

  it('re-adds sources, layers and images after a style swap (styleRevision)', () => {
    const tree = (scheme: 'light' | 'dark') => (
      <MapProvider config={config} colorScheme={scheme}>
        <MapView testID="map">
          <Images images={{ pin: 'https://example.org/pin.png' }} />
          <ShapeSource id="route" shape={line}>
            <LineLayer id="route-line" style={{ lineColor: '#f00' }} />
          </ShapeSource>
        </MapView>
      </MapProvider>
    );
    const { rerender } = render(tree('light'));
    act(() => screen.getByTestId('map').props.onDidFinishLoadingStyle());
    expect(mockMountCounts['source:route']).toBe(1);
    expect(mockMountCounts['layer:route-line']).toBe(1);

    rerender(tree('dark'));
    expect(screen.getByTestId('map').props.mapStyle).toBe(NIGHT);
    // Nothing remounts until the new style has loaded…
    expect(mockMountCounts['source:route']).toBe(1);
    act(() => screen.getByTestId('map').props.onDidFinishLoadingStyle());
    // …then everything is re-added to the new style document.
    expect(mockMountCounts['source:route']).toBe(2);
    expect(mockMountCounts['layer:route-line']).toBe(2);
    expect(mockMountCounts.images).toBe(2);
  });

  it('re-adds everything when the caller bumps styleRevision', () => {
    const tree = (revision: number) => (
      <MapProvider config={config} colorScheme="light">
        <MapView testID="map" styleRevision={revision}>
          <ShapeSource id="units" shape={null}>
            <CircleLayer id="units-dots" />
          </ShapeSource>
        </MapView>
      </MapProvider>
    );
    const { rerender } = render(tree(0));
    rerender(tree(1));
    expect(mockMountCounts['source:units']).toBe(2);
  });

  it('maps rnmapbox camera props and ref calls onto MapLibre', () => {
    const ref = createRef<CameraRef>();
    render(
      <MapProvider config={config} colorScheme="light">
        <MapView testID="map">
          <Camera ref={ref} centerCoordinate={[3.7, 50.9]} zoomLevel={14} heading={45} animationMode="flyTo" animationDuration={500} defaultSettings={{ centerCoordinate: [1, 1], zoomLevel: 5 }} />
        </MapView>
      </MapProvider>
    );
    const camera = screen.getByTestId('mlrn-camera');
    expect(camera.props).toMatchObject({ center: [3.7, 50.9], zoom: 14, bearing: 45, easing: 'fly', duration: 500, initialViewState: { center: [1, 1], zoom: 5 } });
    ref.current?.fitBounds([2, 2], [1, 1], 20, 300);
    ref.current?.setCamera({ centerCoordinate: [5, 6], zoomLevel: 9, animationMode: 'moveTo' });
    ref.current?.flyTo([Number.NaN, 1]);
    expect(mockCameraCalls).toEqual([
      { method: 'fitBounds', args: [[1, 1, 2, 2], { padding: { top: 20, right: 20, bottom: 20, left: 20 }, duration: 300 }] },
      { method: 'jumpTo', args: [{ center: [5, 6], zoom: 9, bearing: undefined, pitch: undefined, padding: undefined }] },
    ]);
  });

  it('follows the user with trackUserLocation and drops the center', () => {
    render(
      <MapProvider config={config} colorScheme="light">
        <MapView testID="map">
          <Camera followUserLocation={true} followUserMode="course" followZoomLevel={16} centerCoordinate={[1, 1]} />
        </MapView>
      </MapProvider>
    );
    const camera = screen.getByTestId('mlrn-camera');
    expect(camera.props.trackUserLocation).toBe('course');
    expect(camera.props.zoom).toBe(16);
    expect(camera.props.center).toBeUndefined();
  });

  it('renders a MarkerView with a named anchor and skips invalid coordinates', () => {
    const onPress = jest.fn();
    render(
      <MapProvider config={config} colorScheme="light">
        <MapView testID="map">
          <MarkerView id="pin" coordinate={[3.7, 50.9]} anchor={{ x: 0.5, y: 1 }} onPress={onPress}>
            <></>
          </MarkerView>
          <MarkerView id="bad" coordinate={[Number.NaN, 1]}>
            <></>
          </MarkerView>
        </MapView>
      </MapProvider>
    );
    const marker = screen.getByTestId('mlrn-marker-pin');
    expect(marker.props.lngLat).toEqual([3.7, 50.9]);
    expect(marker.props.anchor).toBe('bottom');
    marker.props.onPress();
    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByTestId('mlrn-marker-bad')).toBeNull();
  });
});
