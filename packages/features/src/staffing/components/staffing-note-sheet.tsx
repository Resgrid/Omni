import { isNoteRequired, readableColors, type StatusOption } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, CustomBottomSheet, HStack, Text, Textarea, TextareaInput, VStack } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useStaffingActions } from '../hooks/use-staffing-actions';

export interface StaffingNoteSheetProps {
  isOpen: boolean;
  /** The level chosen on the home buttons; the sheet only adds the note. */
  staffing: StatusOption | null;
  onClose: () => void;
  testID?: string;
}

/**
 * Note step for a staffing level picked on the home buttons (a level whose note is Required, or a long press to add
 * one anyway). Choosing a different level happens in the status/staffing sheet (`PersonnelStatusSheet`), not here.
 */
export const StaffingNoteSheet: React.FC<StaffingNoteSheetProps> = ({ isOpen, staffing, onClose, testID = 'staffing-note-sheet' }) => {
  const { t } = useTranslation();
  const { submittingId, submit } = useStaffingActions();
  const [note, setNote] = useState('');
  const isSubmitting = submittingId !== null;
  const required = isNoteRequired(staffing);
  const canSave = !!staffing && !isSubmitting && (!required || note.trim().length > 0);
  const colors = readableColors(staffing?.BColor);

  // Every open starts with an empty note: the sheet stays mounted between uses.
  useEffect(() => {
    setNote('');
  }, [isOpen, staffing]);

  const handleSave = async () => {
    if (!staffing || !canSave) return;
    const outcome = await submit(staffing, note);
    if (outcome === 'sent' || outcome === 'queued') onClose();
  };

  const handleClose = () => {
    // Closing mid-save would not cancel it; like Cancel, it waits.
    if (!isSubmitting) onClose();
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={handleClose} snapPoints={[55]} testID={testID}>
      <VStack space="md" className="w-full">
        <Text className="text-xl font-bold text-typography-900" accessibilityRole="header">
          {t('home.staffing.add_note')}
        </Text>
        {staffing ? (
          <View style={StyleSheet.flatten([styles.chip, { backgroundColor: colors.backgroundColor }])} testID={`${testID}-selected`}>
            <Text style={StyleSheet.flatten([styles.chipText, { color: colors.textColor }])}>{staffing.Text}</Text>
          </View>
        ) : null}
        <Text className="text-sm text-typography-600">{required ? t('staffing.note_required') : t('staffing.note_optional')}</Text>
        <Textarea size="md" className="min-h-[100px]" isDisabled={isSubmitting}>
          <TextareaInput testID={`${testID}-input`} value={note} onChangeText={setNote} placeholder={t('home.staffing.note_placeholder')} accessibilityLabel={t('home.staffing.note')} />
        </Textarea>
        <HStack space="md">
          <Button variant="outline" action="secondary" className="flex-1" onPress={handleClose} isDisabled={isSubmitting} testID={`${testID}-cancel`}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button className="flex-1" onPress={() => void handleSave()} isDisabled={!canSave} accessibilityState={{ disabled: !canSave, busy: isSubmitting }} testID={`${testID}-save`}>
            {isSubmitting ? <ButtonSpinner /> : <ButtonText>{t('common.save')}</ButtonText>}
          </Button>
        </HStack>
      </VStack>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontWeight: '600' },
});
