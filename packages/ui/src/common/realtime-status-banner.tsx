import { WifiOff } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';

import { HStack } from '../hstack';
import { Text } from '../text';
import { useTranslation } from '../utils/i18n';
import { VStack } from '../vstack';

/**
 * How long a realtime hub may be down before the user is told about it.
 *
 * Most drops heal on their own well inside the service's reconnect budget, and a strip that
 * flashes on every one of those is a strip people learn to ignore. A hub whose reconnection is
 * already exhausted skips the wait entirely -- there is nothing left to wait for.
 */
export const REALTIME_OUTAGE_GRACE_MS = 20000;

export interface RealtimeHubOutage {
  /** Epoch ms when the hub (connected before) dropped. */
  since: number;
  /** The reconnect budget is used up. */
  exhausted: boolean;
}

export interface RealtimeStatusBannerProps {
  /**
   * Hubs that were connected and then dropped, keyed by hub name (the realtime store's
   * `realtimeHubOutages`). A cold start, a hub that never connected, an intentional teardown on
   * backgrounding and signing out must all leave this empty, so none of them flash the banner.
   */
  outages: Readonly<Record<string, RealtimeHubOutage>>;
  graceMs?: number;
  title?: string;
  description?: string;
  testID?: string;
}

/**
 * Tells the user when the live call/status/chat feed has actually stopped (Responder baseline, made
 * props-driven so @resgrid/ui never imports a store).
 *
 * This matters more here than in most apps: a dead update feed and a quiet shift look exactly
 * the same on screen, so without this the app silently stops reporting new calls.
 */
export const RealtimeStatusBanner: React.FC<RealtimeStatusBannerProps> = ({ outages, graceMs = REALTIME_OUTAGE_GRACE_MS, title, description, testID = 'realtime-status-banner' }) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  // The oldest outage drives the countdown, so a second hub dropping mid-outage cannot push the
  // warning further away.
  const { isExhausted, since } = useMemo(() => {
    const active = Object.values(outages);
    return {
      isExhausted: active.some((outage) => outage.exhausted),
      since: active.length > 0 ? Math.min(...active.map((outage) => outage.since)) : null,
    };
  }, [outages]);

  useEffect(() => {
    if (since === null) {
      setIsVisible(false);
      return;
    }

    if (isExhausted) {
      setIsVisible(true);
      return;
    }

    // Measured from when the session actually dropped rather than from this render, so a screen
    // mounted midway through an outage does not restart the grace period.
    const remaining = graceMs - (Date.now() - since);
    if (remaining <= 0) {
      setIsVisible(true);
      return;
    }

    setIsVisible(false);
    const timer = setTimeout(() => setIsVisible(true), remaining);
    return () => clearTimeout(timer);
  }, [graceMs, isExhausted, since]);

  if (!isVisible) {
    return null;
  }

  const resolvedTitle = title ?? t('app.realtime_offline_title', { defaultValue: 'Live updates paused' });
  const resolvedDescription = description ?? t('app.realtime_offline_description', { defaultValue: 'New calls and status changes may not appear until the connection is restored.' });

  return (
    <HStack
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${resolvedTitle}. ${resolvedDescription}`}
      accessibilityLiveRegion="polite"
      className="w-full items-center bg-amber-700 px-4 py-2 dark:bg-amber-800"
      space="sm"
      testID={testID}
    >
      <WifiOff size={18} color="#FFFFFF" />
      <VStack className="flex-1">
        <Text className="text-sm font-semibold text-white">{resolvedTitle}</Text>
        <Text className="text-xs text-white" numberOfLines={2}>
          {resolvedDescription}
        </Text>
      </VStack>
    </HStack>
  );
};
