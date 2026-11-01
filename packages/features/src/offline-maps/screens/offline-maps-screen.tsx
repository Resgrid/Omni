import { ConfirmDialog } from '@resgrid/features/auth-ui';
import { useTranslation } from '@resgrid/i18n';
import { isOfflineMapPacksSupported, type OfflineMapsController, type OfflineMapsState } from '@resgrid/maps/offline';
import { Box, Button, ButtonSpinner, ButtonText, Heading, HStack, Progress, ProgressFilledTrack, RefreshControl, ScrollView, Spinner, Switch, Text, useFormFactor, useToast, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useOfflineMapsController, useOfflineMapsState } from '../hooks/use-offline-maps';
import { buildContentRows, type ContentRow, errorKey, formatBytes, packStateKey, statusKey } from '../lib/present';

type BusyAction = 'refresh' | 'download' | 'delete' | null;

const Card: React.FC<{ title: string; children: React.ReactNode; testID?: string }> = ({ title, children, testID }) => (
  <Box className="mb-4 rounded-lg border border-outline-200 bg-background-0 p-4" testID={testID}>
    <Heading size="sm" className="mb-2" accessibilityRole="header">
      {title}
    </Heading>
    <VStack space="xs">{children}</VStack>
  </Box>
);

const InfoRow: React.FC<{ label: string; value: string; testID?: string }> = ({ label, value, testID }) => (
  <View accessible accessibilityLabel={`${label}, ${value}`} testID={testID}>
    <HStack className="items-center justify-between py-1" space="md">
      <Text className="flex-1 text-typography-700">{label}</Text>
      <Text className="text-right text-typography-900">{value}</Text>
    </HStack>
  </View>
);

const Message: React.FC<{ text: string; testID: string }> = ({ text, testID }) => (
  <Box className="rounded-lg border border-outline-200 bg-background-0 p-4" testID={testID}>
    <Text>{text}</Text>
  </Box>
);

const ContentItem: React.FC<{ row: ContentRow }> = ({ row }) => {
  const { t } = useTranslation();
  const label = row.labelKey ? t(row.labelKey) : (row.name ?? '');
  const detail = row.detailKey ? (row.detailCount !== null ? t(row.detailKey, { count: row.detailCount }) : t(row.detailKey)) : null;
  const size = formatBytes(row.sizeBytes);
  const stateText = row.state === 'rejected' && row.code ? t(errorKey(row.code)) : t(packStateKey(row.state));
  const warn = row.state === 'rejected' || row.state === 'failed';
  return (
    <View accessible accessibilityLabel={[label, detail, size, stateText].filter((part) => part).join(', ')} testID={`offline-maps-item-${row.id}`}>
      <HStack className="items-center justify-between py-2" space="md">
        <VStack className="flex-1">
          <Text className="text-typography-900">{label}</Text>
          {detail ? (
            <Text size="xs" className="text-typography-500">
              {detail}
            </Text>
          ) : null}
        </VStack>
        <VStack className="max-w-[55%] items-end">
          {size ? <Text className="text-typography-600">{size}</Text> : null}
          <Text size="xs" className={warn ? 'text-right text-error-600' : 'text-right text-typography-500'} testID={`offline-maps-item-${row.id}-state`}>
            {stateText}
          </Text>
        </VStack>
      </HStack>
    </View>
  );
};

const formatTime = (value: number | null, never: string): string => (value ? new Date(value).toLocaleString() : never);

const Actions: React.FC<{ state: OfflineMapsState; busy: BusyAction; onDownload: () => void; onStop: () => void; onRefresh: () => void; onDelete: () => void }> = ({
  state,
  busy,
  onDownload,
  onStop,
  onRefresh,
  onDelete,
}) => {
  const { t } = useTranslation();
  const downloading = state.status === 'downloading';
  const canDownload = state.updateAvailable && state.status !== 'checking';
  const hasFiles = state.isInstalled || state.installedBytes > 0;
  return (
    <VStack space="sm" className="mb-4">
      {downloading ? (
        <Button action="secondary" variant="outline" onPress={onStop} accessibilityLabel={t('offline_maps.stop')} testID="offline-maps-stop">
          <ButtonText>{t('offline_maps.stop')}</ButtonText>
        </Button>
      ) : canDownload ? (
        <Button action="primary" onPress={onDownload} isDisabled={busy !== null} accessibilityLabel={state.isInstalled ? t('offline_maps.update') : t('offline_maps.download')} testID="offline-maps-download">
          {busy === 'download' ? <ButtonSpinner /> : <ButtonText>{state.isInstalled ? t('offline_maps.update') : t('offline_maps.download')}</ButtonText>}
        </Button>
      ) : null}
      {downloading ? null : (
        <Button action="secondary" variant="outline" onPress={onRefresh} isDisabled={busy !== null || state.status === 'checking'} accessibilityLabel={t('offline_maps.check')} testID="offline-maps-refresh">
          {busy === 'refresh' || state.status === 'checking' ? <ButtonSpinner /> : <ButtonText>{t('offline_maps.check')}</ButtonText>}
        </Button>
      )}
      {hasFiles && !downloading ? (
        <Button action="negative" variant="outline" onPress={onDelete} isDisabled={busy !== null} accessibilityLabel={t('offline_maps.delete')} testID="offline-maps-delete">
          <ButtonText>{t('offline_maps.delete')}</ButtonText>
        </Button>
      ) : null}
    </VStack>
  );
};

const StatusCard: React.FC<{ state: OfflineMapsState }> = ({ state }) => {
  const { t } = useTranslation();
  const size = (bytes: number | null) => formatBytes(bytes) ?? t('offline_maps.unknown_size');
  const progress = state.status === 'downloading' ? state.progress : null;
  const percent = progress ? Math.round(progress.fraction * 100) : 0;
  return (
    <Card title={t('offline_maps.status_title')} testID="offline-maps-status-card">
      <Text className="font-semibold" testID="offline-maps-status">
        {t(statusKey(state))}
      </Text>
      {progress ? (
        <VStack space="xs" className="py-1" testID="offline-maps-progress">
          <Progress value={percent} size="sm" accessibilityLabel={`${t('offline_maps.status.downloading')} ${percent}%`}>
            <ProgressFilledTrack />
          </Progress>
          <Text size="xs" className="text-typography-600" testID="offline-maps-progress-text">
            {t('offline_maps.progress', { completed: size(progress.completedBytes), total: size(progress.totalBytes) })} · {percent}%
          </Text>
          {progress.currentName ? (
            <Text size="xs" className="text-typography-500" numberOfLines={1}>
              {t('offline_maps.progress_item', { name: progress.currentName, index: Math.min(progress.itemIndex + 1, progress.itemCount), count: progress.itemCount })}
            </Text>
          ) : null}
        </VStack>
      ) : null}
      {state.error ? (
        <Text size="sm" className="text-error-600" testID="offline-maps-error">
          {t(errorKey(state.error))}
        </Text>
      ) : null}
      {state.stale ? (
        <Text size="sm" className="text-warning-700" testID="offline-maps-stale">
          {t('offline_maps.stale_warning')}
        </Text>
      ) : null}
      <InfoRow label={t('offline_maps.size.downloaded')} value={size(state.installedBytes)} testID="offline-maps-size-installed" />
      {state.updateAvailable ? <InfoRow label={t('offline_maps.size.download')} value={size(state.pendingBytes)} testID="offline-maps-size-pending" /> : null}
      {state.totalBytes > 0 ? <InfoRow label={t('offline_maps.size.total')} value={size(state.totalBytes)} testID="offline-maps-size-total" /> : null}
      <InfoRow label={t('offline_maps.size.free')} value={size(state.freeBytes)} testID="offline-maps-size-free" />
      <InfoRow label={t('offline_maps.last_checked')} value={formatTime(state.checkedAt, t('offline_maps.never'))} testID="offline-maps-checked" />
      <InfoRow label={t('offline_maps.last_updated')} value={formatTime(state.updatedAt, t('offline_maps.never'))} testID="offline-maps-updated" />
      {state.responseAreaBytes > 0 ? (
        <Text size="xs" className="text-typography-500" testID="offline-maps-response-area">
          {t('offline_maps.response_area', { size: size(state.responseAreaBytes), limit: size(state.responseAreaLimitBytes) })}
        </Text>
      ) : null}
    </Card>
  );
};

const Content: React.FC<{ controller: OfflineMapsController; state: OfflineMapsState }> = ({ controller, state }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rows = buildContentRows(state.packs);

  const run = useCallback(async (action: Exclude<BusyAction, null>, work: () => Promise<void>) => {
    setBusy(action);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  }, []);

  const refresh = () => void run('refresh', async () => void (await controller.refreshManifest({ force: true })));
  const download = () =>
    void run('download', async () => {
      const result = await controller.download();
      if (result.ok) toast.success(t('offline_maps.download_complete'));
    });
  const remove = () =>
    void run('delete', async () => {
      try {
        await controller.deleteAll();
        toast.success(t('offline_maps.deleted'));
      } finally {
        setConfirmDelete(false);
      }
    });

  return (
    <>
      <ScrollView className="flex-1 bg-background-50" contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={busy === 'refresh'} onRefresh={refresh} />} testID="offline-maps-screen">
        <Heading size="xl" className="mb-2" accessibilityRole="header">
          {t('offline_maps.title')}
        </Heading>
        <Text className="mb-4 text-typography-600">{t('offline_maps.description')}</Text>
        <StatusCard state={state} />
        <Actions state={state} busy={busy} onDownload={download} onStop={() => controller.cancel()} onRefresh={refresh} onDelete={() => setConfirmDelete(true)} />
        <Card title={t('offline_maps.settings_title')} testID="offline-maps-settings-card">
          <VStack space="xs" className="py-1">
            <HStack className="items-center justify-between" space="md">
              <Text className="flex-1">{t('offline_maps.wifi_only')}</Text>
              <Switch value={state.wifiOnly} onValueChange={(value: boolean) => controller.setWifiOnly(value)} accessibilityLabel={t('offline_maps.wifi_only')} testID="offline-maps-wifi-only" />
            </HStack>
            {state.wifiOnly ? (
              <Text size="xs" className="text-typography-500" testID="offline-maps-wifi-only-note">
                {t('offline_maps.wifi_only_note')}
              </Text>
            ) : null}
          </VStack>
        </Card>
        {rows.length > 0 ? (
          <Card title={t('offline_maps.contents_title')} testID="offline-maps-contents">
            {rows.map((row) => (
              <ContentItem key={row.id} row={row} />
            ))}
          </Card>
        ) : null}
        <Text size="xs" className="text-center text-typography-500" testID="offline-maps-attribution">
          {t('offline_maps.attribution', { attribution: state.attribution })}
        </Text>
      </ScrollView>
      <ConfirmDialog
        isOpen={confirmDelete}
        title={t('offline_maps.delete_title')}
        message={t('offline_maps.delete_message')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
        destructive
        isBusy={busy === 'delete'}
        testID="offline-maps-delete-dialog"
      />
    </>
  );
};

/**
 * Settings → Offline maps (MapLibre plan §19.8): status, sizes and free space, download / update / stop / delete with
 * progress, the Wi-Fi-only choice, the pack list and the "Protomaps © OpenStreetMap" attribution. iOS/Android only and
 * only when the department offers offline maps; elsewhere it explains why there is nothing to do.
 */
export function OfflineMapsScreen() {
  const { t } = useTranslation();
  const { isPhone } = useFormFactor();
  const controller = useOfflineMapsController();
  const state = useOfflineMapsState(controller);
  const supported = isOfflineMapPacksSupported();

  useEffect(() => {
    if (controller && supported) {
      void controller.refreshIfStale();
    }
  }, [controller, supported]);

  const body = !supported ? (
    <Message text={t('offline_maps.unsupported')} testID="offline-maps-unsupported" />
  ) : !controller || !state || state.availability === 'unknown' ? (
    <HStack className="items-center p-4" space="sm" testID="offline-maps-loading">
      <Spinner />
      <Text>{t('offline_maps.checking')}</Text>
    </HStack>
  ) : state.availability !== 'available' ? (
    <Message text={t('offline_maps.unavailable')} testID="offline-maps-unavailable" />
  ) : null;

  return (
    <VStack className={`w-full flex-1 self-center bg-background-50 ${isPhone ? '' : 'max-w-3xl'}`}>
      {body ? (
        <VStack className="p-4">
          <Heading size="xl" className="mb-4" accessibilityRole="header">
            {t('offline_maps.title')}
          </Heading>
          {body}
        </VStack>
      ) : controller && state ? (
        <Content controller={controller} state={state} />
      ) : null}
    </VStack>
  );
}

export default OfflineMapsScreen;
