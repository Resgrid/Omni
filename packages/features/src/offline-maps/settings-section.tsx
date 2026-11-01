import { pushRoute } from '@resgrid/features/auth-ui';
import { registerSettingsSection, SettingsRow, type SettingsSection } from '@resgrid/features/settings';
import { useTranslation } from '@resgrid/i18n';
import type { OfflineMapsController } from '@resgrid/maps/offline';
import React from 'react';

import { isOfflineMapsVisible, useOfflineMapsController, useOfflineMapsState } from './hooks/use-offline-maps';
import { errorKey, formatBytes, statusKey } from './lib/present';
import { offlineMapsRoutes } from './routes';
import { getOfflineMapsController, subscribeOfflineMapsRuntime } from './runtime';

export const OFFLINE_MAPS_SETTINGS_SECTION_ID = 'offline-maps';

/** The Settings row: status (or the last problem), size on the device, and the way into Settings → Offline maps. */
export const OfflineMapsSettingsRow: React.FC = () => {
  const { t } = useTranslation();
  const controller = useOfflineMapsController();
  const state = useOfflineMapsState(controller);
  if (!state) {
    return null;
  }
  return (
    <SettingsRow
      label={t('offline_maps.title')}
      description={state.error ? t(errorKey(state.error)) : t(statusKey(state))}
      value={state.installedBytes > 0 ? formatBytes(state.installedBytes) : null}
      badge={state.updateAvailable && state.isInstalled ? '1' : null}
      onPress={() => pushRoute(offlineMapsRoutes.offlineMaps())}
      testID="settings-offline-maps"
    />
  );
};

/**
 * Adds the "Offline maps" section to Settings while offline maps are available (iOS/Android, department offers them)
 * and removes it otherwise, following the configured controller. Call once from the app shell after
 * `configureOfflineMaps`; returns the disposer.
 */
export function registerOfflineMapsSettings(options: { order?: number } = {}): () => void {
  const section: SettingsSection = {
    id: OFFLINE_MAPS_SETTINGS_SECTION_ID,
    order: options.order ?? 75,
    title: 'offline_maps.settings_title',
    visible: (context) => context.isAuthenticated && context.platform !== 'web',
    render: () => <OfflineMapsSettingsRow />,
  };
  let unregister: (() => void) | null = null;
  let current: OfflineMapsController | null = null;
  let unsubscribeController: (() => void) | null = null;

  const sync = (): void => {
    const visible = isOfflineMapsVisible(current ? current.getState() : null);
    if (visible && !unregister) {
      unregister = registerSettingsSection(section);
    } else if (!visible && unregister) {
      unregister();
      unregister = null;
    }
  };
  const bind = (): void => {
    const next = getOfflineMapsController();
    if (next !== current) {
      unsubscribeController?.();
      current = next;
      unsubscribeController = next ? next.subscribe(sync) : null;
    }
    sync();
  };

  const unsubscribeRuntime = subscribeOfflineMapsRuntime(bind);
  bind();
  return () => {
    unsubscribeRuntime();
    unsubscribeController?.();
    unsubscribeController = null;
    unregister?.();
    unregister = null;
  };
}
