import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { CheckInRecordResultData } from '@resgrid/models';
import { Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CHECK_IN_TYPE_LABEL_KEYS } from '../lib/check-in-status';

export interface CheckInHistoryListProps {
  records: readonly CheckInRecordResultData[];
  /** Resolves a user id to a display name (personnel roster). */
  nameFor?: (userId: string) => string | undefined;
}

/** Recorded check-ins on the call, newest first. */
export const CheckInHistoryList: React.FC<CheckInHistoryListProps> = ({ records, nameFor }) => {
  const { t } = useTranslation();
  if (records.length === 0) return null;
  const sorted = [...records].sort((a, b) => (b.Timestamp > a.Timestamp ? 1 : b.Timestamp < a.Timestamp ? -1 : 0));
  return (
    <View testID="check-in-history">
      <Text className="mb-2 mt-4 font-semibold text-typography-900" accessibilityRole="header">
        {t('check_in.history')}
      </Text>
      {sorted.map((record) => (
        <View key={record.CheckInRecordId} style={styles.row} className="border-outline-100">
          <Text size="sm" className="font-medium text-typography-900">
            {record.CheckInTypeName || t(CHECK_IN_TYPE_LABEL_KEYS[record.CheckInType] ?? 'common.unknown')}
          </Text>
          <Text size="xs" className="text-typography-500">
            {[nameFor?.(record.UserId), formatUtcInDepartmentTime(record.Timestamp, null)].filter(Boolean).join(' · ')}
          </Text>
          {record.Note ? (
            <Text size="xs" className="text-typography-600">
              {record.Note}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { borderBottomWidth: 1, paddingVertical: 6 },
});
