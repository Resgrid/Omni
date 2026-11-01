import { TermKeys, useTerm } from '@resgrid/auth';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { generateDataId, selectUnitById, useInventoryStore, useUnitsStore } from '@resgrid/data';
import { useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { InventoryAssetStatus, type InventoryCount, type InventoryCountDetail, InventoryCountStatus, type InventoryEquipment, type InventoryFieldLocation } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Loading, Pressable, RefreshControl, ScrollView, Text, useFormFactor, useToast, View, VStack, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Package } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { contentOf, groupEquipment, inventoryErrorKey, locationNames, orderLocations, todayKey } from '../lib/count';
import { inventoryRoutes } from '../routes';

const NO_EQUIPMENT: InventoryEquipment[] = [];
const NO_COUNTS: InventoryCount[] = [];
const NO_LOCATIONS: InventoryFieldLocation[] = [];
/** Recent counts shown on the screen (the store keeps a few more). */
const RECENT_COUNTS_SHOWN = 10;

const isNeedsAttention = (status: number | null): boolean => status !== null && status !== InventoryAssetStatus.InService && status !== InventoryAssetStatus.Issued;

/**
 * The active unit's inventory (`/inventory`): what it carries, compartment by compartment, the recent counts and Start
 * count for crews with Adjust Inventory at the unit. Reads the persisted store first, so it works offline; starting a
 * count needs the server (it snapshots the expected quantities).
 */
export default function InventoryHomeScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { isElectron, isDesktop } = useFormFactor();
  const targetSize = isElectron || isDesktop ? 64 : 48;
  const { activeUnitId } = useStatusContext();
  const unit = useUnitsStore((state) => (activeUnitId ? selectUnitById(state, activeUnitId) : undefined));
  const access = useInventoryStore((state) => (activeUnitId ? state.accessByUnit[activeUnitId] : undefined)) ?? null;
  const equipment = useInventoryStore((state) => (activeUnitId ? state.equipmentByUnit[activeUnitId] : undefined)) ?? NO_EQUIPMENT;
  const counts = useInventoryStore((state) => (activeUnitId ? state.countsByUnit[activeUnitId] : undefined)) ?? NO_COUNTS;
  const drafts = useInventoryStore((state) => state.observedByCount);
  const isLoading = useInventoryStore((state) => state.loading.access === true || state.loading.equipment === true);
  const loadError = useInventoryStore((state) => state.errors.access ?? state.errors.equipment ?? null);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const renamed = useTerm(TermKeys.Inventory, '');
  const title = renamed || t('inventory.title');
  const heading = unit?.Name ? (renamed ? `${renamed} · ${unit.Name}` : t('inventory.titleFor', { name: unit.Name })) : title;

  const locations = useMemo(() => orderLocations(access?.UnitLocations ?? NO_LOCATIONS), [access?.UnitLocations]);
  const names = useMemo(() => locationNames(locations, t('inventory.unnamedLocation')), [locations, t]);
  const groups = useMemo(() => groupEquipment(equipment, t('inventory.unnamedItem')), [equipment, t]);
  const root = locations.find((location) => location.IsRoot) ?? null;
  const writable = !!access?.Enabled && !!access.Migrated;
  const selected = selectedLocation || root?.Id || locations[0]?.Id || '';
  const labelOf = useCallback((location: InventoryFieldLocation) => (location.IsRoot ? unit?.Name || names[location.Id] : names[location.Id]), [names, unit?.Name]);
  const locationIdsKey = locations.map((location) => location.Id).join('|');

  const load = useCallback(
    async (bypassCache: boolean) => {
      if (!activeUnitId) return;
      const store = useInventoryStore.getState();
      await Promise.all([store.fetchAccess(activeUnitId, { bypassCache }), store.fetchEquipment(activeUnitId, { bypassCache })]);
      if (!useUnitsStore.getState().units.length) void useUnitsStore.getState().fetchUnits();
    },
    [activeUnitId]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  // Counts are listed only to people who may run them.
  useEffect(() => {
    if (activeUnitId && access?.CanCount && locationIdsKey) void useInventoryStore.getState().fetchCounts(activeUnitId, locationIdsKey.split('|'));
  }, [access?.CanCount, activeUnitId, locationIdsKey]);

  const refresh = async () => {
    setIsRefreshing(true);
    await load(true);
    if (activeUnitId && access?.CanCount && locationIdsKey) await useInventoryStore.getState().fetchCounts(activeUnitId, locationIdsKey.split('|'));
    setIsRefreshing(false);
  };

  const start = async () => {
    const location = locations.find((candidate) => candidate.Id === selected);
    if (!location || isStarting) return;
    setIsStarting(true);
    const detail: InventoryCountDetail | null = await useInventoryStore.getState().startCount({
      Id: generateDataId(),
      LocationId: location.Id,
      Name: t('inventory.countName', { name: labelOf(location), date: todayKey() }),
      Note: null,
      // A field count covers this location and its compartments only; padding in the whole catalog would exceed the 100-line limit.
      IncludeCatalogItems: false,
      IncludeChildLocations: true,
    });
    setIsStarting(false);
    if (detail) {
      if (activeUnitId) void useInventoryStore.getState().fetchCounts(activeUnitId, locationIdsKey.split('|'));
      router.push(inventoryRoutes.count(detail.Count.Id));
      return;
    }
    toast.error(t(inventoryErrorKey(useInventoryStore.getState().actionError), { defaultValue: t('inventory.errors.retry') }));
  };

  if (!activeUnitId) {
    return (
      <View className="flex-1 bg-background-0" testID="inventory-home-screen">
        <ZeroState icon={Package} heading={title} description={t('inventory.selectUnit')} testID="inventory-no-unit" />
      </View>
    );
  }

  if (!access && isLoading) {
    return (
      <View className="flex-1 bg-background-0" testID="inventory-home-screen">
        <Loading text={t('common.loading')} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background-0" testID="inventory-home-screen">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}>
        <VStack space="md">
          <Text className="text-xl font-bold text-typography-900" accessibilityRole="header" testID="inventory-heading">
            {heading}
          </Text>
          {loadError ? (
            <Text accessibilityRole="alert" className="text-error-600" testID="inventory-error">
              {t(inventoryErrorKey(loadError), { defaultValue: t('inventory.errors.retry') })}
            </Text>
          ) : null}
          {access && !writable ? <Text className="text-typography-500">{access.Enabled ? t('inventory.notMigrated') : t('inventory.disabled')}</Text> : null}
          {access && writable && locations.length === 0 ? <Text className="text-typography-500">{t('inventory.noLocations')}</Text> : null}

          {access?.CanCount && writable && locations.length > 0 ? (
            <VStack space="sm" className="rounded-lg border border-outline-200 p-3" testID="inventory-start-count">
              <Text className="font-semibold text-typography-900">{t('inventory.startCount')}</Text>
              {locations.length > 1 ? (
                <VStack space="xs" accessibilityLabel={t('inventory.pickLocation')}>
                  {locations.map((location) => {
                    const isSelected = location.Id === selected;
                    return (
                      <Pressable
                        key={location.Id}
                        onPress={() => setSelectedLocation(location.Id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        testID={`inventory-location-option-${location.Id}`}
                        className={`justify-center rounded-lg border px-3 ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-outline-200 bg-background-0'}`}
                        style={{ minHeight: targetSize }}
                      >
                        <Text className={isSelected ? 'font-semibold text-primary-700' : 'text-typography-900'}>{location.IsRoot ? t('inventory.wholeUnit', { name: labelOf(location) }) : labelOf(location)}</Text>
                      </Pressable>
                    );
                  })}
                </VStack>
              ) : null}
              <Text className="text-sm text-typography-500">{t('inventory.startHelp')}</Text>
              <Button onPress={() => void start()} isDisabled={isStarting || !selected} testID="inventory-start" style={{ minHeight: targetSize }}>
                {isStarting ? <ButtonSpinner /> : <ButtonText>{t('inventory.start')}</ButtonText>}
              </Button>
            </VStack>
          ) : null}
          {access && writable && !access.CanCount && locations.length > 0 ? <Text className="text-typography-500">{t('inventory.cannotCount')}</Text> : null}

          {counts.length > 0 ? (
            <VStack space="xs">
              <Text className="font-semibold text-typography-900">{t('inventory.counts')}</Text>
              {counts.slice(0, RECENT_COUNTS_SHOWN).map((count) => {
                const unsaved = Object.keys(drafts[count.Id] ?? {}).length;
                const when = formatUtcInDepartmentTime(count.CompletedOn ?? count.SnapshotOn, null);
                return (
                  <Pressable
                    key={count.Id}
                    onPress={() => router.push(inventoryRoutes.count(count.Id))}
                    accessibilityRole="button"
                    testID={`inventory-count-${count.Id}`}
                    className="rounded-lg border border-outline-200 p-3"
                    style={{ minHeight: targetSize }}
                  >
                    <HStack className="items-center">
                      <Text className="flex-1 text-typography-900">{contentOf(count.Content).Name || t('inventory.count')}</Text>
                      <Text className={count.Status === InventoryCountStatus.Draft ? 'text-primary-600' : 'text-typography-500'}>{t(`inventory.countStatus.${count.Status}`)}</Text>
                    </HStack>
                    {when ? <Text className="text-sm text-typography-500">{when}</Text> : null}
                    {unsaved > 0 ? (
                      <Text className="text-xs text-warning-700" testID={`inventory-count-${count.Id}-unsaved`}>
                        {t('inventory.unsaved', { count: unsaved })}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </VStack>
          ) : null}

          {locations.map((location) => {
            const rows = groups[location.Id] ?? [];
            return (
              <VStack key={location.Id} space="xs" testID={`inventory-location-${location.Id}`}>
                <Text className="font-semibold text-typography-900">{labelOf(location)}</Text>
                {rows.length === 0 ? <Text className="text-typography-500">{t('inventory.empty')}</Text> : null}
                {rows.map((row) => (
                  <HStack key={row.key} className="items-center border-b border-outline-100 py-2" testID={`inventory-item-${row.key}`}>
                    <VStack className="flex-1">
                      <Text className="text-typography-900">{row.name}</Text>
                      {row.serial ? <Text className="text-sm text-typography-500">{t('inventory.serial', { serial: row.serial })}</Text> : null}
                    </VStack>
                    <Text className={isNeedsAttention(row.assetStatus) ? 'text-warning-600' : 'text-typography-600'}>
                      {row.assetStatus !== null ? t(`inventory.assetStatus.${row.assetStatus}`) : t('inventory.quantity', { quantity: row.quantity })}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            );
          })}
        </VStack>
      </ScrollView>
    </View>
  );
}
