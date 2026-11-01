import type { MapMakerInfoData } from '@resgrid/models';
import React, { useCallback, useMemo } from 'react';

import { buildPinCollection } from '../lib/pin-features';
import { useMapProviderContext } from '../provider/context';
import { CircleLayer, Images, MarkerView, ShapeSource, SymbolLayer } from '../rg';
import type { SourcePressEvent } from '../rg/types';
import { PinMarker } from './pin-marker';

export interface MapPinsProps {
  pins: readonly MapMakerInfoData[];
  onPinPress?: (pin: MapMakerInfoData) => void;
  /** The selected / active pin: drawn as an interactive MarkerView on top instead of in the symbol layer. */
  selectedPinId?: string | null;
  /** From the rights DTO (`CanViewPII`): false hides personnel pins. */
  canViewPersonnel: boolean;
  /** Labels under pins. Off automatically on raster base maps (no glyphs to draw text with). */
  showLabels?: boolean;
  /** Prefix for source/layer ids when a map shows more than one pin set. */
  idPrefix?: string;
  iconSize?: number;
}

/**
 * Department pins (baseline Responder map-pins) as ONE symbol layer over a generated image sprite — every distinct icon
 * registered once, each pin a GeoJSON feature — so Dispatch and BigBoard stay smooth with hundreds of pins. Pins
 * without any icon draw as coloured circles. Only the selected pin is a React view (`MarkerView` + `PinMarker`).
 */
export const MapPins: React.FC<MapPinsProps> = ({ pins, onPinPress, selectedPinId = null, canViewPersonnel, showLabels = true, idPrefix = 'resgrid-pins', iconSize = 1 }) => {
  const { icons, theme, style } = useMapProviderContext();
  const collection = useMemo(() => buildPinCollection(pins, { icons, canViewPersonnel, selectedPinId }), [pins, icons, canViewPersonnel, selectedPinId]);
  const selectedPin = selectedPinId != null ? (collection.byId.get(selectedPinId) ?? null) : null;
  const labels = showLabels && style.kind !== 'raster';

  const handlePress = useCallback(
    (event: SourcePressEvent) => {
      const properties = event.features[0]?.properties as { pinId?: unknown } | null | undefined;
      const pin = typeof properties?.pinId === 'string' ? collection.byId.get(properties.pinId) : undefined;
      if (pin) onPinPress?.(pin);
    },
    [collection, onPinPress]
  );

  const symbolStyle = useMemo(
    () => ({
      iconImage: ['get', 'icon'] as ['get', string],
      iconSize,
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      symbolSortKey: ['get', 'sortKey'] as ['get', string],
      ...(labels
        ? {
            textField: ['get', 'title'] as ['get', string],
            textSize: 10,
            textOffset: [0, 1.6],
            textAnchor: 'top' as const,
            textOptional: true,
            textMaxWidth: 10,
            textColor: theme.text,
            textHaloColor: theme.background,
            textHaloWidth: 1,
          }
        : {}),
    }),
    [iconSize, labels, theme.text, theme.background]
  );

  return (
    <>
      <Images images={collection.images} />
      <ShapeSource id={`${idPrefix}-source`} shape={collection.features} onPress={onPinPress ? handlePress : undefined} hitbox={{ width: 24, height: 24 }}>
        <CircleLayer id={`${idPrefix}-fallback`} filter={['==', ['get', 'icon'], '']} style={{ circleRadius: 7, circleColor: ['get', 'color'], circleStrokeWidth: 2, circleStrokeColor: '#ffffff' }} />
        <SymbolLayer id={`${idPrefix}-symbols`} filter={['!=', ['get', 'icon'], '']} style={symbolStyle} />
      </ShapeSource>
      {selectedPin ? (
        <MarkerView id={`${idPrefix}-selected`} coordinate={[selectedPin.Longitude, selectedPin.Latitude]} anchor={{ x: 0.5, y: 0.5 }} onPress={() => onPinPress?.(selectedPin)} testID="map-pins-selected">
          <PinMarker
            title={selectedPin.Title}
            imagePath={selectedPin.ImagePath}
            poiImage={selectedPin.PoiImage}
            iconUrl={selectedPin.IconUrl}
            pinIconUrl={selectedPin.PinIconUrl}
            isActive={true}
            onPress={() => onPinPress?.(selectedPin)}
          />
        </MarkerView>
      ) : null}
    </>
  );
};
