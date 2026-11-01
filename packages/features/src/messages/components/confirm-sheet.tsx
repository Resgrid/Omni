import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, CustomBottomSheet, HStack, Text, VStack } from '@resgrid/ui';
import React from 'react';

export interface MessagesConfirmSheetProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  isBusy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  testID?: string;
}

/** A destructive confirmation (delete) in a sheet: React Native's Alert does not exist on web/Electron. */
export const MessagesConfirmSheet: React.FC<MessagesConfirmSheetProps> = ({ isOpen, title, message, confirmLabel, isBusy = false, onConfirm, onClose, testID = 'messages-confirm-sheet' }) => {
  const { t } = useTranslation();
  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[35]} testID={testID}>
      <VStack space="md">
        <Text className="text-lg font-semibold text-typography-900" accessibilityRole="header">
          {title}
        </Text>
        <Text className="text-typography-700">{message}</Text>
        <HStack space="sm">
          <Button variant="outline" action="secondary" className="flex-1" onPress={onClose} isDisabled={isBusy} testID={`${testID}-cancel`}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button action="negative" className="flex-1" onPress={onConfirm} isDisabled={isBusy} testID={`${testID}-confirm`}>
            {isBusy ? <ButtonSpinner /> : null}
            <ButtonText>{confirmLabel}</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </CustomBottomSheet>
  );
};
