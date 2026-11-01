import { useCallsStore } from '@resgrid/data';
import { callRoutes } from '@resgrid/features/calls';
import { CheckInTab } from '@resgrid/features/check-in';
import { useTranslation } from '@resgrid/i18n';
import { Box, Button, ButtonText, Heading, HStack, Text, VStack } from '@resgrid/ui';
import { router } from 'expo-router';
import React, { useCallback } from 'react';

export interface ActiveCallTabProps {
  /** The call the member is working (StatusContext `activeCallId`). */
  callId: string;
  /** Clears the active call; the button is hidden when the shell offers no way to clear it. */
  onClearActiveCall?: () => void;
  testID?: string;
}

/**
 * The member home's "Call" tab (Responder): the active call's summary, its check-in timers (with self check-in through
 * the outbox, `@resgrid/features/check-in`) and the way to the call detail.
 */
export const ActiveCallTab: React.FC<ActiveCallTabProps> = ({ callId, onClearActiveCall, testID = 'active-call-tab' }) => {
  const { t } = useTranslation();
  const call = useCallsStore((state) => state.calls.find((candidate) => candidate.CallId === callId));

  const openDetails = useCallback(() => {
    router.push(callRoutes.callDetail(callId));
  }, [callId]);

  if (!call) {
    return (
      <Box className="items-center py-8" testID={`${testID}-none`}>
        <Text className="text-typography-500">{t('home.active_call.no_active_call')}</Text>
      </Box>
    );
  }

  return (
    <VStack space="md" className="py-2" testID={testID}>
      <Box className="rounded-xl bg-background-0 p-4">
        <VStack space="xs">
          <Heading size="sm">{call.Number ? `${call.Name} (#${call.Number})` : call.Name}</Heading>
          {call.Address ? <Text className="text-sm text-typography-500">{call.Address}</Text> : null}
        </VStack>
      </Box>

      {call.CheckInTimersEnabled ? <CheckInTab callId={call.CallId} timersEnabled={call.CheckInTimersEnabled} /> : null}

      <HStack space="md">
        <Button className="flex-1" variant="outline" onPress={openDetails} testID={`${testID}-view-details`}>
          <ButtonText>{t('home.active_call.view_details')}</ButtonText>
        </Button>
        {onClearActiveCall ? (
          <Button className="flex-1" variant="outline" action="negative" onPress={onClearActiveCall} testID={`${testID}-clear`}>
            <ButtonText>{t('home.active_call.clear_active')}</ButtonText>
          </Button>
        ) : null}
      </HStack>
    </VStack>
  );
};
