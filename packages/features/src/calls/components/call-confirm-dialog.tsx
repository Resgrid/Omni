import { Box, Button, ButtonSpinner, ButtonText, Heading, HStack, NativeModal, Text, VStack } from '@resgrid/ui';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

export interface CallConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  isBusy?: boolean;
  /** Keeps confirm disabled for a reason other than a request running (e.g. offline for an online-only action). */
  isConfirmDisabled?: boolean;
  /** Choices shown between the message and the buttons (e.g. whether to notify). */
  children?: React.ReactNode;
  testID?: string;
}

/**
 * Asks before an irreversible call action (dispatch now pages people; cancelling or deleting removes the call) in a NativeModal —
 * its own window with a toast host — on native, web and Electron alike (no `window.confirm` / `Alert.alert` forks).
 */
export const CallConfirmDialog: React.FC<CallConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
  isBusy = false,
  isConfirmDisabled = false,
  children,
  testID = 'call-confirm-dialog',
}) => {
  const dismiss = isBusy ? () => undefined : onCancel;
  const confirmDisabled = isBusy || isConfirmDisabled;

  return (
    <NativeModal visible={isOpen} transparent animationType="fade" onRequestClose={dismiss} testID={testID}>
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityRole="button" accessibilityLabel={cancelLabel} testID={`${testID}-backdrop`} />
      <Box className="flex-1 items-center justify-center p-4" pointerEvents="box-none">
        <Box className="w-full max-w-md rounded-2xl bg-background-0 p-5" accessibilityViewIsModal>
          <VStack space="md">
            <Heading size="md" accessibilityRole="header">
              {title}
            </Heading>
            <Text testID={`${testID}-message`}>{message}</Text>
            {children}
            <HStack space="sm" className="justify-end">
              <Button variant="outline" action="secondary" onPress={onCancel} isDisabled={isBusy} testID={`${testID}-cancel`}>
                <ButtonText>{cancelLabel}</ButtonText>
              </Button>
              <Button action={destructive ? 'negative' : 'primary'} onPress={onConfirm} isDisabled={confirmDisabled} testID={`${testID}-confirm`}>
                {isBusy ? <ButtonSpinner /> : <ButtonText>{confirmLabel}</ButtonText>}
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
