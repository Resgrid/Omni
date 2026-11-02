import { applyAppUpdate, type AppUpdatesState, checkForAppUpdate, getAppVersionInfo, useAppUpdates } from '@resgrid/core';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, Text, useToast, VStack } from '@resgrid/ui';
import React, { useCallback, useRef, useState } from 'react';

import { SettingsRow } from '../components/settings-row';

/** Update ids are UUIDs and fingerprint runtime versions are 40-character hashes: the start identifies them for support. */
const SHORT_UPDATE_ID = 8;
const SHORT_RUNTIME_VERSION = 12;

const shorten = (value: string | null | undefined, length: number): string | null => (value ? value.slice(0, length) : null);

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** One line for the check state; null before the first check of this launch. */
function statusText(state: AppUpdatesState, t: Translate): { text: string; className: string } | null {
  switch (state.status) {
    case 'checking':
      return { text: t('settings.app_updates.checking'), className: 'text-typography-600' };
    case 'downloading':
      return { text: t('settings.app_updates.downloading'), className: 'text-typography-600' };
    case 'ready':
      return { text: t('settings.app_updates.ready'), className: 'text-success-600' };
    case 'error':
      return { text: t('settings.app_updates.check_failed'), className: 'text-warning-700' };
    default:
      return state.lastCheckAt === null ? null : { text: t('settings.app_updates.up_to_date', { time: new Date(state.lastCheckAt).toLocaleString() }), className: 'text-typography-600' };
  }
}

/**
 * Settings → App updates (docs/subsystems/app-updates.md): the version and build, the update channel and runtime
 * version, the running update (short id, publish date, built-in or downloaded), "Check for updates" and, once an update
 * is downloaded, "Restart to update". Only registered where updates work (iOS/Android release builds); restarting is
 * held while a voice session is connected.
 */
export const AppUpdatesSection: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const state = useAppUpdates();
  const [restarting, setRestarting] = useState(false);
  const restartingRef = useRef(false);
  const version = getAppVersionInfo();
  const current = state.current;
  const notSet = t('settings.app_updates.not_set');
  const checking = state.status === 'checking' || state.status === 'downloading';
  const status = statusText(state, t);

  const check = useCallback(() => {
    // Single-flight in the service; the button is also disabled while a check runs.
    void checkForAppUpdate('manual');
  }, []);

  const restart = useCallback(async () => {
    if (restartingRef.current) {
      return;
    }
    restartingRef.current = true;
    setRestarting(true);
    const result = await applyAppUpdate('user');
    if (result === 'restarting') {
      // The app reloads into the update.
      return;
    }
    restartingRef.current = false;
    setRestarting(false);
    if (result === 'failed') {
      toast.error(t('settings.app_updates.restart_failed'));
    }
  }, [t, toast]);

  return (
    <>
      <SettingsRow label={t('settings.version')} value={version ? t('settings.version_value', { version: version.version, build: version.buildNumber }) : t('common.unknown')} testID="settings-updates-version" />
      <SettingsRow label={t('settings.app_updates.channel')} value={current?.channel ?? notSet} testID="settings-updates-channel" />
      <SettingsRow label={t('settings.app_updates.runtime_version')} value={shorten(current?.runtimeVersion, SHORT_RUNTIME_VERSION) ?? notSet} testID="settings-updates-runtime" />
      <SettingsRow
        label={t('settings.app_updates.current_update')}
        value={shorten(current?.updateId, SHORT_UPDATE_ID) ?? notSet}
        description={current?.createdAt ? t('settings.app_updates.published', { date: current.createdAt.toLocaleString() }) : null}
        testID="settings-updates-current"
      />
      <SettingsRow label={t('settings.app_updates.source')} value={current?.isEmbeddedLaunch ? t('settings.app_updates.source_embedded') : t('settings.app_updates.source_downloaded')} testID="settings-updates-source" />
      {current?.isEmergencyLaunch ? (
        <Text size="xs" className="px-1 text-warning-700" testID="settings-updates-emergency">
          {t('settings.app_updates.emergency_launch')}
        </Text>
      ) : null}
      {status ? (
        <Text size="sm" className={`px-1 ${status.className}`} accessibilityLiveRegion="polite" testID="settings-updates-status">
          {status.text}
        </Text>
      ) : null}
      <VStack space="sm" className="mt-2">
        <Button variant="outline" action="secondary" onPress={check} isDisabled={checking || restarting} accessibilityLabel={t('settings.app_updates.check')} testID="settings-updates-check">
          {checking ? <ButtonSpinner /> : <ButtonText>{t('settings.app_updates.check')}</ButtonText>}
        </Button>
        {state.status === 'ready' ? (
          <Button action="primary" onPress={() => void restart()} isDisabled={restarting} accessibilityLabel={t('settings.app_updates.restart')} testID="settings-updates-restart">
            {restarting ? <ButtonSpinner /> : <ButtonText>{t('settings.app_updates.restart')}</ButtonText>}
          </Button>
        ) : null}
      </VStack>
    </>
  );
};
