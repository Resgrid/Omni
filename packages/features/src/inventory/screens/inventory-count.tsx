import { selectUnitById, useInventoryStore, useUnitsStore } from '@resgrid/data';
import { useStatusContext } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { type InventoryCountLine, InventoryCountStatus } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, Loading, ScreenHeader, ScrollView, Text, useFormFactor, useToast, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Package } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ConfirmDialog } from '../components/confirm-dialog';
import { CountLineRow } from '../components/count-line-row';
import { contentOf, inventoryErrorKey, isComplete, locationNames, observedQuantity, orderLocations, pendingObservations, SAVE_COUNT_MAX_LINES, variances } from '../lib/count';
import { inventoryRoutes, readInventoryParam } from '../routes';

export interface InventoryCountScreenProps {
  countId?: string;
}

const NO_OBSERVED: Readonly<Record<string, number>> = {};

type Dialog = 'complete' | 'cancel' | null;

/**
 * One inventory count of the unit (`/inventory/count/[id]`): every position the unit should carry, compartment by
 * compartment. Entered values are kept on the device (they survive an app kill) and "Save progress" queues them through
 * the outbox, so counting works offline. Completing posts the differences to the ledger and needs the server (a missing
 * serialized item becomes Lost; controlled items wait for a witness on the web); cancelling too.
 */
export default function InventoryCountScreen({ countId: countIdProp }: InventoryCountScreenProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isElectron, isDesktop } = useFormFactor();
  const targetSize = isElectron || isDesktop ? 64 : 48;
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const countId = countIdProp ?? readInventoryParam(params.id);
  const { activeUnitId } = useStatusContext();
  const unitName = useUnitsStore((state) => (activeUnitId ? selectUnitById(state, activeUnitId)?.Name : undefined));
  const detail = useInventoryStore((state) => (countId ? state.countsById[countId] : undefined)) ?? null;
  const access = useInventoryStore((state) => (activeUnitId ? state.accessByUnit[activeUnitId] : undefined)) ?? null;
  const observed = useInventoryStore((state) => (countId ? state.observedByCount[countId] : undefined)) ?? NO_OBSERVED;
  const isLoading = useInventoryStore((state) => state.loading.count === true);
  const [busy, setBusy] = useState<'save' | 'complete' | 'cancel' | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const [settled, setSettled] = useState(false);
  const loadError = useInventoryStore((state) => state.errors.count ?? null);

  useEffect(() => {
    if (!countId) return undefined;
    let active = true;
    setSettled(false);
    void useInventoryStore
      .getState()
      .fetchCount(countId, { bypassCache: true })
      .finally(() => {
        if (active) setSettled(true);
      });
    return () => {
      active = false;
    };
  }, [countId]);

  const lines = useMemo(() => detail?.Lines ?? [], [detail?.Lines]);
  const unitLocations = useMemo(() => access?.UnitLocations ?? [], [access?.UnitLocations]);
  const names = useMemo(() => locationNames(unitLocations, t('inventory.unnamedLocation')), [t, unitLocations]);
  const grouped = useMemo(() => {
    const order = orderLocations(unitLocations).map((location) => location.Id);
    const groups: Record<string, InventoryCountLine[]> = {};
    lines.forEach((line) => (groups[line.LocationId] ??= []).push(line));
    Object.values(groups).forEach((rows) => rows.sort((a, b) => (contentOf(a.Content).ItemName ?? '').localeCompare(contentOf(b.Content).ItemName ?? '')));
    const rank = (id: string) => (order.indexOf(id) === -1 ? Number.MAX_SAFE_INTEGER : order.indexOf(id));
    return Object.entries(groups).sort(([a], [b]) => rank(a) - rank(b));
  }, [lines, unitLocations]);

  const status = detail?.Count.Status ?? null;
  const editable = status === InventoryCountStatus.Draft;
  const counted = lines.filter((line) => observedQuantity(line, observed) !== null).length;
  const differences = variances(lines, observed);
  const pending = pendingObservations(lines, observed);
  const complete = isComplete(lines, observed);

  const locationLabel = (locationId: string): string => {
    const location = unitLocations.find((candidate) => candidate.Id === locationId);
    return location?.IsRoot ? unitName || names[locationId] : (names[locationId] ?? t('inventory.unnamedLocation'));
  };

  const onChange = useCallback(
    (lineId: string, quantity: number) => {
      if (countId) useInventoryStore.getState().setObserved(countId, lineId, quantity);
    },
    [countId]
  );

  /** Queues the entered values (offline-capable); the newest save replaces an older queued one for this count. */
  const save = async (): Promise<'sent' | 'queued' | 'rejected' | 'nothing'> => {
    const current = countId ? useInventoryStore.getState().countsById[countId] : undefined;
    if (!countId || !current) return 'nothing';
    const lineSet = pendingObservations(current.Lines, useInventoryStore.getState().observedByCount[countId] ?? {});
    if (lineSet.length === 0) return 'nothing';
    const result = await useInventoryStore.getState().saveCount(countId, { CountId: countId, Revision: current.Count.Revision, Lines: lineSet.slice(0, SAVE_COUNT_MAX_LINES) });
    return result.outcome;
  };

  const handleSave = async () => {
    setBusy('save');
    const outcome = await save();
    setBusy(null);
    if (outcome === 'sent') toast.success(t('inventory.saved'));
    else if (outcome === 'queued') toast.info(t('inventory.saved_offline'));
    else if (outcome === 'rejected') toast.error(t('inventory.save_rejected'));
  };

  const handleComplete = async () => {
    if (!countId) return;
    setBusy('complete');
    try {
      const saved = await save();
      if (saved === 'queued' || saved === 'rejected') {
        toast.error(t(saved === 'queued' ? 'inventory.complete_needs_connection' : 'inventory.save_rejected'));
        return;
      }
      const current = useInventoryStore.getState().countsById[countId];
      if (!current) return;
      const result = await useInventoryStore.getState().completeCount({ CountId: countId, Revision: current.Count.Revision, RequestId: useInventoryStore.getState().completionIdFor(countId) });
      if (!result) {
        toast.error(t(inventoryErrorKey(useInventoryStore.getState().actionError), { defaultValue: t('inventory.errors.retry') }));
        return;
      }
      await useInventoryStore.getState().fetchCount(countId, { bypassCache: true });
      toast.success(t(result.AwaitingWitness ? 'inventory.awaitingWitness' : 'inventory.completed'));
    } finally {
      setBusy(null);
      setDialog(null);
    }
  };

  const handleCancel = async () => {
    const current = countId ? useInventoryStore.getState().countsById[countId] : undefined;
    if (!countId || !current) return;
    setBusy('cancel');
    const ok = await useInventoryStore.getState().cancelCount({ CountId: countId, Revision: current.Count.Revision });
    setBusy(null);
    setDialog(null);
    if (ok) {
      if (router.canGoBack()) router.back();
      else router.replace(inventoryRoutes.list());
    } else {
      toast.error(t(inventoryErrorKey(useInventoryStore.getState().actionError), { defaultValue: t('inventory.errors.retry') }));
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace(inventoryRoutes.list()));

  if (!detail) {
    return (
      <View className="flex-1 bg-background-0" testID="inventory-count-screen">
        <ScreenHeader title={t('inventory.count')} onBack={back} />
        {isLoading || (!!countId && !settled) ? (
          <Loading text={t('common.loading')} />
        ) : (
          <ZeroState
            icon={Package}
            isError={!!loadError}
            heading={t('inventory.count')}
            description={loadError ? t(inventoryErrorKey(loadError), { defaultValue: t('inventory.errors.retry') }) : undefined}
            testID="inventory-count-missing"
          />
        )}
      </View>
    );
  }

  const name = contentOf(detail.Count.Content).Name || t('inventory.count');

  return (
    <View className="flex-1 bg-background-0" testID="inventory-count-screen">
      <ScreenHeader title={name} onBack={back} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <VStack space="md">
          <Text className="text-typography-500" testID="inventory-count-summary">
            {[t(`inventory.countStatus.${detail.Count.Status}`), t('inventory.progress', { counted, total: lines.length }), t('inventory.differences', { count: differences.length })].join(' · ')}
          </Text>
          {editable && pending.length > 0 ? (
            <Text className="text-sm text-warning-700" testID="inventory-count-unsaved">
              {t('inventory.unsaved', { count: pending.length })}
            </Text>
          ) : null}
          {status === InventoryCountStatus.AwaitingWitness ? (
            <Text className="text-warning-600" testID="inventory-count-witness">
              {t('inventory.awaitingWitness')}
            </Text>
          ) : null}
          {status === InventoryCountStatus.Completed ? (
            <Text className="text-success-600" testID="inventory-count-completed">
              {t('inventory.completed')}
            </Text>
          ) : null}

          {grouped.map(([locationId, rows]) => (
            <VStack key={locationId} space="xs" testID={`inventory-count-location-${locationId}`}>
              <Text className="font-semibold text-typography-900">{locationLabel(locationId)}</Text>
              {rows.map((line) => (
                <CountLineRow key={line.Id} line={line} value={observedQuantity(line, observed)} editable={editable} onChange={onChange} targetSize={targetSize} />
              ))}
            </VStack>
          ))}

          {editable ? (
            <VStack space="sm">
              <Button variant="outline" onPress={() => void handleSave()} isDisabled={busy !== null || pending.length === 0} testID="inventory-save" style={{ minHeight: targetSize }}>
                {busy === 'save' ? <ButtonSpinner /> : <ButtonText>{t('inventory.save')}</ButtonText>}
              </Button>
              <Button action="positive" onPress={() => setDialog('complete')} isDisabled={busy !== null || !complete} testID="inventory-complete" style={{ minHeight: targetSize }}>
                <ButtonText>{t('inventory.complete')}</ButtonText>
              </Button>
              <Button variant="link" action="negative" onPress={() => setDialog('cancel')} isDisabled={busy !== null} testID="inventory-cancel">
                <ButtonText>{t('inventory.cancelCount')}</ButtonText>
              </Button>
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
      <ConfirmDialog
        isOpen={dialog === 'complete'}
        title={t('inventory.completeTitle')}
        message={differences.length > 0 ? t('inventory.completeBody', { count: differences.length }) : t('inventory.completeNoChanges')}
        confirmLabel={t('inventory.complete')}
        cancelLabel={t('inventory.cancel')}
        isBusy={busy === 'complete'}
        onCancel={() => setDialog(null)}
        onConfirm={() => void handleComplete()}
        testID="inventory-complete-dialog"
      />
      <ConfirmDialog
        isOpen={dialog === 'cancel'}
        title={t('inventory.cancelTitle')}
        message={t('inventory.cancelBody')}
        confirmLabel={t('inventory.cancelCount')}
        cancelLabel={t('inventory.keep')}
        destructive
        isBusy={busy === 'cancel'}
        onCancel={() => setDialog(null)}
        onConfirm={() => void handleCancel()}
        testID="inventory-cancel-dialog"
      />
    </View>
  );
}
