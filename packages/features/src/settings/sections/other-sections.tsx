import { useAuthStore } from '@resgrid/auth';
import { useActiveVariant } from '@resgrid/config';
import { Env, getAppVersionInfo, logger } from '@resgrid/core';
import { ConfirmDialog, pushRoute } from '@resgrid/features/auth-ui';
import { useTranslation } from '@resgrid/i18n';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useRef, useState } from 'react';

import { SettingsRow } from '../components/settings-row';
import { useOutboxSnapshot } from '../hooks/use-storage-sync';
import { settingsRoutes } from '../routes';

/** Advanced: Storage & sync (plan §8.2a), with the number of changes waiting to be sent. */
export const AdvancedSection: React.FC = () => {
  const { t } = useTranslation();
  const snapshot = useOutboxSnapshot();
  const unsent = snapshot?.counts.unsent ?? 0;
  const failed = (snapshot?.counts.failed ?? 0) + (snapshot?.counts.dead ?? 0);
  return (
    <SettingsRow
      label={t('storage_sync.title')}
      description={failed > 0 ? t('storage_sync.failed_count', { count: failed }) : unsent > 0 ? t('storage_sync.pending_count', { count: unsent }) : t('storage_sync.up_to_date')}
      badge={unsent > 0 ? String(unsent) : null}
      onPress={() => pushRoute(settingsRoutes.storageSync())}
      testID="settings-storage-sync"
    />
  );
};

const SUPPORT_LINKS: readonly { key: string; url: string }[] = [
  { key: 'settings.help_center', url: 'https://resgrid.zohodesk.com/portal/en/home' },
  { key: 'settings.contact_us', url: 'https://resgrid.com/contact' },
  { key: 'settings.status_page', url: 'https://resgrid.freshstatus.io' },
  { key: 'settings.privacy_policy', url: 'https://resgrid.com/privacy' },
  { key: 'settings.terms', url: 'https://resgrid.com/terms' },
];

/** About: app, version and build, environment, and the support links (Responder/Unit "App Info" + "Support"). */
export const AboutSection: React.FC = () => {
  const { t } = useTranslation();
  const variant = useActiveVariant();
  const version = getAppVersionInfo();
  return (
    <>
      <SettingsRow label={t('settings.app_name')} value={variant.identity.name} testID="settings-app-name" />
      <SettingsRow label={t('settings.version')} value={version ? t('settings.version_value', { version: version.version, build: version.buildNumber }) : t('common.unknown')} testID="settings-version" />
      <SettingsRow label={t('settings.environment')} value={Env.APP_ENV} testID="settings-environment" />
      {SUPPORT_LINKS.map((link) => (
        <SettingsRow key={link.key} label={t(link.key)} onPress={() => void WebBrowser.openBrowserAsync(link.url).catch(() => undefined)} testID={`settings-link-${link.key.replace('settings.', '')}`} />
      ))}
    </>
  );
};

/** Sign out, after a confirmation; a second request joins the one in flight (Responder). */
export const LogoutSection: React.FC = () => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);

  const logout = useCallback(async () => {
    inFlight.current ??= useAuthStore
      .getState()
      .logout()
      .catch(() => logger.warn({ message: 'Sign-out did not complete cleanly' }))
      .finally(() => {
        inFlight.current = null;
      });
    setBusy(true);
    try {
      await inFlight.current;
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }, []);

  return (
    <>
      <SettingsRow label={t('settings.logout')} tone="danger" onPress={() => setConfirming(true)} testID="settings-logout" />
      <ConfirmDialog
        isOpen={confirming}
        title={t('settings.logout_confirm_title')}
        message={t('settings.logout_confirm_message')}
        confirmLabel={t('settings.logout')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void logout()}
        onCancel={() => setConfirming(false)}
        destructive
        isBusy={busy}
        testID="logout-dialog"
      />
    </>
  );
};
