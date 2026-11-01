// Stand-in for @maplibre/maplibre-react-native (mapped in jest.native.config.js). Every component renders a host View
// that keeps its props, so tests read and fire them; mount counts let tests observe remounts after a style swap.
import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { View } from 'react-native';

export const mockMountCounts: Record<string, number> = {};
export const mockCameraCalls: { method: string; args: unknown[] }[] = [];

export const resetMaplibreFakes = (): void => {
  for (const key of Object.keys(mockMountCounts)) delete mockMountCounts[key];
  mockCameraCalls.length = 0;
};

const useMountCount = (key: string): void => {
  useEffect(() => {
    mockMountCounts[key] = (mockMountCounts[key] ?? 0) + 1;
  }, [key]);
};

export const Map = forwardRef<any, any>(function Map({ children, testID, ...props }, ref) {
  useImperativeHandle(ref, () => ({
    getCenter: async () => [1, 2],
    getZoom: async () => 10,
    getBounds: async () => [0, 1, 2, 3],
  }));
  return (
    <View testID={testID ?? 'mlrn-map'} {...props}>
      {children}
    </View>
  );
});

export const Camera = forwardRef<any, any>(function Camera(props, ref) {
  useImperativeHandle(ref, () => {
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        mockCameraCalls.push({ method, args });
      };
    return { jumpTo: record('jumpTo'), easeTo: record('easeTo'), flyTo: record('flyTo'), fitBounds: record('fitBounds'), zoomTo: record('zoomTo'), setStop: record('setStop') };
  });
  return <View testID="mlrn-camera" {...props} />;
});

const cloneWithSource = (children: React.ReactNode, source: string): React.ReactNode =>
  React.Children.map(children, (child) => (React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<{ source?: string }>, { source }) : child));

export function GeoJSONSource({ id, children, ...props }: any) {
  useMountCount(`source:${id}`);
  return (
    <View testID={`mlrn-source-${id}`} {...props}>
      {cloneWithSource(children, id)}
    </View>
  );
}

export function RasterSource({ id, children, ...props }: any) {
  useMountCount(`source:${id}`);
  return (
    <View testID={`mlrn-raster-source-${id}`} {...props}>
      {cloneWithSource(children, id)}
    </View>
  );
}

export function ImageSource({ id, children, ...props }: any) {
  useMountCount(`source:${id}`);
  return (
    <View testID={`mlrn-image-source-${id}`} {...props}>
      {cloneWithSource(children, id)}
    </View>
  );
}

export function Layer({ id, ...props }: any) {
  useMountCount(`layer:${id}`);
  return <View testID={`mlrn-layer-${id}`} {...props} />;
}

export function Images(props: any) {
  useMountCount('images');
  return <View testID="mlrn-images" {...props} />;
}

export function Marker({ id, children, testID, ...props }: any) {
  return (
    <View {...props} testID={`mlrn-marker-${id ?? 'anonymous'}`} wrappedTestID={testID}>
      {children}
    </View>
  );
}

export function UserLocation(props: any) {
  return <View testID="mlrn-user-location" {...props} />;
}
