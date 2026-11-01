import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { selectCallById, useCallsStore, useCommandStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Camera, FillLayer, LineLayer, MapView, MarkerView, ShapeSource } from '@resgrid/maps';
import { HStack, ScreenHeader, Text, View, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Flag, HeartPulse, MapPin, ParkingSquare, Truck } from 'lucide-react-native';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { resolveResourcePosition } from '../hooks/resource-position';
import { useBoardRoster } from '../hooks/use-board-roster';
import { safeColor } from '../lib/labels';
import { annotationShapes, incidentSites, initialMapCenter, resourceMarkers, type SiteKind } from '../lib/map-features';

const SITE_ICONS: Record<SiteKind, { icon: LucideIcon; color: string; labelKey: string }> = {
  call: { icon: MapPin, color: '#dc2626', labelKey: 'incident_command.site_call' },
  'command-post': { icon: Flag, color: '#2563eb', labelKey: 'incident_command.site_command_post' },
  staging: { icon: ParkingSquare, color: '#7c3aed', labelKey: 'incident_command.site_staging' },
  rehab: { icon: HeartPulse, color: '#16a34a', labelKey: 'incident_command.site_rehab' },
};

export interface CommandMapScreenProps {
  callId?: string;
}

type ShapeProp = React.ComponentProps<typeof ShapeSource>['shape'];

/**
 * The incident's command map (`/command-map/[callId]`, IC; MapLibre through @resgrid/maps): the call, command post,
 * staging and rehab, units on the incident coloured by lane, and the board's map annotations (read-only here).
 */
export default function CommandMapScreen({ callId: callIdProp }: CommandMapScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ callId?: string | string[] }>();
  const raw = callIdProp ?? (Array.isArray(params.callId) ? params.callId[0] : params.callId);
  const callId = isSafeRouteId(raw) ? raw : null;
  const entry = useCommandStore((state) => (callId ? state.boards[callId] : undefined));
  const call = useCallsStore((state) => (callId ? selectCallById(state, callId) : undefined));
  const roster = useBoardRoster(entry);
  const board = entry?.board ?? null;

  useEffect(() => {
    if (callId && !entry) void useCommandStore.getState().refreshBoard(callId);
  }, [callId, entry]);

  const sites = useMemo(() => incidentSites(board, call), [board, call]);
  const resources = useMemo(() => resourceMarkers(board, resolveResourcePosition), [board]);
  const annotations = useMemo(() => annotationShapes(board?.Annotations), [board?.Annotations]);
  const start = useMemo(() => initialMapCenter(board, sites, resources), [board, resources, sites]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/command' as never));
  const header = <ScreenHeader title={t('incident_command.command_map')} onBack={back} />;

  if (!callId || !board) {
    return (
      <View className="flex-1 bg-background-50" testID="command-map-screen">
        {header}
        <ZeroState icon={MapPin} heading={callId ? t('incident_command.no_command') : t('incident_command.not_found')} testID="command-map-empty" />
      </View>
    );
  }

  if (!start) {
    return (
      <View className="flex-1 bg-background-50" testID="command-map-screen">
        {header}
        <ZeroState icon={MapPin} heading={t('incident_command.map_no_positions')} testID="command-map-no-positions" />
      </View>
    );
  }

  return (
    <View className="flex-1" testID="command-map-screen">
      {header}
      <MapView style={styles.map} compassEnabled testID="command-map-view">
        <Camera defaultSettings={{ centerCoordinate: start.center, zoomLevel: start.zoom }} />
        {annotations.shapes.features.length > 0 ? (
          <ShapeSource id="command-annotations" shape={annotations.shapes as unknown as ShapeProp}>
            <FillLayer id="command-annotations-fill" filter={['==', ['get', 'kind'], 'polygon']} style={{ fillColor: '#f97316', fillOpacity: 0.2 }} />
            <LineLayer id="command-annotations-line" style={{ lineColor: '#f97316', lineWidth: 3 }} />
          </ShapeSource>
        ) : null}
        {sites.map((site) => {
          const config = SITE_ICONS[site.kind];
          const Icon = config.icon;
          return (
            <MarkerView key={site.kind} id={`command-site-${site.kind}`} coordinate={site.coordinate} anchor={{ x: 0.5, y: 0.5 }} testID={`command-map-site-${site.kind}`}>
              <View style={StyleSheet.flatten([styles.badge, { backgroundColor: config.color }])} accessibilityLabel={site.label ? `${t(config.labelKey)}: ${site.label}` : t(config.labelKey)}>
                <Icon size={16} color="#ffffff" />
              </View>
            </MarkerView>
          );
        })}
        {resources.map((marker) => (
          <MarkerView
            key={marker.assignment.ResourceAssignmentId}
            id={`command-resource-${marker.assignment.ResourceAssignmentId}`}
            coordinate={marker.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            testID={`command-map-resource-${marker.assignment.ResourceAssignmentId}`}
          >
            <HStack style={StyleSheet.flatten([styles.resource, { borderColor: safeColor(marker.color, '#6b7280') }])} className="items-center bg-background-0" space="xs">
              <View>
                <Truck size={14} color={safeColor(marker.color, '#6b7280')} />
              </View>
              <Text className="text-xs font-semibold text-typography-900">{roster.resourceName(marker.assignment.ResourceKind, marker.assignment.ResourceId)}</Text>
            </HStack>
          </MarkerView>
        ))}
        {annotations.points.map((point) => (
          <MarkerView key={point.id} id={`command-annotation-${point.id}`} coordinate={point.coordinate} anchor={{ x: 0.5, y: 1 }} testID={`command-map-annotation-${point.id}`}>
            <View style={styles.annotation} className="bg-background-0">
              <Text className="text-xs text-typography-900">{point.label || t('incident_command.map_marker')}</Text>
            </View>
          </MarkerView>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  badge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#ffffff' },
  resource: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 },
  annotation: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#f97316' },
});
