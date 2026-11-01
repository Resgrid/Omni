import { useAuthStore } from '@resgrid/auth';
import { type RealtimeHubOutage, useRealtimeStore } from '@resgrid/realtime';
import { Button, ButtonText, Heading, Loading, OfflineStatusToast, RealtimeStatusBanner, Text, useThemeColors, VStack } from '@resgrid/ui';
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

/** OfflineStatusToast fed from connectivity and the outbox's unsent count; opens the storage screen when the variant has one. */
export function ShellOfflineToast() {
  const isOffline = useShellStore((state) => state.isOffline);
  const unsent = useShellStore((state) => state.unsentChanges);
  const href = useHref();
  const router = useRouter();
  const target = href.settingsStorage();
  return <OfflineStatusToast isOffline={isOffline} pendingCount={unsent} onOpenQueue={target ? () => router.push(target) : undefined} />;
}

/**
 * Over the shell while the signed-in bootstrap runs for the first time (the navigator stays mounted underneath, as in
 * Unit), or when it failed before ever succeeding: a generic message, "Try again" and "Sign out".
 */
export function SessionInitOverlay() {
  const init = useAppInit();
  const colors = useThemeColors();
  const { t } = useShellTranslation();

  if (init.isSessionFailed) {
    return (
      <View style={StyleSheet.flatten([StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background }])} testID="shell-init-failed">
        <VStack space="md" className="max-w-md items-center p-6">
          <Heading size="lg">{t('shell.init_failed_title')}</Heading>
          <Text className="text-center">{t('shell.init_failed_message')}</Text>
          <Button onPress={init.retry} testID="shell-init-retry">
            <ButtonText>{t('shell.retry')}</ButtonText>
          </Button>
          <Button variant="outline" onPress={() => void useAuthStore.getState().logout()} testID="shell-init-sign-out">
            <ButtonText>{t('shell.sign_out')}</ButtonText>
          </Button>
        </VStack>
      </View>
    );
  }
  if (init.isSessionLoading) {
    return <Loading fullscreen testID="shell-init-loading" text={t('shell.loading')} />;
  }
  return null;
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
  center: { alignItems: 'center', justifyContent: 'center' },
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
