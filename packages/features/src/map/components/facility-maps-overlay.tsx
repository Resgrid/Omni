import { useTranslation } from '@resgrid/i18n';
import { CustomMapRasterLayer, IndoorMapFloorLayer } from '@resgrid/maps';
import { HStack, Pressable, Text, useThemeColors, View, VStack } from '@resgrid/ui';
import { X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { type FacilityFeature, facilityFeatureOf, type FacilityOverlayLayer } from '../lib/facility-maps';

export interface FacilityMapsOverlayProps {
  /** What the shown facility maps draw (`useFacilityMaps`, `useFacilityMapLayers`). */
  layers: readonly FacilityOverlayLayer[];
  /** The room or region to highlight. */
  selectedFeatureId?: string | null;
  /** A room or region was tapped; without it the shapes take no taps (a board in edit mode). */
  onFeaturePress?: (feature: FacilityFeature) => void;
  /** Room names on indoor floors. */
  showLabels?: boolean;
}

/**
 * The facility maps shown on a map (rendered inside a `MapView`; under the base map's labels, so the department layers,
 * routes and pins stay above them even when a map is switched on later): each custom map layer from its signed Mercator tiles or its image over its bounds with its regions, each indoor
 * floor's image with its zones. Offline, both come from the downloaded packs (`CustomMapRasterLayer`, `IndoorMapFloorLayer`).
 */
export const FacilityMapsOverlay: React.FC<FacilityMapsOverlayProps> = ({ layers, selectedFeatureId = null, onFeaturePress, showLabels = true }) => {
  const press = (entry: FacilityOverlayLayer) =>
    onFeaturePress
      ? (featureId: string) => {
          const feature = facilityFeatureOf([entry], featureId);

          if (feature) onFeaturePress(feature);
        }
      : undefined;

  return (
    <>
      {layers.map((entry) =>
        entry.kind === 'custom' ? (
          <CustomMapRasterLayer key={`custom-${entry.layer.IndoorMapFloorId}`} layer={entry.layer} belowLabels selectedRegionId={selectedFeatureId} onRegionPress={press(entry)} />
        ) : (
          <IndoorMapFloorLayer key={`indoor-${entry.floor.IndoorMapFloorId}`} floor={entry.floor} belowLabels selectedZoneId={selectedFeatureId} showZoneLabels={showLabels} onZonePress={press(entry)} />
        )
      )}
    </>
  );
};

/** "Map · Floor" (the level only when it is named differently from the map). */
export const facilityFeaturePlace = (feature: Pick<FacilityFeature, 'mapName' | 'levelName'>): string =>
  [feature.mapName, feature.levelName && feature.levelName !== feature.mapName ? feature.levelName : ''].filter((part) => !!part.trim()).join(' · ');

export interface FacilityFeatureCardProps {
  feature: FacilityFeature;
  onClose: () => void;
  testID?: string;
}

/** A tapped room or region over a map that has no details panel (the Dispatch console, the IC maps, a BigBoard map). */
export const FacilityFeatureCard: React.FC<FacilityFeatureCardProps> = ({ feature, onClose, testID = 'facility-feature-card' }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const place = facilityFeaturePlace(feature);

  return (
    <View style={styles.card} className="bg-background-0" testID={testID}>
      <HStack className="items-start">
        <VStack className="flex-1">
          {place ? (
            <Text className="text-xs uppercase text-typography-500" testID={`${testID}-place`}>
              {place}
            </Text>
          ) : null}
          <Text className="text-base font-bold text-typography-900" testID={`${testID}-name`}>
            {feature.name || t(feature.kind === 'indoor' ? 'maps.zone' : 'maps.region')}
          </Text>
          {feature.description ? <Text className="mt-1 text-sm text-typography-600">{feature.description}</Text> : null}
        </VStack>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} className="p-1" testID={`${testID}-close`}>
          <View>
            <X size={18} color={colors.textMuted} />
          </View>
        </Pressable>
      </HStack>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 12, bottom: 16, elevation: 4, left: 16, padding: 14, position: 'absolute', right: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
});
