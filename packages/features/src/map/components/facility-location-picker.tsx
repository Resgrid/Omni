import { useCustomMapsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { FullScreenLocationPicker, type PickedLocation, useLocationPickerContext } from '@resgrid/maps';
import { Pressable, ScrollView, Text, View } from '@resgrid/ui';
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { type FacilitySelection, useFacilityMapLayers, useFacilityMapListings } from '../hooks/use-facility-maps';
import { type FacilityFeature, facilityMapKey, type FacilityOverlayLayer } from '../lib/facility-maps';
import { FacilityMapsOverlay } from './facility-maps-overlay';

/** A room or region picked as the location: the call's indoor location (Core `IndoorMapZoneId` + `IndoorMapFloorId`). */
export interface PickedFacilityLocation {
  zoneId: string;
  /** The indoor floor or custom map layer the zone is on. */
  floorId: string;
  /** "Room, Map", for the form and a blank address. */
  name: string;
}

export interface FacilityLocationPickerResult extends PickedLocation {
  /** Set when a room or region was picked and the pin is still on it; absent when the indoor location is not changed. */
  indoor?: PickedFacilityLocation;
}

export interface FacilityLocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  initial?: { latitude: number; longitude: number } | null;
  onSelect: (location: FacilityLocationPickerResult) => void;
  /** Offer the department's facility maps (the call location; not the destination). */
  facilityMaps?: boolean;
  /** The call's indoor location as the form holds it: its map opens on its floor with the room highlighted. */
  initialIndoor?: { zoneId: string; floorId: string | null } | null;
  /** More map content (Dispatch's nearest-unit board). */
  overlay?: ReactNode;
}

/** Two points this close (about a metre) are the same place. */
const SAME_PLACE_DEGREES = 0.00001;

const isAt = (center: [number, number] | null, location: PickedLocation | null): boolean =>
  !!center && !!location && Math.abs(center[0] - location.longitude) < SAME_PLACE_DEGREES && Math.abs(center[1] - location.latitude) < SAME_PLACE_DEGREES;

/** The facility map holding a floor or layer, from what the device has read. */
const useMapKeyOfLevel = (floorId: string | null | undefined): string | null => {
  const customMapById = useCustomMapsStore((state) => state.customMapById);
  const indoorMapById = useCustomMapsStore((state) => state.indoorMapById);
  const floorById = useCustomMapsStore((state) => state.floorById);
  const customMapLayerById = useCustomMapsStore((state) => state.customMapLayerById);

  return useMemo(() => {
    if (!floorId) return null;
    const floor = floorById[floorId];

    if (floor?.IndoorMapId) return facilityMapKey('indoor', floor.IndoorMapId);

    for (const [mapId, map] of Object.entries(indoorMapById)) if (map.Floors?.some((entry) => entry.IndoorMapFloorId === floorId)) return facilityMapKey('indoor', mapId);
    const layer = customMapLayerById[floorId];

    if (layer?.IndoorMapId) return facilityMapKey('custom', layer.IndoorMapId);

    for (const [mapId, map] of Object.entries(customMapById)) if (map.Layers?.some((entry) => entry.IndoorMapFloorId === floorId)) return facilityMapKey('custom', mapId);

    return null;
  }, [customMapById, customMapLayerById, floorById, floorId, indoorMapById]);
};

/**
 * The call form's map picker with the department's facility maps: choose a custom or indoor map (and a floor or layer),
 * see it over the map and tap a room or region — the pin goes to its centre, the footer names it, and confirming hands the
 * form the point, the room's name (for a blank address) and the indoor location. A tap elsewhere is an ordinary point.
 * Every app's call form uses it (the app layer registers it as the calls `LocationPicker`).
 */
export const FacilityLocationPicker: React.FC<FacilityLocationPickerProps> = ({ isOpen, onClose, initial, onSelect, facilityMaps = false, initialIndoor = null, overlay }) => {
  const { t } = useTranslation();
  const listings = useFacilityMapListings(isOpen && facilityMaps);
  const initialMapKey = useMapKeyOfLevel(isOpen && facilityMaps ? initialIndoor?.floorId : null);
  const [chosen, setChosen] = useState<FacilitySelection | null>(null);
  const [picked, setPicked] = useState<FacilityFeature | null>(null);
  const [pin, setPin] = useState<PickedLocation | null>(null);
  const appliedInitial = useRef(false);

  // Each opening starts from the form: the call's indoor location's map and floor when the device knows them.
  useEffect(() => {
    if (!isOpen) {
      appliedInitial.current = false;
      setChosen(null);
      setPicked(null);

      return;
    }

    if (appliedInitial.current || !initialMapKey) return;
    appliedInitial.current = true;
    setChosen({ key: initialMapKey, levelId: initialIndoor?.floorId ?? null });
  }, [initialIndoor?.floorId, initialMapKey, isOpen]);

  const selections = useMemo(() => (chosen ? [chosen] : []), [chosen]);
  const { layers, maps } = useFacilityMapLayers(selections);
  const resolved = chosen ? maps[chosen.key] : undefined;
  const effective = picked && isAt(picked.center, pin) ? picked : null;
  const highlighted = effective?.featureId ?? initialIndoor?.zoneId ?? null;

  const choose = useCallback((key: string | null) => {
    setPicked(null);
    setChosen(key ? { key, levelId: null } : null);
  }, []);

  const chooseLevel = useCallback((levelId: string | null) => {
    setPicked(null);
    setChosen((current) => (current ? { ...current, levelId } : current));
  }, []);

  const roomLabel = useCallback((room: FacilityFeature): string => t('maps.facility.feature_address', { name: room.name || t(room.kind === 'indoor' ? 'maps.zone' : 'maps.region'), map: room.mapName }), [t]);

  const handleSelected = useCallback(
    (location: PickedLocation) => {
      const room = picked && isAt(picked.center, location) ? picked : null;

      if (!room) {
        onSelect(location);

        return;
      }

      const name = roomLabel(room);

      onSelect({ ...location, address: name, indoor: { zoneId: room.featureId, floorId: room.levelId, name } });
    },
    [onSelect, picked, roomLabel]
  );

  const showToolbar = facilityMaps && listings.length > 0;

  return (
    <FullScreenLocationPicker
      isOpen={isOpen}
      initialLocation={initial}
      onClose={onClose}
      onLocationSelected={handleSelected}
      onLocationChange={setPin}
      selectionLabel={effective ? roomLabel(effective) : null}
      overlay={
        <>
          {showToolbar ? <PickerFacilityLayers layers={layers} selectedFeatureId={highlighted} onPick={setPicked} /> : null}
          {overlay}
        </>
      }
      toolbar={
        showToolbar ? (
          <PickerFacilityToolbar
            listings={listings.map((listing) => ({ key: listing.key, name: listing.name }))}
            chosenKey={chosen?.key ?? null}
            levels={resolved?.levels ?? []}
            levelId={resolved?.levelId ?? null}
            allowsAllLevels={resolved?.allowsAllLevels ?? false}
            bounds={resolved?.bounds ?? null}
            onChoose={choose}
            onChooseLevel={chooseLevel}
          />
        ) : undefined
      }
    />
  );
};

/** The chosen facility map inside the picker's map: a tapped room moves the pin to its centre. */
const PickerFacilityLayers: React.FC<{ layers: readonly FacilityOverlayLayer[]; selectedFeatureId: string | null; onPick: (feature: FacilityFeature) => void }> = ({ layers, selectedFeatureId, onPick }) => {
  const picker = useLocationPickerContext();

  const handlePress = useCallback(
    (feature: FacilityFeature) => {
      if (!feature.center) return;
      onPick(feature);
      picker?.selectLocation({ latitude: feature.center[1], longitude: feature.center[0] });
    },
    [onPick, picker]
  );

  return <FacilityMapsOverlay layers={layers} selectedFeatureId={selectedFeatureId} onFeaturePress={handlePress} />;
};

interface PickerFacilityToolbarProps {
  listings: readonly { key: string; name: string }[];
  chosenKey: string | null;
  levels: readonly { id: string; name: string }[];
  levelId: string | null;
  allowsAllLevels: boolean;
  bounds: { ne: [number, number]; sw: [number, number] } | null;
  onChoose: (key: string | null) => void;
  onChooseLevel: (levelId: string | null) => void;
}

/** Which facility map (and floor or layer) the picker shows; the map is framed on it once it is read. */
const PickerFacilityToolbar: React.FC<PickerFacilityToolbarProps> = ({ listings, chosenKey, levels, levelId, allowsAllLevels, bounds, onChoose, onChooseLevel }) => {
  const { t } = useTranslation();
  const picker = useLocationPickerContext();
  const framed = useRef<string | null>(null);
  const fitBounds = picker?.fitBounds;

  useEffect(() => {
    if (!chosenKey) {
      framed.current = null;

      return;
    }

    if (!bounds || !fitBounds || framed.current === chosenKey) return;
    framed.current = chosenKey;
    fitBounds(bounds);
  }, [bounds, chosenKey, fitBounds]);

  return (
    <View style={styles.toolbar} testID="facility-picker-toolbar">
      <Text size="xs" className="mb-1 text-typography-500">
        {t('maps.facility.pick_hint')}
      </Text>
      <ScrollView style={styles.maps} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        <View style={styles.chips}>
          <Chip label={t('maps.facility.none')} selected={chosenKey === null} onPress={() => onChoose(null)} testID="facility-picker-map-none" />
          {listings.map((listing) => (
            <Chip key={listing.key} label={listing.name} selected={listing.key === chosenKey} onPress={() => onChoose(listing.key)} testID={`facility-picker-map-${listing.key}`} />
          ))}
        </View>
      </ScrollView>
      {chosenKey && levels.length > 1 ? (
        <View style={styles.chips} testID="facility-picker-levels">
          {allowsAllLevels ? <Chip label={t('maps.facility.all_layers')} selected={levelId === null} onPress={() => onChooseLevel(null)} testID="facility-picker-level-all" /> : null}
          {levels.map((level) => (
            <Chip key={level.id} label={level.name} selected={level.id === levelId} onPress={() => onChooseLevel(level.id)} testID={`facility-picker-level-${level.id}`} />
          ))}
        </View>
      ) : null}
    </View>
  );
};

const Chip: React.FC<{ label: string; selected: boolean; onPress: () => void; testID: string }> = ({ label, selected, onPress, testID }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    className={`mb-1 mr-2 rounded-full border px-3 py-1 ${selected ? 'border-primary-500 bg-primary-50' : 'border-outline-200 bg-background-0'}`}
    testID={testID}
  >
    <Text size="sm" className={selected ? 'text-primary-700' : 'text-typography-700'}>
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  toolbar: { marginBottom: 8 },
  maps: { maxHeight: 76 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
