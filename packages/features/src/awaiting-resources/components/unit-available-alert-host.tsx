import { useSecurity } from '@resgrid/auth';
import { awaitingDispatchKey, type AwaitingUnitAlert, useAwaitingResourcesStore } from '@resgrid/data';
import { callRoutes } from '@resgrid/features/calls';
import { formatResponseSeconds } from '@resgrid/features/runcards';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, HStack, Pressable, Text, useFormFactor, VStack } from '@resgrid/ui';
import { type Href, useRouter } from 'expo-router';
import { BellRing, ExternalLink, Send, X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useAwaitingResourceActions, useIsAwaitingResourcesEnabled } from '../hooks/use-awaiting-resources';
import { awaitingCallLabel, unitLabel } from '../lib/awaiting-format';

/** Wider screens get a card in the corner; phones get it full width. */
const CARD_MAX_WIDTH = 440;
const ACCENT = '#ea580c';

const UnitAvailableAlertCard: React.FC<{ alert: AwaitingUnitAlert; canDispatch: boolean }> = ({ alert, canDispatch }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const busyKey = useAwaitingResourcesStore((state) => state.busyKey);
  const { dispatchUnit } = useAwaitingResourceActions();
  const testID = `unit-available-alert-${alert.unitId}`;

  return (
    <View style={styles.card} className="border-warning-400 bg-background-0" accessibilityRole="alert" accessibilityLiveRegion="assertive" testID={testID}>
      <HStack space="sm" className="items-center">
        <View>
          <BellRing size={18} color={ACCENT} />
        </View>
        <Text className="flex-1 font-bold" numberOfLines={2}>
          {t('awaiting_resources.unit_available_title', { unit: unitLabel(alert.unitName, alert.unitTypeName) })}
        </Text>
        <Pressable onPress={() => useAwaitingResourcesStore.getState().dismissUnitAlert(alert.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')} testID={`${testID}-close`}>
          <View>
            <X size={18} color="#6b7280" />
          </View>
        </Pressable>
      </HStack>
      {alert.message ? <Text className="mt-1.5 text-sm text-typography-700">{alert.message}</Text> : null}
      {alert.calls.map((call) => {
        const callLabel = awaitingCallLabel({ CallId: call.callId, CallNumber: call.callNumber });
        const response = formatResponseSeconds(call.responseSeconds);
        const details = [call.label, response ? t('awaiting_resources.response_time', { time: response }) : null, t('awaiting_resources.waiting_minutes', { minutes: call.ageMinutes })].filter(
          (part): part is string => !!part
        );
        const isBusy = busyKey === awaitingDispatchKey(call.callId, alert.unitId);
        return (
          <VStack key={`alert-${alert.unitId}-call-${call.callId}`} className="mt-2 border-t border-outline-100 pt-2">
            <Text className="text-sm font-semibold" numberOfLines={1}>
              {call.callName ? `${callLabel} · ${call.callName}` : callLabel}
            </Text>
            <Text className="text-xs text-typography-500" numberOfLines={2}>
              {details.join(' · ')}
            </Text>
            <HStack space="sm" className="mt-2 flex-wrap">
              {canDispatch ? (
                <Button size="xs" onPress={() => void dispatchUnit(call.callId, alert.unitId)} isDisabled={isBusy} testID={`${testID}-dispatch-${call.callId}`}>
                  {isBusy ? (
                    <ButtonSpinner />
                  ) : (
                    <View>
                      <Send size={14} color="#ffffff" />
                    </View>
                  )}
                  <ButtonText>{t('awaiting_resources.dispatch_to_call', { call: callLabel })}</ButtonText>
                </Button>
              ) : null}
              <Button size="xs" variant="outline" onPress={() => router.push(callRoutes.callDetail(String(call.callId)) as Href)} testID={`${testID}-open-${call.callId}`}>
                <View>
                  <ExternalLink size={14} color="#2563eb" />
                </View>
                <ButtonText>{t('awaiting_resources.open_call')}</ButtonText>
              </Button>
            </HStack>
          </VStack>
        );
      })}
    </View>
  );
};

/**
 * Alerts that a unit matching calls awaiting resources became available (conditional run cards). Unlike a toast, each
 * stays until the dispatcher dispatches the unit, closes it, or the calls it names stop waiting: a crew short on scene
 * must not be missed because a toast timed out. Dispatching is one step and needs the create-calls right. Render once,
 * over every screen of the signed-in shell.
 */
export const UnitAvailableAlertHost: React.FC = () => {
  const isEnabled = useIsAwaitingResourcesEnabled();
  const alerts = useAwaitingResourcesStore((state) => state.unitAlerts);
  const { canUserCreateCalls } = useSecurity();
  const { width, isPhone } = useFormFactor();

  if (!isEnabled || alerts.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.flatten([styles.host, isPhone ? styles.hostPhone : { right: 16, width: Math.min(CARD_MAX_WIDTH, width - 32) }])} testID="unit-available-alert-host">
      {alerts.map((alert) => (
        <UnitAvailableAlertCard key={alert.id} alert={alert} canDispatch={canUserCreateCalls} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  host: { position: 'absolute', bottom: 16, zIndex: 60 },
  hostPhone: { left: 12, right: 12 },
  card: {
    borderWidth: 2,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
});
