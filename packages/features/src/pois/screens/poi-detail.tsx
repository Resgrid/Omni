import { usePoisStore } from '@resgrid/data';
import { useNavigationHandoff } from '@resgrid/features/contacts';
import { useTranslation } from '@resgrid/i18n';
import { type PoiResultData } from '@resgrid/models';
import { Box, Button, ButtonText, Heading, HStack, Loading, ScreenHeader, ScrollView, Text, TypeIcon, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { MapPinned, Navigation } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';

import { parsePoiId, poiLabel } from '../lib/poi-filters';

export interface PoiDetailScreenProps {
  poiId?: number;
  /** Map slot (MapLibre via @resgrid/maps, supplied by the app): the POI's position. */
  renderMap?: (poi: PoiResultData) => React.ReactNode;
}

const hasPosition = (poi: PoiResultData): boolean => Number.isFinite(poi.Latitude) && Number.isFinite(poi.Longitude) && !(poi.Latitude === 0 && poi.Longitude === 0);

/** A POI at the canonical `/poi/[id]` (Responder/Dispatch): type, address, note, capabilities, directions hand-off and a map slot. */
export default function PoiDetailScreen({ poiId: poiIdProp, renderMap }: PoiDetailScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const poiId = poiIdProp ?? parsePoiId(params.id);
  const handoff = useNavigationHandoff();
  const cached = usePoisStore((state) => (poiId ? (state.poiDetailsById[poiId] ?? state.pois.find((poi) => poi.PoiId === poiId)) : undefined));
  const [poi, setPoi] = useState<PoiResultData | null | undefined>(cached);
  const [isLoading, setIsLoading] = useState(!cached && !!poiId);

  useEffect(() => {
    if (!poiId) return;
    let active = true;
    setIsLoading(!cached);
    void usePoisStore
      .getState()
      .fetchPoi(poiId)
      .then((result) => {
        if (active) setPoi(result ?? cached ?? null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
    // Re-read per id; the cached copy only seeds the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poiId]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/pois'));
  const current = poi ?? cached;

  if (!current) {
    return (
      <View className="flex-1 bg-background-50" testID="poi-detail-screen">
        <ScreenHeader title={t('pois.title')} onBack={back} />
        {isLoading ? <Loading text={t('pois.loading_detail')} /> : <ZeroState icon={MapPinned} heading={t('pois.not_found')} testID="poi-detail-missing" />}
      </View>
    );
  }

  const positioned = hasPosition(current);

  return (
    <View className="flex-1 bg-background-50" testID="poi-detail-screen">
      <ScreenHeader title={poiLabel(current)} onBack={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {positioned && renderMap ? <VStack className="mx-4 mt-4 h-56 overflow-hidden rounded-xl">{renderMap(current)}</VStack> : null}
        <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4">
          <HStack space="md" className="items-center">
            <TypeIcon iconUrl={current.IconUrl ?? null} size={36} fallback={<MapPinned size={28} color="#6b7280" />} />
            <VStack className="flex-1">
              <Heading size="md" className="text-typography-900">
                {poiLabel(current)}
              </Heading>
              <Text className="text-sm text-typography-500">{current.PoiTypeName}</Text>
            </VStack>
          </HStack>
          {current.Address ? <Text className="mt-3 text-sm text-typography-900">{current.Address}</Text> : null}
          {positioned ? <Text className="mt-1 text-xs text-typography-500">{`${current.Latitude.toFixed(5)}, ${current.Longitude.toFixed(5)}`}</Text> : null}
          {current.Note ? <Text className="mt-3 text-sm text-typography-700">{current.Note}</Text> : null}
          {current.IsDestination || (current.Capabilities ?? []).length > 0 ? (
            <HStack space="xs" className="mt-3 flex-wrap">
              {current.IsDestination ? <Text className="rounded-full bg-info-50 px-2 py-0.5 text-xs text-info-700">{t('pois.destination')}</Text> : null}
              {(current.Capabilities ?? []).map((capability) => (
                <Text key={capability} className="rounded-full bg-background-100 px-2 py-0.5 text-xs text-typography-700">
                  {capability}
                </Text>
              ))}
            </HStack>
          ) : null}
        </Box>
        {positioned || current.Address ? (
          <Button
            className="mx-4 mt-4"
            onPress={() => void handoff.navigateTo(positioned ? { latitude: current.Latitude, longitude: current.Longitude, label: poiLabel(current) } : { address: current.Address, label: poiLabel(current) })}
            testID="poi-detail-directions"
          >
            <Navigation size={16} color="#ffffff" />
            <ButtonText>{t('common.route')}</ButtonText>
          </Button>
        ) : null}
      </ScrollView>
    </View>
  );
}
