import { useCheckInTimersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, Pressable, Text, Textarea, TextareaInput, useToast } from '@resgrid/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CHECK_IN_TYPE_LABEL_KEYS, CheckInType, OTHERS_CHECK_IN_TYPES, SELF_CHECK_IN_TYPES } from '../lib/check-in-status';
import type { CheckInAbility } from '../lib/check-in-target';

export interface CheckInTarget {
  checkInType: number;
  /** Checking in someone else (IC/Dispatch `checkIn.others`). */
  userId?: string | null;
  unitId?: number | null;
  /** Shown in the title ("Check in: Engine 1"). */
  name?: string;
}

export interface CheckInSheetProps {
  isOpen: boolean;
  onClose: () => void;
  callId: number;
  ability: CheckInAbility;
  /** Preselected target (from a timer card or a person row); omitted = a free check-in of the member. */
  target?: CheckInTarget | null;
  testID?: string;
}

/**
 * Records a check-in (Responder sheet + Dispatch on-behalf). Offline-capable: `performCheckIn` goes through the outbox
 * with an idempotency key, so a check-in made without a connection is queued and replays once on reconnect.
 */
export const CheckInSheet: React.FC<CheckInSheetProps> = ({ isOpen, onClose, callId, ability, target, testID = 'check-in-sheet' }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const performCheckIn = useCheckInTimersStore((state) => state.performCheckIn);
  const defaultType = target?.checkInType ?? CheckInType.Personnel;
  const [selectedType, setSelectedType] = useState<number>(defaultType);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedType(defaultType);
      setNote('');
    }
  }, [defaultType, isOpen]);

  const types = useMemo(() => {
    const allowed = ability.others ? OTHERS_CHECK_IN_TYPES : SELF_CHECK_IN_TYPES;
    // A card-driven unit check-in keeps its type even for a member who cannot pick "Unit" freely.
    return target && !allowed.includes(target.checkInType) ? [target.checkInType, ...allowed] : allowed;
  }, [ability.others, target]);

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const result = await performCheckIn({ callId, checkInType: selectedType, userId: target?.userId ?? null, unitId: target?.unitId ?? null, note: note.trim() || null });
      if (result.outcome === 'sent') toast.success(t('check_in.check_in_success'));
      else if (result.outcome === 'queued') toast.info(t('check_in.queued_offline'));
      else toast.error(t('check_in.check_in_error'));
      onClose();
    } catch {
      toast.error(t('check_in.check_in_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = target?.name ? `${t('check_in.select_type')}: ${target.name}` : t('check_in.select_type');

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={isSubmitting} loadingText={t('check_in.confirm')} testID={testID}>
      <View style={styles.content}>
        <Text className="mb-3 text-lg font-bold text-typography-900" accessibilityRole="header">
          {title}
        </Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('check_in.select_type')}>
          {types.map((type) => {
            const selected = selectedType === type;
            return (
              <Pressable
                key={type}
                onPress={() => setSelectedType(type)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t(CHECK_IN_TYPE_LABEL_KEYS[type] ?? 'common.unknown')}
                testID={`${testID}-type-${type}`}
                className={`mb-2 flex-row items-center rounded-lg p-3 ${selected ? 'bg-primary-100' : 'bg-background-100'}`}
              >
                <View style={StyleSheet.flatten([styles.radio, selected ? styles.radioSelected : null])}>{selected ? <View style={styles.radioDot} /> : null}</View>
                <Text className={selected ? 'font-semibold text-typography-900' : 'text-typography-700'}>{t(CHECK_IN_TYPE_LABEL_KEYS[type] ?? 'common.unknown')}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text size="sm" className="mb-1 mt-2 text-typography-500">
          {t('check_in.add_note')}
        </Text>
        <Textarea size="md">
          <TextareaInput value={note} onChangeText={setNote} placeholder={t('check_in.add_note')} accessibilityLabel={t('check_in.add_note')} testID={`${testID}-note`} />
        </Textarea>
        <Button size="lg" className="mt-4" onPress={() => void submit()} isDisabled={isSubmitting} accessibilityLabel={t('check_in.confirm')} testID={`${testID}-confirm`}>
          <ButtonText>{t('check_in.confirm')}</ButtonText>
        </Button>
      </View>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  content: { width: '100%' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  radioSelected: { borderColor: '#2563EB', backgroundColor: '#2563EB' },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
});
