import { useAuthStore } from '@resgrid/auth';
import { type RealtimeHubOutage, useRealtimeStore } from '@resgrid/realtime';
import { Button, ButtonText, HStack, RealtimeStatusBanner, Spinner, SyncAttentionToast, Text, useSettledFlag, useThemeColors, VStack } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useShellTranslation } from '../i18n';
import { useAppInit } from '../init/app-init';
import { useHref } from '../routes/href';
import { useShellStore } from '../runtime/shell-state';
import { useShellBanners, useShellOverlays } from '../runtime/slots';

/** RealtimeStatusBanner fed from the realtime store's outages (hubs that were live and dropped). */
export function ShellRealtimeBanner() {
  const outages = useRealtimeStore((state) => state.outages);

  const defined = useMemo(() => {
    const out: Record<string, RealtimeHubOutage> = {};

    for (const [hub, outage] of Object.entries(outages)) {
      if (outage) {
        out[hub] = outage;
      }
    }

    return out;
  }, [outages]);

  return <RealtimeStatusBanner outages={defined} />;
}

/**
 * SyncAttentionToast fed from the outbox's changes that need the user; opens the storage screen when the variant has
 * one. Offline and "changes waiting" are routine and never toast: the app bar's sync chip shows them once they last.
 */
export function ShellSyncAttentionToast() {
  const attention = useShellStore((state) => state.changesNeedingAttention);
  const href = useHref();
  const router = useRouter();
  const target = href.settingsStorage();

  return <SyncAttentionToast attentionCount={attention} onOpenQueue={target ? () => router.push(target) : undefined} />;
}

/** A bootstrap quicker than this shows no indicator at all; one that shows stays long enough to read. */
export const SESSION_INIT_INDICATOR_DELAY_MS = 1000;
export const SESSION_INIT_INDICATOR_MIN_VISIBLE_MS = 1000;

/**
 * The signed-in bootstrap's first run, without blocking anything: launch never puts a spinner over the app (owner
 * decision, 2026-11-04). Rights, flags and terminology are persisted, so every screen works from the last session's
 * copies while the bootstrap refreshes them, and lists show their own loading inside the page. A small chip at the
 * top of the content says so once the run has taken a moment (a quick one would only flash it); it takes no touches
 * and no space, so nothing under a finger moves when it goes.
 */
export function SessionInitIndicator() {
  const init = useAppInit();
  const colors = useThemeColors();
  const { t } = useShellTranslation();
  const isVisible = useSettledFlag(init.isSessionLoading, { delayMs: SESSION_INIT_INDICATOR_DELAY_MS, minVisibleMs: SESSION_INIT_INDICATOR_MIN_VISIBLE_MS });

  if (!isVisible) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.indicatorHost} testID="shell-init-loading">
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('shell.loading')}
        accessibilityState={{ busy: true }}
        style={StyleSheet.flatten([styles.indicator, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }])}
      >
        <Spinner size="small" color={colors.primary} />
        <Text size="sm" style={StyleSheet.flatten([styles.indicatorText, { color: colors.textMuted }])}>
          {t('shell.loading')}
        </Text>
      </View>
    </View>
  );
}

/**
 * Under the app bar when the signed-in bootstrap failed before ever succeeding (a server error; offline it completes
 * from the stored copies):
 * "Try again" (disabled while a retry runs) and "Sign out", with the screens below still usable on their stored data.
 * It stays through automatic retries and goes once a run succeeds.
 */
export function SessionInitFailedBanner() {
  const init = useAppInit();
  const { t } = useShellTranslation();

  if (!init.isSessionFailed) {
    return null;
  }

  return (
    <HStack space="sm" className="w-full items-center border-b border-outline-200 bg-background-100 px-4 py-2" accessibilityRole="alert" testID="shell-init-failed">
      <VStack className="flex-1">
        <Text size="sm" className="font-semibold text-typography-900">
          {t('shell.init_failed_title')}
        </Text>
        <Text size="xs" className="text-typography-600" numberOfLines={2}>
          {t('shell.init_failed_message')}
        </Text>
      </VStack>
      <Button size="sm" onPress={init.retry} isDisabled={init.session.state === 'running'} testID="shell-init-retry">
        <ButtonText>{t('shell.retry')}</ButtonText>
      </Button>
      <Button size="sm" variant="outline" onPress={() => void useAuthStore.getState().logout()} testID="shell-init-sign-out">
        <ButtonText>{t('shell.sign_out')}</ButtonText>
      </Button>
    </HStack>
  );
}

/** Overlays features registered with `registerShellOverlay` (one instance each, inside the shell). */
export function RegisteredOverlays() {
  const overlays = useShellOverlays();

  return (
    <>
      {overlays.map(({ id, component: Overlay }) => (
        <Overlay key={id} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  // Top of the content area, centred; the host spans the width so the chip can centre, and passes every touch through.
  indicatorHost: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  indicator: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 1 },
  indicatorText: { marginLeft: 8 },
});

/** Banners registered with `registerShellBanner`, stacked under the app bar in registration order. */
export function RegisteredBanners() {
  const entries = useShellBanners();

  return (
    <>
      {entries.map(({ id, component: Banner }) => (
        <Banner key={id} />
      ))}
    </>
  );
}
