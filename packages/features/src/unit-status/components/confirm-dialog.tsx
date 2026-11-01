import { Box, Button, ButtonSpinner, ButtonText, Heading, HStack, NativeModal, Text, VStack } from '@resgrid/ui';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  isBusy?: boolean;
  testID?: string;
}

/**
 * A confirmation in its own NativeModal window (works over the drawer and bottom sheets, unlike `Alert.alert`, which
 * has no web/Electron equivalent). The confirm button comes last so a destructive action is never the default focus.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ isOpen, title, message, confirmLabel, cancelLabel, onConfirm, onCancel, destructive = false, isBusy = false, testID = 'confirm-dialog' }) => (
  <NativeModal visible={isOpen} transparent animationType="fade" onRequestClose={isBusy ? () => undefined : onCancel} testID={testID}>
    <Pressable style={styles.backdrop} onPress={isBusy ? undefined : onCancel} accessibilityRole="button" accessibilityLabel={cancelLabel} testID={`${testID}-backdrop`} />
    <Box className="flex-1 items-center justify-center p-4" pointerEvents="box-none">
      <Box className="w-full max-w-md rounded-2xl bg-background-0 p-5" accessibilityViewIsModal>
        <VStack space="md">
          <Heading size="md" accessibilityRole="header">
            {title}
          </Heading>
          <Text testID={`${testID}-message`}>{message}</Text>
          <HStack space="sm" className="justify-end">
            <Button variant="outline" action="secondary" onPress={onCancel} isDisabled={isBusy} accessibilityLabel={cancelLabel} testID={`${testID}-cancel`}>
              <ButtonText>{cancelLabel}</ButtonText>
            </Button>
            <Button action={destructive ? 'negative' : 'primary'} onPress={onConfirm} isDisabled={isBusy} accessibilityLabel={confirmLabel} testID={`${testID}-confirm`}>
              {isBusy ? <ButtonSpinner /> : <ButtonText>{confirmLabel}</ButtonText>}
            </Button>
          </HStack>
        </VStack>
      </Box>
    </Box>
  </NativeModal>
);

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
});
