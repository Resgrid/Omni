import { useTranslation } from '@resgrid/i18n';
import { Box, Button, ButtonSpinner, ButtonText, Heading, NativeModal, Text, VStack } from '@resgrid/ui';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

export type RouteConflictChoice = 'end' | 'cancel' | 'keep';

export interface RouteConflictDialogProps {
  isOpen: boolean;
  /** The route the unit runs now; null when its name is not known. */
  existingName: string | null;
  /** Ending or cancelling needs the running route's id: without it only "keep" is offered. */
  canReplace: boolean;
  isBusy?: boolean;
  onChoose: (choice: RouteConflictChoice) => void;
  testID?: string;
}

/**
 * The unit already runs (or has paused) another route (Core 409 `route_in_progress`) when a call's route should start: end
 * or cancel that one and start the call's route, or keep the current one. In its own NativeModal window, so it shows over
 * the drawer on every platform.
 */
export const RouteConflictDialog: React.FC<RouteConflictDialogProps> = ({ isOpen, existingName, canReplace, isBusy = false, onChoose, testID = 'call-route-conflict' }) => {
  const { t } = useTranslation();
  const keep = () => (isBusy ? undefined : onChoose('keep'));

  return (
    <NativeModal visible={isOpen} transparent animationType="fade" onRequestClose={keep} testID={testID}>
      <Pressable style={styles.backdrop} onPress={keep} accessibilityRole="button" accessibilityLabel={t('unit_status.route.conflict_keep')} testID={`${testID}-backdrop`} />
      <Box className="flex-1 items-center justify-center p-4" pointerEvents="box-none">
        <Box className="w-full max-w-md rounded-2xl bg-background-0 p-5" accessibilityViewIsModal>
          <VStack space="md">
            <Heading size="md" accessibilityRole="header">
              {t('unit_status.route.conflict_title')}
            </Heading>
            <Text testID={`${testID}-message`}>{existingName ? t('unit_status.route.conflict_message', { route: existingName }) : t('unit_status.route.conflict_message_unnamed')}</Text>
            {isBusy ? (
              <Button isDisabled testID={`${testID}-busy`}>
                <ButtonSpinner />
              </Button>
            ) : (
              <VStack space="sm">
                {canReplace ? (
                  <>
                    <Button action="negative" onPress={() => onChoose('end')} testID={`${testID}-end`}>
                      <ButtonText>{t('unit_status.route.conflict_end')}</ButtonText>
                    </Button>
                    <Button variant="outline" action="negative" onPress={() => onChoose('cancel')} testID={`${testID}-cancel`}>
                      <ButtonText>{t('unit_status.route.conflict_cancel')}</ButtonText>
                    </Button>
                  </>
                ) : null}
                <Button variant="outline" action="secondary" onPress={() => onChoose('keep')} testID={`${testID}-keep`}>
                  <ButtonText>{t('unit_status.route.conflict_keep')}</ButtonText>
                </Button>
              </VStack>
            )}
          </VStack>
        </Box>
      </Box>
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
});
