import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, Text, useThemeColors } from '@resgrid/ui';
import { CalendarClock, Hourglass, Send } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface CallQueueBannerProps {
  kind: 'pending' | 'scheduled';
  /** Scheduled: when the call goes out (UTC wire value). */
  dispatchAtUtc?: string;
  /** Shown to users who may dispatch: Pending opens the picker, scheduled asks and dispatches now. */
  onDispatch?: () => void;
  isBusy?: boolean;
}

/** Not dispatched yet (Dispatch call detail): a Pending call waiting for a dispatcher, or a scheduled call before its time. */
export const CallQueueBanner: React.FC<CallQueueBannerProps> = ({ kind, dispatchAtUtc, onDispatch, isBusy = false }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const colors = useThemeColors();
  const isPending = kind === 'pending';
  const Icon = isPending ? Hourglass : CalendarClock;

  return (
    <View style={styles.banner} className={isPending ? 'border-warning-300 bg-warning-50' : 'border-info-300 bg-info-50'} accessibilityRole="summary" testID={isPending ? 'pending-call-banner' : 'scheduled-call-banner'}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon size={20} color={isPending ? colors.warning : colors.info} />
        </View>
        <View style={styles.body}>
          <Text className={isPending ? 'font-bold text-warning-800' : 'font-bold text-info-800'}>
            {isPending ? t('call_detail.pending_banner_title') : `${t('scheduled_calls.scheduled_for')}: ${formatUtcInDepartmentTime(dispatchAtUtc, timeZone)}`}
          </Text>
          {isPending ? (
            <Text size="sm" className="mt-1 text-typography-700">
              {t('call_detail.pending_banner_description')}
            </Text>
          ) : null}
        </View>
      </View>
      {onDispatch ? (
        <Button
          size="sm"
          className="mt-3 self-start"
          onPress={onDispatch}
          isDisabled={isBusy}
          accessibilityLabel={isPending ? t('call_detail.dispatch_call') : t('call_queues.dispatch_now')}
          testID={isPending ? 'pending-call-dispatch-button' : 'scheduled-call-dispatch-now-button'}
        >
          {isBusy ? (
            <ButtonSpinner />
          ) : (
            <View style={styles.buttonIcon}>
              <Send size={16} color={colors.textInverse} />
            </View>
          )}
          <ButtonText>{isPending ? t('call_detail.dispatch_call') : t('call_queues.dispatch_now')}</ButtonText>
        </Button>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 10 },
  body: { flex: 1 },
  buttonIcon: { marginRight: 6 },
});
