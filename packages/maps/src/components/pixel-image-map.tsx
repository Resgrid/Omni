import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet } from 'react-native';

import { useLocalFileUrl } from '../hooks/use-local-file-url';
import { useSignedMapUrl } from '../hooks/use-signed-map-url';
import { createPixelFrame, type PixelRegion, pixelRegionsToFeatureCollection } from '../lib/pixel-frame';
import { useMapTheme } from '../provider/context';
import { Camera, FillLayer, ImageSource, LineLayer, MapView, RasterLayer, ShapeSource } from '../rg';
import type { SourcePressEvent } from '../rg/types';
import type { StyleSpecification } from '../types';

/**
 * A pixel-space custom map layer or indoor floor (MapLibre plan D21): the image in a synthetic local frame on a blank
 * style, with its regions or zones from `PixelGeometry`, pan and zoom kept to the image. Server images are signed before
 * a source gets them (D12); an offline pack's local image file is used as is.
 */
export interface PixelImageMapProps {
  id: string;
  /** The layer or floor image: a server URL (signed here) or, with `isLocalImage`, a downloaded file. */
  imageUrl: string | null;
  isLocalImage?: boolean;
  regions?: readonly PixelRegion[];
  opacity?: number;
  selectedRegionId?: string | null;
  onRegionPress?: (regionId: string) => void;
  testID?: string;
}

interface ImageSize {
  width: number;
  height: number;
}

/** The image's pixel size (the frame keeps its aspect ratio); null until known or when it cannot be read. */
export const useImageSize = (url: string | null): ImageSize | null => {
  const [size, setSize] = useState<{ url: string; value: ImageSize | null } | null>(null);
  useEffect(() => {
    if (!url) return undefined;
    let active = true;
    Image.getSize(
      url,
      (width, height) => {
        if (active) setSize({ url, value: { width, height } });
      },
      () => {
        if (active) setSize({ url, value: null });
      }
    );
    return () => {
      active = false;
    };
  }, [url]);
  return size && size.url === url ? size.value : null;
};

const PADDING = { paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 };

export const PixelImageMap: React.FC<PixelImageMapProps> = ({ id, imageUrl, isLocalImage = false, regions, opacity = 1, selectedRegionId = null, onRegionPress, testID = 'pixel-image-map' }) => {
  const { colors } = useMapTheme();
  const signed = useSignedMapUrl(isLocalImage ? null : imageUrl);
  const local = useLocalFileUrl(isLocalImage ? imageUrl : null);
  const url = isLocalImage ? local : signed;
  const size = useImageSize(url);
  const frame = useMemo(() => createPixelFrame(size?.width, size?.height), [size?.width, size?.height]);
  const shapes = useMemo(() => pixelRegionsToFeatureCollection(regions ?? [], frame), [regions, frame]);
  // No base map: a plain background, so nothing is fetched and nothing needs glyphs.
  const style = useMemo(
    () => ({ version: 8, name: 'resgrid-pixel-frame', sources: {}, layers: [{ id: `${id}-background`, type: 'background', paint: { 'background-color': colors.surface } }] }) as unknown as StyleSpecification,
    [colors.surface, id]
  );
  const [west, south, east, north] = frame.bounds;
  const marginX = (east - west) * 0.5;
  const marginY = (north - south) * 0.5;
  const handlePress = (event: SourcePressEvent) => {
    const regionId = (event.features[0]?.properties as { regionId?: unknown } | null | undefined)?.regionId;
    if (typeof regionId === 'string') onRegionPress?.(regionId);
  };
  const clampedOpacity = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;

  return (
    <MapView mapStyle={style} style={styles.map} compassEnabled={false} rotateEnabled={false} pitchEnabled={false} testID={testID}>
      <Camera bounds={{ ne: [east, north], sw: [west, south], ...PADDING }} maxBounds={{ ne: [east + marginX, north + marginY], sw: [west - marginX, south - marginY] }} animationMode="none" />
      {url && size ? (
        <ImageSource id={`${id}-image`} url={url} coordinates={frame.corners}>
          <RasterLayer id={`${id}-image-layer`} style={{ rasterOpacity: clampedOpacity }} />
        </ImageSource>
      ) : null}
      {shapes.features.length > 0 ? (
        <ShapeSource id={`${id}-regions`} shape={shapes} onPress={onRegionPress ? handlePress : undefined}>
          <FillLayer id={`${id}-regions-fill`} style={{ fillColor: ['get', 'color'], fillOpacity: ['case', ['==', ['get', 'regionId'], selectedRegionId ?? ''], 0.45, 0.2] }} />
          <LineLayer id={`${id}-regions-line`} style={{ lineColor: ['get', 'color'], lineWidth: ['case', ['==', ['get', 'regionId'], selectedRegionId ?? ''], 3, 1.5] }} />
        </ShapeSource>
      ) : null}
    </MapView>
  );
};

const styles = StyleSheet.create({ map: { flex: 1 } });
