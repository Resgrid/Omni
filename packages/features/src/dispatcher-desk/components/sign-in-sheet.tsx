import { DESK_PRESENCE_KEY, useDispatcherDeskStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, DateTimeField, Input, InputField, Switch, Text, useFormFactor } from '@resgrid/ui';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useDeskActions } from '../hooks/use-desk-actions';
import { useDispatcherDeskView } from '../hooks/use-dispatcher-desk';
import { deviceLabelKey } from '../lib/desk-format';

export interface SignInSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Signing in to the desk (plan D3): the device kind comes from the form factor (phone, tablet, desktop), the number the
 * desk rings to connect a held caller is prefilled from the last one, and where the department allows it the member can
 * go on duty without a shift ("unscheduled duty", optionally until a time). Starting Away takes no routed work at once.
 */
export const SignInSheet: React.FC<SignInSheetProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { formFactor } = useFormFactor();
  const { me, config } = useDispatcherDeskView();
  const actions = useDeskActions();
  const busy = useDispatcherDeskStore((state) => state.busyKeys.includes(DESK_PRESENCE_KEY));
  const [callbackNumber, setCallbackNumber] = useState('');
  const [unscheduled, setUnscheduled] = useState(false);
  const [dutyEndsOn, setDutyEndsOn] = useState('');
  const [startAway, setStartAway] = useState(false);
  const deviceKind = formFactor === 'phone' || formFactor === 'tablet' ? formFactor : 'desktop';
  const allowUnscheduled = config?.AllowUnscheduledDuty === true;
  const needsShift = config?.RequireShift !== false && !me?.IsOnDuty;

  // A sign-in the desk finished after the answer gave up (a slow request, a dropped connection) still shows on the next
  // board read: close once the member turns up signed in instead of leaving the form open over a desk that took it.
  const signedIn = me?.IsSignedIn === true;
  const wasSignedIn = useRef(signedIn);

  useEffect(() => {
    const before = wasSignedIn.current;
    wasSignedIn.current = signedIn;

    if (isOpen && signedIn && !before) onClose();
  }, [isOpen, onClose, signedIn]);

  useEffect(() => {
    if (!isOpen) return;
    setCallbackNumber(me?.CallbackNumber ?? '');
    setUnscheduled(allowUnscheduled && !me?.IsOnDuty);
    setDutyEndsOn('');
    setStartAway(false);
  }, [allowUnscheduled, isOpen, me?.CallbackNumber, me?.IsOnDuty]);

  const submit = async () => {
    const outcome = await actions.run(
      () =>
        useDispatcherDeskStore.getState().signIn({
          DeviceKind: deviceKind,
          CallbackNumber: callbackNumber.trim() || null,
          Unscheduled: allowUnscheduled && unscheduled,
          DutyEndsOn: allowUnscheduled && unscheduled && dutyEndsOn ? dutyEndsOn : null,
          StartAway: startAway,
        }),
      { success: t('dispatcher_desk.sign_in.done') }
    );

    if (outcome.ok) onClose();
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={busy} snapPoints={[70]} testID="desk-sign-in-sheet">
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text className="mb-1 text-center text-lg font-bold text-typography-900" accessibilityRole="header">
          {t('dispatcher_desk.sign_in.title')}
        </Text>
        <Text size="sm" className="mb-3 text-center text-typography-600">
          {t('dispatcher_desk.sign_in.device', { device: t(deviceLabelKey(deviceKind)) })}
        </Text>

        {needsShift && !(allowUnscheduled && unscheduled) ? (
          <View className="mb-3 rounded-lg border border-warning-300 bg-background-warning p-3" accessibilityRole="alert" testID="desk-sign-in-no-shift">
            <Text size="sm" className="text-warning-800">
              {t(allowUnscheduled ? 'dispatcher_desk.sign_in.no_shift_unscheduled' : 'dispatcher_desk.sign_in.no_shift')}
            </Text>
          </View>
        ) : null}

        <Text size="sm" className="mb-1 font-medium text-typography-700">
          {t('dispatcher_desk.sign_in.callback_number')}
        </Text>
        <Input size="lg">
          <InputField
            value={callbackNumber}
            onChangeText={setCallbackNumber}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder={t('dispatcher_desk.sign_in.callback_placeholder')}
            accessibilityLabel={t('dispatcher_desk.sign_in.callback_number')}
            testID="desk-sign-in-callback"
          />
        </Input>
        <Text size="xs" className="mb-3 mt-1 text-typography-500">
          {t('dispatcher_desk.sign_in.callback_hint')}
        </Text>

        {allowUnscheduled ? (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text className="font-medium text-typography-900">{t('dispatcher_desk.sign_in.unscheduled')}</Text>
              <Text size="xs" className="text-typography-500">
                {t('dispatcher_desk.sign_in.unscheduled_hint')}
              </Text>
            </View>
            <Switch value={unscheduled} onValueChange={setUnscheduled} accessibilityLabel={t('dispatcher_desk.sign_in.unscheduled')} testID="desk-sign-in-unscheduled" />
          </View>
        ) : null}

        {allowUnscheduled && unscheduled ? (
          <View className="mb-3">
            <DateTimeField mode="datetime" value={dutyEndsOn} onChange={setDutyEndsOn} label={t('dispatcher_desk.sign_in.until')} testID="desk-sign-in-until" />
          </View>
        ) : null}

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text className="font-medium text-typography-900">{t('dispatcher_desk.sign_in.start_away')}</Text>
            <Text size="xs" className="text-typography-500">
              {t('dispatcher_desk.sign_in.start_away_hint')}
            </Text>
          </View>
          <Switch value={startAway} onValueChange={setStartAway} accessibilityLabel={t('dispatcher_desk.sign_in.start_away')} testID="desk-sign-in-away" />
        </View>

        <View style={styles.actions}>
          <Button variant="outline" className="mr-2 flex-1" onPress={onClose} isDisabled={busy} accessibilityLabel={t('common.cancel')}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button className="flex-1" onPress={() => void submit()} isDisabled={busy} accessibilityLabel={t('dispatcher_desk.actions.sign_in')} testID="desk-sign-in-submit">
            <ButtonText>{t('dispatcher_desk.actions.sign_in')}</ButtonText>
          </Button>
        </View>
      </ScrollView>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rowText: { flex: 1, marginRight: 8 },
  actions: { flexDirection: 'row', marginTop: 8, marginBottom: 8 },
});
