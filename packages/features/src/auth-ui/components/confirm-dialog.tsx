import { Box, Button, ButtonSpinner, ButtonText, Heading, HStack, NativeModal, Text, VStack } from '@resgrid/ui';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Omit for an acknowledgement (one button). */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  /** Destructive actions (discard, clear, sign out) get the negative style. */
  destructive?: boolean;
  isBusy?: boolean;
  testID?: string;
  children?: React.ReactNode;
}

/**
 * A confirmation or acknowledgement dialog in a NativeModal (its own window, with a toast host), so it also works on top
 * of a bottom sheet. The confirm button is never the default focus for a destructive action: it is placed last.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ isOpen, title, message, confirmLabel, cancelLabel, onConfirm, onCancel, destructive = false, isBusy = false, testID = 'confirm-dialog', children }) => {
  const dismiss = onCancel ?? onConfirm;
  return (
    <NativeModal visible={isOpen} transparent animationType="fade" onRequestClose={isBusy ? () => undefined : dismiss} testID={testID}>
      <Pressable style={styles.backdrop} onPress={isBusy ? undefined : dismiss} accessibilityRole="button" accessibilityLabel={cancelLabel ?? confirmLabel} testID={`${testID}-backdrop`} />
      <Box className="flex-1 items-center justify-center p-4" pointerEvents="box-none">
        <Box className="w-full max-w-md rounded-2xl bg-background-0 p-5" accessibilityViewIsModal>
          <VStack space="md">
            <Heading size="md" accessibilityRole="header">
              {title}
            </Heading>
            <Text testID={`${testID}-message`}>{message}</Text>
            {children ?? null}
            <HStack space="sm" className="justify-end">
              {cancelLabel ? (
                <Button variant="outline" action="secondary" onPress={onCancel} isDisabled={isBusy} accessibilityLabel={cancelLabel} testID={`${testID}-cancel`}>
                  <ButtonText>{cancelLabel}</ButtonText>
                </Button>
              ) : null}
              <Button action={destructive ? 'negative' : 'primary'} onPress={onConfirm} isDisabled={isBusy} accessibilityLabel={confirmLabel} testID={`${testID}-confirm`}>
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
