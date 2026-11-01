import { useTranslation } from '@resgrid/i18n';
import type { CallPersonnelCheckInStatusResultData } from '@resgrid/models';
import { Button, ButtonText, Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { PAR_STATE_COLORS, PAR_STATE_LABEL_KEYS, parState } from '../lib/check-in-status';

export interface ParListProps {
  rows: readonly CallPersonnelCheckInStatusResultData[];
  /** Present only with `checkIn.others`: record a check-in on the person's behalf. */
  onCheckIn?: (row: CallPersonnelCheckInStatusResultData) => void;
}

/** Personnel accountability on the call (PAR): overdue, needs a check-in, or ok (Dispatch/IC). */
export const ParList: React.FC<ParListProps> = ({ rows, onCheckIn }) => {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <View testID="check-in-par-list">
      <Text className="mb-2 mt-4 font-semibold text-typography-900" accessibilityRole="header">
        {t('check_in.par.title')}
      </Text>
      {rows.map((row) => {
        const state = parState(row);
        const label = t(PAR_STATE_LABEL_KEYS[state]);
        return (
          <View key={row.UserId} style={styles.row} className="border-outline-100" testID={`par-row-${row.UserId}`}>
            <View style={StyleSheet.flatten([styles.dot, { backgroundColor: PAR_STATE_COLORS[state] }])} />
            <View style={styles.body} accessible accessibilityLabel={`${row.FullName}: ${label}`}>
              <Text size="sm" className="font-medium text-typography-900">
                {row.FullName}
              </Text>
              <Text size="xs" style={{ color: PAR_STATE_COLORS[state] }}>
                {row.NeedsCheckIn && row.MinutesRemaining > 0 ? `${label} · ${t('check_in.par.minutes_remaining', { count: row.MinutesRemaining })}` : label}
              </Text>
            </View>
            {onCheckIn ? (
              <Button size="xs" variant="outline" onPress={() => onCheckIn(row)} accessibilityLabel={t('check_in.par.check_in_person', { name: row.FullName })} testID={`par-row-${row.UserId}-check-in`}>
                <ButtonText>{t('check_in.perform_check_in')}</ButtonText>
              </Button>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  body: { flex: 1 },
});
