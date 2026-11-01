import { useRunCardsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, HStack, Text, useToast, VStack } from '@resgrid/ui';
import { Flame } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { useIsRunCardsEnabled } from '../hooks/use-run-card-flags';

export interface EscalateAlarmButtonProps {
  callId: string;
  /** Current alarm level from the call payload; 1 when the call was never escalated. */
  alarmLevel: number;
  /** Null when no run card is driving this call — escalation would add nothing. */
  activeRunCardId: number | null;
  /** False for a closed call or a user without edit rights. */
  canEscalate: boolean;
  onEscalated?: (newAlarmLevel: number) => void;
  testID?: string;
}

/**
 * "Strike Next Alarm" (Dispatch baseline). Escalation is additive — the server dispatches only the next level and
 * alerts only the newly added resources — and irreversible from here, hence the two-step confirm. Online only: paging
 * must never replay late. Renders nothing unless run cards are on and a card drives this call.
 */
export const EscalateAlarmButton: React.FC<EscalateAlarmButtonProps> = ({ callId, alarmLevel, activeRunCardId, canEscalate, onEscalated, testID = 'escalate-alarm-button' }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const isRunCardsEnabled = useIsRunCardsEnabled();
  const isEscalating = useRunCardsStore((state) => state.isEscalating);
  const [isConfirming, setIsConfirming] = useState(false);
  const nextLevel = Math.max(1, alarmLevel) + 1;

  const confirm = useCallback(async () => {
    setIsConfirming(false);
    const result = await useRunCardsStore.getState().escalate(callId);
    if (!result) {
      toast.error(t('run_cards.escalate_failed'));
      return;
    }
    if (!result.Success) {
      // No level beyond the current one, or everything it would add is already on the call: say so plainly.
      toast.info(t('run_cards.escalate_nothing_to_add'));
      return;
    }
    toast.success(t('run_cards.escalate_succeeded', { level: result.NewAlarmLevel ?? nextLevel, units: result.AddedUnits ?? 0, personnel: result.AddedPersonnel ?? 0 }));
    onEscalated?.(result.NewAlarmLevel ?? nextLevel);
  }, [callId, nextLevel, onEscalated, t, toast]);

  if (!isRunCardsEnabled || !activeRunCardId || !canEscalate) return null;

  return (
    <VStack space="sm" testID={testID}>
      {isConfirming ? (
        <VStack space="sm">
          <Text className="text-sm text-typography-500">{t('run_cards.escalate_confirm', { level: nextLevel })}</Text>
          <HStack space="sm">
            <Button variant="outline" action="secondary" onPress={() => setIsConfirming(false)} className="flex-1" isDisabled={isEscalating} testID={`${testID}-cancel`}>
              <ButtonText>{t('common.cancel')}</ButtonText>
            </Button>
            <Button action="negative" onPress={() => void confirm()} className="flex-1" isDisabled={isEscalating} testID={`${testID}-confirm`}>
              {isEscalating ? <ButtonSpinner /> : null}
              <ButtonText>{t('run_cards.escalate_confirm_action')}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      ) : (
        <Button variant="outline" action="secondary" onPress={() => setIsConfirming(true)} isDisabled={isEscalating} testID={`${testID}-trigger`}>
          <View>
            <Flame size={16} color="#d97706" />
          </View>
          <ButtonText>{t('run_cards.escalate', { level: nextLevel })}</ButtonText>
        </Button>
      )}
    </VStack>
  );
};
