import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { selectCallById, useCallsStore } from '@resgrid/data';
import { CallCard, callRoutes, CallSummaryModal, resolvePriority } from '@resgrid/features/calls';
import { useNavigationHandoff } from '@resgrid/features/contacts';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, useToast, View, VStack } from '@resgrid/ui';
import { router } from 'expo-router';
import { ArrowLeftRight, CircleX, Eye, type LucideIcon, MapPin, Navigation } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { callDestinationTarget, callLocationTarget } from '../lib/call-location';
import { ActiveCallSheet } from './active-call-sheet';
import { ConfirmDialog } from './confirm-dialog';

export interface ActiveCallCardProps {
  activeCallId: string | null;
  /** Makes a call the crew's active call (StatusProvider `onActiveCallChange`); without it the card cannot change calls. */
  onSelectCall?: (callId: string) => void;
  /** Clears the active call; the deselect action is hidden when the shell offers no way to clear it. */
  onClearCall?: () => void;
  /** Called after navigating away (closes the drawer). */
  onNavigate?: () => void;
  buttonMinHeight?: number;
  iconSize?: number;
  testID?: string;
}

interface CallAction {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  onPress: () => void;
}

/**
 * The crew's active call on the console (Unit `call-sidebar`): the call card, or "No active call". Tapping the card opens
 * the call summary (nature, notes, images, files, video, protocols, site info, history and audio, with a way on to the
 * full detail); tapping "No active call" opens the call picker. Actions: call details, directions to the call,
 * directions to its destination POI, change the active call and deselect (confirmed). Directions hand off to the crew's
 * navigation app — the app never calls a routing provider.
 */
export const ActiveCallCard: React.FC<ActiveCallCardProps> = ({ activeCallId, onSelectCall, onClearCall, onNavigate, buttonMinHeight = 44, iconSize = 18, testID = 'unit-active-call' }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const handoff = useNavigationHandoff();
  const call = useCallsStore((state) => (activeCallId ? selectCallById(state, activeCallId) : undefined));
  const priorities = useCallsStore((state) => state.callPriorities);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const priority = useMemo(() => (call ? resolvePriority(priorities, call.Priority) : null), [call, priorities]);
  const location = useMemo(() => (call ? callLocationTarget(call) : null), [call]);
  const destination = useMemo(() => (call ? callDestinationTarget(call) : null), [call]);

  const navigate = useCallback(
    async (target: typeof location) => {
      if (!target) return;
      const opened = await handoff.navigateTo(target);

      if (!opened) toast.error(t('map.failed_to_open_maps'));
    },
    [handoff, t, toast]
  );

  const openDetails = useCallback(
    (callId: string) => {
      pushRoutePath(router, callRoutes.callDetail(callId));
      onNavigate?.();
    },
    [onNavigate]
  );

  const actions = useMemo<CallAction[]>(() => {
    if (!call) return [];
    const list: CallAction[] = [{ id: 'details', labelKey: 'map.view_call_details', icon: Eye, onPress: () => openDetails(call.CallId) }];

    if (location) list.push({ id: 'directions', labelKey: 'calls.directions', icon: MapPin, onPress: () => void navigate(location) });

    if (destination) list.push({ id: 'destination', labelKey: 'calls.directions_to_destination', icon: Navigation, onPress: () => void navigate(destination) });

    // The card itself opens the call summary, so changing the call is a button of its own.
    if (onSelectCall) list.push({ id: 'change', labelKey: 'calls.select_active_call', icon: ArrowLeftRight, onPress: () => setIsPickerOpen(true) });

    if (onClearCall) list.push({ id: 'deselect', labelKey: 'calls.deselect', icon: CircleX, onPress: () => setIsConfirmOpen(true) });

    return list;
  }, [call, destination, location, navigate, onClearCall, onSelectCall, openDetails]);

  const onCardPress = call ? () => setIsSummaryOpen(true) : onSelectCall ? () => setIsPickerOpen(true) : undefined;

  const handleSelect = useCallback(
    (callId: string) => {
      setIsPickerOpen(false);
      onSelectCall?.(callId);
    },
    [onSelectCall]
  );

  return (
    <VStack space="xs" testID={testID}>
      <Pressable onPress={onCardPress} disabled={!onCardPress} accessibilityRole="button" accessibilityHint={call ? t('calls.call_summary_hint') : t('calls.select_active_call')} testID={`${testID}-trigger`}>
        {call ? (
          <CallCard
            call={call}
            priorityColor={priority?.color ?? null}
            priorityLabel={priority ? (priority.isLabelKey ? t(priority.label) : priority.label) : null}
            density="compact"
            showDispatchTicker={false}
            testID={`${testID}-card`}
          />
        ) : (
          <VStack className="rounded-xl border border-outline-100 bg-background-50 p-3" testID={`${testID}-none`}>
            <Text className="font-semibold text-typography-900">{t('calls.no_call_selected')}</Text>
            <Text className="text-sm text-typography-500">{t('calls.no_call_selected_info')}</Text>
          </VStack>
        )}
      </Pressable>
      {actions.length > 0 ? (
        <HStack className="w-full">
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <Pressable
                key={action.id}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={t(action.labelKey)}
                testID={`${testID}-${action.id}`}
                className="flex-1 items-center justify-center rounded-lg border border-outline-200 bg-background-0"
                style={StyleSheet.flatten([styles.action, { minHeight: buttonMinHeight }])}
              >
                <View>
                  <Icon size={iconSize} color="#2563eb" />
                </View>
              </Pressable>
            );
          })}
        </HStack>
      ) : null}
      {call ? <CallSummaryModal isOpen={isSummaryOpen} onClose={() => setIsSummaryOpen(false)} callId={call.CallId} onOpenDetails={openDetails} testID={`${testID}-summary`} /> : null}
      {onSelectCall ? <ActiveCallSheet isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} activeCallId={activeCallId} onSelect={handleSelect} rowMinHeight={buttonMinHeight + 8} /> : null}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={t('calls.confirm_deselect_title')}
        message={t('calls.confirm_deselect_message')}
        confirmLabel={t('calls.deselect')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          setIsConfirmOpen(false);
          onClearCall?.();
        }}
        testID={`${testID}-deselect-dialog`}
      />
    </VStack>
  );
};

const styles = StyleSheet.create({
  action: { marginHorizontal: 2 },
});
