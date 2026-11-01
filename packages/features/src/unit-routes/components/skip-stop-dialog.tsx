import { useTranslation } from '@resgrid/i18n';
import { Box, Button, ButtonText, Heading, HStack, NativeModal, Text, Textarea, TextareaInput, VStack } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

export interface SkipStopDialogProps {
  isOpen: boolean;
  stopName: string;
  onCancel: () => void;
  /** The reason as typed; an empty reason becomes "Skipped by driver". */
  onConfirm: (reason: string) => void;
  testID?: string;
}

/** Asks why a stop is skipped (Unit skip modal, in a NativeModal so it also works over sheets and on web/Electron). */
export const SkipStopDialog: React.FC<SkipStopDialogProps> = ({ isOpen, stopName, onCancel, onConfirm, testID = 'skip-stop-dialog' }) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  return (
    <NativeModal visible={isOpen} transparent animationType="fade" onRequestClose={onCancel} testID={testID}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('common.cancel')} testID={`${testID}-backdrop`} />
      <Box className="flex-1 items-center justify-center p-4" pointerEvents="box-none">
        <Box className="w-full max-w-md rounded-2xl bg-background-0 p-5" accessibilityViewIsModal>
          <VStack space="md">
            <Heading size="md" accessibilityRole="header">
              {stopName ? `${t('routes.skip')} — ${stopName}` : t('routes.skip')}
            </Heading>
            <Text className="text-sm text-typography-500">{t('routes.skip_reason')}</Text>
            <Textarea>
              <TextareaInput value={reason} onChangeText={setReason} placeholder={t('routes.skip_reason_placeholder')} accessibilityLabel={t('routes.skip_reason')} testID={`${testID}-reason`} />
            </Textarea>
            <HStack space="sm" className="justify-end">
              <Button variant="outline" action="secondary" onPress={onCancel} testID={`${testID}-cancel`}>
                <ButtonText>{t('common.cancel')}</ButtonText>
              </Button>
              <Button action="primary" onPress={() => onConfirm(reason.trim() || t('routes.skipped_by_driver'))} testID={`${testID}-confirm`}>
                <ButtonText>{t('routes.skip')}</ButtonText>
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
