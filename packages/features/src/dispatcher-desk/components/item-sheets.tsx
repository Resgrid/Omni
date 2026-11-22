import { deskItemKey, useDispatcherDeskStore } from '@resgrid/data';
import { OptionChips } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import { type DispatcherCompleteInput, DispatcherDisplayState, type DispatcherQueueItemData } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, HStack, Pressable, Switch, Text, Textarea, TextareaInput, VStack } from '@resgrid/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useDeskActions } from '../hooks/use-desk-actions';
import { useDispatcherDeskView } from '../hooks/use-dispatcher-desk';
import { useResetOnOpen } from '../hooks/use-reset-on-open';
import { completeOutcomesFor, defaultCompleteOutcome, outcomeLabelKey } from '../lib/desk-format';
import { StateChip } from './state-chip';

export interface ItemSheetProps {
  item: DispatcherQueueItemData;
  isOpen: boolean;
  onClose: () => void;
  onDone?: () => void;
}

/**
 * Hands held work to another dispatcher signed in to the desk (not on break), with an optional note: the member's own
 * work, or anyone's for a supervisor.
 */
export const TransferItemSheet: React.FC<ItemSheetProps> = ({ item, isOpen, onClose, onDone }) => {
  const { t } = useTranslation();
  const { desk, me } = useDispatcherDeskView();
  const actions = useDeskActions();
  const busy = useDispatcherDeskStore((state) => state.busyKeys.includes(deskItemKey(item.DispatcherQueueItemId)));
  const [toUserId, setToUserId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const candidates = useMemo(
    () => (desk?.Members ?? []).filter((member) => member.IsSignedIn && member.UserId !== item.AssignedUserId && member.UserId !== me?.UserId && member.DisplayState !== DispatcherDisplayState.OnBreak),
    [desk?.Members, item.AssignedUserId, me?.UserId]
  );

  useEffect(() => {
    if (isOpen) {
      setToUserId(null);
      setNote('');
    }
  }, [isOpen]);

  const submit = async () => {
    if (!toUserId) return;
    const outcome = await actions.run(() => useDispatcherDeskStore.getState().transfer(item.DispatcherQueueItemId, toUserId, note), { success: t('dispatcher_desk.transfer.done') });

    if (outcome.ok) {
      onClose();
      onDone?.();
    }
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={busy} snapPoints={[70]} testID="desk-transfer-sheet">
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text className="mb-3 text-center text-lg font-bold text-typography-900" accessibilityRole="header">
          {t('dispatcher_desk.transfer.title')}
        </Text>
        {candidates.length === 0 ? (
          <Text className="mb-3 text-center text-typography-600" testID="desk-transfer-none">
            {t('dispatcher_desk.transfer.none')}
          </Text>
        ) : (
          <VStack space="xs" className="mb-3">
            {candidates.map((member) => (
              <Pressable
                key={member.UserId}
                onPress={() => setToUserId(member.UserId)}
                accessibilityRole="radio"
                accessibilityState={{ selected: toUserId === member.UserId }}
                accessibilityLabel={member.Name ?? member.UserId}
                className={`min-h-[48px] rounded-lg border px-3 py-2 ${toUserId === member.UserId ? 'border-primary-500 bg-primary-50' : 'border-outline-200'}`}
                testID={`desk-transfer-${member.UserId}`}
              >
                <HStack className="items-center justify-between">
                  <Text className="mr-2 shrink font-medium text-typography-900" numberOfLines={1}>
                    {member.Name ?? member.UserId}
                  </Text>
                  <StateChip member={member} />
                </HStack>
                <Text size="xs" className="text-typography-500">
                  {t('dispatcher_desk.team.holding', { count: member.ActiveItemCount, capacity: member.Capacity })}
                </Text>
              </Pressable>
            ))}
          </VStack>
        )}
        <Text size="sm" className="mb-1 font-medium text-typography-700">
          {`${t('dispatcher_desk.transfer.note')} (${t('common.optional')})`}
        </Text>
        <Textarea size="md">
          <TextareaInput value={note} onChangeText={setNote} accessibilityLabel={t('dispatcher_desk.transfer.note')} testID="desk-transfer-note" />
        </Textarea>
        <View style={styles.actions}>
          <Button variant="outline" className="mr-2 flex-1" onPress={onClose} isDisabled={busy} accessibilityLabel={t('common.cancel')}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button className="flex-1" onPress={() => void submit()} isDisabled={busy || !toUserId} accessibilityLabel={t('dispatcher_desk.item.transfer')} testID="desk-transfer-submit">
            <ButtonText>{t('dispatcher_desk.item.transfer')}</ButtonText>
          </Button>
        </View>
      </ScrollView>
    </CustomBottomSheet>
  );
};

/** Finishes an item with how it ended (dispatched, a call created, left pending, a duplicate, nothing needed…) and a note. */
export const CompleteItemSheet: React.FC<ItemSheetProps> = ({ item, isOpen, onClose, onDone }) => {
  const { t } = useTranslation();
  const actions = useDeskActions();
  const busy = useDispatcherDeskStore((state) => state.busyKeys.includes(deskItemKey(item.DispatcherQueueItemId)));
  const { Kind: kind, CallId: callId } = item;
  const outcomes = useMemo(() => completeOutcomesFor({ Kind: kind, CallId: callId }), [kind, callId]);
  const [outcome, setOutcome] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [notifyTexter, setNotifyTexter] = useState(true);
  const intakeThread = !!item.IntakeConversationId;

  useResetOnOpen(isOpen, () => {
    setOutcome(defaultCompleteOutcome({ Kind: kind, CallId: callId }));
    setNote('');
    setNotifyTexter(true);
  });

  const submit = async () => {
    if (outcome === null) return;

    const input: DispatcherCompleteInput = { ItemId: item.DispatcherQueueItemId, Outcome: outcome, CallId: item.CallId, Note: note };

    // Only an intake text thread has a texter to tell; Core leaves other items alone either way.
    if (intakeThread) input.NotifyParticipant = notifyTexter;

    const result = await actions.run(() => useDispatcherDeskStore.getState().complete(input), {
      success: t('dispatcher_desk.complete.done'),
    });

    if (result.ok) {
      onClose();
      onDone?.();
    }
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={busy} snapPoints={[65]} testID="desk-complete-sheet">
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text className="mb-3 text-center text-lg font-bold text-typography-900" accessibilityRole="header">
          {t('dispatcher_desk.complete.title')}
        </Text>
        <Text size="sm" className="mb-1 font-medium text-typography-700">
          {t('dispatcher_desk.complete.outcome')}
        </Text>
        <OptionChips
          options={outcomes.map((value) => ({ value, label: t(outcomeLabelKey(value)) }))}
          selected={outcome === null ? [] : [outcome]}
          onToggle={setOutcome}
          accessibilityLabel={t('dispatcher_desk.complete.outcome')}
          testID="desk-complete-outcome"
        />
        <Text size="sm" className="mb-1 mt-3 font-medium text-typography-700">
          {`${t('dispatcher_desk.complete.note')} (${t('common.optional')})`}
        </Text>
        <Textarea size="md">
          <TextareaInput value={note} onChangeText={setNote} accessibilityLabel={t('dispatcher_desk.complete.note')} testID="desk-complete-note" />
        </Textarea>
        {intakeThread ? (
          <View style={styles.row} className="mt-3">
            <View style={styles.rowText}>
              <Text className="font-medium text-typography-900">{t('dispatcher_desk.complete.notify_participant')}</Text>
              <Text size="xs" className="text-typography-500">
                {t('dispatcher_desk.complete.notify_participant_hint')}
              </Text>
            </View>
            <Switch value={notifyTexter} onValueChange={setNotifyTexter} accessibilityLabel={t('dispatcher_desk.complete.notify_participant')} testID="desk-complete-notify" />
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button variant="outline" className="mr-2 flex-1" onPress={onClose} isDisabled={busy} accessibilityLabel={t('common.cancel')}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button action="positive" className="flex-1" onPress={() => void submit()} isDisabled={busy || outcome === null} accessibilityLabel={t('dispatcher_desk.item.complete')} testID="desk-complete-submit">
            <ButtonText>{t('dispatcher_desk.item.complete')}</ButtonText>
          </Button>
        </View>
      </ScrollView>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  actions: { flexDirection: 'row', marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowText: { flex: 1, marginRight: 12 },
});
