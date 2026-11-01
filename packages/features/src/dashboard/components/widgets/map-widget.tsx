import { useSecurity } from '@resgrid/auth';
import { getDataApiContext, hasDataApiContext, useMapMarkersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Camera, type CameraRef, MapPins, MapProvider, MapView, useFitBounds, useMapProviderContext } from '@resgrid/maps';
import type { MapMakerInfoData } from '@resgrid/models';
import { type RealtimeEventName, useMapLiveLocations, useRealtimeRefetch } from '@resgrid/realtime';
import { useColorScheme } from 'nativewind';
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useDashboardConfig } from '../../hooks/use-department-config';
import { useStale } from '../../hooks/use-stale';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { filterMapPins, resolveWidgetCenter } from '../../lib/map-pins';
import { WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import type { WidgetProps } from './types';

/** Pushes that change what the department map shows; the geolocation feed moves unit/personnel pins in place. */
const MAP_EVENTS: readonly RealtimeEventName[] = ['callsUpdated', 'callAdded', 'callClosed', 'unitStatusUpdated', 'personnelStatusUpdated', 'eventingHubJoined'];

/**
 * Uses the app's MapProvider when the shell mounts one; until then the widget provides its own from the department
 * config, so the map works on a board either way (MapLibre via @resgrid/maps; styles come from the Resgrid server).
 */
const WidgetMapProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { hasProvider } = useMapProviderContext();
  const config = useDashboardConfig();
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
  const config = useDashboardConfig();
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
  const center = useMemo<[number, number]>(
    () =>
      resolveWidgetCenter(settings, { latitude: config?.MapCenterLatitude, longitude: config?.MapCenterLongitude }) ??
      resolveWidgetCenter({ latitude: 0, longitude: 0 }, { latitude: centerLatitude, longitude: centerLongitude }) ?? [providerCenter.longitude, providerCenter.latitude],
    [centerLatitude, centerLongitude, config?.MapCenterLatitude, config?.MapCenterLongitude, providerCenter, settings]
  );

  // Fit once per load and whenever the pin kinds change — never on every live position update (that would yank the
  // camera, and any pan, around all day).
  const fitKey = `${hasLoaded}|${settings.showAllMarkers}|${settings.showCalls}|${settings.showUnits}|${settings.showStations}|${settings.showPersonnel}`;
  const fittedKeyRef = useRef('');
  useEffect(() => {
    if (!hasLoaded || !settings.showAllMarkers || fittedKeyRef.current === fitKey || visiblePins.length === 0) return;
    if (fitBounds(visiblePins.map((pin) => [pin.Longitude, pin.Latitude]))) fittedKeyRef.current = fitKey;
  }, [fitBounds, fitKey, hasLoaded, settings.showAllMarkers, visiblePins]);

  if (style.status === 'loading') return <WidgetLoading testID="map-widget-loading" />;

  return (
    <MapView style={styles.map} interactive={!isEditMode} testID="map-widget-map" unavailableFallback={<WidgetMessage message={t('dashboard.map_unavailable')} testID="map-widget-unavailable" />}>
      <Camera
        ref={cameraRef}
        defaultSettings={{ centerCoordinate: center, zoomLevel: settings.zoomLevel }}
        centerCoordinate={settings.showAllMarkers ? undefined : center}
        zoomLevel={settings.showAllMarkers ? undefined : settings.zoomLevel}
        animationDuration={0}
      />
      <MapPins pins={visiblePins} canViewPersonnel={canUserViewPII} showLabels={!settings.hideLabels} idPrefix="dashboard-pins" />
    </MapView>
  );
};

/** The department map: calls, units, stations and personnel pins (as configured), live positions, attribution on. */
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
