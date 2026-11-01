import type { UpdateCallRequest } from '@resgrid/api';
import { useCallDetailStore, useCallsStore } from '@resgrid/data';
import { dispatchesToSelection, mergeDispatchSelections, selectionSize } from '@resgrid/features/call-queues';
import { type DispatchSelection, DispatchSelectionModal, EMPTY_DISPATCH_SELECTION, useDispatchRecipients } from '@resgrid/features/calls';
import { RecommendationPanel, useAddResourcesRecommendation } from '@resgrid/features/runcards';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, NativeModal, Pressable, ScrollView, Text, useToast, VStack } from '@resgrid/ui';
import { UserPlus, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface AddResourcesSheetProps {
  call: CallResultData | null;
  onClose: () => void;
}

const coordinatesOf = (call: CallResultData): { latitude?: number; longitude?: number } => {
  const [lat, lon] = call.Latitude && call.Longitude ? [call.Latitude, call.Longitude] : (call.Geolocation ?? '').split(',');
  const latitude = Number(lat);
  const longitude = Number(lon);
  return lat && lon && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : {};
};

/**
 * The EditCall request that adds `added` to a call while preserving everything else (Dispatch baseline
 * `buildAddResourcesUpdateRequest`). The picked resources are unioned with the call's CURRENT dispatches, so nothing is
 * un-dispatched and the server notifies only the new resources. Linked call and protocols are left out (no picker here:
 * EditCall then neither changes nor enforces them); CallFormData is threaded through so it is not blanked.
 */
export function buildAddResourcesRequest(call: CallResultData, current: DispatchSelection, added: DispatchSelection, extras: { callFormData?: string; unitResponseCodes?: string } = {}): UpdateCallRequest {
  const merged = mergeDispatchSelections(current, added);
  return {
    callId: call.CallId,
    name: call.Name,
    nature: call.Nature,
    note: call.Note,
    address: call.Address,
    ...coordinatesOf(call),
    priority: call.Priority,
    type: call.Type,
    contactName: call.ContactName,
    contactInfo: call.ContactInfo,
    what3words: call.What3Words,
    callFormData: extras.callFormData,
    destinationPoiId: call.DestinationPoiId,
    referenceId: call.ReferenceId,
    externalId: call.ExternalId,
    incidentId: call.IncidentId,
    dispatchUsers: merged.users,
    dispatchGroups: merged.groups,
    dispatchRoles: merged.roles,
    dispatchUnits: merged.units,
    dispatchEveryone: merged.everyone,
    ...(extras.unitResponseCodes ? { unitResponseCodes: extras.unitResponseCodes } : {}),
  };
}

/**
 * "Dispatch more" for a call already out (Dispatch baseline): the run card's add-resources recommendation (only what the
 * call still lacks, with Re-evaluate and response codes under conditional run cards) plus a free pick of personnel,
 * groups, roles and units. Online write (EditCall is not in Dispatch's offline scope; paging must never replay late).
 */
export const AddResourcesSheet: React.FC<AddResourcesSheetProps> = ({ call, onClose }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const isOpen = call !== null;
  const [added, setAdded] = useState<DispatchSelection>(EMPTY_DISPATCH_SELECTION);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { recipients } = useDispatchRecipients(isOpen);
  const recommendation = useAddResourcesRecommendation({ callId: call?.CallId, enabled: isOpen });

  useEffect(() => {
    if (isOpen) setAdded(EMPTY_DISPATCH_SELECTION);
  }, [isOpen, call?.CallId]);

  const dispatch = async () => {
    if (!call) return;
    setIsSaving(true);
    try {
      // Union against the server's current dispatches, never a cached list: a stale one would un-dispatch resources.
      const latest = await useCallsStore.getState().fetchCallExtraData(call.CallId, { bypassCache: true });
      if (!latest) {
        toast.error(t('dispatch_console.add_resources_error'));
        return;
      }
      await useCallDetailStore
        .getState()
        .updateCall(buildAddResourcesRequest(call, dispatchesToSelection(latest.Dispatches), added, { callFormData: latest.CallFormData, unitResponseCodes: recommendation.getUnitResponseCodes(added.units) }));
      void useCallsStore.getState().fetchCallDispatches([call.CallId], { bypassCache: true });
      toast.success(t('dispatch_console.add_resources_success'));
      onClose();
    } catch {
      toast.error(t('dispatch_console.add_resources_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const count = selectionSize(added);

  return (
    <NativeModal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} testID="add-resources-sheet">
      <View style={styles.screen} className="bg-background-0">
        <HStack className="items-center justify-between border-b border-outline-100 px-4 py-3">
          <VStack className="flex-1">
            <Text className="text-lg font-bold">{t('dispatch_console.add_resources')}</Text>
            {call ? <Text className="text-xs text-typography-500" numberOfLines={1}>{`#${call.Number} ${call.Name}`}</Text> : null}
          </VStack>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="add-resources-sheet-close">
            <View>
              <X size={22} color="#6b7280" />
            </View>
          </Pressable>
        </HStack>
        <ScrollView contentContainerStyle={styles.content}>
          {recommendation.isRunCardsEnabled ? (
            <RecommendationPanel
              recommendation={recommendation.recommendation}
              isLoading={recommendation.isLoading}
              hasError={recommendation.hasError}
              hasFetched={recommendation.hasFetched}
              isApplied={recommendation.isApplied}
              onApply={() => setAdded((current) => recommendation.applyToSelection(current))}
              onRefresh={recommendation.refresh}
              coveredMessage={t('run_cards.covered_on_call', { level: recommendation.recommendation?.AlarmLevel ?? call?.AlarmLevel ?? 1 })}
              isExistingCall
              conditions={recommendation.conditions}
              testID="add-resources-recommendation"
            />
          ) : null}
          <Pressable onPress={() => setIsPickerOpen(true)} accessibilityRole="button" className="flex-row items-center rounded-lg border border-outline-200 p-3" testID="add-resources-pick">
            <View>
              <UserPlus size={18} color="#6366f1" />
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
