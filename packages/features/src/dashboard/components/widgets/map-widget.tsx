import { useSecurity } from '@resgrid/auth';
import { getDataApiContext, hasDataApiContext, useMapMarkersStore } from '@resgrid/data';
import { useDepartmentConfig } from '@resgrid/features/department-config';
import { DepartmentLayersOverlay } from '@resgrid/features/map/components/department-layers';
import { FacilityFeatureCard, FacilityMapsOverlay } from '@resgrid/features/map/components/facility-maps-overlay';
import { type FacilitySelection, useDrawnFacilityFeature, useFacilityMapLayers } from '@resgrid/features/map/hooks/use-facility-maps';
import { type FacilityFeature, facilityMapKey, lockedViewBounds } from '@resgrid/features/map/lib/facility-maps';
import { useNavigationEtaPins } from '@resgrid/features/navigation-eta';
import { useTranslation } from '@resgrid/i18n';
import { Camera, type CameraRef, type MapCameraChangedEvent, MapPins, MapProvider, MapView, useFitBounds, useMapProviderContext } from '@resgrid/maps';
import type { MapMakerInfoData } from '@resgrid/models';
import { type RealtimeEventName, useMapLiveLocations, useRealtimeRefetch } from '@resgrid/realtime';
import { useColorScheme } from 'nativewind';
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useMapWidgetViewStore } from '../../hooks/use-map-widget-view-store';
import { useStale } from '../../hooks/use-stale';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { filterMapPins, resolveWidgetCenter } from '../../lib/map-pins';
import { WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import type { WidgetProps } from './types';

/** Pushes that change what the department map shows; the geolocation feed moves unit/personnel pins in place. */
const MAP_EVENTS: readonly RealtimeEventName[] = ['callsUpdated', 'callAdded', 'callClosed', 'unitStatusUpdated', 'personnelStatusUpdated', 'eventingHubJoined'];

const FACILITY_PADDING = { paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 };
const NO_SELECTIONS: FacilitySelection[] = [];

/**
 * Uses the app's MapProvider when the shell mounts one; until then the widget provides its own from the department
 * config, so the map works on a board either way (MapLibre via @resgrid/maps; styles come from the Resgrid server).
 */
const WidgetMapProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { hasProvider } = useMapProviderContext();
  const config = useDepartmentConfig();
  const scheme = useColorScheme().colorScheme === 'dark' ? 'dark' : 'light';

  if (hasProvider) return <>{children}</>;

  return (
    <MapProvider config={config} colorScheme={scheme} apiContext={hasDataApiContext() ? getDataApiContext() : null}>
      {children}
    </MapProvider>
  );
};

const DepartmentMap: React.FC<{ isEditMode: boolean }> = ({ isEditMode }) => {
  const { t } = useTranslation();
  const { canUserViewPII } = useSecurity();
  const { center: providerCenter, style } = useMapProviderContext();
  const config = useDepartmentConfig();
  const settings = useWidgetSettings('map');
  // Persisted department pins (@resgrid/data): a board that starts offline still shows the last map.
  const markers = useMapMarkersStore((state) => state.markers);
  const centerLatitude = useMapMarkersStore((state) => state.centerLatitude);
  const centerLongitude = useMapMarkersStore((state) => state.centerLongitude);
  const hasLoaded = useMapMarkersStore((state) => (state.fetchedAt.markers ?? 0) > 0 || state.markers.length > 0);
  const [pins, setPins] = useState<MapMakerInfoData[]>(markers);
  const cameraRef = useRef<CameraRef>(null);
  const fitBounds = useFitBounds(cameraRef);
  const fetchStartedAtRef = useRef(0);

  const refresh = useCallback(async (options?: { bypassCache?: boolean }) => {
    fetchStartedAtRef.current = Date.now();
    await useMapMarkersStore.getState().fetchMarkers(options);
  }, []);

  const refreshBypassingCache = useCallback(() => refresh({ bypassCache: true }), [refresh]);
  const { applyToFetchedPins } = useMapLiveLocations({ pins, setPins, requestRefresh: () => void refreshBypassingCache() });

  // Every snapshot goes through the live-location merge: a position pushed while the request was out is newer.
  useEffect(() => {
    setPins(applyToFetchedPins(markers, fetchStartedAtRef.current));
  }, [applyToFetchedPins, markers]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useRealtimeRefetch(MAP_EVENTS, refreshBypassingCache);

  const visiblePins = useMemo(() => filterMapPins(pins, settings), [pins, settings]);
  // Navigating units carry their live ETA under their label (labels on); the fit below uses the plain pins.
  const etaPins = useNavigationEtaPins(visiblePins);

  const center = useMemo<[number, number]>(
    () =>
      resolveWidgetCenter(settings, { latitude: config?.MapCenterLatitude, longitude: config?.MapCenterLongitude }) ??
      resolveWidgetCenter({ latitude: 0, longitude: 0 }, { latitude: centerLatitude, longitude: centerLongitude }) ?? [providerCenter.longitude, providerCenter.latitude],
    [centerLatitude, centerLongitude, config?.MapCenterLatitude, config?.MapCenterLongitude, providerCenter, settings]
  );

  // The facility map the board is set to (a site plan or a building's floor), drawn under the layers and pins.
  const facilityKey = settings.customMapId ? facilityMapKey(settings.customMapKind, settings.customMapId) : null;
  const selections = useMemo<FacilitySelection[]>(() => (facilityKey ? [{ key: facilityKey, levelId: settings.customMapLayerId || null }] : NO_SELECTIONS), [facilityKey, settings.customMapLayerId]);
  const facility = useFacilityMapLayers(selections);
  const facilityBounds = facilityKey ? (facility.maps[facilityKey]?.bounds ?? null) : null;
  const [tapped, setTappedFeature] = useState<FacilityFeature | null>(null);
  const clearTapped = useCallback(() => setTappedFeature(null), []);
  // A room's card closes when the board shows another floor or layer, or another map.
  const tappedFeature = useDrawnFacilityFeature(tapped, tapped?.featureId, facility.layers, clearTapped);

  const viewMode = settings.viewMode;
  const framesFacility = viewMode === 'customMap' && facilityBounds !== null;
  const cameraBounds = useMemo(() => (framesFacility && facilityBounds ? { ...facilityBounds, ...FACILITY_PADDING } : undefined), [facilityBounds, framesFacility]);

  // A locked board keeps the camera around its spot or its facility map (pans and pinches stay inside).
  const maxBounds = useMemo(() => {
    if (!settings.lockView) return undefined;

    if (viewMode === 'fixed') return lockedViewBounds({ center, zoom: settings.zoomLevel });

    return framesFacility && facilityBounds ? lockedViewBounds({ bounds: facilityBounds }) : undefined;
  }, [center, facilityBounds, framesFacility, settings.lockView, settings.zoomLevel, viewMode]);

  // Fit once per load and whenever the pin kinds change — never on every live position update (that would yank the
  // camera, and any pan, around all day). Another view forgets the fit, so coming back to fitting the pins fits them again.
  const fitKey = `${hasLoaded}|${viewMode}|${settings.showCalls}|${settings.showLinkedCalls}|${settings.showUnits}|${settings.showStations}|${settings.showPersonnel}`;
  const fittedKeyRef = useRef('');
  useEffect(() => {
    if (viewMode !== 'fitPins') {
      fittedKeyRef.current = '';

      return;
    }

    if (!hasLoaded || fittedKeyRef.current === fitKey || visiblePins.length === 0) return;

    if (fitBounds(visiblePins.map((pin) => [pin.Longitude, pin.Latitude]))) fittedKeyRef.current = fitKey;
  }, [fitBounds, fitKey, hasLoaded, viewMode, visiblePins]);

  // A pan or zoom on the board is offered as the fixed view in the widget's settings.
  const handleCameraChanged = useCallback((event: MapCameraChangedEvent) => {
    if (!event.isUserInteraction) return;
    useMapWidgetViewStore.getState().setLastView({ latitude: event.center[1], longitude: event.center[0], zoom: event.zoom });
  }, []);

  if (style.status === 'loading') return <WidgetLoading testID="map-widget-loading" />;

  const holdsCenter = viewMode === 'fixed' || (viewMode === 'customMap' && !framesFacility);

  return (
    <View style={styles.map}>
      <MapView
        style={styles.map}
        interactive={!isEditMode}
        onCameraChanged={isEditMode ? undefined : handleCameraChanged}
        testID="map-widget-map"
        unavailableFallback={<WidgetMessage message={t('dashboard.map_unavailable')} testID="map-widget-unavailable" />}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: center, zoomLevel: settings.zoomLevel }}
          centerCoordinate={holdsCenter ? center : undefined}
          zoomLevel={holdsCenter ? settings.zoomLevel : undefined}
          bounds={cameraBounds}
          maxBounds={maxBounds}
          animationDuration={0}
        />
        <FacilityMapsOverlay layers={facility.layers} selectedFeatureId={tappedFeature?.featureId ?? null} onFeaturePress={isEditMode ? undefined : setTappedFeature} showLabels={!settings.hideLabels} />
        <DepartmentLayersOverlay idPrefix="dashboard" showLabels={!settings.hideLabels} />
        <MapPins pins={etaPins} canViewPersonnel={canUserViewPII} showLabels={!settings.hideLabels} idPrefix="dashboard-pins" />
      </MapView>
      {tappedFeature ? <FacilityFeatureCard feature={tappedFeature} onClose={() => setTappedFeature(null)} testID="map-widget-facility-feature" /> : null}
    </View>
  );
};

/**
 * The department map: calls, units, stations and personnel pins (as configured), live positions, the department layers
 * that are on (imported KML/KMZ/GeoJSON event layers included, as on the Map screen), attribution on. A board can set it
 * to a facility map (a site plan or a building floor, drawn under the pins) and frame it, hold a fixed spot, or fit every
 * pin; a locked view keeps the camera there.
 */
export const MapWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure }) => {
  const title = useWidgetTitle(WidgetTypes.MAP);
  const hasPins = useMapMarkersStore((state) => state.markers.length > 0);
  const hasError = useMapMarkersStore((state) => !!state.errors.markers);
  const stale = useStale(hasPins, hasError);

  return (
    <WidgetContainer title={title} testID="map-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale}>
      <WidgetMapProvider>
        <DepartmentMap isEditMode={isEditMode} />
      </WidgetMapProvider>
    </WidgetContainer>
  );
};

const styles = StyleSheet.create({
  map: { flex: 1 },
});
