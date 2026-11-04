import { useCallDetailStore, useCallsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, NativeModal, Pressable, ScrollView, Text, useThemeColors, useToast, VStack } from '@resgrid/ui';
import { UserPlus, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useCallFormHookPoints } from '../hook-points';
import { useDispatchRecipients } from '../hooks/use-call-form-data';
import { callDisplayName } from '../lib/call-display';
import { buildAddResourcesRequest, dispatchesToSelection, type DispatchSelection, EMPTY_DISPATCH_SELECTION, selectionSize } from '../lib/dispatch-selection';
import { DispatchSelectionModal } from './dispatch-selection';

export interface AddResourcesSheetProps {
  call: CallResultData | null;
  onClose: () => void;
  /** After the resources were dispatched (the call detail re-reads the call). */
  onDispatched?: (callId: string) => void;
}

/**
 * "Dispatch more" for a call already out (Dispatch baseline, call detail and console): the run card's add-resources
 * recommendation where the app has run cards (only what the call still lacks, with response codes under conditional
 * run cards) plus a free pick of personnel, groups, roles and units. The pick is unioned with the call's current
 * dispatches, so the server notifies only the new resources. Online write (paging must never replay late).
 */
export const AddResourcesSheet: React.FC<AddResourcesSheetProps> = ({ call, onClose, onDispatched }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const colors = useThemeColors();
  const { AddResourcesRecommendation } = useCallFormHookPoints();
  const isOpen = call !== null;
  const [added, setAdded] = useState<DispatchSelection>(EMPTY_DISPATCH_SELECTION);
  const [unitResponseCodes, setUnitResponseCodes] = useState<string | undefined>(undefined);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { recipients } = useDispatchRecipients(isOpen);

  useEffect(() => {
    if (isOpen) {
      setAdded(EMPTY_DISPATCH_SELECTION);
      setUnitResponseCodes(undefined);
    }
  }, [isOpen, call?.CallId]);

  const dispatch = async () => {
    if (!call) return;
    setIsSaving(true);

    try {
      // EditCall rewrites the whole call, so it is built from the server's current call and dispatches, never cached
      // copies: a stale call would undo another dispatcher's edit, and a stale dispatch list would un-dispatch resources.
      const latest = await useCallDetailStore.getState().fetchCurrentCall(call.CallId);

      if (!latest) {
        toast.error(t('dispatch_console.add_resources_error'));

        return;
      }

      await useCallDetailStore.getState().updateCall(buildAddResourcesRequest(latest.call, dispatchesToSelection(latest.extraData.Dispatches), added, { callFormData: latest.extraData.CallFormData, unitResponseCodes }));
      void useCallsStore.getState().fetchCallDispatches([call.CallId], { bypassCache: true });
      toast.success(t('dispatch_console.add_resources_success'));
      onDispatched?.(call.CallId);
      onClose();
    } catch {
      toast.error(t('dispatch_console.add_resources_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const count = selectionSize(added);
  const callLabel = call ? `#${call.Number} ${callDisplayName(call, t('data_protection.protected_value'))}` : null;

  return (
    <NativeModal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} testID="add-resources-sheet">
      <View style={styles.screen} className="bg-background-0">
        <HStack className="items-center justify-between border-b border-outline-100 px-4 py-3">
          <VStack className="flex-1">
            <Text className="text-lg font-bold">{t('dispatch_console.add_resources')}</Text>
            {callLabel ? (
              <Text className="text-xs text-typography-500" numberOfLines={1}>
                {callLabel}
              </Text>
            ) : null}
          </VStack>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="add-resources-sheet-close">
            <View>
              <X size={22} color={colors.textMuted} />
            </View>
          </Pressable>
        </HStack>
        <ScrollView contentContainerStyle={styles.content}>
          {call && AddResourcesRecommendation ? (
            <AddResourcesRecommendation
              callId={call.CallId}
              selection={added}
              onApply={(selection, decision) => {
                setAdded(selection);
                setUnitResponseCodes(decision.unitResponseCodes);
              }}
            />
          ) : null}
          <Pressable onPress={() => setIsPickerOpen(true)} accessibilityRole="button" className="flex-row items-center rounded-lg border border-outline-200 p-3" testID="add-resources-pick">
            <View>
              <UserPlus size={18} color={colors.primary} />
            </View>
            <Text className="ml-2 flex-1">{count > 0 ? t('dispatch_console.add_resources_selected', { count }) : t('dispatch_console.add_resources_choose')}</Text>
          </Pressable>
          <Button className="mt-4" onPress={() => void dispatch()} isDisabled={isSaving || count === 0} testID="add-resources-dispatch">
            {isSaving ? <ButtonSpinner /> : null}
            <ButtonText>{t('dispatch_console.add_resources_dispatch')}</ButtonText>
          </Button>
        </ScrollView>
      </View>
      <DispatchSelectionModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        recipients={recipients}
        value={added}
        onConfirm={(selection) => {
          setAdded(selection);
          setIsPickerOpen(false);
        }}
      />
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16 },
});
