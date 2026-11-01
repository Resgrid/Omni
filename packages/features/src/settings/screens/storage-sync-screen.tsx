import { ConfirmDialog } from '@resgrid/features/auth-ui';
import { useTranslation } from '@resgrid/i18n';
import type { OutboxItemView, StorageDiagnostics, StorageReport } from '@resgrid/offline';
import { Box, Button, ButtonSpinner, ButtonText, Heading, HStack, RefreshControl, ScrollView, Spinner, Text, useFormFactor, useToast, VStack } from '@resgrid/ui';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useState } from 'react';

import { SettingsCard, SettingsRow } from '../components/settings-row';
import { type SyncNowOutcome, useStorageSync } from '../hooks/use-storage-sync';
import { ageParts, formatBytes } from '../lib/format';

type Confirmation = { kind: 'discard'; item: OutboxItemView } | { kind: 'clear-cached' } | { kind: 'clear-all'; unsent: number } | null;

const typeKey = (type: string): string => `storage_sync.types.${type.replace(/[^a-zA-Z0-9]+/g, '_')}`;

/** The member-facing state of a queued change: stuck and awaiting-confirmation win over the raw outbox state. */
const itemStateKey = (item: OutboxItemView): string => (item.awaitingConfirmation ? 'storage_sync.state.awaiting_confirmation' : item.stuck ? 'storage_sync.state.stuck' : `storage_sync.state.${item.state}`);

const canRetry = (item: OutboxItemView): boolean => item.state === 'failed' || item.state === 'dead' || item.stuck;

const PendingItem: React.FC<{ item: OutboxItemView; busy: boolean; onRetry: () => void; onConfirm: () => void; onDiscard: () => void }> = ({ item, busy, onRetry, onConfirm, onDiscard }) => {
  const { t } = useTranslation();
  const age = ageParts(item.ageMs);
  const error = item.lastError ? (item.lastError.code ?? (item.lastError.status ? `HTTP ${item.lastError.status}` : item.lastError.message)) : null;
  const typeLabel = t(typeKey(item.type), { defaultValue: item.type });
  return (
    <Box className="rounded-lg border border-outline-200 p-3" testID={`storage-item-${item.id}`}>
      <VStack space="xs">
        <HStack className="items-center justify-between" space="sm">
          <Text className="flex-1 font-semibold">{typeLabel}</Text>
          <Text size="xs" className={item.state === 'dead' || item.state === 'failed' || item.stuck ? 'text-error-600' : 'text-typography-500'} testID={`storage-item-${item.id}-state`}>
            {t(itemStateKey(item))}
          </Text>
        </HStack>
        <Text size="xs" className="text-typography-500" testID={`storage-item-${item.id}-meta`}>
          {t(`storage_sync.age.${age.key}`, { count: age.count })} · {t('storage_sync.attempts', { count: item.attempts })}
        </Text>
        {error ? (
          <Text size="xs" className="text-error-600" numberOfLines={2} testID={`storage-item-${item.id}-error`}>
            {t('storage_sync.last_error', { error: error.slice(0, 120) })}
          </Text>
        ) : null}
        <HStack space="sm" className="mt-1">
          {canRetry(item) ? (
            <Button size="xs" variant="outline" action="secondary" onPress={onRetry} isDisabled={busy} accessibilityLabel={t('storage_sync.retry_item', { type: typeLabel })} testID={`storage-item-${item.id}-retry`}>
              <ButtonText>{t('common.retry')}</ButtonText>
            </Button>
          ) : null}
          {item.awaitingConfirmation ? (
            <Button size="xs" action="primary" onPress={onConfirm} isDisabled={busy} accessibilityLabel={t('storage_sync.send_item', { type: typeLabel })} testID={`storage-item-${item.id}-confirm`}>
              <ButtonText>{t('storage_sync.send')}</ButtonText>
            </Button>
          ) : null}
          <Button size="xs" variant="outline" action="negative" onPress={onDiscard} isDisabled={busy} accessibilityLabel={t('storage_sync.discard_item', { type: typeLabel })} testID={`storage-item-${item.id}-discard`}>
            <ButtonText>{t('storage_sync.discard')}</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
};

const SizesCard: React.FC<{ report: StorageReport }> = ({ report }) => {
  const { t } = useTranslation();
  const size = (bytes: number | null) => formatBytes(bytes) ?? t('storage_sync.unknown_size');
  const { sizes, budget } = report;
  return (
    <SettingsCard title={t('storage_sync.sizes_title')} testID="storage-sizes">
      <SettingsRow label={t('storage_sync.size.database')} value={size(sizes.databaseBytes)} testID="storage-size-database" />
      <SettingsRow label={t('storage_sync.size.cached')} value={size(sizes.cachedDataBytes)} testID="storage-size-cached" />
      <SettingsRow label={t('storage_sync.size.queued')} value={size(sizes.outboxBytes)} testID="storage-size-queued" />
      <SettingsRow label={t('storage_sync.size.attachments')} value={size(sizes.attachmentsBytes)} testID="storage-size-attachments" />
      <SettingsRow label={t('storage_sync.size.map_packs')} value={size(sizes.mapPacksBytes)} testID="storage-size-map-packs" />
      <SettingsRow label={t('storage_sync.size.settings')} value={size(sizes.keyValueBytes)} testID="storage-size-settings" />
      <SettingsRow label={t('storage_sync.size.free_space')} value={size(sizes.freeDeviceBytes)} testID="storage-size-free" />
      {budget.budgetBytes !== null ? (
        <Text size="xs" className={`px-1 ${budget.overBudget ? 'text-warning-700' : 'text-typography-500'}`} testID="storage-budget">
          {t(budget.overBudget ? 'storage_sync.over_budget' : 'storage_sync.budget', { used: size(budget.usedBytes), budget: size(budget.budgetBytes) })}
        </Text>
      ) : null}
    </SettingsCard>
  );
};

const formatTime = (value: number | null, never: string): string => (value ? new Date(value).toLocaleString() : never);

/**
 * Settings → Advanced → Storage & sync, for every variant (plan §8.2a; replaces IC's offline-queue screen): sizes by area
 * and free space; queued, failed and stuck changes (type, age, attempts, last error) with Retry, Retry all and Discard
 * (confirmed); last sync and hydration with "Sync now"; Clear cached data (keeps the session and unsent changes); Clear all
 * local data (warns with the unsent count, then wipes and signs out); and a copyable diagnostics summary with counts and
 * sizes only — no record content, ids or protected values.
 */
export function StorageSyncScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { isPhone } = useFormFactor();
  const storage = useStorageSync();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [syncOutcome, setSyncOutcome] = useState<SyncNowOutcome | null>(null);
  const [diagnostics, setDiagnostics] = useState<StorageDiagnostics | null>(null);
  const [copied, setCopied] = useState(false);
  const { report } = storage;

  const run = useCallback(async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  }, []);

  const retry = (item: OutboxItemView) => void run(`retry:${item.id}`, async () => void (await storage.retry(item.id)));
  const confirmSend = (item: OutboxItemView) => void run(`confirm:${item.id}`, async () => void (await storage.confirm(item.id)));
  const retryAll = () =>
    void run('retry-all', async () => {
      const count = await storage.retryAll();
      toast.info(t('storage_sync.retry_all_started', { count }));
    });
  const syncNow = () =>
    void run('sync', async () => {
      setSyncOutcome(null);
      setSyncOutcome(await storage.syncNow());
    });

  const askClearAll = () =>
    void run('prepare-clear-all', async () => {
      setConfirmation({ kind: 'clear-all', unsent: await storage.prepareClearAll() });
    });

  const confirmAction = () => {
    const current = confirmation;
    if (!current) {
      return;
    }
    void run(current.kind, async () => {
      try {
        if (current.kind === 'discard') {
          await storage.discard(current.item.id);
          toast.success(t('storage_sync.discarded'));
        } else if (current.kind === 'clear-cached') {
          await storage.clearCachedData();
          toast.success(t('storage_sync.cache_cleared'));
        } else {
          await storage.clearAllLocalData();
        }
      } catch {
        toast.error(t('storage_sync.action_failed'));
      } finally {
        setConfirmation(null);
      }
    });
  };

  const showDiagnostics = () =>
    void run('diagnostics', async () => {
      setCopied(false);
      setDiagnostics(await storage.diagnostics());
    });

  const diagnosticsText = diagnostics ? JSON.stringify(diagnostics, null, 2) : '';
  const copyDiagnostics = async () => {
    await Clipboard.setStringAsync(diagnosticsText);
    setCopied(true);
  };

  const items = report?.items ?? [];
  const dialogBusy = busy !== null && busy !== 'prepare-clear-all';
  const retryable = items.filter(canRetry).length;
  const confirmationText =
    confirmation?.kind === 'discard'
      ? { title: t('storage_sync.discard_title'), message: t('storage_sync.discard_message'), confirm: t('storage_sync.discard') }
      : confirmation?.kind === 'clear-cached'
        ? { title: t('storage_sync.clear_cached_title'), message: t('storage_sync.clear_cached_message'), confirm: t('storage_sync.clear_cached') }
        : confirmation?.kind === 'clear-all'
          ? {
              title: t('storage_sync.clear_all_title'),
              message: confirmation.unsent > 0 ? t('storage_sync.clear_all_message_unsent', { count: confirmation.unsent }) : t('storage_sync.clear_all_message'),
              confirm: t('storage_sync.clear_all'),
            }
          : null;

  return (
    <>
      <ScrollView
        className="flex-1 bg-background-50"
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={storage.loading} onRefresh={() => void storage.refresh()} />}
        testID="storage-sync-screen"
      >
        <VStack className={`w-full self-center ${isPhone ? '' : 'max-w-3xl'}`}>
          <Heading size="xl" className="mb-4" accessibilityRole="header">
            {t('storage_sync.title')}
          </Heading>

          {!storage.available ? (
            <Text testID="storage-unavailable">{t('storage_sync.unavailable')}</Text>
          ) : (
            <>
              {report ? <SizesCard report={report} /> : storage.loading ? <Spinner size="large" /> : null}
              {storage.failed && !report ? <Text className="mb-4 text-error-600">{t('storage_sync.report_failed')}</Text> : null}

              <SettingsCard title={t('storage_sync.pending_title')} testID="storage-pending">
                <Text size="sm" className="px-1" testID="storage-pending-summary">
                  {t('storage_sync.pending_summary', { unsent: report?.pending.unsent ?? 0, failed: (report?.pending.failed ?? 0) + (report?.pending.dead ?? 0), stuck: report?.pending.stuck ?? 0 })}
                </Text>
                {report && report.pending.held > 0 ? (
                  <Text size="xs" className="px-1 text-typography-500" testID="storage-pending-held">
                    {t('storage_sync.held', { count: report.pending.held })}
                  </Text>
                ) : null}
                {items.length === 0 ? (
                  <Text size="sm" className="px-1 text-typography-500" testID="storage-pending-empty">
                    {t('storage_sync.no_pending')}
                  </Text>
                ) : (
                  <VStack space="sm" className="mt-2">
                    {items.map((item) => (
                      <PendingItem key={item.id} item={item} busy={busy !== null} onRetry={() => retry(item)} onConfirm={() => confirmSend(item)} onDiscard={() => setConfirmation({ kind: 'discard', item })} />
                    ))}
                  </VStack>
                )}
                {retryable > 0 ? (
                  <Button action="primary" className="mt-2" onPress={retryAll} isDisabled={busy !== null} accessibilityLabel={t('storage_sync.retry_all')} testID="storage-retry-all">
                    {busy === 'retry-all' ? <ButtonSpinner /> : <ButtonText>{t('storage_sync.retry_all')}</ButtonText>}
                  </Button>
                ) : null}
              </SettingsCard>

              <SettingsCard title={t('storage_sync.sync_title')} testID="storage-sync">
                <SettingsRow label={t('storage_sync.last_sync')} value={formatTime(report?.lastSyncAt ?? null, t('storage_sync.never'))} testID="storage-last-sync" />
                <SettingsRow label={t('storage_sync.last_hydration')} value={formatTime(report?.lastHydrationAt ?? null, t('storage_sync.never'))} testID="storage-last-hydration" />
                <SettingsRow label={t('storage_sync.last_maintenance')} value={formatTime(report?.lastMaintenanceAt ?? null, t('storage_sync.never'))} testID="storage-last-maintenance" />
                {syncOutcome ? (
                  <Text size="sm" className={`px-1 ${syncOutcome === 'synced' ? 'text-success-600' : 'text-warning-700'}`} accessibilityLiveRegion="polite" testID="storage-sync-outcome">
                    {t(`storage_sync.sync_${syncOutcome}`)}
                  </Text>
                ) : null}
                <Button action="primary" className="mt-2" onPress={syncNow} isDisabled={busy !== null} accessibilityLabel={t('storage_sync.sync_now')} testID="storage-sync-now">
                  {busy === 'sync' ? <ButtonSpinner /> : <ButtonText>{t('storage_sync.sync_now')}</ButtonText>}
                </Button>
              </SettingsCard>

              <SettingsCard title={t('storage_sync.clear_title')} testID="storage-clear">
                <Text size="sm" className="px-1 text-typography-600">
                  {t('storage_sync.clear_cached_description')}
                </Text>
                <Button
                  variant="outline"
                  action="secondary"
                  onPress={() => setConfirmation({ kind: 'clear-cached' })}
                  isDisabled={busy !== null}
                  accessibilityLabel={t('storage_sync.clear_cached')}
                  testID="storage-clear-cached"
                >
                  <ButtonText>{t('storage_sync.clear_cached')}</ButtonText>
                </Button>
                <Text size="sm" className="mt-3 px-1 text-typography-600">
                  {t('storage_sync.clear_all_description')}
                </Text>
                <Button variant="outline" action="negative" onPress={askClearAll} isDisabled={busy !== null} accessibilityLabel={t('storage_sync.clear_all')} testID="storage-clear-all">
                  {busy === 'prepare-clear-all' ? <ButtonSpinner /> : <ButtonText>{t('storage_sync.clear_all')}</ButtonText>}
                </Button>
              </SettingsCard>

              <SettingsCard title={t('storage_sync.diagnostics_title')} testID="storage-diagnostics">
                <Text size="sm" className="px-1 text-typography-600">
                  {t('storage_sync.diagnostics_description')}
                </Text>
                {diagnostics ? (
                  <>
                    <Box className="rounded-md bg-background-100 p-2">
                      <Text selectable className="font-mono text-xs" testID="storage-diagnostics-text">
                        {diagnosticsText}
                      </Text>
                    </Box>
                    <Button variant="outline" action="secondary" onPress={() => void copyDiagnostics()} accessibilityLabel={t('storage_sync.copy_diagnostics')} testID="storage-diagnostics-copy">
                      <ButtonText>{copied ? t('storage_sync.copied') : t('storage_sync.copy_diagnostics')}</ButtonText>
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" action="secondary" onPress={showDiagnostics} isDisabled={busy !== null} accessibilityLabel={t('storage_sync.show_diagnostics')} testID="storage-diagnostics-show">
                    <ButtonText>{t('storage_sync.show_diagnostics')}</ButtonText>
                  </Button>
                )}
              </SettingsCard>
            </>
          )}
        </VStack>
      </ScrollView>
      <ConfirmDialog
        isOpen={confirmationText !== null}
        title={confirmationText?.title ?? ''}
        message={confirmationText?.message ?? ''}
        confirmLabel={confirmationText?.confirm ?? ''}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmAction}
        onCancel={() => setConfirmation(null)}
        destructive
        isBusy={dialogBusy}
        testID="storage-confirm"
      />
    </>
  );
}

export default StorageSyncScreen;
