import { usePoisStore } from '@resgrid/data';
import { useNavigationHandoff } from '@resgrid/features/contacts';
import { parsePoiId, poiLabel } from '@resgrid/features/pois';
import { UnitStatusSheet, useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import type { PoiResultData } from '@resgrid/models';
import { Button, ButtonText, HStack, Loading, ScreenHeader, ScrollView, Text, TypeIcon, useToast, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Flag, MapPinned, Navigation } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { isMappable } from '../lib/route-geo';
import { mapBounds, routeColor } from '../lib/route-map';
import { type RenderRouteMap, RouteMapSlot } from '../map-slot';
import { unitRoutesRoutes } from '../routes';

export interface RoutePoiScreenProps {
  poiId?: number;
  renderMap?: RenderRouteMap;
}

/** Whether the crew can pick the POI as a status destination (the POI or its type is a destination). */
export const isPoiDestination = (poi: Pick<PoiResultData, 'IsDestination' | 'PoiTypeId'>, destinationTypeIds: ReadonlySet<number>): boolean => poi.IsDestination || destinationTypeIds.has(poi.PoiTypeId);

/**
 * A point of interest from the Routes tab (`/routes/poi/[id]`): type, address, coordinates and note, directions handed off
 * to the crew's navigation app, and "Set destination" (destination POIs) which opens the unit status sheet.
 */
export default function RoutePoiScreen({ poiId: poiIdProp, renderMap }: RoutePoiScreenProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const handoff = useNavigationHandoff();
  const { activeUnitId } = useStatusContext();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const poiId = poiIdProp ?? parsePoiId(params.id);
  const cached = usePoisStore((state) => (poiId ? (state.poiDetailsById[poiId] ?? state.pois.find((poi) => poi.PoiId === poiId)) : undefined));
  const poiTypes = usePoisStore((state) => state.poiTypes);
  const [poi, setPoi] = useState<PoiResultData | null | undefined>(cached);
  const [isLoading, setIsLoading] = useState(!cached && !!poiId);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  useEffect(() => {
    if (!poiId) return undefined;
    let active = true;
    if (usePoisStore.getState().poiTypes.length === 0) void usePoisStore.getState().fetchPoiTypes();
    void usePoisStore
      .getState()
      .fetchPoi(poiId)
      .then((result) => {
        if (active && result) setPoi(result);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [poiId]);

  const current = poi ?? cached ?? null;
  const destinationTypes = useMemo(() => new Set(poiTypes.filter((type) => type.IsDestination).map((type) => type.PoiTypeId)), [poiTypes]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(unitRoutesRoutes.list()));

  if (!current) {
    return (
      <View className="flex-1 bg-background-50" testID="route-poi-screen">
        <ScreenHeader title={t('routes.poi_detail')} onBack={back} />
        {isLoading ? <Loading text={t('routes.loading_poi')} /> : <ZeroState icon={MapPinned} heading={t('routes.poi_not_found')} description={t('routes.poi_not_found_description')} testID="route-poi-missing" />}
      </View>
    );
  }

  const positioned = isMappable(current.Latitude, current.Longitude);
  const label = poiLabel(current);
  const typeName = current.PoiTypeName || poiTypes.find((type) => type.PoiTypeId === current.PoiTypeId)?.Name || t('routes.poi_type_unknown');
  const color = routeColor(current.Color);
  const stops = positioned ? [{ id: String(current.PoiId), order: 1, name: label, latitude: current.Latitude, longitude: current.Longitude, status: 0, isCurrent: true, color }] : [];
  const canSetDestination = !!activeUnitId && isPoiDestination(current, destinationTypes);

  const navigate = async () => {
    const target = positioned ? { latitude: current.Latitude, longitude: current.Longitude, label } : current.Address ? { address: current.Address, label } : null;
    if (!target) return;
    if (!(await handoff.navigateTo(target))) toast.error(t('routes.failed_to_open_poi_maps'));
  };

  return (
    <View className="flex-1 bg-background-50" testID="route-poi-screen">
      <ScreenHeader title={label || t('routes.poi_detail')} onBack={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <RouteMapSlot kind="poi" renderMap={renderMap} height={220} stops={stops} line={null} geofence={null} color={color} bounds={mapBounds(stops, null)} showUserLocation />
        <VStack space="md" className="px-4 pt-4">
          <VStack space="sm" className="rounded-xl bg-background-0 p-4">
            <HStack space="md" className="items-center">
              <View style={StyleSheet.flatten([styles.icon, { backgroundColor: current.Color || '#e5e7eb' }])}>
                <TypeIcon iconUrl={current.IconUrl ?? null} size={24} fallback={<MapPinned size={20} color="#374151" />} />
              </View>
              <VStack className="flex-1">
                <Text className="text-lg font-bold text-typography-900">{label}</Text>
                <Text className="text-sm text-typography-500">{typeName}</Text>
              </VStack>
            </HStack>
            {current.Address ? <Text className="text-sm text-typography-900">{`${t('routes.poi_address')}: ${current.Address}`}</Text> : null}
            {positioned ? <Text className="text-xs text-typography-500">{t('routes.poi_coordinates_value', { latitude: current.Latitude.toFixed(5), longitude: current.Longitude.toFixed(5) })}</Text> : null}
            {current.Note ? <Text className="text-sm text-typography-700">{`${t('routes.poi_note')}: ${current.Note}`}</Text> : null}
            {isPoiDestination(current, destinationTypes) ? <Text className="self-start rounded-full bg-info-50 px-2 py-0.5 text-xs text-info-700">{t('routes.poi_destination_enabled')}</Text> : null}
          </VStack>
          {positioned || current.Address ? (
            <Button onPress={() => void navigate()} testID="route-poi-directions" style={{ minHeight: 52 }}>
              <View style={styles.buttonIcon}>
                <Navigation size={16} color="#ffffff" />
              </View>
              <ButtonText>{t('routes.route_to_poi')}</ButtonText>
            </Button>
          ) : null}
          {canSetDestination ? (
            <Button variant="outline" onPress={() => setIsStatusOpen(true)} testID="route-poi-set-destination" style={{ minHeight: 52 }}>
              <View style={styles.buttonIcon}>
                <Flag size={16} color="#2563eb" />
              </View>
              <ButtonText>{t('routes.set_poi_destination')}</ButtonText>
            </Button>
          ) : null}
        </VStack>
      </ScrollView>
      {canSetDestination ? <UnitStatusSheet isOpen={isStatusOpen} onClose={() => setIsStatusOpen(false)} unitId={activeUnitId} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  buttonIcon: { marginRight: 6 },
});
