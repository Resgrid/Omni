import { useTranslation } from '@resgrid/i18n';
import { Box, Button, ButtonSpinner, ButtonText, Heading, HStack, Input, InputField, NativeModal, Text, VStack } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

/** The server keeps up to 1000 characters of the note. */
export const DISMISS_NOTE_MAX_LENGTH = 1000;

export interface DismissRequirementDialogProps {
  isOpen: boolean;
  /** What is awaited ("MUG"), named in the prompt so the dispatcher knows which requirement goes. */
  requirementLabel: string | null;
  isSubmitting: boolean;
  /** The optional note saying why the call no longer needs it (blank when none). */
  onConfirm: (note: string) => void;
  onClose: () => void;
}

/**
 * Confirms dismissing an outstanding requirement (conditional run cards) with an optional note, in a NativeModal (its own
 * window with a toast host). Dismissing takes the call off the Awaiting Resources list for that requirement; nothing is
 * dispatched or cancelled. The destructive button is placed last.
 */
export const DismissRequirementDialog: React.FC<DismissRequirementDialogProps> = ({ isOpen, requirementLabel, isSubmitting, onConfirm, onClose }) => {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const testID = 'dismiss-requirement-dialog';

  useEffect(() => {
    if (!isOpen) setNote('');
  }, [isOpen]);

  const dismiss = isSubmitting ? () => undefined : onClose;

  return (
    <NativeModal visible={isOpen} transparent animationType="fade" onRequestClose={dismiss} testID={testID}>
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityRole="button" accessibilityLabel={t('common.cancel')} testID={`${testID}-backdrop`} />
      <Box className="flex-1 items-center justify-center p-4" pointerEvents="box-none">
        <Box className="w-full max-w-md rounded-2xl bg-background-0 p-5" accessibilityViewIsModal>
          <VStack space="md">
            <Heading size="md" accessibilityRole="header">
              {t('awaiting_resources.dismiss_title')}
            </Heading>
            <Text>{t('awaiting_resources.dismiss_confirm', { label: requirementLabel ?? '' })}</Text>
            <Input variant="outline" size="md" isDisabled={isSubmitting}>
              <InputField
                testID="dismiss-requirement-note"
                value={note}
                onChangeText={setNote}
                placeholder={t('awaiting_resources.dismiss_note_placeholder')}
                maxLength={DISMISS_NOTE_MAX_LENGTH}
                accessibilityLabel={t('awaiting_resources.dismiss_note_placeholder')}
              />
            </Input>
            <HStack space="sm" className="justify-end">
              <Button variant="outline" action="secondary" onPress={onClose} isDisabled={isSubmitting} testID={`${testID}-cancel`}>
                <ButtonText>{t('common.cancel')}</ButtonText>
              </Button>
              <Button action="negative" onPress={() => onConfirm(note.trim())} isDisabled={isSubmitting} testID={`${testID}-confirm`}>
                {isSubmitting ? <ButtonSpinner /> : <ButtonText>{t('awaiting_resources.dismiss')}</ButtonText>}
              </Button>
            </HStack>
          </VStack>
        </Box>
      </Box>
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
});
