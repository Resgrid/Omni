import { usePersonnelStore } from '@resgrid/data';
import { isNoteRequired, readableColors, type StatusOption, toOptionId } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { type StatusesResultData } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, Loading, Text, VStack } from '@resgrid/ui';
import React, { useCallback, useState } from 'react';
import { type AccessibilityActionEvent, StyleSheet, View } from 'react-native';

import { useOwnStaffing } from '../hooks/use-own-staffing';
import { useStaffingActions } from '../hooks/use-staffing-actions';
import { StaffingNoteSheet } from './staffing-note-sheet';

interface StaffingButtonProps {
  staffing: StatusesResultData;
  isCurrent: boolean;
  isSubmitting: boolean;
  isDisabled: boolean;
  onQuickSet: (staffing: StatusesResultData) => void;
  onOpenNote: (staffing: StatusesResultData) => void;
}

const StaffingButton: React.FC<StaffingButtonProps> = React.memo(({ staffing, isCurrent, isSubmitting, isDisabled, onQuickSet, onOpenNote }) => {
  const { t } = useTranslation();
  const noteRequired = isNoteRequired(staffing);
  const { backgroundColor, textColor } = readableColors(staffing.BColor);
  const id = toOptionId(staffing.Id);

  // A level that needs a note goes through the note sheet; everything else is one tap, with a long press as the way to
  // attach a note anyway.
  const handlePress = useCallback(() => (noteRequired ? onOpenNote(staffing) : onQuickSet(staffing)), [noteRequired, onOpenNote, onQuickSet, staffing]);
  const handleLongPress = useCallback(() => onOpenNote(staffing), [onOpenNote, staffing]);
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'longpress') onOpenNote(staffing);
      else if (event.nativeEvent.actionName === 'activate') handlePress();
    },
    [handlePress, onOpenNote, staffing]
  );

  return (
    <View>
      {isCurrent ? <View pointerEvents="none" style={styles.currentRing} className="border-typography-500" testID={`staffing-current-ring-${id}`} /> : null}
      <Button
        variant="solid"
        className="w-full justify-center px-3 py-2"
        size="lg"
        style={{ backgroundColor }}
        onPress={handlePress}
        onLongPress={noteRequired ? undefined : handleLongPress}
        isDisabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={isCurrent ? `${staffing.Text}, ${t('status.current')}` : staffing.Text}
        accessibilityHint={noteRequired ? t('home.staffing.note_required_hint') : t('home.staffing.quick_set_hint')}
        accessibilityState={{ disabled: isDisabled, busy: isSubmitting }}
        accessibilityActions={noteRequired ? [{ name: 'activate' }] : [{ name: 'activate' }, { name: 'longpress', label: t('home.staffing.add_note_action') }]}
        onAccessibilityAction={handleAccessibilityAction}
        testID={`staffing-button-${id}`}
      >
        {isSubmitting ? <ButtonSpinner color={textColor} testID={`staffing-button-spinner-${id}`} /> : null}
        <ButtonText style={{ color: textColor }}>{staffing.Text}</ButtonText>
      </Button>
    </View>
  );
});

StaffingButton.displayName = 'StaffingButton';

export interface StaffingButtonsProps {
  testID?: string;
}

/**
 * The member's staffing levels as one-tap buttons (Responder home "Staffing" tab). A level whose note is Required opens
 * the note sheet; a long press adds a note to any other level. The current level is ringed; saves go through the outbox.
 */
export const StaffingButtons: React.FC<StaffingButtonsProps> = ({ testID = 'staffing-buttons' }) => {
  const { t } = useTranslation();
  const staffingOptions = usePersonnelStore((state) => state.staffingOptions);
  const isLoading = usePersonnelStore((state) => state.loading.statusOptions === true);
  const { currentId } = useOwnStaffing();
  const { submittingId, quickSet } = useStaffingActions();
  const [noteFor, setNoteFor] = useState<StatusOption | null>(null);

  const handleQuickSet = useCallback(
    (staffing: StatusesResultData) => {
      void quickSet(staffing).then((result) => {
        if (result === 'needs-note') setNoteFor(staffing);
      });
    },
    [quickSet]
  );
  const handleOpenNote = useCallback((staffing: StatusesResultData) => setNoteFor(staffing), []);

  if (isLoading && staffingOptions.length === 0) return <Loading />;

  return (
    <>
      {staffingOptions.length === 0 ? (
        <VStack className="p-4" testID={`${testID}-empty`}>
          <Text className="text-center text-typography-500">{t('home.staffing.no_options_available')}</Text>
        </VStack>
      ) : (
        <VStack space="sm" className="p-4" testID={testID}>
          {staffingOptions.map((staffing) => {
            const id = toOptionId(staffing.Id);
            return (
              <StaffingButton key={id} staffing={staffing} isCurrent={id === currentId} isSubmitting={submittingId === id} isDisabled={submittingId !== null} onQuickSet={handleQuickSet} onOpenNote={handleOpenNote} />
            );
          })}
        </VStack>
      )}
      <StaffingNoteSheet isOpen={noteFor !== null} staffing={noteFor} onClose={() => setNoteFor(null)} />
    </>
  );
};

const RING_OUTSET = 4;

const styles = StyleSheet.create({
  currentRing: { position: 'absolute', top: -RING_OUTSET, right: -RING_OUTSET, bottom: -RING_OUTSET, left: -RING_OUTSET, borderWidth: 2, borderRadius: 4 + RING_OUTSET },
});
