import { type ShiftActionOutcome, useShiftsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, CustomBottomSheet, HStack, Text, Textarea, TextareaInput, VStack } from '@resgrid/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { useShiftAction } from '../hooks/use-shift-action';
import type { ShiftSheetAction } from '../lib/shift-action-types';
import { refreshAfterShiftChange } from '../lib/shift-loaders';
import { swapOptionsFor } from '../lib/shift-rules';
import { formatShiftDate, formatShiftTime } from '../lib/shift-time';
import { ShiftSelectRow } from './shift-select-row';

export interface ShiftActionSheetProps {
  action: ShiftSheetAction | null;
  onClose: () => void;
}

const NO_SWAP = '';

interface SheetCopy {
  title: string;
  description: string;
  confirm: string;
  tone: 'primary' | 'positive' | 'negative';
  withNote: boolean;
}

/** Confirms a trade or approval action (with an optional note and, when accepting or applying, a shift offered back). */
export const ShiftActionSheet: React.FC<ShiftActionSheetProps> = ({ action, onClose }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const myShiftDays = useShiftsStore((state) => state.myShiftDays);
  const { busy, run } = useShiftAction();
  const [note, setNote] = useState('');
  const [offeredSignupId, setOfferedSignupId] = useState<string>(NO_SWAP);

  useEffect(() => {
    setNote('');
    setOfferedSignupId(NO_SWAP);
  }, [action]);

  const offersSwap = action?.kind === 'accept-trade' || action?.kind === 'apply-trade';
  const swapOptions = useMemo(() => (action && (action.kind === 'accept-trade' || action.kind === 'apply-trade') ? swapOptionsFor(action.trade, myShiftDays) : []), [action, myShiftDays]);

  const copy = useMemo<SheetCopy | null>(() => {
    if (!action) return null;
    switch (action.kind) {
      case 'accept-trade':
        return { title: t('shifts.trade.accept_title'), description: t('shifts.trade.accept_description'), confirm: t('shifts.actions.accept'), tone: 'positive', withNote: true };
      case 'decline-trade':
        return { title: t('shifts.trade.decline_title'), description: t('shifts.trade.decline_description'), confirm: t('shifts.actions.decline'), tone: 'negative', withNote: true };
      case 'apply-trade':
        return { title: t('shifts.trade.apply_title'), description: t('shifts.trade.apply_description', { name: action.trade.SourceUserName }), confirm: t('shifts.actions.apply'), tone: 'positive', withNote: true };
      case 'withdraw-application':
        return { title: t('shifts.trade.withdraw_title'), description: t('shifts.trade.withdraw_description'), confirm: t('shifts.actions.withdraw_application'), tone: 'negative', withNote: false };
      case 'cancel-trade':
        return {
          title: t('shifts.trade.cancel_title'),
          description: action.trade.IsOpen ? t('shifts.trade.cancel_description_open') : t('shifts.trade.cancel_description'),
          confirm: t('shifts.actions.cancel_trade'),
          tone: 'negative',
          withNote: false,
        };
      case 'finish-trade':
        return {
          title: t('shifts.trade.finish_title'),
          description: action.offeredShift
            ? t('shifts.trade.finish_swap_description', { name: action.user.Name, shift: action.offeredShift.ShiftName, date: formatShiftDate(action.offeredShift.ShiftDay, locale) })
            : t('shifts.trade.finish_give_description', { name: action.user.Name }),
          confirm: t('shifts.actions.confirm'),
          tone: 'primary',
          withNote: false,
        };
      case 'review-trade':
        return {
          title: action.approve ? t('shifts.review.approve_trade_title') : t('shifts.review.deny_trade_title'),
          description: t('shifts.review.trade_summary', { from: action.trade.SourceUserName, to: action.trade.AcceptedUserName || t('shifts.unknown') }),
          confirm: action.approve ? t('shifts.actions.approve') : t('shifts.actions.deny'),
          tone: action.approve ? 'positive' : 'negative',
          withNote: true,
        };
      case 'review-signup':
        return {
          title: action.approve ? t('shifts.review.approve_signup_title') : t('shifts.review.deny_signup_title'),
          description: [action.signup.UserName, action.signup.GroupName].filter((part) => !!part).join(' · '),
          confirm: action.approve ? t('shifts.actions.approve') : t('shifts.actions.deny'),
          tone: action.approve ? 'positive' : 'negative',
          withNote: true,
        };
    }
  }, [action, locale, t]);

  const subject = useMemo(() => {
    if (!action) return '';
    const source = action.kind === 'review-signup' ? action.signup : action.trade;
    return `${source.ShiftName} · ${formatShiftDate(source.ShiftDay || source.Start, locale)} · ${formatShiftTime(source.Start, locale)} – ${formatShiftTime(source.End, locale)}`;
  }, [action, locale]);

  const confirm = async () => {
    if (!action) return;
    const store = useShiftsStore.getState();
    const trimmed = note.trim();
    const offered = offeredSignupId ? [offeredSignupId] : [];
    let outcome: ShiftActionOutcome;
    switch (action.kind) {
      case 'accept-trade':
        outcome = await run('confirm', () => store.respondToTrade(action.trade.ShiftSignupTradeId, true, trimmed, offered), 'shifts.toast.trade_accepted');
        break;
      case 'decline-trade':
        outcome = await run('confirm', () => store.respondToTrade(action.trade.ShiftSignupTradeId, false, trimmed, []), 'shifts.toast.trade_declined');
        break;
      case 'apply-trade':
        outcome = await run('confirm', () => store.respondToTrade(action.trade.ShiftSignupTradeId, true, trimmed, offered), 'shifts.toast.trade_applied');
        break;
      case 'withdraw-application':
        outcome = await run('confirm', () => store.respondToTrade(action.trade.ShiftSignupTradeId, false, '', []), 'shifts.toast.trade_application_withdrawn');
        break;
      case 'cancel-trade':
        outcome = await run('confirm', () => store.cancelTrade(action.trade.ShiftSignupTradeId), 'shifts.toast.trade_cancelled');
        break;
      case 'finish-trade':
        outcome = await run(
          'confirm',
          () => store.finishTrade(action.trade.ShiftSignupTradeId, action.user.UserId, action.offeredShift?.ShiftSignupId ?? null),
          (result) => (result.approvalPending ? 'shifts.toast.trade_finished_pending' : 'shifts.toast.trade_finished')
        );
        break;
      case 'review-trade':
        outcome = await run('confirm', () => store.reviewTrade(action.trade.ShiftSignupTradeId, action.approve, trimmed), action.approve ? 'shifts.toast.approved' : 'shifts.toast.denied');
        break;
      case 'review-signup':
        outcome = await run('confirm', () => store.reviewSignup(action.signup.ShiftSignupId, action.approve, trimmed), action.approve ? 'shifts.toast.approved' : 'shifts.toast.denied');
        break;
    }
    if (outcome.success) {
      onClose();
      void refreshAfterShiftChange(action.kind === 'review-signup' ? { shiftDayId: action.signup.ShiftDayId } : { tradeId: action.trade.ShiftSignupTradeId });
    }
  };

  const isBusy = busy !== null;

  return (
    <CustomBottomSheet isOpen={action !== null} onClose={onClose} snapPoints={[70]} testID="shift-action-sheet">
      {action && copy ? (
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <VStack space="md">
            <Text className="text-lg font-semibold text-typography-900" accessibilityRole="header">
              {copy.title}
            </Text>
            <Text size="sm" className="font-medium text-typography-800">
              {subject}
            </Text>
            <Text size="sm" className="text-typography-600">
              {copy.description}
            </Text>

            {offersSwap && swapOptions.length > 0 ? (
              <VStack space="sm" testID="shift-action-swap-options">
                <Text size="sm" className="font-semibold text-typography-900">
                  {t('shifts.trade.offer_back')}
                </Text>
                <ShiftSelectRow id={NO_SWAP} mode="radio" title={t('shifts.trade.no_swap')} selected={offeredSignupId === NO_SWAP} onToggle={setOfferedSignupId} testID="swap-option-none" />
                {swapOptions.map((day) => (
                  <ShiftSelectRow
                    key={day.MySignupId}
                    id={day.MySignupId}
                    mode="radio"
                    title={day.ShiftName}
                    subtitle={`${formatShiftDate(day.ShiftDay || day.Start, locale)} · ${formatShiftTime(day.Start, locale)} – ${formatShiftTime(day.End, locale)}`}
                    selected={offeredSignupId === day.MySignupId}
                    onToggle={setOfferedSignupId}
                    testID={`swap-option-${day.MySignupId}`}
                  />
                ))}
              </VStack>
            ) : null}

            {action.kind === 'finish-trade' && action.trade.PickIsApproval ? (
              <Text size="sm" className="text-typography-600">
                {t('shifts.trade.pick_as_approver_note')}
              </Text>
            ) : null}
            {action.kind === 'finish-trade' && action.trade.RequireApproval && !action.trade.PickIsApproval ? (
              <Text size="sm" className="text-warning-700">
                {t('shifts.trade.finish_pending_note')}
              </Text>
            ) : null}

            {copy.withNote ? (
              <VStack space="xs">
                <Text size="sm" className="font-medium text-typography-700">
                  {t('shifts.note_label')}
                </Text>
                <Textarea size="md">
                  <TextareaInput value={note} onChangeText={setNote} placeholder={t('shifts.note_optional_placeholder')} accessibilityLabel={t('shifts.note_label')} testID="shift-action-note" />
                </Textarea>
              </VStack>
            ) : null}

            <HStack space="sm" className="mt-2">
              <Button variant="outline" action="secondary" className="flex-1" onPress={onClose} isDisabled={isBusy} testID="shift-action-cancel">
                <ButtonText>{t('common.cancel')}</ButtonText>
              </Button>
              <Button action={copy.tone} className="flex-1" onPress={() => void confirm()} isDisabled={isBusy} accessibilityState={{ disabled: isBusy, busy: isBusy }} testID="shift-action-confirm">
                {isBusy ? <ButtonSpinner /> : null}
                <ButtonText>{copy.confirm}</ButtonText>
              </Button>
            </HStack>
          </VStack>
        </ScrollView>
      ) : null}
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  content: { paddingBottom: 32 },
});
