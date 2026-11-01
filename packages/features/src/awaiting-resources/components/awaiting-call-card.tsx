import { awaitingDismissKey, awaitingDispatchKey } from '@resgrid/data';
import { formatResponseSeconds, minutesSinceUtc, ResponseCodeChip } from '@resgrid/features/runcards';
import { useTranslation } from '@resgrid/i18n';
import type { AwaitingResourceRequirementData, AwaitingResourcesCallData, DispatchResponseCodeData } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Pressable, Text, VStack } from '@resgrid/ui';
import { MapPin, Send } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { awaitingCallLabel, findResponseCode, unitLabel } from '../lib/awaiting-format';

export interface AwaitingCallCardProps {
  call: AwaitingResourcesCallData;
  /** Dispatch and dismiss need the create-calls right. */
  canAct: boolean;
  busyKey: string | null;
  responseCodes: readonly DispatchResponseCodeData[];
  /** For "minutes waiting" (tests pin it). */
  now: number;
  onOpenCall: (callId: number) => void;
  onDispatch: (callId: number, unitId: number) => void;
  onDismiss: (callId: number, requirement: AwaitingResourceRequirementData) => void;
}

const FALLBACK_PRIORITY_COLOR = '#6b7280';

/** One requirement of a waiting call: what is awaited, what went instead, and the units that could go now. */
const RequirementBlock: React.FC<Omit<AwaitingCallCardProps, 'onOpenCall'> & { requirement: AwaitingResourceRequirementData }> = ({ call, requirement, canAct, busyKey, responseCodes, now, onDispatch, onDismiss }) => {
  const { t } = useTranslation();
  const waiting = minutesSinceUtc(requirement.CreatedOn, now);
  const testID = `awaiting-requirement-${requirement.CallOutstandingRequirementId}`;
  const callLabel = awaitingCallLabel(call);
  const code = findResponseCode(responseCodes, requirement.ResponseCode, requirement.ResponseCodeId);
  const units = requirement.AvailableUnits ?? [];

  return (
    <View className="mt-2 rounded-lg border border-outline-200 bg-background-50 p-3" testID={testID}>
      <HStack space="sm" className="items-start justify-between">
        <VStack className="flex-1">
          <HStack space="sm" className="flex-wrap items-center">
            <Text className="font-semibold">{t('awaiting_resources.requirement_progress', { label: requirement.Label, resolved: requirement.ResolvedCount, required: requirement.RequiredCount })}</Text>
            <ResponseCodeChip code={requirement.ResponseCode} name={code?.Name} color={code?.Color ?? requirement.ResponseCodeColor} testID={`${testID}-code`} />
          </HStack>
          {requirement.SentInstead ? <Text className="text-xs text-typography-600">{t('awaiting_resources.sent_instead', { sent: requirement.SentInstead })}</Text> : null}
          {waiting !== null ? <Text className="text-xs text-typography-500">{t('awaiting_resources.waiting_minutes', { minutes: waiting })}</Text> : null}
        </VStack>
        {canAct ? (
          <Button
            size="xs"
            variant="outline"
            action="secondary"
            onPress={() => onDismiss(call.CallId, requirement)}
            isDisabled={busyKey === awaitingDismissKey(requirement.CallOutstandingRequirementId)}
            testID={`${testID}-dismiss`}
          >
            <ButtonText>{t('awaiting_resources.dismiss')}</ButtonText>
          </Button>
        ) : null}
      </HStack>

      {units.length > 0 ? (
        <VStack space="xs" className="mt-2">
          <Text className="text-xs font-semibold uppercase text-typography-500">{t('awaiting_resources.available_units')}</Text>
          {units.map((unit) => {
            const response = formatResponseSeconds(unit.ResponseSeconds);
            const isBusy = busyKey === awaitingDispatchKey(call.CallId, unit.UnitId);
            return (
              <HStack key={`awaiting-unit-${requirement.CallOutstandingRequirementId}-${unit.UnitId}`} space="sm" className="items-center justify-between" testID={`${testID}-unit-${unit.UnitId}`}>
                <VStack className="flex-1">
                  <Text className="text-sm font-medium">{unitLabel(unit.UnitName, unit.UnitTypeName)}</Text>
                  {response ? <Text className="text-xs text-typography-500">{t('awaiting_resources.response_time', { time: response })}</Text> : null}
                </VStack>
                {canAct ? (
                  <Button
                    size="xs"
                    onPress={() => onDispatch(call.CallId, unit.UnitId)}
                    isDisabled={isBusy}
                    accessibilityLabel={t('awaiting_resources.dispatch_unit_to_call', { unit: unit.UnitName, call: callLabel })}
                    testID={`${testID}-unit-${unit.UnitId}-dispatch`}
                  >
                    {isBusy ? (
                      <ButtonSpinner />
                    ) : (
                      <View>
                        <Send size={14} color="#ffffff" />
                      </View>
                    )}
                    <ButtonText>{t('awaiting_resources.dispatch')}</ButtonText>
                  </Button>
                ) : null}
              </HStack>
            );
          })}
        </VStack>
      ) : (
        <Text className="mt-2 text-xs italic text-typography-500" testID={`${testID}-no-units`}>
          {t('awaiting_resources.no_units_available')}
        </Text>
      )}
    </View>
  );
};

/** A call awaiting resources: number, name, priority, age and address, then each open requirement. */
export const AwaitingCallCard: React.FC<AwaitingCallCardProps> = (props) => {
  const { t } = useTranslation();
  const { call, now, onOpenCall } = props;
  const age = minutesSinceUtc(call.LoggedOn, now);
  const callLabel = awaitingCallLabel(call);
  const priorityColor = call.PriorityColor || FALLBACK_PRIORITY_COLOR;

  return (
    <View style={StyleSheet.flatten([styles.card, { borderLeftColor: priorityColor }])} className="bg-background-0" testID={`awaiting-call-${call.CallId}`}>
      <Pressable onPress={() => onOpenCall(call.CallId)} accessibilityRole="link" testID={`awaiting-call-${call.CallId}-open`}>
        <HStack space="sm" className="items-start justify-between">
          <VStack className="flex-1">
            <Text className="text-base font-bold" numberOfLines={2}>
              {call.CallName ? `${callLabel} · ${call.CallName}` : callLabel}
            </Text>
            <HStack space="sm" className="flex-wrap items-center">
              {call.PriorityName ? (
                <HStack space="xs" className="items-center">
                  <View style={StyleSheet.flatten([styles.dot, { backgroundColor: priorityColor }])} />
                  <Text className="text-xs text-typography-600">{call.PriorityName}</Text>
                </HStack>
              ) : null}
              {age !== null ? <Text className="text-xs text-typography-500">{t('awaiting_resources.call_age', { minutes: age })}</Text> : null}
            </HStack>
          </VStack>
          <Text className="text-xs font-semibold text-primary-600">{t('awaiting_resources.open_call')}</Text>
        </HStack>
        {call.Address ? (
          <HStack space="xs" className="mt-1 items-center">
            <View>
              <MapPin size={12} color="#6b7280" />
            </View>
            <Text className="flex-1 text-xs text-typography-500" numberOfLines={1}>
              {call.Address}
            </Text>
          </HStack>
        ) : null}
      </Pressable>
      {(call.Requirements ?? []).map((requirement) => (
        <RequirementBlock key={`awaiting-req-${requirement.CallOutstandingRequirementId}`} {...props} requirement={requirement} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 12, borderRadius: 12, borderLeftWidth: 4, padding: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
