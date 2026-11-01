import { awaitingDismissKey, useAwaitingResourcesStore } from '@resgrid/data';
import { ResponseCodeChip } from '@resgrid/features/runcards';
import { useTranslation } from '@resgrid/i18n';
import type { CallOutstandingRequirementData } from '@resgrid/models';
import { Button, ButtonText, HStack, Text, VStack } from '@resgrid/ui';
import { Hourglass } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAwaitingResourceActions, useIsAwaitingResourcesEnabled } from '../hooks/use-awaiting-resources';
import { findResponseCode } from '../lib/awaiting-format';
import { DismissRequirementDialog } from './dismiss-requirement-dialog';

export interface CallOutstandingRequirementsProps {
  callId: string;
  /** Dismissing needs the same authority as editing the call. */
  canDismiss: boolean;
  testID?: string;
}

const EMPTY: CallOutstandingRequirementData[] = [];

/**
 * A call's open outstanding requirements (conditional run cards): what it still awaits because it could not be sent as
 * configured, what went instead, and a Dismiss for each. Refreshed on every `outstandingRequirementsUpdated` push.
 * Renders nothing when the call awaits nothing or the department does not use conditional run cards.
 */
export const CallOutstandingRequirements: React.FC<CallOutstandingRequirementsProps> = ({ callId, canDismiss, testID = 'call-outstanding-requirements' }) => {
  const { t } = useTranslation();
  const isEnabled = useIsAwaitingResourcesEnabled();
  const lastPushAt = useAwaitingResourcesStore((state) => state.lastPushAt);
  const busyKey = useAwaitingResourcesStore((state) => state.busyKey);
  const allResponseCodes = useAwaitingResourcesStore((state) => state.allResponseCodes);
  const requirements = useAwaitingResourcesStore((state) => state.requirementsByCall[callId] ?? EMPTY);
  const { dismissRequirement } = useAwaitingResourceActions();
  const [target, setTarget] = useState<CallOutstandingRequirementData | null>(null);

  useEffect(() => {
    if (isEnabled && callId) void useAwaitingResourcesStore.getState().fetchCallRequirements(callId, { bypassCache: lastPushAt > 0 });
  }, [callId, isEnabled, lastPushAt]);

  const confirmDismiss = useCallback(
    async (note: string) => {
      if (!target) return;
      const dismissed = await dismissRequirement(target.CallId, target.CallOutstandingRequirementId, note);
      if (dismissed) setTarget(null);
      void useAwaitingResourcesStore.getState().fetchCallRequirements(callId, { bypassCache: true });
    },
    [callId, dismissRequirement, target]
  );

  if (!isEnabled || requirements.length === 0) return null;

  return (
    <View className="mb-4 rounded-lg border border-warning-300 bg-background-warning p-3" testID={testID}>
      <HStack space="sm" className="mb-2 items-center">
        <View>
          <Hourglass size={16} color="#d97706" />
        </View>
        <Text className="font-semibold text-warning-800">{t('awaiting_resources.call_section_title')}</Text>
      </HStack>
      <VStack space="sm">
        {requirements.map((requirement) => {
          const code = findResponseCode(allResponseCodes, requirement.ResponseCode, requirement.ResponseCodeId);
          const rowTestID = `${testID}-${requirement.CallOutstandingRequirementId}`;
          return (
            <HStack key={`call-req-${requirement.CallOutstandingRequirementId}`} space="sm" className="items-center justify-between" testID={rowTestID}>
              <VStack className="flex-1">
                <HStack space="sm" className="flex-wrap items-center">
                  <Text className="text-sm font-medium">{t('awaiting_resources.requirement_progress', { label: requirement.Label, resolved: requirement.ResolvedCount, required: requirement.RequiredCount })}</Text>
                  <ResponseCodeChip code={requirement.ResponseCode} name={code?.Name} color={code?.Color} testID={`${rowTestID}-code`} />
                </HStack>
                {requirement.SentInstead ? <Text className="text-xs text-typography-600">{t('awaiting_resources.sent_instead', { sent: requirement.SentInstead })}</Text> : null}
              </VStack>
              {canDismiss ? (
                <Button
                  size="xs"
                  variant="outline"
                  action="secondary"
                  onPress={() => setTarget(requirement)}
                  isDisabled={busyKey === awaitingDismissKey(requirement.CallOutstandingRequirementId)}
                  testID={`${rowTestID}-dismiss`}
                >
                  <ButtonText>{t('awaiting_resources.dismiss')}</ButtonText>
                </Button>
              ) : null}
            </HStack>
          );
        })}
      </VStack>
      <DismissRequirementDialog
        isOpen={target !== null}
        requirementLabel={target?.Label ?? null}
        isSubmitting={target !== null ? busyKey === awaitingDismissKey(target.CallOutstandingRequirementId) : false}
        onConfirm={(note) => void confirmDismiss(note)}
        onClose={() => setTarget(null)}
      />
    </View>
  );
};
