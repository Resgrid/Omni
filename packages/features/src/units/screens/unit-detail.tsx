import { useCapability } from '@resgrid/config';
import { safeFormatDate } from '@resgrid/core/utils/dates';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { selectPendingUnitStatus, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { CurrentStatusBadge, UnitStatusSheet } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { type UnitInfoResultData } from '@resgrid/models';
import { useRealtimeEvent } from '@resgrid/realtime';
import { Box, Button, ButtonText, Heading, HStack, Loading, ScreenHeader, ScrollView, Text, TypeIcon, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Building2, Truck } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';

export interface UnitDetailScreenProps {
  unitId?: string;
  /** Map slot (MapLibre via @resgrid/maps, supplied by the app): rendered when the unit has a position. */
  renderMap?: (unit: UnitInfoResultData) => React.ReactNode;
}

const Row: React.FC<{ label: string; value?: string | null; testID?: string }> = ({ label, value, testID }) =>
  value ? (
    <HStack className="items-start justify-between border-b border-outline-100 py-2.5" space="md" testID={testID}>
      <Text className="text-sm text-typography-500">{label}</Text>
      <Text className="flex-1 text-right text-sm font-medium text-typography-900">{value}</Text>
    </HStack>
  ) : null;

/** A unit's detail page (Dispatch baseline): status, destination, crew, vehicle details and set-status on its behalf. */
export default function UnitDetailScreen({ unitId: unitIdProp, renderMap }: UnitDetailScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = unitIdProp ?? (Array.isArray(params.id) ? params.id[0] : params.id);
  const unitId = isSafeRouteId(rawId) ? rawId : null;
  const statusCapability = useCapability('status');
  const unit = useUnitsStore((state) => (unitId ? state.unitInfos.find((info) => info.UnitId === unitId) : undefined));
  const isLoading = useUnitsStore((state) => state.loading.unitInfos === true);
  const hasPending = useUnitStatusStore((state) => (unitId ? !!selectPendingUnitStatus(state, unitId) : false));
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  // Fresh on open: this page shows the current status, which the cached list can predate.
  useEffect(() => {
    if (unitId) void useUnitsStore.getState().fetchUnitInfos({ bypassCache: true });
  }, [unitId]);

  useRealtimeEvent(
    'unitStatusUpdated',
    (id) => {
      if (!id || id === unitId) void useUnitsStore.getState().fetchUnitInfos({ bypassCache: true });
    },
    !!unitId
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/units'));

  if (!unit) {
    return (
      <View className="flex-1 bg-background-50" testID="unit-detail-screen">
        <ScreenHeader title={t('units.details')} onBack={back} />
        {isLoading && unitId ? <Loading /> : <ZeroState icon={Truck} heading={t('units.not_found')} testID="unit-detail-missing" />}
      </View>
    );
  }

  const hasPosition = !!unit.Latitude && !!unit.Longitude;
  const crew = unit.Roles.filter((role) => !!role.UserId);

  return (
    <View className="flex-1 bg-background-50" testID="unit-detail-screen">
      <ScreenHeader title={unit.Name} onBack={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Box className="mx-4 mt-4 items-center rounded-xl border border-outline-200 bg-background-0 p-5">
          <TypeIcon iconUrl={unit.TypeIconUrl ?? null} mapIcon={unit.TypeMapIcon ?? null} size={48} fallback={<Truck size={40} color="#6b7280" />} />
          <Heading size="lg" className="mt-3 text-typography-900">
            {unit.Name}
          </Heading>
          {unit.Type ? <Text className="mt-1 text-sm text-typography-500">{unit.Type}</Text> : null}
          {unit.GroupName ? (
            <HStack className="mt-1 items-center" space="xs">
              <Building2 size={14} color="#9ca3af" />
              <Text className="text-sm text-typography-500">{unit.GroupName}</Text>
            </HStack>
          ) : null}
        </Box>

        <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4">
          <HStack className="mb-2 items-center justify-between">
            <Heading size="sm" className="text-typography-900">
              {t('units.status_info')}
            </Heading>
            {statusCapability.onBehalf ? (
              <Button size="sm" onPress={() => setIsStatusOpen(true)} testID="unit-detail-set-status">
                <ButtonText>{t('status.set_status')}</ButtonText>
              </Button>
            ) : null}
          </HStack>
          <CurrentStatusBadge text={unit.CurrentStatus} color={unit.CurrentStatusColor} baseType={unit.CurrentStatusBaseType} isPending={hasPending} showAvailability testID="unit-detail-status" />
          <Row label={t('units.destination')} value={unit.CurrentDestinationName || t('status.no_destination')} />
          <Row label={t('units.status_updated')} value={unit.CurrentStatusTimestampUtc ? safeFormatDate(unit.CurrentStatusTimestampUtc, 'MMM d, yyyy h:mm a') : null} />
          <Row label={t('units.note')} value={unit.Note} />
        </Box>

        <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4" testID="unit-detail-crew">
          <Heading size="sm" className="mb-2 text-typography-900">
            {t('units.crew')}
          </Heading>
          {crew.length === 0 ? <Text className="text-sm text-typography-500">{t('units.no_crew')}</Text> : crew.map((role) => <Row key={`${role.RoleId}-${role.UserId}`} label={role.RoleName} value={role.Name} />)}
        </Box>

        <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4">
          <Heading size="sm" className="mb-2 text-typography-900">
            {t('units.details')}
          </Heading>
          <Row label={t('units.plate_number')} value={unit.PlateNumber} />
          <Row label={t('units.vin')} value={unit.Vin} />
          <Row label={t('units.four_wheel_drive')} value={unit.FourWheelDrive ? t('units.yes') : null} />
          <Row label={t('units.special_permit')} value={unit.SpecialPermit ? t('units.yes') : null} />
        </Box>

        {hasPosition && renderMap ? <VStack className="mx-4 mt-4 h-56 overflow-hidden rounded-xl">{renderMap(unit)}</VStack> : null}
      </ScrollView>

      {statusCapability.onBehalf ? <UnitStatusSheet isOpen={isStatusOpen} onClose={() => setIsStatusOpen(false)} unitId={unit.UnitId} isOnBehalf /> : null}
    </View>
  );
}
