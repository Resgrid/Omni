import { useUnitsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, Heading, HStack, Pressable, Spinner, Text, useThemeColors, useToast, VStack } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { SettingsRow } from '../components/settings-row';
import { type ActiveUnitAdapter, getActiveUnitAdapter } from '../runtime';

const noActiveUnit = (): string | null => null;

/**
 * Unit's active-unit picker (Unit `unit-selection-bottom-sheet`): the department's units, fetched once per open (an empty
 * list is a real answer, not a reason to refetch), the current one checked; selecting one makes it active.
 */
export const UnitSelectionSheet: React.FC<{ isOpen: boolean; onClose: () => void; adapter: ActiveUnitAdapter }> = ({ isOpen, onClose, adapter }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const toast = useToast();
  const units = useUnitsStore((state) => state.units);
  const loading = useUnitsStore((state) => state.loading.units === true);
  const loadError = useUnitsStore((state) => state.errors.units ?? null);
  const fetched = useUnitsStore((state) => state.fetchedAt.units !== undefined);
  const fetchUnits = useUnitsStore((state) => state.fetchUnits);
  const activeUnitId = adapter.useActiveUnitId();
  const [selecting, setSelecting] = useState<string | null>(null);
  const processing = useRef(false);

  useEffect(() => {
    if (isOpen && !fetched && !loading) {
      void fetchUnits().catch(() => undefined);
    }
  }, [fetchUnits, fetched, isOpen, loading]);

  const select = useCallback(
    async (unitId: string, name: string) => {
      if (processing.current || unitId === activeUnitId) {
        onClose();
        return;
      }
      processing.current = true;
      setSelecting(unitId);
      try {
        await adapter.setActiveUnit(unitId);
        toast.success(t('settings.unit_selected_successfully', { unitName: name }));
        onClose();
      } catch {
        toast.error(t('settings.unit_selection_failed'));
      } finally {
        processing.current = false;
        setSelecting(null);
      }
    },
    [activeUnitId, adapter, onClose, t, toast]
  );

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[70]} testID="unit-selection-sheet">
      <VStack space="sm" className="w-full" accessibilityRole="radiogroup" accessibilityLabel={t('settings.select_unit')}>
        <Heading size="md" accessibilityRole="header">
          {t('settings.select_unit')}
        </Heading>
        {loading && units.length === 0 ? <Spinner /> : null}
        {!loading && loadError && units.length === 0 ? (
          <VStack space="sm">
            <Text testID="unit-selection-error">{t('settings.units_load_failed')}</Text>
            <Button variant="outline" action="secondary" onPress={() => void fetchUnits({ bypassCache: true }).catch(() => undefined)} accessibilityLabel={t('common.retry')}>
              <ButtonText>{t('common.retry')}</ButtonText>
            </Button>
          </VStack>
        ) : null}
        {!loading && !loadError && fetched && units.length === 0 ? <Text testID="unit-selection-empty">{t('settings.no_units_available_help')}</Text> : null}
        {units.map((unit) => {
          const isActive = unit.UnitId === activeUnitId;
          return (
            <Pressable
              key={unit.UnitId}
              onPress={() => void select(unit.UnitId, unit.Name)}
              disabled={selecting !== null}
              accessibilityRole="radio"
              accessibilityState={{ checked: isActive, disabled: selecting !== null }}
              accessibilityLabel={unit.Type ? `${unit.Name}, ${unit.Type}` : unit.Name}
              testID={`unit-item-${unit.UnitId}`}
              className={`rounded-lg px-3 py-3 ${isActive ? 'bg-background-100' : ''}`}
            >
              <HStack className="items-center justify-between">
                <VStack className="flex-1">
                  <Text className={isActive ? 'font-semibold' : ''}>{unit.Name}</Text>
                  {unit.Type ? (
                    <Text size="sm" className="text-typography-500">
                      {unit.Type}
                    </Text>
                  ) : null}
                </VStack>
                {selecting === unit.UnitId ? <Spinner size="small" /> : null}
                {isActive && selecting === null ? (
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Check size={20} color={colors.primary} />
                  </View>
                ) : null}
              </HStack>
            </Pressable>
          );
        })}
      </VStack>
    </CustomBottomSheet>
  );
};

/** Unit: the active unit (capabilities.status.subject 'unit'). Needs the shell's active-unit adapter (`configureSettings`). */
export const UnitSection: React.FC = () => {
  const { t } = useTranslation();
  const adapter = getActiveUnitAdapter();
  const useActiveUnitId = adapter?.useActiveUnitId ?? noActiveUnit;
  const activeUnitId = useActiveUnitId();
  const activeUnitName = useUnitsStore((state) => state.units.find((unit) => unit.UnitId === activeUnitId)?.Name ?? null);
  const [open, setOpen] = useState(false);
  const value = activeUnitId ? (activeUnitName ?? t('common.unknown')) : t('settings.none_selected');

  return (
    <>
      <SettingsRow label={t('settings.active_unit')} value={value} onPress={adapter ? () => setOpen(true) : undefined} isDisabled={!adapter} testID="settings-active-unit" />
      {adapter ? <UnitSelectionSheet isOpen={open} onClose={() => setOpen(false)} adapter={adapter} /> : null}
    </>
  );
};
