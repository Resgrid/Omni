import { getOfferedStatuses, HoldToConfirmButton, readableColors, type StatusOption, toOptionId } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { Pressable, Text, useToast, View } from '@resgrid/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import type { ConsoleMetrics } from '../lib/console-layout';

/** Gap between a status button and the ring that marks the current status, then the ring line itself. */
const RING_GAP = 2;
const RING_WIDTH = 2;
const RING_OUTSET = RING_GAP + RING_WIDTH;
const BUTTON_RADIUS = 8;

export interface StatusButtonsProps {
  statuses: readonly StatusOption[];
  currentStatusId: string | null;
  /** Department "Hold to set status" (config `StatusHoldToConfirm`). */
  holdToConfirm: boolean;
  /** Opens the unit status sheet on the chosen status (`holdConfirmed` after a completed hold). */
  onSelect: (status: StatusOption, holdConfirmed: boolean) => void;
  metrics: Pick<ConsoleMetrics, 'buttonMinHeight' | 'labelClassName' | 'statusColumns'>;
  disabled?: boolean;
  testID?: string;
}

/**
 * The console's status buttons (Unit sidebar): the unit's status set in the department's colours, narrowed to the
 * current status's next statuses until the crew asks for all, the current status ringed, and press-and-hold when the
 * department requires it. A button opens the unit status sheet (destination, note, GPS), which saves through the outbox.
 */
export const StatusButtons: React.FC<StatusButtonsProps> = ({ statuses, currentStatusId, holdToConfirm, onSelect, metrics, disabled = false, testID = 'unit-status-buttons' }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);

  // A new status brings its own next statuses: go back to the narrowed list.
  useEffect(() => setShowAll(false), [currentStatusId]);

  const offered = useMemo(() => getOfferedStatuses(statuses, currentStatusId, showAll), [currentStatusId, showAll, statuses]);
  const canNarrow = useMemo(() => showAll && getOfferedStatuses(statuses, currentStatusId, false).isRestricted, [currentStatusId, showAll, statuses]);
  const itemStyle = useMemo(() => StyleSheet.flatten([styles.item, { width: `${100 / Math.max(1, metrics.statusColumns)}%` as const }]), [metrics.statusColumns]);

  return (
    <View testID={testID}>
      <View style={styles.grid}>
        {offered.offered.map((status) => {
          const id = toOptionId(status.Id);
          const isCurrent = id === currentStatusId;
          const { backgroundColor, textColor } = readableColors(status.BColor, '#ffffff');
          const accessibilityLabel = isCurrent ? `${status.Text}, ${t('status.current')}` : status.Text;
          const label = (
            <Text className={metrics.labelClassName} style={StyleSheet.flatten([styles.label, { color: textColor }])} numberOfLines={2}>
              {status.Text}
            </Text>
          );
          return (
            <View key={id} style={itemStyle}>
              <View>
                {isCurrent ? <View pointerEvents="none" className="border-typography-500" style={styles.ring} testID={`${testID}-current-${id}`} /> : null}
                {holdToConfirm ? (
                  <HoldToConfirmButton
                    testID={`${testID}-hold-${id}`}
                    onConfirm={() => onSelect(status, true)}
                    onTap={() => toast.info(t('status.hold_to_set_hint'))}
                    disabled={disabled}
                    backgroundColor={backgroundColor}
                    foregroundColor={textColor}
                    accessibilityLabel={accessibilityLabel}
                    accessibilityHint={t('status.hold_to_set_hint')}
                  >
                    {/* The hold button pads 10 px top and bottom; the label row carries the rest of the touch target. */}
                    <View style={StyleSheet.flatten([styles.holdLabel, { minHeight: Math.max(0, metrics.buttonMinHeight - 20) }])}>{label}</View>
                  </HoldToConfirmButton>
                ) : (
                  <Pressable
                    testID={`${testID}-${id}`}
                    onPress={() => onSelect(status, false)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={accessibilityLabel}
                    accessibilityState={{ disabled, selected: isCurrent }}
                    style={StyleSheet.flatten([styles.button, { backgroundColor, minHeight: metrics.buttonMinHeight }, disabled ? styles.disabled : null])}
                  >
                    {label}
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </View>
      {offered.isRestricted ? (
        <Pressable testID={`${testID}-show-all`} onPress={() => setShowAll(true)} accessibilityRole="button" style={StyleSheet.flatten([styles.toggle, { minHeight: metrics.buttonMinHeight }])}>
          <Text className="font-semibold text-primary-600">{t('status.show_all_statuses', { count: offered.hiddenCount })}</Text>
        </Pressable>
      ) : canNarrow ? (
        <Pressable testID={`${testID}-show-next`} onPress={() => setShowAll(false)} accessibilityRole="button" style={StyleSheet.flatten([styles.toggle, { minHeight: metrics.buttonMinHeight }])}>
          <Text className="font-semibold text-primary-600">{t('status.show_next_statuses')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  item: { paddingHorizontal: 4, paddingVertical: 4 + RING_OUTSET / 2 },
  button: { borderRadius: BUTTON_RADIUS, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  label: { textAlign: 'center', flexShrink: 1 },
  holdLabel: { justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.5 },
  ring: { position: 'absolute', top: -RING_OUTSET, right: -RING_OUTSET, bottom: -RING_OUTSET, left: -RING_OUTSET, borderWidth: RING_WIDTH, borderRadius: BUTTON_RADIUS + RING_OUTSET },
  toggle: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
});
