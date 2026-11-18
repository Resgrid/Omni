import { useTranslation } from '@resgrid/i18n';
import { BottomAnchoredKeyboardView, Box, Button, ButtonSpinner, ButtonText, DateTimeField, Heading, HStack, Input, InputField, NativeModal, Switch, Text, VStack } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

/** Core keeps up to 1000 characters of the reason. */
export const PAUSE_REASON_MAX_LENGTH = 1000;

export interface PauseRecurringCallValues {
  reason: string;
  /** "yyyy-MM-dd" in the department's time zone, or blank to stay paused. */
  resumeOn: string;
  deleteUpcomingCalls: boolean;
}

export interface PauseRecurringCallDialogProps {
  isOpen: boolean;
  isSubmitting: boolean;
  /** Department today ("yyyy-MM-dd"): the earliest resume date offered. */
  today?: string | null;
  onConfirm: (values: PauseRecurringCallValues) => void;
  onClose: () => void;
}

/**
 * Pauses a schedule without deleting it: an optional reason, an optional date it resumes by itself, and whether the calls
 * it already created that have not gone out are deleted too (off by default: they still go out unless deleted).
 */
export const PauseRecurringCallDialog: React.FC<PauseRecurringCallDialogProps> = ({ isOpen, isSubmitting, today = null, onConfirm, onClose }) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [resumeOn, setResumeOn] = useState('');
  const [deleteUpcomingCalls, setDeleteUpcomingCalls] = useState(false);
  const testID = 'pause-recurring-call-dialog';
  const resumeTooEarly = !!resumeOn && !!today && resumeOn <= today;

  useEffect(() => {
    if (isOpen) return;
    setReason('');
    setResumeOn('');
    setDeleteUpcomingCalls(false);
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
                {t('recurring_calls.pause_title')}
              </Heading>
              <Text>{t('recurring_calls.pause_description')}</Text>
              <Input variant="outline" size="md" isDisabled={isSubmitting}>
                <InputField
                  testID={`${testID}-reason`}
                  value={reason}
                  onChangeText={setReason}
                  placeholder={t('recurring_calls.pause_reason_placeholder')}
                  maxLength={PAUSE_REASON_MAX_LENGTH}
                  accessibilityLabel={t('recurring_calls.pause_reason_placeholder')}
                />
              </Input>
              <DateTimeField value={resumeOn} onChange={setResumeOn} label={t('recurring_calls.pause_resume_on')} mode="date" disabled={isSubmitting} testID={`${testID}-resume-on`} />
              {resumeTooEarly ? (
                <Text size="sm" className="text-error-700" testID={`${testID}-resume-error`}>
                  {t('recurring_calls.pause_resume_on_future')}
                </Text>
              ) : null}
              <View style={styles.switchRow}>
                <Text className="flex-1 pr-3">{t('recurring_calls.delete_upcoming_calls')}</Text>
                <Switch value={deleteUpcomingCalls} onValueChange={setDeleteUpcomingCalls} accessibilityLabel={t('recurring_calls.delete_upcoming_calls')} testID={`${testID}-delete-upcoming`} />
              </View>
              <HStack space="sm" className="justify-end">
                <Button variant="outline" action="secondary" onPress={onClose} isDisabled={isSubmitting} testID={`${testID}-cancel`}>
                  <ButtonText>{t('common.cancel')}</ButtonText>
                </Button>
                <Button onPress={() => onConfirm({ reason: reason.trim(), resumeOn, deleteUpcomingCalls })} isDisabled={isSubmitting || resumeTooEarly} testID={`${testID}-confirm`}>
                  {isSubmitting ? <ButtonSpinner /> : <ButtonText>{t('recurring_calls.pause')}</ButtonText>}
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
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});
