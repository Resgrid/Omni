import { parseApiUtcDate, toZonedWallClock, zonedWallClockToUtc } from '@resgrid/core/utils/dates';
import { useCallDetailStore, useCallsStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, DateTimeField, Text, useToast } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { scheduledDispatchUtc } from '../lib/call-time';

export interface RescheduleCallSheetProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * `UpdateScheduledDispatchTime` takes the dispatch time as a wall clock ("yyyy-MM-ddTHH:mm:ss") that Core reads in the
 * department's zone, so the picked instant is written in that zone; with no department zone (`null`, older servers) it
 * is written in the device zone, as Dispatch did.
 */
export const toDispatchWallClock = (instant: Date, zoneId: string | null): string => {
  const wall = toZonedWallClock(instant, zoneId);

  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;
};

const HOUR_MS = 60 * 60 * 1000;

/** Quick choices (Dispatch): in an hour, in a day, tomorrow at 08:00 department time. */
const presets = (now: Date, zoneId: string | null): { key: string; at: Date }[] => {
  const tomorrowMorning = zonedWallClockToUtc({ ...toZonedWallClock(new Date(now.getTime() + 24 * HOUR_MS), zoneId), hour: 8, minute: 0, second: 0 }, zoneId);

  return [
    { key: 'call_detail.reschedule_in_1_hour', at: new Date(now.getTime() + HOUR_MS) },
    { key: 'call_detail.reschedule_in_1_day', at: new Date(now.getTime() + 24 * HOUR_MS) },
    { key: 'call_detail.reschedule_tomorrow_morning', at: tomorrowMorning },
  ];
};

/**
 * Moves the dispatch time of a call that is still scheduled (Dispatch reschedule sheet). Starts at the call's current
 * schedule; after a save the call, the scheduled queue and the active calls are re-read. Online write.
 */
export const RescheduleCallSheet: React.FC<RescheduleCallSheetProps> = ({ isOpen, onClose, callId }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const timeZone = useDepartmentTimeZone();

  // The stored schedule, not the call object: a refresh of the call (a realtime ping) must not reset the time picked.
  const scheduled = useCallDetailStore((state) => {
    const call = state.details[callId]?.call;

    return call ? scheduledDispatchUtc(call) : null;
  });

  const isWriting = useCallDetailStore((state) => state.isWriting);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const current = scheduled ? parseApiUtcDate(scheduled) : null;

    setValue((current ?? new Date()).toISOString());
  }, [isOpen, scheduled]);

  const picked = parseApiUtcDate(value);

  const submit = async () => {
    if (!picked) {
      toast.error(t('call_detail.reschedule_invalid'));

      return;
    }

    try {
      await useCallDetailStore.getState().rescheduleDispatchTime(callId, toDispatchWallClock(picked, timeZone));
      toast.success(t('call_detail.reschedule_success'));
      const calls = useCallsStore.getState();

      void calls.refreshQueuedCallLists();
      void calls.fetchCalls({ bypassCache: true });
      onClose();
    } catch {
      toast.error(t('call_detail.reschedule_error'));
    }
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={isWriting} snapPoints={[55]} testID="reschedule-call-sheet">
      <View style={styles.body}>
        <Text className="mb-3 text-center text-lg font-semibold text-typography-900" accessibilityRole="header">
          {t('call_detail.reschedule')}
        </Text>
        <View style={styles.presets}>
          {presets(new Date(), timeZone).map((preset) => (
            <Button
              key={preset.key}
              variant="outline"
              size="xs"
              className="mb-2 mr-2"
              onPress={() => setValue(preset.at.toISOString())}
              accessibilityLabel={t(preset.key)}
              testID={`reschedule-${preset.key.split('.').pop()}`}
            >
              <ButtonText>{t(preset.key)}</ButtonText>
            </Button>
          ))}
        </View>
        <DateTimeField mode="datetime" label={t('call_detail.reschedule_datetime')} value={value} onChange={setValue} clearable={false} testID="reschedule-datetime" />
        {!picked ? (
          <Text size="sm" className="mt-2 text-center text-error-600">
            {t('call_detail.reschedule_invalid')}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button variant="outline" className="mr-2 flex-1" onPress={onClose} isDisabled={isWriting} accessibilityLabel={t('common.cancel')}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button className="flex-1" onPress={() => void submit()} isDisabled={isWriting || !picked} accessibilityLabel={t('call_detail.reschedule')} testID="reschedule-submit">
            <ButtonText>{t('call_detail.reschedule')}</ButtonText>
          </Button>
        </View>
      </View>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  body: { width: '100%', padding: 4 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 8 },
  actions: { flexDirection: 'row', marginTop: 16 },
});
