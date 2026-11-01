import { FeatureFlagKeys, useFeatureFlagStatus, useSecurity } from '@resgrid/auth';
import { awaitingDismissKey, useAwaitingResourcesStore } from '@resgrid/data';
import { callRoutes } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { AwaitingResourceRequirementData, AwaitingResourcesCallData } from '@resgrid/models';
import { FlatList, HStack, Loading, Pressable, RefreshControl, Spinner, Text, VStack, ZeroState } from '@resgrid/ui';
import { type Href, useRouter } from 'expo-router';
import { Hourglass, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AwaitingCallCard } from '../components/awaiting-call-card';
import { DismissRequirementDialog } from '../components/dismiss-requirement-dialog';
import { useAwaitingResourceActions, useIsAwaitingResourcesEnabled } from '../hooks/use-awaiting-resources';

export interface AwaitingResourcesScreenProps {
  /** In-content title row (default true; off when the shell header already titles the screen). */
  showHeader?: boolean;
  /** Clock for "minutes waiting" (tests). */
  now?: () => number;
}

interface DismissTarget {
  callId: number;
  requirement: AwaitingResourceRequirementData;
}

/**
 * Calls awaiting resources (conditional run cards, Dispatch baseline): calls that went out without a required resource
 * marked "keep outstanding". Each requirement shows what went instead and the matching units available now, with
 * one-step Dispatch (adds the unit, notifies only it) and Dismiss. Highest priority, then oldest, first; kept current by
 * the `outstandingRequirementsUpdated` push.
 */
export default function AwaitingResourcesScreen({ showHeader = true, now = Date.now }: AwaitingResourcesScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const isEnabled = useIsAwaitingResourcesEnabled();
  const conditionsStatus = useFeatureFlagStatus(FeatureFlagKeys.DispatchRunCardConditions);
  const { canUserCreateCalls } = useSecurity();
  const calls = useAwaitingResourcesStore((state) => state.calls);
  const isLoading = useAwaitingResourcesStore((state) => state.loading.calls === true);
  const error = useAwaitingResourcesStore((state) => state.errors.calls ?? null);
  const fetchedAt = useAwaitingResourcesStore((state) => state.fetchedAt.calls ?? 0);
  const busyKey = useAwaitingResourcesStore((state) => state.busyKey);
  const allResponseCodes = useAwaitingResourcesStore((state) => state.allResponseCodes);
  const { dispatchUnit, dismissRequirement } = useAwaitingResourceActions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dismissTarget, setDismissTarget] = useState<DismissTarget | null>(null);

  useEffect(() => {
    if (isEnabled) void useAwaitingResourcesStore.getState().fetchAwaitingCalls({ bypassCache: true });
  }, [isEnabled]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void useAwaitingResourcesStore
      .getState()
      .fetchAwaitingCalls({ bypassCache: true })
      .finally(() => setIsRefreshing(false));
  }, []);

  const confirmDismiss = useCallback(
    async (note: string) => {
      if (!dismissTarget) return;
      const dismissed = await dismissRequirement(dismissTarget.callId, dismissTarget.requirement.CallOutstandingRequirementId, note);
      if (dismissed) setDismissTarget(null);
    },
    [dismissRequirement, dismissTarget]
  );

  const renderCall = useCallback(
    ({ item }: { item: AwaitingResourcesCallData }) => (
      <AwaitingCallCard
        call={item}
        canAct={canUserCreateCalls}
        busyKey={busyKey}
        responseCodes={allResponseCodes}
        now={now()}
        onOpenCall={(callId) => router.push(callRoutes.callDetail(String(callId)) as Href)}
        onDispatch={(callId, unitId) => void dispatchUnit(callId, unitId)}
        onDismiss={(callId, requirement) => setDismissTarget({ callId, requirement })}
      />
    ),
    [allResponseCodes, busyKey, canUserCreateCalls, dispatchUnit, now, router]
  );

  const renderContent = () => {
    if (!isEnabled) {
      // A deep link while flags still resolve shows the loader rather than a "not available" flash.
      return conditionsStatus === 'unknown' ? <Loading /> : <ZeroState heading={t('awaiting_resources.not_enabled')} description={t('awaiting_resources.not_enabled_description')} icon={Hourglass} />;
    }
    // Only the first load replaces the list; a refresh from a push keeps the cards on screen.
    if (isLoading && calls.length === 0 && fetchedAt === 0) return <Loading text={t('awaiting_resources.loading')} />;
    if (error && calls.length === 0) return <ZeroState heading={t('common.errorOccurred')} description={t(error.messageKey)} isError />;
    if (calls.length === 0) return <ZeroState heading={t('awaiting_resources.empty_title')} description={t('awaiting_resources.empty_description')} icon={Hourglass} />;
    return (
      <FlatList
        testID="awaiting-resources-list"
        data={calls}
        renderItem={renderCall}
        keyExtractor={(item: AwaitingResourcesCallData) => String(item.CallId)}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.list}
      />
    );
  };

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="awaiting-resources-screen">
      {isEnabled && showHeader ? (
        <HStack className="mb-3 items-center justify-between">
          <VStack className="flex-1">
            <Text className="text-lg font-bold">{t('awaiting_resources.title')}</Text>
            <Text className="text-xs text-typography-500">{t('awaiting_resources.subtitle')}</Text>
          </VStack>
          <Pressable onPress={handleRefresh} accessibilityRole="button" accessibilityLabel={t('common.refresh')} testID="awaiting-resources-refresh">
            {isRefreshing ? (
              <Spinner size="small" />
            ) : (
              <View>
                <RefreshCw size={18} color="#737373" />
              </View>
            )}
          </Pressable>
        </HStack>
      ) : null}
      <View className="flex-1">{renderContent()}</View>
      <DismissRequirementDialog
        isOpen={dismissTarget !== null}
        requirementLabel={dismissTarget?.requirement.Label ?? null}
        isSubmitting={dismissTarget !== null ? busyKey === awaitingDismissKey(dismissTarget.requirement.CallOutstandingRequirementId) : false}
        onConfirm={(note) => void confirmDismiss(note)}
        onClose={() => setDismissTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({ list: { paddingBottom: 24 } });
