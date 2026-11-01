import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { toDataError } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CalendarItemResultData } from '@resgrid/models';
import { Button, ButtonText, Text } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { checklistErrorKey } from '../lib/checklist-form';
import { fetchChecklistCalendar } from '../lib/checklists-api';

export interface ChecklistCalendarProps {
  /** Opens a scheduled occurrence (the calendar entry's source id). */
  onOpenOccurrence: (occurrenceId: string) => void;
  /** Bumped by the screen to re-read (realtime ping, reveal/conceal). */
  revision?: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const monthRange = (month: Date): { start: string; end: string } => {
  const y = month.getFullYear();
  const m = month.getMonth() + 1;
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}` };
};

/** Scheduled checks on the department calendar, one month at a time (Responder). Redacted entries show the unlock hint. */
export const ChecklistCalendar: React.FC<ChecklistCalendarProps> = ({ onOpenOccurrence, revision = 0 }) => {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [entries, setEntries] = useState<CalendarItemResultData[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries([]);
    setErrorKey(null);
    const { start, end } = monthRange(month);
    fetchChecklistCalendar(start, end)
      .then((next) => {
        if (!cancelled) setEntries(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) setErrorKey(checklistErrorKey(toDataError(error)));
      });
    return () => {
      cancelled = true;
    };
  }, [month, revision]);

  return (
    <View testID="checklist-calendar">
      <Text className="font-semibold text-typography-900">{month.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })}</Text>
      <View style={styles.row}>
        <Button variant="outline" size="sm" onPress={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} testID="checklist-calendar-previous">
          <ButtonText>{t('checklists.labels.Previous')}</ButtonText>
        </Button>
        <Button variant="outline" size="sm" onPress={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} testID="checklist-calendar-next">
          <ButtonText>{t('checklists.labels.Next')}</ButtonText>
        </Button>
      </View>
      {errorKey ? (
        <Text accessibilityRole="alert" className="text-error-600">
          {t(`checklists.errors.${errorKey}`)}
        </Text>
      ) : null}
      {entries.map((entry) => (
        <Button
          key={entry.CalendarItemId}
          variant="outline"
          size="sm"
          className="mt-2"
          isDisabled={!entry.SourceId}
          onPress={() => (entry.SourceId ? onOpenOccurrence(entry.SourceId) : undefined)}
          testID={`checklist-calendar-entry-${entry.CalendarItemId}`}
        >
          <ButtonText>{`${entry.IsRedacted ? t('checklists.ui.unlock') : entry.Title} · ${formatUtcInDepartmentTime(entry.StartUtc, null, { dateStyle: 'medium' })}`}</ButtonText>
        </Button>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8 },
});
