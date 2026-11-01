import { usePersonnelStore } from '@resgrid/data';
import { getOfferedStatuses, HoldToConfirmButton, readableColors, toOptionId } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import type { StatusesResultData } from '@resgrid/models';
import { Button, Loading, Pressable, Text, useToast, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useOwnStatus } from '../hooks/use-own-status';
import { homeStatusOptions } from '../lib/home-statuses';

export interface HomeStatusButtonsProps {
  /** Department "Hold to set status": a two-second hold sets the status without a Save tap. */
  holdToConfirm?: boolean;
  /** Opens the status sheet on this status; `held` = a completed hold (save at once when nothing else is needed). */
  onSelectStatus: (status: StatusesResultData, held: boolean) => void;
  testID?: string;
}

interface StatusButtonProps {
  status: StatusesResultData;
  isCurrent: boolean;
  isHoldMode: boolean;
  onPress: (status: StatusesResultData) => void;
  onHold: (status: StatusesResultData) => void;
  onHoldTap: () => void;
}

const StatusButton: React.FC<StatusButtonProps> = React.memo(({ status, isCurrent, isHoldMode, onPress, onHold, onHoldTap }) => {
  const { t } = useTranslation();
  const { backgroundColor, textColor } = readableColors(status.BColor);
  const id = toOptionId(status.Id);
  const accessibilityLabel = isCurrent ? `${status.Text}, ${t('status.current')}` : status.Text;
  // Plain Text: the hold button is not a gluestack Button, so ButtonText has no style context there.
  const label = (
    <Text className="text-lg font-semibold" style={StyleSheet.flatten([styles.label, { color: textColor }])}>
      {status.Text}
    </Text>
  );

  return (
    <View>
      {isCurrent ? <View pointerEvents="none" style={StyleSheet.flatten([styles.ring, isHoldMode ? styles.ringHold : null])} className="border-typography-500" testID={`status-current-ring-${id}`} /> : null}
      {isHoldMode ? (
        <HoldToConfirmButton
          testID={`status-hold-button-${id}`}
          onConfirm={() => onHold(status)}
          onTap={onHoldTap}
          backgroundColor={backgroundColor}
          foregroundColor={textColor}
          style={styles.holdContent}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={t('status.hold_to_set_hint')}
        >
          {label}
        </HoldToConfirmButton>
      ) : (
        <Button variant="solid" className="w-full justify-center px-3 py-2" size="lg" style={{ backgroundColor }} onPress={() => onPress(status)} accessibilityLabel={accessibilityLabel} testID={`status-button-${id}`}>
          {label}
        </Button>
      )}
    </View>
  );
});

StatusButton.displayName = 'StatusButton';

/**
 * The member's personnel statuses as buttons (Responder home "Status" tab). A department's "next statuses" narrow the
 * list with a "Show all statuses" escape; the current status is ringed; in hold mode a two-second hold sets it.
 * The buttons open the status sheet (destination and note steps live there).
 */
export const HomeStatusButtons: React.FC<HomeStatusButtonsProps> = ({ holdToConfirm = false, onSelectStatus, testID = 'home-status-buttons' }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const statusOptions = usePersonnelStore((state) => state.statusOptions);
  const isLoading = usePersonnelStore((state) => state.loading.statusOptions === true);
  const { currentId } = useOwnStatus();
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(() => homeStatusOptions(statusOptions), [statusOptions]);
  const offered = useMemo(() => getOfferedStatuses(visible, currentId, showAll), [currentId, showAll, visible]);
  const hasNextRestriction = useMemo(() => showAll && getOfferedStatuses(visible, currentId, false).isRestricted, [currentId, showAll, visible]);

  // A new status brings its own next statuses: go back to the narrowed list.
  useEffect(() => {
    setShowAll(false);
  }, [currentId]);

  const handlePress = useCallback((status: StatusesResultData) => onSelectStatus(status, false), [onSelectStatus]);
  const handleHold = useCallback((status: StatusesResultData) => onSelectStatus(status, true), [onSelectStatus]);
  const handleHoldTap = useCallback(() => toast.info(t('status.hold_to_set_hint')), [t, toast]);

  if (isLoading && statusOptions.length === 0) return <Loading />;

  if (visible.length === 0) {
    return (
      <VStack className="p-4" testID={`${testID}-empty`}>
        <Text className="text-center text-typography-500">{t('home.status.no_options_available')}</Text>
      </VStack>
    );
  }

  return (
    <VStack space="sm" className="p-4" testID={testID}>
      {offered.offered.map((status) => (
        <StatusButton key={toOptionId(status.Id)} status={status} isCurrent={toOptionId(status.Id) === currentId} isHoldMode={holdToConfirm} onPress={handlePress} onHold={handleHold} onHoldTap={handleHoldTap} />
      ))}
      {offered.isRestricted ? (
        <Pressable onPress={() => setShowAll(true)} className="items-center py-1" accessibilityRole="button" testID={`${testID}-show-all`}>
          <Text className="font-semibold text-primary-600">{t('status.show_all_statuses', { count: offered.hiddenCount })}</Text>
        </Pressable>
      ) : hasNextRestriction ? (
        <Pressable onPress={() => setShowAll(false)} className="items-center py-1" accessibilityRole="button" testID={`${testID}-show-next`}>
          <Text className="font-semibold text-primary-600">{t('status.show_next_statuses')}</Text>
        </Pressable>
      ) : null}
    </VStack>
  );
};

const RING_OUTSET = 4;

const styles = StyleSheet.create({
  label: { flexShrink: 1, textAlign: 'center' },
  ring: { position: 'absolute', top: -RING_OUTSET, right: -RING_OUTSET, bottom: -RING_OUTSET, left: -RING_OUTSET, borderWidth: 2, borderRadius: 4 + RING_OUTSET },
  ringHold: { borderRadius: 8 + RING_OUTSET },
  holdContent: { paddingHorizontal: 12, paddingVertical: 12 },
});
