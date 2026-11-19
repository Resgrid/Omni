import { useTranslation } from '@resgrid/i18n';
import { BottomAnchoredKeyboardView, Box, Button, ButtonSpinner, ButtonText, Heading, HStack, Input, InputField, NativeModal, Text, VStack } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

/** Core keeps up to 1000 characters of the note. */
export const ALERT_NOTE_MAX_LENGTH = 1000;

export interface DismissAlertDialogProps {
  isOpen: boolean;
  isSubmitting: boolean;
  /** The optional note saying why (blank when none). */
  onConfirm: (note: string) => void;
  onClose: () => void;
}

/**
 * Confirms dismissing a recurring call alert with an optional note, in a NativeModal (its own window with a toast host).
 * Dismissing only closes the alert: nothing is sent, created or skipped.
 */
export const DismissAlertDialog: React.FC<DismissAlertDialogProps> = ({ isOpen, isSubmitting, onConfirm, onClose }) => {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const testID = 'dismiss-alert-dialog';

  useEffect(() => {
    if (!isOpen) setNote('');
  }, [isOpen]);

  const dismiss = isSubmitting ? () => undefined : onClose;

  return (
    <NativeModal visible={isOpen} transparent animationType="fade" onRequestClose={dismiss} testID={testID}>
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityRole="button" accessibilityLabel={t('common.cancel')} testID={`${testID}-backdrop`} />
      <BottomAnchoredKeyboardView pointerEvents="box-none">
        <Box className="flex-1 items-center justify-center p-4" pointerEvents="box-none">
          <Box className="w-full max-w-md rounded-2xl bg-background-0 p-5" accessibilityViewIsModal>
            <VStack space="md">
              <Heading size="md" accessibilityRole="header">
                {t('recurring_calls.alerts.dismiss_title')}
              </Heading>
              <Text>{t('recurring_calls.alerts.dismiss_confirm')}</Text>
              <Input variant="outline" size="md" isDisabled={isSubmitting}>
                <InputField
                  testID="dismiss-alert-note"
                  value={note}
                  onChangeText={setNote}
                  placeholder={t('recurring_calls.alerts.dismiss_note_placeholder')}
                  maxLength={ALERT_NOTE_MAX_LENGTH}
                  accessibilityLabel={t('recurring_calls.alerts.dismiss_note_placeholder')}
                />
              </Input>
              <HStack space="sm" className="justify-end">
                <Button variant="outline" action="secondary" onPress={onClose} isDisabled={isSubmitting} testID={`${testID}-cancel`}>
                  <ButtonText>{t('common.cancel')}</ButtonText>
                </Button>
                <Button action="negative" onPress={() => onConfirm(note.trim())} isDisabled={isSubmitting} testID={`${testID}-confirm`}>
                  {isSubmitting ? <ButtonSpinner /> : <ButtonText>{t('recurring_calls.alerts.dismiss')}</ButtonText>}
                </Button>
              </HStack>
            </VStack>
          </Box>
        </Box>
      </BottomAnchoredKeyboardView>
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
});
