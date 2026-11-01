import type { SymbolLayerStyle } from '@maplibre/maplibre-react-native';
import type { PoiResultData, PoiTypeResultData } from '@resgrid/models';
import React, { useCallback, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { getRemoteIconUrl } from '../lib/pin-features';
import { getPoiColor, getPoiDisplayName, poisToFeatureCollection, poiTypeIconImages } from '../lib/poi';
import { useMapProviderContext, useMapTheme } from '../provider/context';
import { CircleLayer, Images, MarkerView, ShapeSource, SymbolLayer } from '../rg';
import type { SourcePressEvent } from '../rg/types';

/** A POI drawn as a view: the uploaded type icon on the type colour, else a coloured pin dot (selected POI, list rows). */
export const PoiMarkerIcon: React.FC<{ color?: string | null; iconUrl?: string | null; size?: number; testID?: string }> = ({ color, iconUrl, size = 28, testID }) => {
  const url = getRemoteIconUrl(iconUrl);
  return (
    <View style={StyleSheet.flatten([styles.poiIcon, { width: size, height: size, borderRadius: size / 2, backgroundColor: getPoiColor(color) }])} testID={testID}>
      {url ? <Image source={{ uri: url }} style={{ width: size * 0.7, height: size * 0.7 }} resizeMode="contain" /> : null}
    </View>
  );
};

export interface PoiMarkersProps {
  pois: readonly PoiResultData[];
  poiTypes?: readonly PoiTypeResultData[];
  onPoiPress?: (poi: PoiResultData) => void;
  selectedPoiId?: number | null;
  showLabels?: boolean;
  idPrefix?: string;
}

/** Department POIs (baseline Responder POI set) as a circle + symbol layer; the selected POI is a MarkerView. */
export const PoiMarkers: React.FC<PoiMarkersProps> = ({ pois, poiTypes = [], onPoiPress, selectedPoiId = null, showLabels = true, idPrefix = 'resgrid-pois' }) => {
  const { style } = useMapProviderContext();
  const { colors } = useMapTheme();
  const visible = useMemo(() => (selectedPoiId == null ? pois : pois.filter((poi) => poi.PoiId !== selectedPoiId)), [pois, selectedPoiId]);
  const shape = useMemo(() => poisToFeatureCollection(visible, poiTypes), [visible, poiTypes]);
  const images = useMemo(() => poiTypeIconImages(poiTypes, pois), [poiTypes, pois]);
  const byId = useMemo(() => new Map(pois.map((poi) => [poi.PoiId, poi])), [pois]);
  const selected = selectedPoiId != null ? byId.get(selectedPoiId) : undefined;
  const labels = showLabels && style.kind !== 'raster';
  const symbolStyle = useMemo<SymbolLayerStyle>(() => {
    const icon: SymbolLayerStyle = { iconImage: ['get', 'icon'], iconSize: 0.14, iconAllowOverlap: true, iconIgnorePlacement: true };
    return labels ? { ...icon, textField: ['get', 'title'], textSize: 10, textOffset: [0, 1.4], textAnchor: 'top', textOptional: true, textColor: colors.text, textHaloColor: colors.background, textHaloWidth: 1 } : icon;
  }, [labels, colors.text, colors.background]);

  const handlePress = useCallback(
    (event: SourcePressEvent) => {
      const poiId = (event.features[0]?.properties as { poiId?: unknown } | null | undefined)?.poiId;
      const poi = typeof poiId === 'number' ? byId.get(poiId) : undefined;
      if (poi) onPoiPress?.(poi);
    },
    [byId, onPoiPress]
  );

  return (
    <>
      <Images images={images} />
      <ShapeSource id={`${idPrefix}-source`} shape={shape} onPress={onPoiPress ? handlePress : undefined} hitbox={{ width: 24, height: 24 }}>
        <CircleLayer id={`${idPrefix}-circles`} style={{ circleRadius: 9, circleColor: ['get', 'color'], circleStrokeWidth: 2, circleStrokeColor: '#ffffff' }} />
        <SymbolLayer id={`${idPrefix}-symbols`} style={symbolStyle} />
      </ShapeSource>
      {selected ? (
        <MarkerView id={`${idPrefix}-selected`} coordinate={[selected.Longitude, selected.Latitude]} anchor={{ x: 0.5, y: 0.5 }} onPress={() => onPoiPress?.(selected)} testID="poi-markers-selected">
          <View style={styles.selected}>
            <PoiMarkerIcon color={selected.Color} iconUrl={selected.IconUrl} size={36} />
            <Text style={StyleSheet.flatten([styles.title, { color: colors.text }])} numberOfLines={2}>
              {getPoiDisplayName(selected)}
            </Text>
          </View>
        </MarkerView>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  poiIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  selected: {
    alignItems: 'center',
  },
  title: {
    marginTop: 2,
    maxWidth: 120,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
